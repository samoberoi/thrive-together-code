import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DailyActivityDial, { type DialRingItem } from "@/components/DailyActivityDial";
import { useTodayExerciseProgress } from "@/hooks/useTodayExerciseProgress";
import { useBreathSessionsToday } from "@/hooks/useBreathSessionsToday";
import { useSoleusSessionsToday } from "@/hooks/useSoleusSessionsToday";
import { useDailyYogaMinutes } from "@/hooks/useAppSettings";
import { getTodayYogaMinutes } from "@/lib/yogaProgressService";
import { fetchMovementOverview, logTodaySteps, COACH_MIN_DAILY_STEPS } from "@/lib/movementUserService";
import { canUseNativeHealth, syncTodaySteps, requestNativeHealthAuthorization } from "@/lib/healthProvider";
import { healthSourceLabel } from "@/lib/platformLabels";
import { toast } from "sonner";
import { fetchProfile } from "@/lib/profileService";
import { fetchUserProtocol, fetchTrackingForUser } from "@/lib/fastingService";

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * The coach's own daily rings — same habit engine patients see, so coaches
 * can walk the talk and lead by example.
 */
export default function CoachActivityRings() {
  const { user } = useAuth();
  const { minutes: exerciseMin, goal: exerciseGoal } = useTodayExerciseProgress();
  const { count: breathCount, goal: breathGoal } = useBreathSessionsToday();
  const { count: soleusCount, goal: soleusGoal } = useSoleusSessionsToday();
  const yogaGoal = useDailyYogaMinutes();

  const [yogaMin, setYogaMin] = useState(0);
  const [movement, setMovement] = useState({ ratio: 0, hint: "" });
  const [water, setWater] = useState(0);
  const [supps, setSupps] = useState({ taken: 0, total: 0 });
  const [fasting, setFasting] = useState<{ active: boolean; ratio: number; hint: string }>({
    active: false, ratio: 0, hint: "",
  });

  const load = useCallback(async () => {
    if (!user) return;
    const today = todayKey();

    getTodayYogaMinutes(user.id).then(setYogaMin).catch(() => {});

    // Movement (steps)
    try {
      const p = await fetchProfile(user.id);
      const ov = await fetchMovementOverview(user.id, {
        bmiCategory: (p as any)?.bmi_category ?? null,
        activityLevel: (p as any)?.lifestyle?.activity ?? null,
        age: (p as any)?.age ?? null,
        weightKg: (p as any)?.weight ?? null,
        heightCm: (p as any)?.height ?? null,
      }, { minTargetSteps: COACH_MIN_DAILY_STEPS });
      setMovement({
        ratio: ov.targetSteps > 0 ? Math.min(1, ov.todaySteps / ov.targetSteps) : 0,
        hint: `${(ov.todaySteps || 0).toLocaleString("en-IN")} / ${(ov.targetSteps || 0).toLocaleString("en-IN")} steps`,
      });
    } catch { /* ignore */ }

    // Water (glasses stored in weight_kg on water logs)
    try {
      const { data } = await supabase
        .from("health_logs" as any)
        .select("logged_at, weight_kg, log_type")
        .eq("user_id", user.id)
        .eq("log_type", "water")
        .order("logged_at", { ascending: false })
        .limit(30);
      const glasses = ((data as any[]) ?? [])
        .filter((l) => new Date(l.logged_at).toDateString() === new Date().toDateString())
        .reduce((s, l) => s + (l.weight_kg ?? 0), 0);
      setWater(glasses);
    } catch { /* ignore */ }

    // Supplements
    try {
      const { data: plans } = await supabase
        .from("user_supplement_plans" as any)
        .select("id").eq("user_id", user.id).eq("status", "active");
      const planIds = ((plans as any[]) ?? []).map((p) => p.id);
      if (planIds.length) {
        const [{ data: items }, { data: track }] = await Promise.all([
          supabase.from("user_supplement_plan_items" as any).select("id").in("plan_id", planIds).eq("is_active", true),
          supabase.from("user_supplement_tracking" as any).select("plan_item_id, taken").eq("user_id", user.id).eq("date", today),
        ]);
        const total = ((items as any[]) ?? []).length;
        const taken = ((track as any[]) ?? []).filter((t) => t.taken).length;
        setSupps({ taken: Math.min(taken, total), total });
      } else {
        setSupps({ taken: 0, total: 0 });
      }
    } catch { /* ignore */ }

    // Fasting
    try {
      const proto = await fetchUserProtocol(user.id);
      if (proto) {
        const tracks = await fetchTrackingForUser(user.id, 2);
        const t = tracks.find((x: any) => x.date === today) as any;
        const fmod = !!t?.fmod_actual_time;
        const lmod = !!t?.lmod_actual_time;
        const ratio = Math.min(1, (fmod ? 0.5 : 0) + (lmod ? 0.5 : 0));
        setFasting({
          active: true,
          ratio,
          hint: `${fmod ? "FMOD ✓" : "FMOD pending"} · ${lmod ? "LMOD ✓" : "LMOD pending"}`,
        });
      } else {
        setFasting({ active: false, ratio: 0, hint: "" });
      }
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Pull steps from Apple Health / Health Connect for the coach too.
  const [needsHealth, setNeedsHealth] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const syncSteps = useCallback(async (allowPrompt: boolean) => {
    if (!user || !canUseNativeHealth()) return;
    try {
      const steps = await syncTodaySteps({ allowPrompt });
      if (steps == null) { setNeedsHealth(true); return; }
      setNeedsHealth(false);
      await logTodaySteps(user.id, steps);
      await load();
    } catch {
      setNeedsHealth(true);
    }
  }, [load, user]);

  useEffect(() => { void syncSteps(false); }, [syncSteps]);

  const connectHealth = async () => {
    setConnecting(true);
    try {
      const state = await requestNativeHealthAuthorization();
      if (!state.authorized && state.message) toast.message(state.message);
      await syncSteps(true);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't connect your health app");
    } finally {
      setConnecting(false);
    }
  };


  useEffect(() => {
    const h = () => load();
    window.addEventListener("health-log-saved", h);
    window.addEventListener("breath-session-saved", h);
    window.addEventListener("soleus-session-saved", h);
    window.addEventListener("supplement-tracking-saved", h);
    window.addEventListener("fasting-log-saved", h);
    window.addEventListener("supplement-plan-changed", h);
    window.addEventListener("fasting-protocol-changed", h);
    return () => {
      window.removeEventListener("health-log-saved", h);
      window.removeEventListener("breath-session-saved", h);
      window.removeEventListener("soleus-session-saved", h);
      window.removeEventListener("supplement-tracking-saved", h);
      window.removeEventListener("fasting-log-saved", h);
      window.removeEventListener("supplement-plan-changed", h);
      window.removeEventListener("fasting-protocol-changed", h);
    };
  }, [load]);

  if (!user) return null;

  const rings: DialRingItem[] = [];
  if (fasting.active) {
    rings.push({ key: "fasting", label: "Fasting", ratio: fasting.ratio, color: "#0F1A3D", hint: fasting.hint });
  }
  if (supps.total > 0) {
    rings.push({
      key: "supplements", label: "Supplements", ratio: supps.taken / supps.total,
      color: "#F59E0B", hint: `${supps.taken} / ${supps.total} taken`,
    });
  }
  rings.push({ key: "movement", label: "Movement", ratio: movement.ratio, color: "#10B981", hint: movement.hint || undefined });
  rings.push({
    key: "exercise", label: "Exercise",
    ratio: exerciseGoal > 0 ? Math.min(1, exerciseMin / exerciseGoal) : 0,
    color: "#248CCB", hint: `${Math.min(exerciseMin, exerciseGoal)} / ${exerciseGoal} min`,
  });
  rings.push({
    key: "yoga", label: "Yoga & Stress",
    ratio: yogaGoal > 0 ? Math.min(1, yogaMin / yogaGoal) : 0,
    color: "#8B5CF6", hint: `${Math.min(yogaMin, yogaGoal)} / ${yogaGoal} min`,
  });
  rings.push({ key: "water", label: "Water", ratio: Math.min(1, water / 8), color: "#38BDF8", hint: `${water} / 8 glasses` });
  rings.push({
    key: "breath", label: "Breath Protocol",
    ratio: breathGoal > 0 ? Math.min(1, breathCount / breathGoal) : 0,
    color: "#EA6A5E", hint: `${Math.min(breathCount, breathGoal)} / ${breathGoal} sessions`,
  });
  rings.push({
    key: "soleus", label: "Soleus Push-Ups",
    ratio: soleusGoal > 0 ? Math.min(1, soleusCount / soleusGoal) : 0,
    color: "#B91C1C", hint: `${Math.min(soleusCount, soleusGoal)} / ${soleusGoal} rounds`,
  });

  return (
    <div className="space-y-3">
      <DailyActivityDial items={rings} title="My rings" size="lg" />
      {canUseNativeHealth() && needsHealth && (
        <button
          type="button"
          onClick={connectHealth}
          disabled={connecting}
          className="w-full rounded-2xl bg-primary text-primary-foreground text-[13px] font-bold py-3 disabled:opacity-60"
        >
          {connecting ? "Connecting…" : `Allow ${healthSourceLabel()} to count my steps`}
        </button>
      )}
    </div>
  );
}
