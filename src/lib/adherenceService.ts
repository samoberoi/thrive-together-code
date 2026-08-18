import { supabase } from "@/integrations/supabase/client";
import type { ActivityKey } from "@/components/coach/CoachActivityNudgeDialog";
import { videos as exerciseLibrary } from "@/lib/exerciseData";

export const ALL_ACTIVITIES: ActivityKey[] = [
  "glucose", "bp", "weight", "fasting", "supplements", "exercise", "yoga", "diet",
  "water", "soleus", "breath",
];

const WATER_GLASS_GOAL = 8;
const SOLEUS_GOAL = 3;
const BREATH_GOAL = 4;
const GLUCOSE_READING_GOAL = 2;   // morning + evening
const MEAL_GOAL = 3;              // meals photographed per day
const EXERCISE_MINUTE_GOAL = 30;  // minutes of exercise per day
const YOGA_MINUTE_GOAL = 10;      // minutes of yoga / stress video
const FASTING_HOUR_GOAL = 16;

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

/** Raw per-user daily counters used to build human-readable progress lines. */
export interface ActivityCounters {
  glucoseReadings: number;
  bpLogged: boolean;
  weightLogged: boolean;
  fastingHours: number | null;
  fastingStatus: string | null;
  fmod: string | null;
  lmod: string | null;
  suppTaken: number;
  suppTotal: number;
  exerciseLogs: number;
  exerciseMinutes: number;
  yogaMinutes: number;
  mealsLogged: number;
  waterGlasses: number;
  soleusRounds: number;
  breathRounds: number;
}

export const emptyCounters = (): ActivityCounters => ({
  glucoseReadings: 0, bpLogged: false, weightLogged: false,
  fastingHours: null, fastingStatus: null, fmod: null, lmod: null,
  suppTaken: 0, suppTotal: 0, exerciseLogs: 0, yogaMinutes: 0, mealsLogged: 0,
  waterGlasses: 0, soleusRounds: 0, breathRounds: 0,
});

/** "13:45:00" / ISO timestamp -> "1:45 PM" */
export function formatClock(value: string | null): string | null {
  if (!value) return null;
  let h: number, m: number;
  const t = /^(\d{1,2}):(\d{2})/.exec(value);
  if (t && !value.includes("T")) {
    h = Number(t[1]); m = Number(t[2]);
  } else {
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    h = d.getHours(); m = d.getMinutes();
  }
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Detailed progress text + ratio for every activity, so nudges are informed. */
export function buildActivityProgress(c: ActivityCounters): AdherenceSummary["progress"] {
  const fmod = formatClock(c.fmod);
  const lmod = formatClock(c.lmod);
  const fastingBits: string[] = [];
  if (c.fastingHours != null && c.fastingHours > 0) fastingBits.push(`${Number(c.fastingHours).toFixed(1)}h fasted`);
  fastingBits.push(fmod ? `FMOD ${fmod}` : "FMOD —");
  fastingBits.push(lmod ? `LMOD ${lmod}` : "LMOD —");

  return {
    glucose: {
      text: `${c.glucoseReadings}/${GLUCOSE_READING_GOAL} readings today`,
      ratio: clamp(c.glucoseReadings / GLUCOSE_READING_GOAL),
    },
    bp: {
      text: c.bpLogged ? "BP logged today" : "No BP reading today",
      ratio: c.bpLogged ? 1 : 0,
    },
    weight: {
      text: c.weightLogged ? "Weight logged today" : "No weight logged today",
      ratio: c.weightLogged ? 1 : 0,
    },
    fasting: {
      text: fastingBits.join(" · "),
      ratio: clamp((c.fastingHours ?? 0) / FASTING_HOUR_GOAL),
    },
    supplements: {
      text: c.suppTotal > 0
        ? `${c.suppTaken}/${c.suppTotal} doses taken`
        : (c.suppTaken > 0 ? `${c.suppTaken} doses taken` : "No doses marked"),
      ratio: c.suppTotal > 0 ? clamp(c.suppTaken / c.suppTotal) : (c.suppTaken > 0 ? 1 : 0),
    },
    exercise: {
      text: c.exerciseLogs > 0
        ? `${c.exerciseLogs} workout${c.exerciseLogs > 1 ? "s" : ""} logged`
        : "No workout logged today",
      ratio: clamp(c.exerciseLogs / EXERCISE_LOG_GOAL),
    },
    yoga: {
      text: c.yogaMinutes > 0
        ? `${c.yogaMinutes} min practised (goal ${YOGA_MINUTE_GOAL} min)`
        : "No yoga / stress session today",
      ratio: clamp(c.yogaMinutes / YOGA_MINUTE_GOAL),
    },
    diet: {
      text: `${c.mealsLogged}/${MEAL_GOAL} meals logged`,
      ratio: clamp(c.mealsLogged / MEAL_GOAL),
    },
    water: {
      text: `${c.waterGlasses}/${WATER_GLASS_GOAL} glasses`,
      ratio: clamp(c.waterGlasses / WATER_GLASS_GOAL),
    },
    soleus: {
      text: `${c.soleusRounds}/${SOLEUS_GOAL} rounds`,
      ratio: clamp(c.soleusRounds / SOLEUS_GOAL),
    },
    breath: {
      text: `${c.breathRounds}/${BREATH_GOAL} rounds`,
      ratio: clamp(c.breathRounds / BREATH_GOAL),
    },
  };
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
    db.from("fasting_tracking").select("user_id, compliance_status, fasting_hours_completed, fmod_actual_time, lmod_actual_time").in("user_id", ids).eq("date", today),
    db.from("user_supplement_tracking").select("user_id, taken").in("user_id", ids).eq("date", today),
    db.from("user_supplement_plans").select("user_id").in("user_id", ids).eq("status", "active"),
    db.from("user_protocols").select("user_id").in("user_id", ids).eq("status", "active"),
    db.from("user_exercise_logs").select("user_id").in("user_id", ids).gte("created_at", todayIso),
    db.from("video_progress").select("user_id, progress_sec, duration_sec, completed").in("user_id", ids).gte("watched_at", todayIso),
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
  const exByUser = countOf(exRows);
  const dietByUser = countOf(mealRows);
  const soleusByUser = countOf(soleusRows);
  const breathByUser = countOf(breathRows);

  const yogaMinByUser = new Map<string, number>();
  ((vidRows?.data as any[]) ?? []).forEach((r) => {
    const secs = Number(r.progress_sec ?? 0) || (r.completed ? Number(r.duration_sec ?? 0) : 0);
    yogaMinByUser.set(r.user_id, (yogaMinByUser.get(r.user_id) ?? 0) + secs);
  });

  const glucoseByUser = new Map<string, number>();
  const bpSet = new Set<string>();
  const weightSet = new Set<string>();
  const waterByUser = new Map<string, number>();
  ((hLogsToday?.data as any[]) ?? []).forEach((l) => {
    if (l.log_type === "diabetes") {
      const n = (l.glucose_morning != null ? 1 : 0) + (l.glucose_evening != null ? 1 : 0);
      if (n) glucoseByUser.set(l.user_id, (glucoseByUser.get(l.user_id) ?? 0) + n);
    }
    if (l.log_type === "bp" && l.bp_systolic != null) bpSet.add(l.user_id);
    if (l.log_type === "weight" && l.weight_kg != null) weightSet.add(l.user_id);
    if (l.log_type === "water" && l.weight_kg != null) {
      waterByUser.set(l.user_id, (waterByUser.get(l.user_id) ?? 0) + Number(l.weight_kg));
    }
  });

  const fastingSet = new Set<string>();
  const fastingByUser = new Map<string, any>();
  ((fastTodayRows?.data as any[]) ?? []).forEach((r) => {
    fastingByUser.set(r.user_id, r);
    if (r.compliance_status === "completed" || r.compliance_status === "partial" || (r.fasting_hours_completed ?? 0) > 0) {
      fastingSet.add(r.user_id);
    }
  });

  const suppSet = new Set<string>();
  const suppTakenByUser = new Map<string, number>();
  const suppTotalByUser = new Map<string, number>();
  ((suppTodayRows?.data as any[]) ?? []).forEach((r) => {
    suppTotalByUser.set(r.user_id, (suppTotalByUser.get(r.user_id) ?? 0) + 1);
    if (r.taken) {
      suppSet.add(r.user_id);
      suppTakenByUser.set(r.user_id, (suppTakenByUser.get(r.user_id) ?? 0) + 1);
    }
  });

  for (const id of ids) {
    const waterGlasses = Math.max(0, Math.round(waterByUser.get(id) ?? 0));
    const soleusRounds = soleusByUser.get(id) ?? 0;
    const breathRounds = breathByUser.get(id) ?? 0;
    const fastRow = fastingByUser.get(id);

    const counters: ActivityCounters = {
      glucoseReadings: glucoseByUser.get(id) ?? 0,
      bpLogged: bpSet.has(id),
      weightLogged: weightSet.has(id),
      fastingHours: fastRow?.fasting_hours_completed ?? null,
      fastingStatus: fastRow?.compliance_status ?? null,
      fmod: fastRow?.fmod_actual_time ?? null,
      lmod: fastRow?.lmod_actual_time ?? null,
      suppTaken: suppTakenByUser.get(id) ?? 0,
      suppTotal: suppTotalByUser.get(id) ?? 0,
      exerciseLogs: exByUser.get(id) ?? 0,
      yogaMinutes: Math.round((yogaMinByUser.get(id) ?? 0) / 60),
      mealsLogged: dietByUser.get(id) ?? 0,
      waterGlasses,
      soleusRounds,
      breathRounds,
    };

    const applicable: Record<ActivityKey, boolean> = {
      glucose: true, bp: true, weight: true,
      fasting: fastProtoSet.has(id),
      supplements: suppPlanSet.has(id),
      exercise: true, yoga: true, diet: true,
      water: true, soleus: true, breath: true,
    };
    const activities: Record<ActivityKey, boolean> = {
      glucose: (glucoseByUser.get(id) ?? 0) > 0,
      bp: bpSet.has(id),
      weight: weightSet.has(id),
      fasting: fastingSet.has(id),
      supplements: suppSet.has(id),
      exercise: (exByUser.get(id) ?? 0) > 0,
      yoga: (yogaMinByUser.get(id) ?? 0) > 0,
      diet: (dietByUser.get(id) ?? 0) > 0,
      water: waterGlasses >= WATER_GLASS_GOAL,
      soleus: soleusRounds >= SOLEUS_GOAL,
      breath: breathRounds >= BREATH_GOAL,
    };
    const progress = buildActivityProgress(counters);

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
