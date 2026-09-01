import { supabase } from "@/integrations/supabase/client";

export type BbdoBadge = {
  id: string;
  user_id: string;
  badge_type: "weekly" | "monthly";
  period_start: string;
  period_end: string;
  period_number: number;
  snapshot: BadgeSnapshot;
  pdf_url: string | null;
  viewed: boolean;
  earned_at: string;
};

export type BadgeSnapshot = {
  weight_start?: number | null;
  weight_end?: number | null;
  glucose_start?: number | null;
  glucose_end?: number | null;
  total_steps?: number;
  total_water_glasses?: number;
  total_exercise_min?: number;
  total_yoga_min?: number;
  total_supplements?: number;
  total_fasting_hours?: number;
  complete_days?: number;
};

export type GlobalStreak = {
  current_streak: number;
  longest_streak: number;
  last_complete_date: string | null;
  total_complete_days: number;
};

export type StreakWeekDay = {
  day: string;
  all_complete: boolean;
  is_future: boolean;
};

export type StreakWeek = {
  start_date: string;
  week_number: number;
  days: StreakWeekDay[];
};

function toLocalDateKey(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

function daysBetween(startKey: string, endKey: string): number {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

export async function getUserStreakStartDate(userId: string): Promise<string> {
  const today = toLocalDateKey(new Date());

  const { data: activeSubscription } = await (supabase as any)
    .from("subscriptions")
    .select("started_at, created_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const subscriptionStart = activeSubscription?.started_at ?? activeSubscription?.created_at;
  if (subscriptionStart) return String(subscriptionStart).slice(0, 10);

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("created_at")
    .eq("user_id", userId)
    .maybeSingle();

  return profile?.created_at ? String(profile.created_at).slice(0, 10) : today;
}

export async function tickGlobalStreak(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await (supabase as any).rpc("compute_global_streak_for_user", { _user_id: user.id });
}

export async function getGlobalStreak(): Promise<GlobalStreak | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await (supabase as any)
    .from("user_global_streak")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return data as GlobalStreak | null;
}

export async function getWeekDays(): Promise<StreakWeek> {
  const { data: { user } } = await supabase.auth.getUser();
  const today = toLocalDateKey(new Date());
  if (!user) {
    return {
      start_date: today,
      week_number: 1,
      days: Array.from({ length: 7 }, (_, index) => ({
        day: addDays(today, index),
        all_complete: false,
        is_future: index > 0,
      })),
    };
  }

  const programStart = await getUserStreakStartDate(user.id);
  const elapsedDays = Math.max(0, daysBetween(programStart, today));
  const weekIndex = Math.floor(elapsedDays / 7);
  const weekStart = addDays(programStart, weekIndex * 7);
  const weekEnd = addDays(weekStart, 6);

  const { data } = await (supabase as any)
    .from("user_global_streak_days")
    .select("day, all_complete")
    .eq("user_id", user.id)
    .gte("day", weekStart)
    .lte("day", weekEnd)
    .order("day", { ascending: true });

  const byDay = new Map<string, boolean>((data ?? []).map((row: any) => [String(row.day), Boolean(row.all_complete)]));
  return {
    start_date: weekStart,
    week_number: weekIndex + 1,
    days: Array.from({ length: 7 }, (_, index) => {
      const day = addDays(weekStart, index);
      return {
        day,
        all_complete: byDay.get(day) ?? false,
        is_future: day > today,
      };
    }),
  };
}

const DISMISSED_BADGES_KEY = "bbdo_dismissed_badges";

function readDismissedBadges(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_BADGES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Locally remember a dismissed badge so it never re-opens, even if the
 *  server-side `viewed` write is slow, offline or fails. */
export function dismissBadgeLocally(id: string): void {
  try {
    const next = Array.from(new Set([...readDismissedBadges(), id])).slice(-50);
    localStorage.setItem(DISMISSED_BADGES_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — server `viewed` flag still applies */
  }
}

export function isBadgeDismissedLocally(id: string): boolean {
  return readDismissedBadges().includes(id);
}

export async function getUnviewedBadge(): Promise<BbdoBadge | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await (supabase as any)
    .from("user_bbdo_badges")
    .select("*")
    .eq("user_id", user.id)
    .eq("viewed", false)
    .order("earned_at", { ascending: true })
    .limit(10);
  const rows = (data ?? []) as BbdoBadge[];
  return rows.find((b) => !isBadgeDismissedLocally(b.id)) ?? null;
}


export async function listBbdoBadges(): Promise<BbdoBadge[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await (supabase as any)
    .from("user_bbdo_badges")
    .select("*")
    .eq("user_id", user.id)
    .order("earned_at", { ascending: false });
  return (data ?? []) as BbdoBadge[];
}

export async function markBadgeViewed(id: string): Promise<void> {
  await (supabase as any).from("user_bbdo_badges").update({ viewed: true }).eq("id", id);
}

export async function getStreakConfig(): Promise<any | null> {
  const { data } = await (supabase as any)
    .from("global_streak_config")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function updateStreakConfig(patch: any): Promise<void> {
  const cfg = await getStreakConfig();
  if (!cfg) return;
  await (supabase as any).from("global_streak_config").update(patch).eq("id", cfg.id);
}
