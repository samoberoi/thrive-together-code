import { sanitizeDailySteps } from "@/lib/healthStepsMath";
import { supabase } from "@/integrations/supabase/client";
import {
  getMovementConfig,
  listMovementLevels,
  listMovementBadges,
  computeRecommendedSteps,
  type MovementConfig,
  type MovementLevel,
  type MovementBadge,
} from "@/lib/movementService";

export type UserMovementProgress = {
  id?: string;
  user_id: string;
  current_level: number;
  weeks_at_current_level: number;
  current_streak_weeks: number;
  longest_streak_weeks: number;
  total_weeks_completed: number;
  total_weeks_missed: number;
  custom_daily_step_goal?: number | null;
  custom_goal_set_by?: string | null;
  custom_goal_note?: string | null;
  custom_goal_updated_at?: string | null;
};

export type UserMovementBadge = {
  id: string;
  user_id: string;
  badge_code: string;
  earned_at: string;
};

export async function fetchUserProgress(userId: string): Promise<UserMovementProgress | null> {
  const { data, error } = await supabase
    .from("user_movement_progress" as any)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

/** Minimum daily step target for coaches (lead by example). */
export const COACH_MIN_DAILY_STEPS = 7500;

export async function ensureUserProgress(
  userId: string,
  profile: { bmiCategory?: string | null; activityLevel?: string | null; age?: number | null; weightKg?: number | null; heightCm?: number | null },
  opts?: { minTargetSteps?: number },
): Promise<{ progress: UserMovementProgress; level: MovementLevel | null; targetSteps: number }> {
  let progress = await fetchUserProgress(userId);
  const [cfg, levels] = await Promise.all([getMovementConfig(), listMovementLevels()]);

  if (!progress) {
    // Pick the level whose target is closest to the recommended starting steps
    let startLevel = 1;
    if (cfg) {
      const rec = computeRecommendedSteps(cfg, profile);
      const sorted = [...levels].sort(
        (a, b) => Math.abs(a.target_daily_steps - rec) - Math.abs(b.target_daily_steps - rec),
      );
      startLevel = sorted[0]?.level_number ?? 1;
    }
    const row = {
      user_id: userId,
      current_level: startLevel,
      weeks_at_current_level: 0,
      current_streak_weeks: 0,
      longest_streak_weeks: 0,
      total_weeks_completed: 0,
      total_weeks_missed: 0,
    };
    const { data, error } = await supabase
      .from("user_movement_progress" as any)
      .insert(row as any)
      .select("*")
      .single();
    if (error) throw error;
    progress = data as any;
  }

  const level = levels.find((l) => l.level_number === progress!.current_level) ?? levels[0] ?? null;
  // Coach override wins over any auto calculation.
  const coachOverride = progress?.custom_daily_step_goal ?? null;
  const recommended = cfg ? computeRecommendedSteps(cfg, profile) : (level?.target_daily_steps ?? 5000);
  const levelTarget = level?.target_daily_steps ?? (cfg?.base_daily_steps ?? 5000);
  const autoTarget = Math.max(500, Math.min(levelTarget, recommended));
  const base = coachOverride && coachOverride > 0 ? coachOverride : autoTarget;
  const targetSteps = Math.max(base, opts?.minTargetSteps ?? 0);
  return { progress: progress!, level, targetSteps };
}

export async function fetchUserBadges(userId: string): Promise<UserMovementBadge[]> {
  const { data, error } = await supabase
    .from("user_movement_badges" as any)
    .select("*")
    .eq("user_id", userId)
    .order("earned_at", { ascending: false });
  if (error) throw error;
  return ((data as any) || []) as UserMovementBadge[];
}

// --- Daily steps log (stored on health_logs with log_type = 'steps') ---

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDayBoundsIso(dateIso = localDateString()) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const start = new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
  const end = new Date(year, (month || 1) - 1, day || 1, 23, 59, 59, 999);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function logTodaySteps(userId: string, rawSteps: number, dateIso?: string) {
  // Never persist an implausible daily count (provider double-counting bugs).
  const steps = sanitizeDailySteps(rawSteps);
  const date = dateIso || localDateString();
  const { startIso, endIso } = localDayBoundsIso(date);
  // Look for an existing log today
  const { data: existingRaw } = await supabase
    .from("health_logs")
    .select("id, logged_at, steps_count" as any)
    .eq("user_id", userId)
    .eq("log_type", "steps" as any)
    .gte("logged_at", startIso)
    .lte("logged_at", endIso)
    .order("logged_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existing = (existingRaw as any) ?? null;

  if (existing?.id) {
    // Auto-sync re-reads the same step count constantly; don't write it again.
    if (Number(existing.steps_count ?? -1) === Number(steps)) return;
    const { error } = await supabase
      .from("health_logs")
      .update({ steps_count: steps } as any)
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("health_logs")
      .insert({
        user_id: userId,
        log_type: "steps" as any,
        steps_count: steps,
        logged_at: new Date().toISOString(),
      } as any);
    if (error) throw error;
  }
}

export async function fetchStepsHistory(userId: string, days = 14): Promise<{ date: string; steps: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  since.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("health_logs")
    .select("logged_at, steps_count" as any)
    .eq("user_id", userId)
    .eq("log_type", "steps" as any)
    .gte("logged_at", since.toISOString())
    .order("logged_at", { ascending: true });
  if (error) throw error;
  const byDate: Record<string, number> = {};
  for (const r of ((data as any) || [])) {
    const d = localDateString(new Date(String(r.logged_at)));
    byDate[d] = Math.max(byDate[d] || 0, sanitizeDailySteps(Number(r.steps_count || 0)));
  }
  const out: { date: string; steps: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const iso = localDateString(d);
    out.push({ date: iso, steps: byDate[iso] || 0 });
  }
  return out;
}

export async function fetchTodaySteps(userId: string): Promise<number> {
  const date = localDateString();
  const { startIso, endIso } = localDayBoundsIso(date);
  const { data } = await supabase
    .from("health_logs")
    .select("steps_count" as any)
    .eq("user_id", userId)
    .eq("log_type", "steps" as any)
    .gte("logged_at", startIso)
    .lte("logged_at", endIso)
    .order("logged_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return sanitizeDailySteps(Number((data as any)?.steps_count || 0));
}

export type MovementOverview = {
  progress: UserMovementProgress;
  level: MovementLevel | null;
  targetSteps: number;
  todaySteps: number;
  history: { date: string; steps: number }[];
  badgesEarned: UserMovementBadge[];
  allBadges: MovementBadge[];
  config: MovementConfig | null;
  levels: MovementLevel[];
  /** Multiplier applied to each level's raw target to fit this user's profile. */
  modifierRatio: number;
  /** Levels with `target_daily_steps` scaled to the user's modifier ratio. */
  personalLevels: MovementLevel[];
  /** Next level target scaled for this user (0 when at max level). */
  nextLevelTarget: number;
};

/** Scale a raw step count by the user's modifier ratio, rounded to nearest 500. */
export function scaleStepsForUser(rawSteps: number, modifierRatio: number): number {
  const scaled = rawSteps * (modifierRatio || 1);
  return Math.max(500, Math.round(scaled / 500) * 500);
}

export async function fetchMovementOverview(
  userId: string,
  profile: { bmiCategory?: string | null; activityLevel?: string | null; age?: number | null; weightKg?: number | null; heightCm?: number | null },
  opts?: { minTargetSteps?: number },
): Promise<MovementOverview> {
  await supabase.rpc("recompute_movement_progress_for_user" as any, { _user_id: userId });

  const [{ progress, level, targetSteps }, todaySteps, history, badgesEarned, allBadges, config, levels] =
    await Promise.all([
      ensureUserProgress(userId, profile, opts),
      fetchTodaySteps(userId),
      fetchStepsHistory(userId, 14),
      fetchUserBadges(userId),
      listMovementBadges(),
      getMovementConfig(),
      listMovementLevels(),
    ]);
  const modifierRatio = level?.target_daily_steps
    ? targetSteps / level.target_daily_steps
    : 1;
  const personalLevels = levels.map((l) => ({
    ...l,
    target_daily_steps: scaleStepsForUser(l.target_daily_steps, modifierRatio),
  }));
  const nextRaw = levels.find((l) => l.level_number === (level?.level_number ?? 0) + 1);
  const nextLevelTarget = nextRaw ? scaleStepsForUser(nextRaw.target_daily_steps, modifierRatio) : 0;
  return {
    progress,
    level,
    targetSteps,
    todaySteps,
    history,
    badgesEarned,
    allBadges,
    config,
    levels,
    modifierRatio,
    personalLevels,
    nextLevelTarget,
  };
}
