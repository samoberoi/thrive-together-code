import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users, Star, Activity, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Heart, UserCheck, Clock, ChevronRight, Loader2, Bell,
  CalendarClock, Plus, Package, Send, CheckCircle2, Search, Percent,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { coachTypeLabel, type Coach } from "@/lib/coachService";
import { createNotification } from "@/lib/notificationService";
import { toast } from "sonner";
import ScheduleMeetingDialog from "@/components/coach/ScheduleMeetingDialog";
import PatientDailySummaryDialog from "@/components/coach/PatientDailySummaryDialog";
import CoachCommissionDialog from "@/components/coach/CoachCommissionDialog";
import CoachActivityNudgeDialog, {
  ACTIVITY_META,
  type ActivityKey,
  type PendingPatient,
} from "@/components/coach/CoachActivityNudgeDialog";


interface PatientSummary {
  user_id: string;
  assigned_at: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  age: number | null;
  gender: string | null;
  weight: number | null;
  bmi: number | null;
  bmi_category: string | null;
  latestGlucose: number | null;
  latestBpSystolic: number | null;
  initialScore: number | null;
  currentScore: number | null;
  planName: string | null;
  planStarted: string | null;
  planExpires: string | null;
  hasFastingProtocol: boolean;
  hasSuppPlan: boolean;
  activities: Record<ActivityKey, boolean>;
  applicable: Record<ActivityKey, boolean>;
  doneCount: number;
  applicableCount: number;
  onTrack: boolean;
}

interface Alert {
  user_id: string;
  patient_name: string;
  type: "danger" | "warning";
  message: string;
  metric: string;
}

function evaluateAlerts(patients: PatientSummary[]): Alert[] {
  const seen = new Set<string>();
  const alerts: Alert[] = [];
  const push = (a: Alert) => {
    const key = `${a.user_id}|${a.metric}`;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push(a);
  };
  for (const p of patients) {
    const name = p.name ?? "Unknown";
    if (p.bmi && p.bmi >= 30) {
      push({ user_id: p.user_id, patient_name: name, type: p.bmi >= 35 ? "danger" : "warning", message: `BMI is ${p.bmi} (${p.bmi_category})`, metric: "BMI" });
    }
    if (p.latestGlucose && p.latestGlucose >= 180) {
      push({ user_id: p.user_id, patient_name: name, type: "danger", message: `Fasting glucose at ${p.latestGlucose} mg/dL`, metric: "Glucose" });
    } else if (p.latestGlucose && p.latestGlucose >= 130) {
      push({ user_id: p.user_id, patient_name: name, type: "warning", message: `Fasting glucose at ${p.latestGlucose} mg/dL`, metric: "Glucose" });
    }
    if (p.latestBpSystolic && p.latestBpSystolic >= 150) {
      push({ user_id: p.user_id, patient_name: name, type: "danger", message: `BP systolic at ${p.latestBpSystolic} mmHg`, metric: "BP" });
    } else if (p.latestBpSystolic && p.latestBpSystolic >= 140) {
      push({ user_id: p.user_id, patient_name: name, type: "warning", message: `BP systolic at ${p.latestBpSystolic} mmHg`, metric: "BP" });
    }
    if (p.initialScore != null && p.currentScore != null && p.currentScore < p.initialScore) {
      const delta = p.currentScore - p.initialScore;
      push({ user_id: p.user_id, patient_name: name, type: delta <= -5 ? "danger" : "warning", message: `Health score dropped ${Math.abs(delta)} pts (${p.initialScore} → ${p.currentScore})`, metric: "Score" });
    }
  }
  return alerts.sort((a, b) => (a.type === "danger" ? -1 : 1));
}

const ALL_ACTIVITIES: ActivityKey[] = [
  "glucose", "bp", "weight", "fasting", "supplements", "exercise", "yoga", "diet",
];

export default function CoachHome({ onViewPatient }: { onViewPatient?: () => void; onViewFasting?: () => void }) {
  const { user } = useAuth();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [needsScheduling, setNeedsScheduling] = useState<PatientSummary[]>([]);
  const [scheduleFor, setScheduleFor] = useState<PatientSummary | null>(null);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nudgingAll, setNudgingAll] = useState(false);
  const [summaryPatient, setSummaryPatient] = useState<PatientSummary | null>(null);
  const [activityDialog, setActivityDialog] = useState<ActivityKey | null>(null);
  const [search, setSearch] = useState("");
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commissionInfo, setCommissionInfo] = useState<{ percent: number; name: string; frequency: string } | null>(null);
  const [monthlyCommission, setMonthlyCommission] = useState<number | null>(null);


  useEffect(() => {
    if (!user) return;
    loadData();
     
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const { data: coachData } = await supabase
      .from("coaches" as any).select("*").eq("user_id", user.id).single();

    if (!coachData) { setLoading(false); return; }
    setCoach(coachData as unknown as Coach);

    const { data: assignments } = await supabase
      .from("coach_assignments" as any)
      .select("user_id, assigned_at")
      .eq("coach_id", (coachData as any).id)
      .eq("is_active", true);

    if (!assignments || assignments.length === 0) {
      setPatients([]); setAlerts([]); setNeedsScheduling([]);
      setLoading(false); return;
    }

    const patientIds = (assignments as any[]).map((a) => a.user_id);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();
    const todayDate = todayStart.toISOString().slice(0, 10);

    // Fetch everything in parallel across all patients (single queries, not per-patient loops)
    const [
      { data: profiles },
      { data: subs },
      { data: hLogsToday },
      { data: fastTodayRows },
      { data: suppTodayRows },
      { data: activePlans },
      { data: activeProtocols },
      { data: exRows },
      { data: vidRows },
      { data: mealRows },
      { data: latestGlucose },
      { data: latestBp },
    ] = await Promise.all([
      supabase.from("profiles" as any)
        .select("user_id, name, phone, avatar_url, age, gender, weight, bmi, bmi_category, initial_health_score, assessment")
        .in("user_id", patientIds),
      supabase.from("subscriptions" as any)
        .select("user_id, plan_name, started_at, expires_at, status")
        .in("user_id", patientIds)
        .eq("status", "active"),
      supabase.from("health_logs" as any)
        .select("user_id, log_type, glucose_morning, glucose_evening, bp_systolic, weight_kg, logged_at")
        .in("user_id", patientIds)
        .gte("logged_at", todayIso),
      supabase.from("fasting_tracking" as any)
        .select("user_id, compliance_status, fasting_hours_completed")
        .in("user_id", patientIds)
        .eq("tracking_date", todayDate),
      supabase.from("user_supplement_tracking" as any)
        .select("user_id, taken")
        .in("user_id", patientIds)
        .eq("date", todayDate),
      supabase.from("user_supplement_plans" as any)
        .select("user_id")
        .in("user_id", patientIds)
        .eq("status", "active"),
      supabase.from("user_protocols" as any)
        .select("user_id")
        .in("user_id", patientIds)
        .eq("status", "active"),
      supabase.from("user_exercise_logs" as any)
        .select("user_id").in("user_id", patientIds).gte("created_at", todayIso),
      supabase.from("video_progress" as any)
        .select("user_id").in("user_id", patientIds).gte("watched_at", todayIso),
      supabase.from("meal_photos" as any)
        .select("user_id").in("user_id", patientIds).gte("logged_at", todayIso),
      supabase.from("health_logs" as any)
        .select("user_id, glucose_morning, logged_at")
        .in("user_id", patientIds).eq("log_type", "diabetes")
        .order("logged_at", { ascending: false }),
      supabase.from("health_logs" as any)
        .select("user_id, bp_systolic, logged_at")
        .in("user_id", patientIds).eq("log_type", "bp")
        .order("logged_at", { ascending: false }),
    ]);

    const suppPlanSet = new Set(((activePlans as any[]) ?? []).map((r) => r.user_id));
    const fastProtoSet = new Set(((activeProtocols as any[]) ?? []).map((r) => r.user_id));
    const exSet = new Set(((exRows as any[]) ?? []).map((r) => r.user_id));
    const yogaSet = new Set(((vidRows as any[]) ?? []).map((r) => r.user_id));
    const dietSet = new Set(((mealRows as any[]) ?? []).map((r) => r.user_id));

    // Per-patient today flags
    const glucoseSet = new Set<string>();
    const bpSet = new Set<string>();
    const weightSet = new Set<string>();
    (hLogsToday as any[] | null)?.forEach((l) => {
      if (l.log_type === "diabetes" && (l.glucose_morning != null || l.glucose_evening != null)) glucoseSet.add(l.user_id);
      if (l.log_type === "bp" && l.bp_systolic != null) bpSet.add(l.user_id);
      if (l.log_type === "weight" && l.weight_kg != null) weightSet.add(l.user_id);
    });

    const fastingSet = new Set<string>();
    (fastTodayRows as any[] | null)?.forEach((r) => {
      if (r.compliance_status === "completed" || r.compliance_status === "partial" || (r.fasting_hours_completed ?? 0) > 0) {
        fastingSet.add(r.user_id);
      }
    });

    const suppSet = new Set<string>();
    (suppTodayRows as any[] | null)?.forEach((r) => { if (r.taken) suppSet.add(r.user_id); });

    // Latest glucose / BP (already ordered desc)
    const latestGlucoseByUser = new Map<string, number>();
    (latestGlucose as any[] | null)?.forEach((l) => {
      if (!latestGlucoseByUser.has(l.user_id) && l.glucose_morning != null) {
        latestGlucoseByUser.set(l.user_id, l.glucose_morning);
      }
    });
    const latestBpByUser = new Map<string, number>();
    (latestBp as any[] | null)?.forEach((l) => {
      if (!latestBpByUser.has(l.user_id) && l.bp_systolic != null) {
        latestBpByUser.set(l.user_id, l.bp_systolic);
      }
    });

    const enriched: PatientSummary[] = (assignments as any[]).map((a) => {
      const profile = (profiles as any[])?.find((p) => p.user_id === a.user_id);
      const sub = (subs as any[])?.find((s) => s.user_id === a.user_id);
      const hasFasting = fastProtoSet.has(a.user_id);
      const hasSupp = suppPlanSet.has(a.user_id);

      const applicable: Record<ActivityKey, boolean> = {
        glucose: true, bp: true, weight: true,
        fasting: hasFasting,
        supplements: hasSupp,
        exercise: true, yoga: true, diet: true,
      };
      const activities: Record<ActivityKey, boolean> = {
        glucose: glucoseSet.has(a.user_id),
        bp: bpSet.has(a.user_id),
        weight: weightSet.has(a.user_id),
        fasting: fastingSet.has(a.user_id),
        supplements: suppSet.has(a.user_id),
        exercise: exSet.has(a.user_id),
        yoga: yogaSet.has(a.user_id),
        diet: dietSet.has(a.user_id),
      };

      let applicableCount = 0;
      let doneCount = 0;
      for (const k of ALL_ACTIVITIES) {
        if (applicable[k]) {
          applicableCount++;
          if (activities[k]) doneCount++;
        }
      }
      const onTrack = applicableCount > 0 && doneCount >= Math.ceil(applicableCount * 0.7);

      return {
        user_id: a.user_id,
        assigned_at: a.assigned_at,
        name: profile?.name ?? null,
        phone: profile?.phone ?? null,
        avatar_url: profile?.avatar_url ?? null,
        age: profile?.age ?? null,
        gender: profile?.gender ?? null,
        weight: profile?.weight ?? null,
        bmi: profile?.bmi ?? null,
        bmi_category: profile?.bmi_category ?? null,
        latestGlucose: latestGlucoseByUser.get(a.user_id) ?? null,
        latestBpSystolic: latestBpByUser.get(a.user_id) ?? null,
        initialScore: profile?.initial_health_score ?? null,
        currentScore: profile?.assessment?.healthScore ?? null,
        planName: sub?.plan_name ?? null,
        planStarted: sub?.started_at ?? null,
        planExpires: sub?.expires_at ?? null,
        hasFastingProtocol: hasFasting,
        hasSuppPlan: hasSupp,
        activities,
        applicable,
        doneCount,
        applicableCount,
        onTrack,
      };
    });

    setPatients(enriched);
    setAlerts(evaluateAlerts(enriched));

    const { data: handledMeetings } = await supabase
      .from("coach_meetings" as any)
      .select("user_id, status")
      .eq("coach_id", (coachData as any).id)
      .in("status", ["scheduled", "completed"]);
    const handledIds = new Set(((handledMeetings as any[]) ?? []).map((m) => m.user_id));
    setCompletedSessions(((handledMeetings as any[]) ?? []).filter((m) => m.status === "completed").length);
    setNeedsScheduling(enriched.filter((p) => !handledIds.has(p.user_id)));

    // Commission model + monthly commission estimate
    const modelId = (coachData as any).commission_model_id;
    let model: any = null;
    if (modelId) {
      const { data: m } = await supabase
        .from("commission_models" as any)
        .select("name, percent, payout_frequency")
        .eq("id", modelId)
        .maybeSingle();
      model = m;
    }
    if (!model) {
      const { data: m } = await supabase
        .from("commission_models" as any)
        .select("name, percent, payout_frequency")
        .eq("is_default", true).eq("is_active", true).maybeSingle();
      model = m;
    }
    if (model) {
      const percent = Number(model.percent) || 0;
      setCommissionInfo({ percent, name: model.name, frequency: model.payout_frequency || "monthly" });
      const { data: subs } = await supabase
        .from("subscriptions" as any)
        .select("user_id, plan_price, duration_months, status")
        .in("user_id", patientIds)
        .eq("status", "active");
      const byUser = new Map<string, any>();
      ((subs as any[]) ?? []).forEach((s) => {
        const prev = byUser.get(s.user_id);
        if (!prev || (Number(s.plan_price) || 0) > (Number(prev.plan_price) || 0)) byUser.set(s.user_id, s);
      });
      let revenue = 0;
      byUser.forEach((s) => {
        const months = Math.max(1, Number(s.duration_months) || 1);
        revenue += (Number(s.plan_price) || 0) / months;
      });
      setMonthlyCommission(revenue * (percent / 100));
    }



    setLoading(false);
  };

  // Derived stats
  const onTrackCount = patients.filter((p) => p.onTrack).length;
  const offTrackPatients = patients.filter((p) => !p.onTrack);

  const activityStats = useMemo(() => {
    const map = new Map<ActivityKey, { done: number; applicable: number; pending: PendingPatient[] }>();
    for (const k of ALL_ACTIVITIES) map.set(k, { done: 0, applicable: 0, pending: [] });
    for (const p of patients) {
      for (const k of ALL_ACTIVITIES) {
        if (!p.applicable[k]) continue;
        const s = map.get(k)!;
        s.applicable++;
        if (p.activities[k]) s.done++;
        else s.pending.push({ user_id: p.user_id, name: p.name, avatar_url: p.avatar_url });
      }
    }
    return map;
  }, [patients]);

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => (p.name ?? "").toLowerCase().includes(q) || (p.phone ?? "").includes(q));
  }, [patients, search]);

  const nudgeAllOffTrack = async () => {
    if (!offTrackPatients.length) return;
    setNudgingAll(true);
    try {
      await Promise.all(offTrackPatients.map((p) =>
        createNotification({
          user_id: p.user_id,
          title: `A gentle nudge from ${coach?.name ?? "your coach"}`,
          body: "You have pending items for today — a few quick logs will keep you on track. You've got this! 💪",
          type: "coach_nudge",
          icon: "👋",
        })
      ));
      toast.success(`Nudge sent to ${offTrackPatients.length} patient${offTrackPatients.length > 1 ? "s" : ""}`);
    } catch {
      toast.error("Some nudges could not be sent");
    } finally {
      setNudgingAll(false);
    }
  };

  const trend = (p: PatientSummary) => {
    if (p.initialScore == null || p.currentScore == null) return null;
    const d = p.currentScore - p.initialScore;
    if (d > 0) return { icon: TrendingUp, color: "text-success", label: `+${d}` };
    if (d < 0) return { icon: TrendingDown, color: "text-destructive", label: `${d}` };
    return { icon: Minus, color: "text-muted-foreground", label: "0" };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const activeActivityStats = activityDialog ? activityStats.get(activityDialog) : null;

  return (
    <div className="flex flex-col gap-4 px-5 pt-4 pb-4">
      {/* Coach hero — avatar, name, specialization + coach-type chip.
          No redundant "Good to see you" line; the name IS the greeting. */}
      {coach && (
        <motion.div
          className="flex items-center gap-4 pt-1"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <img
            src={coach.avatar_url || "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=120&h=120&fit=crop&crop=face"}
            alt={coach.name}
            className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 ring-1 ring-border"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-[22px] sm:text-2xl leading-tight font-black tracking-[-0.02em] text-foreground no-break truncate">
              {coach.name}
            </h1>
            <p className="text-muted-foreground text-xs mt-0.5 truncate">{coach.specialization}</p>
            <span className="inline-block text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 mt-1.5 no-break">
              {coachTypeLabel(coach.coach_type)}
            </span>
          </div>
        </motion.div>
      )}

      {/* Dashboard — Patients / Commission / Rating / Sessions (2×2) */}
      <motion.div className="grid grid-cols-2 gap-3" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <button
          onClick={onViewPatient}
          className="liquid-glass rounded-2xl p-4 text-center hover:bg-accent/40 transition-colors"
        >
          <Users className="w-5 h-5 text-primary mx-auto mb-1.5" strokeWidth={1.8} />
          <p className="stat-number text-2xl text-foreground">{patients.length}</p>
          <p className="text-muted-foreground text-[10px] font-medium no-break">Patients →</p>
        </button>
        <button
          onClick={() => setCommissionOpen(true)}
          disabled={!commissionInfo}
          className="liquid-glass rounded-2xl p-4 text-center hover:bg-accent/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          title="Estimated monthly commission — tap to see breakdown"
        >
          <Percent className="w-5 h-5 text-primary mx-auto mb-1.5" strokeWidth={1.8} />
          <p className="stat-number text-2xl text-foreground">
            {monthlyCommission != null
              ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0, notation: monthlyCommission >= 100000 ? "compact" : "standard" }).format(monthlyCommission)
              : "—"}
          </p>
          <p className="text-muted-foreground text-[10px] font-medium no-break">Commission {commissionInfo?.frequency ?? "monthly"} →</p>
        </button>
        <div className="liquid-glass rounded-2xl p-4 text-center">
          <Star className="w-5 h-5 text-warning mx-auto mb-1.5 fill-warning" />
          <p className="stat-number text-2xl text-foreground">{Number(coach?.avg_rating ?? 0).toFixed(1)}</p>
          <p className="text-muted-foreground text-[10px] font-medium no-break">
            Rating{coach?.total_ratings ? ` · ${coach.total_ratings}` : ""}
          </p>
        </div>
        <button
          onClick={() => setSchedulePickerOpen(true)}
          className="liquid-glass rounded-2xl p-4 text-center hover:bg-accent/40 transition-colors"
          title="Sessions completed — tap to schedule a new meeting"
        >
          <Activity className="w-5 h-5 text-success mx-auto mb-1.5" strokeWidth={1.8} />
          <p className="stat-number text-2xl text-foreground">{completedSessions}</p>
          <p className="text-muted-foreground text-[10px] font-medium no-break">Sessions →</p>
        </button>
      </motion.div>


      {/* Meetings to Schedule — surfaced right below the KPI grid */}
      {needsScheduling.length > 0 && (
        <motion.div
          className="liquid-glass rounded-3xl p-5 ring-1 ring-primary/15"
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5 text-primary" strokeWidth={1.6} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Action needed</p>
              <h3 className="text-base font-black text-foreground leading-tight mt-0.5 no-break">Meetings require scheduling</h3>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-primary bg-primary/10 px-2.5 py-1 rounded-full whitespace-nowrap no-break">
              {needsScheduling.length} pending
            </span>
          </div>
          <div className="space-y-2">
            {needsScheduling.slice(0, 6).map((p) => {
              const fmt = (d: string | null) =>
                d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
              const joined = fmt(p.assigned_at);
              const started = fmt(p.planStarted);
              const expires = fmt(p.planExpires);
              const daysLeft = p.planExpires
                ? Math.max(0, Math.ceil((new Date(p.planExpires).getTime() - Date.now()) / 86400000))
                : null;
              return (
                <button
                  key={p.user_id}
                  onClick={() => setScheduleFor(p)}
                  className="w-full flex items-start gap-3 p-3 rounded-2xl bg-card/70 hover:bg-card transition text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                    ) : (
                      <span className="text-primary font-bold text-sm">{(p.name ?? "?")[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-foreground font-semibold text-sm truncate">{p.name ?? "Patient"}</p>
                      {p.planName && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">
                          <Package className="w-2.5 h-2.5" strokeWidth={2} /> {p.planName}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-[11px] mt-0.5">Awaiting onboarding meeting</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                      {joined && <span>Joined <span className="text-foreground font-semibold">{joined}</span></span>}
                      {started && <span>Started <span className="text-foreground font-semibold">{started}</span></span>}
                      {expires && (
                        <span>
                          Ends <span className="text-foreground font-semibold">{expires}</span>
                          {daysLeft !== null && <span className="text-primary font-bold"> · {daysLeft}d left</span>}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="gradient-blue text-primary-foreground rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-1 shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Schedule
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}


      {/* Patient Tracking — compact single row */}
      {patients.length > 0 && (
        <motion.div className="liquid-glass rounded-3xl p-4" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div className="flex items-center gap-2 mb-2.5">
            <UserCheck className="w-4 h-4 text-primary" strokeWidth={1.8} />
            <span className="text-foreground font-bold text-sm">Patient Tracking</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-medium">Today</span>
          </div>
          <div className="flex items-stretch rounded-xl overflow-hidden border border-border/50 divide-x divide-border/50">
            <div className="flex-1 bg-muted/50 px-2 py-2 flex flex-col items-center justify-center">
              <p className="text-lg font-black text-foreground leading-none">{patients.length}</p>
              <p className="text-[9px] text-muted-foreground font-medium mt-0.5 no-break">Total</p>
            </div>
            <div className="flex-1 bg-success/10 px-2 py-2 flex flex-col items-center justify-center">
              <p className="text-lg font-black text-success leading-none">{onTrackCount}</p>
              <p className="text-[9px] text-muted-foreground font-medium mt-0.5 no-break">On Track</p>
            </div>
            <div className="flex-1 bg-destructive/10 px-2 py-2 flex flex-col items-center justify-center">
              <p className="text-lg font-black text-destructive leading-none">{offTrackPatients.length}</p>
              <p className="text-[9px] text-muted-foreground font-medium mt-0.5 no-break">Off Track</p>
            </div>
          </div>
          {offTrackPatients.length > 0 && (
            <button
              onClick={nudgeAllOffTrack}
              disabled={nudgingAll}
              className="mt-2.5 w-full gradient-blue text-primary-foreground rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {nudgingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Nudge all {offTrackPatients.length} off-track
            </button>
          )}
        </motion.div>
      )}

      {/* Activity Tracking — compact */}
      {patients.length > 0 && (
        <motion.div className="liquid-glass rounded-3xl p-4" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <div className="flex items-center gap-2 mb-2.5">
            <CheckCircle2 className="w-4 h-4 text-primary" strokeWidth={1.8} />
            <span className="text-foreground font-bold text-sm">Activity Tracking</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-medium">
              Tap to nudge
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">

            {ALL_ACTIVITIES.map((k) => {
              const s = activityStats.get(k)!;
              const meta = ACTIVITY_META[k];
              const pct = s.applicable ? Math.round((s.done / s.applicable) * 100) : 0;
              const allDone = s.applicable > 0 && s.done === s.applicable;
              const noneApplicable = s.applicable === 0;
              return (
                <button
                  key={k}
                  onClick={() => !noneApplicable && setActivityDialog(k)}
                  disabled={noneApplicable}
                  className={`rounded-2xl p-3 text-left transition ${
                    noneApplicable
                      ? "bg-muted/30 opacity-50 cursor-not-allowed"
                      : allDone
                        ? "bg-success/10 border border-success/30 hover:bg-success/15"
                        : "bg-card border border-border hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base">{meta.emoji}</span>
                    <span className={`text-[10px] font-bold ${
                      noneApplicable ? "text-muted-foreground" :
                      allDone ? "text-success" :
                      pct >= 70 ? "text-warning" : "text-destructive"
                    }`}>
                      {noneApplicable ? "N/A" : `${pct}%`}
                    </span>
                  </div>
                  <p className="text-foreground text-lg font-black leading-none">
                    {s.done}<span className="text-xs text-muted-foreground font-medium">/{s.applicable || 0}</span>
                  </p>
                  <p className="text-muted-foreground text-[10px] font-medium mt-1">{meta.label}</p>
                  {!noneApplicable && s.pending.length > 0 && (
                    <p className="text-[10px] font-semibold text-primary mt-0.5">
                      {s.pending.length} pending →
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-warning" strokeWidth={1.8} />
            <span className="text-foreground font-bold">Attention Needed</span>
            <span className="text-[10px] font-bold text-warning bg-warning/10 px-2 py-0.5 rounded-full ml-auto">
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {alerts.slice(0, 6).map((alert, i) => (
              <div
                key={`${alert.user_id}-${alert.metric}-${i}`}
                className={`flex items-start gap-3 rounded-2xl p-3 ${
                  alert.type === "danger" ? "danger-flash" : "bg-warning/10"
                }`}
              >
                <AlertTriangle
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    alert.type === "danger" ? "text-destructive danger-dot" : "text-warning"
                  }`}
                  strokeWidth={2}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-semibold">{alert.patient_name}</p>
                  <p className="text-muted-foreground text-xs">{alert.message}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  alert.type === "danger" ? "text-destructive bg-destructive/15" : "text-warning bg-warning/15"
                }`}>
                  {alert.metric}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* All clear */}
      {alerts.length === 0 && patients.length > 0 && (
        <motion.div
          className="liquid-glass rounded-3xl p-5 flex items-center gap-3"
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
        >
          <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5 text-success" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-foreground font-bold text-sm">All patients healthy</p>
            <p className="text-muted-foreground text-xs">No concerns flagged right now</p>
          </div>
        </motion.div>
      )}

      {/* My Patients — full list with search */}
      <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" strokeWidth={1.8} />
            <span className="text-foreground font-bold">My Patients</span>
            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {filteredPatients.length}{search ? ` of ${patients.length}` : ""}
            </span>
          </div>
        </div>

        {patients.length > 0 && (
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        )}

        {patients.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No patients assigned yet</p>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground text-sm">No patients match "{search}"</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto -mx-1 px-1">
            {filteredPatients.map((p) => {
              const t = trend(p);
              return (
                <button
                  key={p.user_id}
                  onClick={() => setSummaryPatient(p)}
                  className="flex items-center gap-3 py-3 border-b border-border/30 last:border-0 text-left w-full hover:opacity-90"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-11 h-11 rounded-xl object-cover" />
                    ) : (
                      <span className="text-primary font-bold text-sm">{(p.name ?? "?")[0].toUpperCase()}</span>
                    )}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${
                        p.onTrack ? "bg-success" : "bg-destructive"
                      }`}
                      title={p.onTrack ? "On track today" : "Off track today"}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-foreground font-semibold text-sm truncate">{p.name ?? "Unknown"}</p>
                      {t && (
                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${t.color}`}>
                          <t.icon className="w-3 h-3" /> {t.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {p.doneCount}/{p.applicableCount} today
                      </span>
                      {p.planName && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                          <Package className="w-2.5 h-2.5" /> {p.planName}
                        </span>
                      )}
                      {p.bmi_category && (
                        <span className={`text-[10px] font-medium ${p.bmi && p.bmi >= 30 ? "text-warning" : "text-muted-foreground"}`}>
                          {p.bmi_category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {p.weight && <p className="text-foreground text-xs font-bold">{p.weight} kg</p>}
                    <p className="text-muted-foreground text-[10px]">
                      <Clock className="w-3 h-3 inline mr-0.5" />
                      {new Date(p.assigned_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </motion.div>

      {coach && scheduleFor && (
        <ScheduleMeetingDialog
          open={!!scheduleFor}
          onOpenChange={(b) => { if (!b) setScheduleFor(null); }}
          coachId={coach.id}
          patientId={scheduleFor.user_id}
          patientName={scheduleFor.name ?? "Patient"}
          defaultType="onboarding"
          onScheduled={() => { setScheduleFor(null); loadData(); }}
        />
      )}
      {coach && (
        <ScheduleMeetingDialog
          open={schedulePickerOpen}
          onOpenChange={setSchedulePickerOpen}
          coachId={coach.id}
          patients={patients.map((p) => ({ user_id: p.user_id, name: p.name, phone: p.phone }))}
          onScheduled={() => { setSchedulePickerOpen(false); loadData(); }}
        />
      )}
      {summaryPatient && (
        <PatientDailySummaryDialog
          open={!!summaryPatient}
          onClose={() => setSummaryPatient(null)}
          patient={{
            user_id: summaryPatient.user_id,
            name: summaryPatient.name,
            avatar_url: summaryPatient.avatar_url,
            assigned_at: summaryPatient.assigned_at,
          }}
          coachName={coach?.name ?? null}
        />
      )}
      {activityDialog && activeActivityStats && (
        <CoachActivityNudgeDialog
          open={!!activityDialog}
          onClose={() => setActivityDialog(null)}
          activity={activityDialog}
          pending={activeActivityStats.pending}
          doneCount={activeActivityStats.done}
          totalApplicable={activeActivityStats.applicable}
          coachName={coach?.name ?? null}
        />
      )}
    </div>
  );
}
