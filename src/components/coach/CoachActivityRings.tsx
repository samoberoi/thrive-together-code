import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DailyActivityDial, { type DialRingItem } from "@/components/DailyActivityDial";
import { useTodayExerciseProgress } from "@/hooks/useTodayExerciseProgress";
import { useBreathSessionsToday } from "@/hooks/useBreathSessionsToday";
import { useSoleusSessionsToday } from "@/hooks/useSoleusSessionsToday";
import { useDailyYogaMinutes } from "@/hooks/useAppSettings";
import { getTodayYogaMinutes } from "@/lib/yogaProgressService";
import { fetchMovementOverview, COACH_MIN_DAILY_STEPS } from "@/lib/movementUserService";
import { fetchProfile } from "@/lib/profileService";
import StepsShareCard from "@/components/StepsShareCard";
import MinutesShareCard from "@/components/MinutesShareCard";
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
  const [movement, setMovement] = useState({ ratio: 0, hint: "", steps: 0 });
  const [body, setBody] = useState<{ heightCm: number | null; weightKg: number | null }>({ heightCm: null, weightKg: null });
  const [water, setWater] = useState(0);
  const [hasDiabetes, setHasDiabetes] = useState(false);
  const [diabetesLoggedToday, setDiabetesLoggedToday] = useState(false);
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
        steps: ov.todaySteps || 0,
      });
      setBody({ heightCm: (p as any)?.height ?? null, weightKg: (p as any)?.weight ?? null });
      const clin = (p as any)?.clinical ?? {};
      setHasDiabetes(!!(clin.hasDiabetes || clin.has_diabetes || (p as any)?.has_diabetes));
    } catch { /* ignore */ }

    // Blood sugar log today
    try {
      const { data } = await supabase
        .from("health_logs" as any)
        .select("logged_at, log_type")
        .eq("user_id", user.id)
        .eq("log_type", "diabetes")
        .order("logged_at", { ascending: false })
        .limit(10);
      setDiabetesLoggedToday(
        ((data as any[]) ?? []).some(
          (l) => new Date(l.logged_at).toDateString() === new Date().toDateString(),
        ),
      );
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

  // All nine pillars always render. Ones not set up yet stay in place but are
  // greyed out and labelled "Not unlocked" instead of showing 0%.
  const rings: DialRingItem[] = [
    {
      key: "fasting", label: "Fasting",
      ratio: fasting.active ? fasting.ratio : 0,
      color: "#0F1A3D",
      disabled: !fasting.active,
      hint: fasting.active ? fasting.hint : undefined,
    },
    {
      key: "supplements", label: "Supplements",
      ratio: supps.total > 0 ? supps.taken / supps.total : 0,
      color: "#F59E0B",
      disabled: supps.total === 0,
      hint: supps.total > 0 ? `${supps.taken} / ${supps.total} taken` : undefined,
    },
    {
      key: "movement", label: "Movement", ratio: movement.ratio, color: "#10B981",
      hint: movement.hint || undefined,
      expanded: <StepsShareCard steps={movement.steps} heightCm={body.heightCm} weightKg={body.weightKg} />,
    },
    {
      key: "exercise", label: "Exercise",
      ratio: exerciseGoal > 0 ? Math.min(1, exerciseMin / exerciseGoal) : 0,
      color: "#248CCB",
      disabled: exerciseGoal <= 0,
      hint: exerciseGoal > 0 ? `${Math.min(exerciseMin, exerciseGoal)} / ${exerciseGoal} min` : undefined,
    },
    {
      key: "yoga", label: "Yoga & Stress",
      ratio: yogaGoal > 0 ? Math.min(1, yogaMin / yogaGoal) : 0,
      color: "#8B5CF6",
      disabled: yogaGoal <= 0,
      hint: yogaGoal > 0 ? `${Math.min(yogaMin, yogaGoal)} / ${yogaGoal} min` : undefined,
    },
    { key: "water", label: "Water", ratio: Math.min(1, water / 8), color: "#38BDF8", hint: `${water} / 8 glasses` },
    {
      key: "breath", label: "Breath Protocol",
      ratio: breathGoal > 0 ? Math.min(1, breathCount / breathGoal) : 0,
      color: "#EA6A5E",
      disabled: breathGoal <= 0,
      hint: breathGoal > 0 ? `${Math.min(breathCount, breathGoal)} / ${breathGoal} sessions` : undefined,
    },
    {
      key: "soleus", label: "Soleus Push-Ups",
      ratio: soleusGoal > 0 ? Math.min(1, soleusCount / soleusGoal) : 0,
      color: "#B91C1C",
      disabled: soleusGoal <= 0,
      hint: soleusGoal > 0 ? `${Math.min(soleusCount, soleusGoal)} / ${soleusGoal} rounds` : undefined,
    },
    {
      key: "diabetes", label: "Blood sugar log",
      ratio: hasDiabetes && diabetesLoggedToday ? 1 : 0,
      color: "#E00101",
      disabled: !hasDiabetes,
      hint: hasDiabetes ? (diabetesLoggedToday ? "Logged today" : "Not logged yet") : undefined,
    },
  ];

  return (
    <DailyActivityDial items={rings} title="My rings" size="lg" />
  );
}
