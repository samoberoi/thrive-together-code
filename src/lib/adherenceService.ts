import { supabase } from "@/integrations/supabase/client";
import type { ActivityKey } from "@/components/coach/CoachActivityNudgeDialog";
import { videos as exerciseLibrary } from "@/lib/exerciseData";
import { getCurrentWeek, type FastingBucket } from "@/lib/fastingService";

export const ALL_ACTIVITIES: ActivityKey[] = [
  "glucose", "bp", "weight", "fasting", "supplements", "exercise", "yoga", "diet",
  "water", "soleus", "breath",
];

const WATER_GLASS_GOAL = 8;
const SOLEUS_GOAL = 3;
const BREATH_GOAL = 4;
const GLUCOSE_READING_GOAL = 2;   // morning + evening
const MEAL_GOAL = 3;              // meals photographed per day
const DEFAULT_EXERCISE_MINUTE_GOAL = 30;
const DEFAULT_YOGA_MINUTE_GOAL = 20;
const FASTING_HOUR_GOAL = 16;

/** Per-user daily minute goals, driven by the user's protocol/package config. */
export interface ActivityGoals { exercise: number; yoga: number }

export const DEFAULT_ACTIVITY_GOALS: ActivityGoals = {
  exercise: DEFAULT_EXERCISE_MINUTE_GOAL,
  yoga: DEFAULT_YOGA_MINUTE_GOAL,
};

const bucketOf = (pattern: string | null | undefined): FastingBucket | null => {
  const hours = parseInt(String(pattern ?? "").split(":")[0], 10);
  if (!Number.isFinite(hours)) return null;
  if (hours >= 16) return "16";
  if (hours >= 14) return "14";
  if (hours >= 12) return "12";
  return null;
};

const numOr = (raw: any, fallback: number) => {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Resolve exercise + yoga daily minute goals per user. Goals come from
 * app_settings and vary by the user's active fasting protocol bucket
 * (exercise_daily_minutes_12/14/16, yoga_stress_daily_minutes_12/14/16),
 * falling back to the base keys, then to the app defaults.
 */
export async function fetchActivityGoals(userIds: string[]): Promise<Map<string, ActivityGoals>> {
  const out = new Map<string, ActivityGoals>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return out;
  const db = supabase as any;

  const [settingsRes, protoRes] = await Promise.all([
    db.from("app_settings").select("key, value"),
    db.from("user_protocols").select("user_id, protocol_id, start_date, created_at").in("user_id", ids).eq("status", "active"),
  ]);

  const settings = new Map<string, any>();
  ((settingsRes?.data as any[]) ?? []).forEach((r) => settings.set(r.key, r.value));
  const baseGoals: ActivityGoals = {
    exercise: numOr(settings.get("exercise_daily_minutes"), DEFAULT_EXERCISE_MINUTE_GOAL),
    yoga: numOr(settings.get("yoga_stress_daily_minutes"), DEFAULT_YOGA_MINUTE_GOAL),
  };

  const protoByUser = new Map<string, any>();
  ((protoRes?.data as any[]) ?? []).forEach((r) => {
    const prev = protoByUser.get(r.user_id);
    if (!prev || String(r.created_at ?? "") > String(prev.created_at ?? "")) protoByUser.set(r.user_id, r);
  });

  const protocolIds = Array.from(new Set([...protoByUser.values()].map((p) => p.protocol_id).filter(Boolean)));
  const plansByProtocol = new Map<string, any[]>();
  if (protocolIds.length) {
    const { data: plans } = await db
      .from("fasting_weekly_plans")
      .select("protocol_id, week_number, fasting_pattern")
      .in("protocol_id", protocolIds);
    ((plans as any[]) ?? []).forEach((p) => {
      const arr = plansByProtocol.get(p.protocol_id) ?? [];
      arr.push(p);
      plansByProtocol.set(p.protocol_id, arr);
    });
  }

  for (const id of ids) {
    const proto = protoByUser.get(id);
    let bucket: FastingBucket | null = null;
    if (proto?.protocol_id && proto?.start_date) {
      const week = getCurrentWeek(proto.start_date);
      const plans = (plansByProtocol.get(proto.protocol_id) ?? []).sort((a, b) => a.week_number - b.week_number);
      const plan = plans.find((p) => p.week_number === week) ?? plans[0];
      bucket = bucketOf(plan?.fasting_pattern);
    }
    out.set(id, {
      exercise: bucket ? numOr(settings.get(`exercise_daily_minutes_${bucket}`), baseGoals.exercise) : baseGoals.exercise,
      yoga: bucket ? numOr(settings.get(`yoga_stress_daily_minutes_${bucket}`), baseGoals.yoga) : baseGoals.yoga,
    });
  }

  return out;
}


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
  suppTaken: 0, suppTotal: 0, exerciseLogs: 0, exerciseMinutes: 0, yogaMinutes: 0, mealsLogged: 0,
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

const fmtMin = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** @deprecated fallback only — real goals come from fetchActivityGoals(). */
export const EXERCISE_GOAL_MINUTES = DEFAULT_EXERCISE_MINUTE_GOAL;
export const YOGA_GOAL_MINUTES = DEFAULT_YOGA_MINUTE_GOAL;

/** Video IDs that count as "yoga & stress" (Pranayama, Yoga Asana, Bandha). */
const YOGA_VIDEO_IDS = new Set(
  exerciseLibrary
    .filter((v) => v.group === "Pranayama" || v.group === "Yoga Asana" || v.group === "Bandha")
    .map((v) => v.id),
);

/**
 * Split today's video_progress rows into exercise vs yoga watch minutes per user.
 * Mirrors yogaProgressService so coach nudges match what the patient sees.
 */
export function splitVideoMinutes(rows: any[] | null | undefined) {
  const exerciseMin = new Map<string, number>();
  const yogaMin = new Map<string, number>();
  const exSecByUserVideo = new Map<string, number>();
  const yogaSecByUserVideo = new Map<string, number>();

  (rows ?? []).forEach((r) => {
    const videoId = String(r.video_id ?? "");
    const secs = Math.max(0, Number(r.progress_sec ?? 0) || (r.completed ? Number(r.duration_sec ?? 0) : 0));
    if (!secs) return;
    const key = `${r.user_id}|${videoId}`;
    if (videoId.startsWith("exercise:")) {
      exSecByUserVideo.set(key, Math.max(exSecByUserVideo.get(key) ?? 0, secs));
    } else if (YOGA_VIDEO_IDS.has(videoId)) {
      yogaSecByUserVideo.set(key, (yogaSecByUserVideo.get(key) ?? 0) + secs);
    }
  });

  const accumulate = (src: Map<string, number>, dest: Map<string, number>) => {
    src.forEach((secs, key) => {
      const uid = key.split("|")[0];
      dest.set(uid, (dest.get(uid) ?? 0) + secs);
    });
    dest.forEach((secs, uid) => dest.set(uid, Math.round((secs / 60) * 10) / 10));
  };
  accumulate(exSecByUserVideo, exerciseMin);
  accumulate(yogaSecByUserVideo, yogaMin);

  return { exerciseMin, yogaMin };
}

/** Detailed progress text + ratio for every activity, so nudges are informed. */
export function buildActivityProgress(
  c: ActivityCounters,
  goals: ActivityGoals = DEFAULT_ACTIVITY_GOALS,
): AdherenceSummary["progress"] {
  const exerciseGoal = goals.exercise > 0 ? goals.exercise : DEFAULT_EXERCISE_MINUTE_GOAL;
  const yogaGoal = goals.yoga > 0 ? goals.yoga : DEFAULT_YOGA_MINUTE_GOAL;
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
      text: `${fmtMin(c.exerciseMinutes)}/${exerciseGoal} min of exercise${c.exerciseLogs > 0 ? ` · ${c.exerciseLogs} workout${c.exerciseLogs > 1 ? "s" : ""} logged` : ""}`,
      ratio: clamp(c.exerciseMinutes / exerciseGoal),
    },
    yoga: {
      text: `${fmtMin(c.yogaMinutes)}/${yogaGoal} min of yoga & stress`,
      ratio: clamp(c.yogaMinutes / yogaGoal),
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
    db.from("video_progress").select("user_id, video_id, progress_sec, duration_sec, completed").in("user_id", ids).gte("watched_at", todayIso),
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

  const { exerciseMin: exMinByUser, yogaMin: yogaMinByUser } = splitVideoMinutes((vidRows?.data as any[]) ?? []);

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
      exerciseMinutes: exMinByUser.get(id) ?? 0,
      yogaMinutes: yogaMinByUser.get(id) ?? 0,
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
      exercise: (exMinByUser.get(id) ?? 0) >= EXERCISE_MINUTE_GOAL,
      yoga: (yogaMinByUser.get(id) ?? 0) >= YOGA_MINUTE_GOAL,
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
