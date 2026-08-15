import { supabase } from "@/integrations/supabase/client";
import type { ActivityKey } from "@/components/coach/CoachActivityNudgeDialog";

export const ALL_ACTIVITIES: ActivityKey[] = [
  "glucose", "bp", "weight", "fasting", "supplements", "exercise", "yoga", "diet",
  "water", "soleus", "breath",
];

const WATER_GLASS_GOAL = 8;
const SOLEUS_GOAL = 3;
const BREATH_GOAL = 4;

export interface AdherenceSummary {
  user_id: string;
  activities: Record<ActivityKey, boolean>;
  applicable: Record<ActivityKey, boolean>;
  progress: Partial<Record<ActivityKey, { text: string; ratio: number }>>;
  doneCount: number;
  applicableCount: number;
  onTrack: boolean;
  missed: ActivityKey[];
}

const startOfTodayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Today's activity adherence for a set of users. Mirrors the coach dashboard
 * definition of "on track" (≥70% of applicable daily activities logged today).
 */
export async function fetchDailyAdherence(userIds: string[]): Promise<Map<string, AdherenceSummary>> {
  const out = new Map<string, AdherenceSummary>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return out;

  const todayIso = startOfTodayIso();
  const today = localDateKey(new Date());
  const db = supabase as any;

  const [
    hLogsToday, fastTodayRows, suppTodayRows, activePlans, activeProtocols,
    exRows, vidRows, mealRows, soleusRows, breathRows,
  ] = await Promise.all([
    db.from("health_logs").select("user_id, log_type, glucose_morning, glucose_evening, bp_systolic, weight_kg").in("user_id", ids).gte("logged_at", todayIso),
    db.from("fasting_tracking").select("user_id, compliance_status, fasting_hours_completed").in("user_id", ids).eq("date", today),
    db.from("user_supplement_tracking").select("user_id, taken").in("user_id", ids).eq("date", today),
    db.from("user_supplement_plans").select("user_id").in("user_id", ids).eq("status", "active"),
    db.from("user_protocols").select("user_id").in("user_id", ids).eq("status", "active"),
    db.from("user_exercise_logs").select("user_id").in("user_id", ids).gte("created_at", todayIso),
    db.from("video_progress").select("user_id").in("user_id", ids).gte("watched_at", todayIso),
    db.from("meal_photos").select("user_id").in("user_id", ids).gte("logged_at", todayIso),
    db.from("user_soleus_sessions").select("user_id").in("user_id", ids).gte("session_at", todayIso),
    db.from("user_breath_sessions").select("user_id").in("user_id", ids).gte("session_at", todayIso),
  ]);

  const setOf = (res: any) => new Set(((res?.data as any[]) ?? []).map((r) => r.user_id));
  const countOf = (res: any) => {
    const m = new Map<string, number>();
    ((res?.data as any[]) ?? []).forEach((r) => m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1));
    return m;
  };

  const suppPlanSet = setOf(activePlans);
  const fastProtoSet = setOf(activeProtocols);
  const exSet = setOf(exRows);
  const yogaSet = setOf(vidRows);
  const dietSet = setOf(mealRows);
  const soleusByUser = countOf(soleusRows);
  const breathByUser = countOf(breathRows);

  const glucoseSet = new Set<string>();
  const bpSet = new Set<string>();
  const weightSet = new Set<string>();
  const waterByUser = new Map<string, number>();
  ((hLogsToday?.data as any[]) ?? []).forEach((l) => {
    if (l.log_type === "diabetes" && (l.glucose_morning != null || l.glucose_evening != null)) glucoseSet.add(l.user_id);
    if (l.log_type === "bp" && l.bp_systolic != null) bpSet.add(l.user_id);
    if (l.log_type === "weight" && l.weight_kg != null) weightSet.add(l.user_id);
    if (l.log_type === "water" && l.weight_kg != null) {
      waterByUser.set(l.user_id, (waterByUser.get(l.user_id) ?? 0) + Number(l.weight_kg));
    }
  });

  const fastingSet = new Set<string>();
  ((fastTodayRows?.data as any[]) ?? []).forEach((r) => {
    if (r.compliance_status === "completed" || r.compliance_status === "partial" || (r.fasting_hours_completed ?? 0) > 0) {
      fastingSet.add(r.user_id);
    }
  });

  const suppSet = new Set<string>();
  ((suppTodayRows?.data as any[]) ?? []).forEach((r) => { if (r.taken) suppSet.add(r.user_id); });

  for (const id of ids) {
    const waterGlasses = Math.max(0, Math.round(waterByUser.get(id) ?? 0));
    const soleusRounds = soleusByUser.get(id) ?? 0;
    const breathRounds = breathByUser.get(id) ?? 0;

    const applicable: Record<ActivityKey, boolean> = {
      glucose: true, bp: true, weight: true,
      fasting: fastProtoSet.has(id),
      supplements: suppPlanSet.has(id),
      exercise: true, yoga: true, diet: true,
      water: true, soleus: true, breath: true,
    };
    const activities: Record<ActivityKey, boolean> = {
      glucose: glucoseSet.has(id),
      bp: bpSet.has(id),
      weight: weightSet.has(id),
      fasting: fastingSet.has(id),
      supplements: suppSet.has(id),
      exercise: exSet.has(id),
      yoga: yogaSet.has(id),
      diet: dietSet.has(id),
      water: waterGlasses >= WATER_GLASS_GOAL,
      soleus: soleusRounds >= SOLEUS_GOAL,
      breath: breathRounds >= BREATH_GOAL,
    };
    const progress: AdherenceSummary["progress"] = {
      water: { text: `${waterGlasses}/${WATER_GLASS_GOAL} glasses`, ratio: Math.min(1, waterGlasses / WATER_GLASS_GOAL) },
      soleus: { text: `${soleusRounds}/${SOLEUS_GOAL} rounds`, ratio: Math.min(1, soleusRounds / SOLEUS_GOAL) },
      breath: { text: `${breathRounds}/${BREATH_GOAL} rounds`, ratio: Math.min(1, breathRounds / BREATH_GOAL) },
    };

    let applicableCount = 0;
    let doneCount = 0;
    const missed: ActivityKey[] = [];
    for (const k of ALL_ACTIVITIES) {
      if (!applicable[k]) continue;
      applicableCount++;
      if (activities[k]) doneCount++;
      else missed.push(k);
    }

    out.set(id, {
      user_id: id,
      activities,
      applicable,
      progress,
      doneCount,
      applicableCount,
      onTrack: applicableCount > 0 && doneCount >= Math.ceil(applicableCount * 0.7),
      missed,
    });
  }

  return out;
}
