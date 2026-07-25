// Runs on a cron every 15 minutes. Evaluates active notification templates
// and dispatches to eligible users based on audience_filter + time-of-day.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Template {
  id: string;
  key: string;
  title: string;
  trigger_type: string;
  audience_filter: Record<string, boolean>;
  message_variants: string[];
  icon: string;
  action_url: string | null;
  send_time_local: string; // "HH:MM:SS"
  send_days: number[];
  cooldown_hours: number;
  timezone: string;
  is_active: boolean;
}

function nowInTz(tz: string): { hhmm: string; isoWeekday: number; ymd: string } {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };
  return {
    hhmm: `${parts.hour}:${parts.minute}`,
    isoWeekday: weekdayMap[parts.weekday as string] ?? 1,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function withinWindow(templateTime: string, nowHhmm: string, windowMin = 20): boolean {
  const [h1, m1] = templateTime.split(":").map(Number);
  const [h2, m2] = nowHhmm.split(":").map(Number);
  const t1 = h1 * 60 + m1;
  const t2 = h2 * 60 + m2;
  return t2 >= t1 && t2 - t1 < windowMin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const summary: Record<string, number> = {};

  try {
    const { data: templates } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("is_active", true);

    if (!templates || templates.length === 0) {
      return new Response(JSON.stringify({ ok: true, dispatched: 0, note: "no active templates" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Preload active users (paying subscribers) once — used by every eligible template.
    const { data: activeSubs } = await supabase
      .from("subscriptions")
      .select("user_id, plan_id, expires_at")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());

    const activeUserIds = Array.from(new Set((activeSubs ?? []).map((s: any) => s.user_id)));

    // Compute days-until-expiry per user for expiring_in_* audience filters.
    const daysToExpiry = new Map<string, number>();
    for (const s of activeSubs ?? []) {
      const ms = new Date((s as any).expires_at).getTime() - Date.now();
      const days = Math.ceil(ms / (24 * 3600 * 1000));
      const prev = daysToExpiry.get((s as any).user_id);
      if (prev == null || days < prev) daysToExpiry.set((s as any).user_id, days);
    }
    if (activeUserIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, dispatched: 0, note: "no active users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: staffRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", activeUserIds)
      .in("role", ["admin", "coach", "channel_partner"]);
    const staffUserIds = new Set((staffRoles ?? []).map((r: any) => r.user_id));
    const patientUserIds = activeUserIds.filter((uid) => !staffUserIds.has(uid));
    if (patientUserIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, dispatched: 0, note: "no active patient users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    // Preload signals used by audience filters.
    const [suppPlans, suppTracking, movementProgress, fasting, mealPhotos, dietPref, protocols, videoProgress, profiles, breathSessions, waterLogs, soleusSessions, glucoseLogs] = await Promise.all([
      supabase.from("user_supplement_plans").select("user_id").in("user_id", patientUserIds),
      supabase.from("user_supplement_tracking").select("user_id, taken_at").gte("taken_at", startOfDay).in("user_id", patientUserIds),
      supabase.from("user_movement_progress").select("user_id, log_date, steps, target_steps").eq("log_date", startOfDay.slice(0, 10)).in("user_id", patientUserIds),
      supabase.from("fasting_tracking").select("user_id, started_at").gte("started_at", startOfDay).in("user_id", patientUserIds),
      supabase.from("meal_photos").select("user_id, captured_at").gte("captured_at", startOfDay).in("user_id", patientUserIds),
      supabase.from("user_diet_profiles").select("user_id").in("user_id", patientUserIds),
      supabase.from("user_protocols").select("user_id, is_active").eq("is_active", true).in("user_id", patientUserIds),
      supabase.from("video_progress").select("user_id, last_watched_at").gte("last_watched_at", startOfDay).in("user_id", patientUserIds),
      supabase.from("profiles").select("user_id, name, age, weight, height, gender, clinical, deep_profiling").in("user_id", patientUserIds),
      supabase.from("user_breath_sessions").select("user_id, session_at").gte("session_at", startOfDay).in("user_id", patientUserIds),
      supabase.from("health_logs").select("user_id, weight_kg, logged_at").eq("log_type", "water").gte("logged_at", startOfDay).in("user_id", patientUserIds),
      supabase.from("user_soleus_sessions").select("user_id, session_at").gte("session_at", startOfDay).in("user_id", patientUserIds),
      supabase.from("health_logs").select("user_id, glucose_morning, glucose_evening, logged_at").eq("log_type", "diabetes").gte("logged_at", startOfDay).in("user_id", patientUserIds),
    ]);

    const hasSuppPlan = new Set((suppPlans.data ?? []).map((r: any) => r.user_id));
    const suppTakenToday = new Set((suppTracking.data ?? []).map((r: any) => r.user_id));
    const movementByUser = new Map<string, { steps: number; target: number }>();
    for (const r of movementProgress.data ?? []) movementByUser.set(r.user_id, { steps: r.steps ?? 0, target: r.target_steps ?? 0 });
    const fastedToday = new Set((fasting.data ?? []).map((r: any) => r.user_id));
    const loggedMealToday = new Set((mealPhotos.data ?? []).map((r: any) => r.user_id));
    const hasDietPlan = new Set((dietPref.data ?? []).map((r: any) => r.user_id));
    const hasFastingProtocol = new Set((protocols.data ?? []).map((r: any) => r.user_id));
    const watchedVideoToday = new Set((videoProgress.data ?? []).map((r: any) => r.user_id));
    const breathCountByUser = new Map<string, number>();
    for (const r of breathSessions.data ?? []) {
      breathCountByUser.set(r.user_id, (breathCountByUser.get(r.user_id) ?? 0) + 1);
    }
    const BREATH_GOAL = 4;
    const WATER_GOAL = 8;
    const waterGlassesByUser = new Map<string, number>();
    for (const r of waterLogs.data ?? []) {
      waterGlassesByUser.set(r.user_id, (waterGlassesByUser.get(r.user_id) ?? 0) + Number((r as any).weight_kg ?? 0));
    }
    const soleusDoneToday = new Set((soleusSessions.data ?? []).map((r: any) => r.user_id));
    const glucoseMorningDoneToday = new Set<string>();
    const glucoseEveningDoneToday = new Set<string>();
    for (const r of (glucoseLogs.data ?? []) as any[]) {
      if (r.glucose_morning != null) glucoseMorningDoneToday.add(r.user_id);
      if (r.glucose_evening != null) glucoseEveningDoneToday.add(r.user_id);
    }
    const profileMap = new Map<string, any>();
    for (const p of profiles.data ?? []) profileMap.set(p.user_id, p);

    function userNeedsBpTracking(userId: string): boolean {
      const p = profileMap.get(userId);
      const hasHypertension = p?.clinical?.hasHypertension === true || p?.clinical?.hasHypertension === "yes";
      const onBpMedicine = p?.deep_profiling?.bpMedication === true || p?.deep_profiling?.bpMedication === "yes";
      return hasHypertension || onBpMedicine;
    }

    function isEligible(userId: string, filter: Record<string, boolean>): boolean {
      const f = filter ?? {};
      const activeFilters = Object.keys(f).filter((key) => f[key]);
      if (activeFilters.length === 0 || (activeFilters.length === 1 && f.all_active_users)) return true;
      if (f.patient_users && staffUserIds.has(userId)) return false;
      if (f.has_supplements && !hasSuppPlan.has(userId)) return false;
      if (f.missed_supplement_today && suppTakenToday.has(userId)) return false;
      if (f.has_movement_goal) {
        const m = movementByUser.get(userId);
        if (!m || m.target <= 0) return false;
      }
      if (f.missed_movement_today) {
        const m = movementByUser.get(userId);
        if (m && m.target > 0 && m.steps >= m.target) return false;
      }
      if (f.movement_goal_met_today) {
        const m = movementByUser.get(userId);
        if (!m || m.target <= 0 || m.steps < m.target) return false;
      }
      if (f.no_movement_started_today) {
        const m = movementByUser.get(userId);
        if (m && m.steps > 0) return false;
      }
      if (f.movement_goal_met_early) {
        const m = movementByUser.get(userId);
        if (!m || m.target <= 0 || m.steps < m.target) return false;
        // "early" is enforced by the template's send_time_local (morning window)
      }
      if (f.has_fasting_protocol && !hasFastingProtocol.has(userId)) return false;
      if (f.missed_fasting_today && fastedToday.has(userId)) return false;
      if (f.missed_yoga_today && watchedVideoToday.has(userId)) return false;
      if (f.missed_meal_log_today && loggedMealToday.has(userId)) return false;
      if (f.missed_breath_today) {
        const c = breathCountByUser.get(userId) ?? 0;
        if (c >= BREATH_GOAL) return false;
      }
      if (f.has_diet_plan && !hasDietPlan.has(userId)) return false;
      if (f.needs_bp_tracking) {
        if (!userNeedsBpTracking(userId)) return false;
      }
      if (f.has_hypertension) {
        const p = profileMap.get(userId);
        if (!(p?.clinical?.hasHypertension === true || p?.clinical?.hasHypertension === "yes")) return false;
      }
      if (f.on_bp_medicine) {
        const p = profileMap.get(userId);
        if (!(p?.deep_profiling?.bpMedication === true || p?.deep_profiling?.bpMedication === "yes")) return false;
      }
      if (f.profile_incomplete) {
        const p = profileMap.get(userId);
        if (!p) return false;
        const incomplete = !p.name || !p.age || !p.weight || !p.height || !p.gender;
        if (!incomplete) return false;
      }
      if (f.expiring_in_15d) {
        const d = daysToExpiry.get(userId);
        if (d == null || d > 15 || d < 11) return false;
      }
      if (f.expiring_in_7d) {
        const d = daysToExpiry.get(userId);
        if (d == null || d > 7 || d < 4) return false;
      }
      if (f.expiring_in_3d) {
        const d = daysToExpiry.get(userId);
        if (d == null || d > 3 || d < 0) return false;
      }
      return true;
    }

    let totalDispatched = 0;

    for (const t of templates as Template[]) {
      const { hhmm, isoWeekday } = nowInTz(t.timezone || "Asia/Kolkata");
      if (t.send_days?.length && !t.send_days.includes(isoWeekday)) continue;
      if (!withinWindow(t.send_time_local, hhmm, 20)) continue;
      if (!t.message_variants?.length) continue;

      // Cooldown lookup
      const cutoff = new Date(Date.now() - t.cooldown_hours * 3600 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("notification_dispatch_log")
        .select("user_id")
        .eq("template_id", t.id)
        .gte("sent_at", cutoff);
      const recentSet = new Set((recent ?? []).map((r: any) => r.user_id));

      const isBpTemplate = /\b(bp|blood pressure|hypertension)\b/i.test(`${t.key} ${t.title} ${t.action_url ?? ""}`);
      const eligible = patientUserIds.filter((u) =>
        !recentSet.has(u) &&
        (!isBpTemplate || userNeedsBpTracking(u)) &&
        isEligible(u, t.audience_filter)
      );
      if (eligible.length === 0) continue;

      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

      const rows: any[] = [];
      const logRows: any[] = [];
      for (const uid of eligible) {
        // Rotate variant by day + user hash so different users see different messages same day
        const hash = uid.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        const idx = (dayOfYear + hash) % t.message_variants.length;
        const body = t.message_variants[idx];
        rows.push({
          user_id: uid,
          title: t.title,
          body,
          type: t.trigger_type,
          icon: t.icon || "🔔",
          action_url: t.action_url ?? null,
        });
        logRows.push({ template_id: t.id, user_id: uid, variant_index: idx });
      }

      if (rows.length) {
        await supabase.from("notifications").insert(rows);
        await supabase.from("notification_dispatch_log").insert(logRows);
        summary[t.key] = rows.length;
        totalDispatched += rows.length;
      }
    }

    return new Response(JSON.stringify({ ok: true, dispatched: totalDispatched, per_template: summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dispatcher error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
