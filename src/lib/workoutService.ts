import { supabase } from "@/integrations/supabase/client";
import type { Exercise2 } from "@/lib/exercise2Service";

const db = supabase as any;

export type WorkoutPhase = "warm_up" | "main" | "cool_down";

export const PHASE_LABEL: Record<WorkoutPhase, string> = {
  warm_up: "Warm-up",
  main: "Main",
  cool_down: "Cool-down",
};

export const PHASE_OPTIONS: WorkoutPhase[] = ["warm_up", "main", "cool_down"];

/** Session lengths offered to members. */
export const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60];

export interface WorkoutPlan {
  id: string;
  name: string;
  description: string | null;
  plan_kind: "user" | "coach" | "weekly";
  owner_id: string | null;
  coach_id: string | null;
  created_by: string | null;
  duration_minutes: number;
  workout_type_id: string | null;
  experience_level_id: string | null;
  muscle_group_ids: string[];
  equipment_ids: string[];
  is_published: boolean;
  enabled: boolean;
  created_at: string;
}

export type WorkoutItemMode = "time" | "reps";

/** Rough seconds a single rep takes, used to price a reps-based drill into the plan length. */
export const SECONDS_PER_REP = 4;

export interface WorkoutPlanItem {
  id?: string;
  plan_id?: string;
  exercise_id: string;
  position: number;
  work_seconds: number;
  rest_seconds: number;
  phase: WorkoutPhase;
  mode?: WorkoutItemMode;
  reps?: number;
}

/** Seconds a drill occupies, whether it is timed or rep-counted. */
export function itemWorkSeconds(i: WorkoutPlanItem): number {
  if (i.mode === "reps") return Math.max(SECONDS_PER_REP, (i.reps || 1) * SECONDS_PER_REP);
  return i.work_seconds;
}

/** A plan item joined with the exercise it plays. */
export interface PlayableItem extends WorkoutPlanItem {
  exercise: Exercise2;
}

/* ─────────────────────────── Pool ─────────────────────────── */

/** Every enabled Exercise 2.0 entry with its taxonomy links, for building plans. */
export async function listWorkoutPool(): Promise<Exercise2[]> {
  const { data, error } = await db
    .from("exercises_v2")
    .select("*")
    .eq("enabled", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  const rows = (data ?? []) as Exercise2[];
  const byId = new Map<string, Exercise2>();
  rows.forEach((r) => {
    r.age_group_ids = [];
    r.equipment_ids = [];
    r.muscle_group_ids = [];
    byId.set(r.id, r);
  });
  const links: [string, string, keyof Exercise2][] = [
    ["exercises_v2_age_groups", "age_group_id", "age_group_ids"],
    ["exercises_v2_equipment", "equipment_id", "equipment_ids"],
    ["exercises_v2_muscle_groups", "muscle_group_id", "muscle_group_ids"],
  ];
  await Promise.all(
    links.map(async ([table, col, field]) => {
      const { data: rowsL } = await db.from(table).select("*");
      (rowsL ?? []).forEach((row: any) => {
        const ex = byId.get(row.exercise_id);
        if (ex) (ex[field] as string[]).push(row[col]);
      });
    })
  );
  return rows;
}

/* ───────────────────────── Generator ───────────────────────── */

export interface GenerateOptions {
  durationMinutes: number;
  workoutTypeId?: string | null;
  experienceLevelId?: string | null;
  /** Ordered from easiest, used so "intermediate" can also use beginner drills. */
  experienceOrder?: string[];
  muscleGroupIds?: string[];
  equipmentIds?: string[];
  ageGroupId?: string | null;
  targetAudienceIds?: string[];
  /** Exercise ids to avoid (e.g. already used earlier in the week). */
  avoidIds?: string[];
  seed?: number;
}

const PACE: Record<"beginner" | "intermediate" | "advanced", { work: number; rest: number }> = {
  beginner: { work: 30, rest: 20 },
  intermediate: { work: 40, rest: 15 },
  advanced: { work: 45, rest: 15 },
};

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function matches(ex: Exercise2, o: GenerateOptions, allowedLevels: Set<string> | null) {
  if (o.workoutTypeId && ex.workout_type_id !== o.workoutTypeId) return false;
  if (allowedLevels && ex.experience_level_id && !allowedLevels.has(ex.experience_level_id)) return false;
  if (o.ageGroupId && ex.age_group_ids.length && !ex.age_group_ids.includes(o.ageGroupId)) return false;
  if (o.targetAudienceIds?.length && ex.target_audience_id && !o.targetAudienceIds.includes(ex.target_audience_id))
    return false;
  if (o.equipmentIds?.length && ex.equipment_ids.length && !ex.equipment_ids.some((e) => o.equipmentIds!.includes(e)))
    return false;
  return true;
}

function paceFor(levelSlug: string | undefined): { work: number; rest: number } {
  if (levelSlug === "advanced") return PACE.advanced;
  if (levelSlug === "intermediate") return PACE.intermediate;
  return PACE.beginner;
}

/**
 * Build a session: warm-up → main → cool-down, filling the requested duration.
 * Exercises never repeat unless the matching pool is too small to fill the time.
 */
export function generateWorkout(
  pool: Exercise2[],
  o: GenerateOptions,
  levelSlugById: Record<string, string> = {}
): WorkoutPlanItem[] {
  const rnd = mulberry(o.seed ?? Date.now());
  const total = Math.max(5, o.durationMinutes) * 60;

  // Levels up to and including the chosen one.
  let allowed: Set<string> | null = null;
  if (o.experienceLevelId && o.experienceOrder?.length) {
    const idx = o.experienceOrder.indexOf(o.experienceLevelId);
    if (idx >= 0) allowed = new Set(o.experienceOrder.slice(0, idx + 1));
  }

  const eligible = pool.filter((e) => matches(e, o, allowed));
  const byPhase = (p: WorkoutPhase) => eligible.filter((e) => ((e as any).phase ?? "main") === p);

  const wanted = new Set(o.muscleGroupIds ?? []);
  const scored = (list: Exercise2[]) => {
    if (!wanted.size) return shuffle(list, rnd);
    const hit = list.filter((e) => e.muscle_group_ids.some((m) => wanted.has(m)));
    const rest = list.filter((e) => !e.muscle_group_ids.some((m) => wanted.has(m)));
    return [...shuffle(hit, rnd), ...shuffle(rest, rnd)];
  };

  const pace = paceFor(levelSlugById[o.experienceLevelId ?? ""]);
  const avoid = new Set(o.avoidIds ?? []);

  let warm = scored(byPhase("warm_up"));
  let cool = scored(byPhase("cool_down"));
  let main = scored(byPhase("main"));

  // If nothing is tagged warm-up / cool-down yet, borrow gentle drills from the pool.
  if (!warm.length) warm = main.slice(0, 4);
  if (!cool.length) cool = [...main].reverse().slice(0, 3);
  main = main.filter((e) => !avoid.has(e.id)).length >= 4 ? main.filter((e) => !avoid.has(e.id)) : main;

  const budget = {
    warm_up: Math.round(total * 0.15),
    cool_down: Math.round(total * 0.12),
  };
  budget.warm_up = Math.max(60, budget.warm_up);
  budget.cool_down = Math.max(60, budget.cool_down);
  const mainBudget = Math.max(120, total - budget.warm_up - budget.cool_down);

  const items: WorkoutPlanItem[] = [];
  let position = 0;

  const fill = (
    list: Exercise2[],
    phase: WorkoutPhase,
    seconds: number,
    work: number,
    rest: number
  ) => {
    if (!list.length) return;
    let spent = 0;
    let i = 0;
    while (i < 200) {
      const ex = list[i % list.length];
      // Use the clip's own length when it has one, so the maths matches the videos.
      const clip = (ex as any).duration_seconds as number | undefined;
      const workSeconds = clip && clip > 0 ? Math.min(90, Math.max(15, clip)) : work;
      if (spent + workSeconds > seconds) break;
      items.push({
        exercise_id: ex.id,
        position: position++,
        work_seconds: workSeconds,
        rest_seconds: rest,
        phase,
        mode: "time",
        reps: 0,
      });
      spent += workSeconds + rest;
      i++;
    }
  };

  fill(warm, "warm_up", budget.warm_up, 30, 10);
  fill(main, "main", mainBudget, pace.work, pace.rest);
  fill(cool, "cool_down", budget.cool_down, 30, 5);

  return items;
}

export function planDurationSeconds(items: WorkoutPlanItem[]): number {
  return items.reduce((s, i) => s + itemWorkSeconds(i) + i.rest_seconds, 0);
}

export function attachExercises(items: WorkoutPlanItem[], pool: Exercise2[]): PlayableItem[] {
  const byId = new Map(pool.map((e) => [e.id, e]));
  return items
    .map((i) => ({ ...i, exercise: byId.get(i.exercise_id)! }))
    .filter((i) => !!i.exercise)
    .sort((a, b) => a.position - b.position);
}

/* ─────────────────────────── Plans ─────────────────────────── */

export async function listMyPlans(userId: string): Promise<WorkoutPlan[]> {
  const { data, error } = await db
    .from("workout_plans")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkoutPlan[];
}

export async function listCoachPlans(): Promise<WorkoutPlan[]> {
  const { data, error } = await db
    .from("workout_plans")
    .select("*")
    .eq("plan_kind", "coach")
    .eq("is_published", true)
    .eq("enabled", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkoutPlan[];
}

/** Everything a coach authored, published or not. */
export async function listPlansCreatedBy(userId: string): Promise<WorkoutPlan[]> {
  const { data, error } = await db
    .from("workout_plans")
    .select("*")
    .eq("created_by", userId)
    .eq("plan_kind", "coach")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkoutPlan[];
}

export async function loadPlanItems(planId: string): Promise<WorkoutPlanItem[]> {
  const { data, error } = await db
    .from("workout_plan_items")
    .select("*")
    .eq("plan_id", planId)
    .order("position");
  if (error) throw error;
  return (data ?? []) as WorkoutPlanItem[];
}

export async function savePlan(
  plan: Partial<WorkoutPlan> & { name: string },
  items: WorkoutPlanItem[],
  createdBy: string
): Promise<string> {
  const payload = {
    name: plan.name,
    description: plan.description ?? null,
    plan_kind: plan.plan_kind ?? "user",
    owner_id: plan.owner_id ?? null,
    coach_id: plan.coach_id ?? null,
    created_by: createdBy,
    duration_minutes: plan.duration_minutes ?? 15,
    workout_type_id: plan.workout_type_id ?? null,
    experience_level_id: plan.experience_level_id ?? null,
    muscle_group_ids: plan.muscle_group_ids ?? [],
    equipment_ids: plan.equipment_ids ?? [],
    is_published: plan.is_published ?? false,
    enabled: plan.enabled ?? true,
  };
  let planId = plan.id;
  if (planId) {
    const { error } = await db
      .from("workout_plans")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", planId);
    if (error) throw error;
    const { error: delErr } = await db.from("workout_plan_items").delete().eq("plan_id", planId);
    if (delErr) throw delErr;
  } else {
    const { data, error } = await db.from("workout_plans").insert(payload).select("id").single();
    if (error) throw error;
    planId = data.id as string;
  }
  if (items.length) {
    const { error } = await db.from("workout_plan_items").insert(
      items.map((i, idx) => ({
        plan_id: planId,
        exercise_id: i.exercise_id,
        position: idx,
        work_seconds: i.work_seconds,
        mode: i.mode ?? "time",
        reps: i.reps ?? 0,
        rest_seconds: i.rest_seconds,
        phase: i.phase,
      }))
    );
    if (error) throw error;
  }
  return planId!;
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await db.from("workout_plans").delete().eq("id", id);
  if (error) throw error;
}

export async function setPlanPublished(id: string, published: boolean): Promise<void> {
  const { error } = await db.from("workout_plans").update({ is_published: published }).eq("id", id);
  if (error) throw error;
}

/* ───────────────────────── Weekly plan ───────────────────────── */

export interface ScheduleDay {
  weekday: number;
  plan_id: string | null;
  is_rest_day: boolean;
}

export const WEEKDAY_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function loadSchedule(userId: string): Promise<ScheduleDay[]> {
  const { data, error } = await db.from("workout_schedule").select("*").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as ScheduleDay[];
}

export async function saveScheduleDay(userId: string, day: ScheduleDay): Promise<void> {
  const { error } = await db.from("workout_schedule").upsert(
    {
      user_id: userId,
      weekday: day.weekday,
      plan_id: day.plan_id,
      is_rest_day: day.is_rest_day,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,weekday" }
  );
  if (error) throw error;
}

/* ───────────────────────── Sessions ───────────────────────── */

export async function startSession(userId: string, plan: { id?: string; name: string }): Promise<string | null> {
  const { data, error } = await db
    .from("workout_sessions")
    .insert({ user_id: userId, plan_id: plan.id ?? null, plan_name: plan.name })
    .select("id")
    .single();
  if (error) return null;
  return data.id as string;
}

export async function updateSession(
  sessionId: string,
  patch: { last_position?: number; exercises_done?: number; seconds_done?: number; completed?: boolean }
): Promise<void> {
  const body: any = { ...patch };
  delete body.completed;
  if (patch.completed) body.completed_at = new Date().toISOString();
  await db.from("workout_sessions").update(body).eq("id", sessionId);
}

/** Most recent unfinished session, so members can resume where they stopped. */
export async function lastUnfinishedSession(userId: string): Promise<any | null> {
  const { data } = await db
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1);
  return (data ?? [])[0] ?? null;
}

/** Credit the member's existing exercise log so rings and streaks pick it up. */
export async function logExerciseCompletion(userId: string, sourceExerciseId: string | null): Promise<void> {
  if (!sourceExerciseId) return;
  await db.from("user_exercise_logs").insert({
    user_id: userId,
    exercise_id: sourceExerciseId,
    sets_done: 1,
  });
}
