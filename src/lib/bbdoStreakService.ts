import { supabase } from "@/integrations/supabase/client";

/** A week counts as "kept" when the client is active on at least this many days. */
export const ACTIVE_DAYS_TARGET = 5;

export type StreakDay = {
  day: string;
  activities: string[];
  active: boolean;
  isFuture: boolean;
};

export type StreakWeekRow = {
  weekNumber: number;
  start: string;
  end: string;
  days: StreakDay[];
  activeDays: number;
  /** days in this week that already happened (used for the in-progress week) */
  elapsedDays: number;
  kept: boolean;
  inProgress: boolean;
};

export type BbdoStreakOverview = {
  startDate: string;
  today: string;
  totalDays: number;
  /** "daily" for the first 4 weeks on the platform, "weekly" afterwards */
  mode: "daily" | "weekly";
  weeks: StreakWeekRow[];
  activeDaysTotal: number;
  /** consecutive kept weeks ending at the most recent completed week */
  weekStreak: number;
  bestWeekStreak: number;
  /** consecutive active days ending today (or yesterday) */
  dayStreak: number;
  weeksKept: number;
  weeksTotal: number;
};

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function addDays(key: string, days: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

function diffDays(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000);
}

export function formatDayShort(key: string): string {
  return parseKey(key).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function buildOverview(
  startDate: string,
  today: string,
  byDay: Map<string, string[]>,
): BbdoStreakOverview {
  const totalDays = Math.max(1, diffDays(startDate, today) + 1);
  const weeksTotal = Math.ceil(totalDays / 7);
  const weeks: StreakWeekRow[] = [];

  for (let w = 0; w < weeksTotal; w++) {
    const start = addDays(startDate, w * 7);
    const end = addDays(start, 6);
    const days: StreakDay[] = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      const activities = byDay.get(day) ?? [];
      return { day, activities, active: activities.length > 0, isFuture: day > today };
    });
    const elapsedDays = days.filter((d) => !d.isFuture).length;
    const activeDays = days.filter((d) => d.active).length;
    weeks.push({
      weekNumber: w + 1,
      start,
      end,
      days,
      activeDays,
      elapsedDays,
      kept: activeDays >= ACTIVE_DAYS_TARGET,
      inProgress: elapsedDays < 7,
    });
  }

  // streak of kept weeks, counting backwards from the last completed week
  let weekStreak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const wk = weeks[i];
    if (wk.inProgress) {
      if (wk.kept) weekStreak++; // already earned it early
      continue;
    }
    if (wk.kept) weekStreak++;
    else break;
  }

  let bestWeekStreak = 0;
  let run = 0;
  for (const wk of weeks) {
    if (wk.kept) {
      run++;
      bestWeekStreak = Math.max(bestWeekStreak, run);
    } else if (!wk.inProgress) {
      run = 0;
    }
  }

  let dayStreak = 0;
  let cursor = today;
  if (!(byDay.get(today)?.length)) cursor = addDays(today, -1);
  while (cursor >= startDate && (byDay.get(cursor)?.length ?? 0) > 0) {
    dayStreak++;
    cursor = addDays(cursor, -1);
  }

  return {
    startDate,
    today,
    totalDays,
    mode: totalDays <= 28 ? "daily" : "weekly",
    weeks,
    activeDaysTotal: Array.from(byDay.values()).filter((a) => a.length > 0).length,
    weekStreak,
    bestWeekStreak,
    dayStreak,
    weeksKept: weeks.filter((w) => w.kept).length,
    weeksTotal,
  };
}

export async function fetchBbdoStreak(userId: string): Promise<BbdoStreakOverview | null> {
  const { data, error } = await (supabase as any).rpc("bbdo_streak_overview", { _user_id: userId });
  if (error || !data) return null;
  const byDay = new Map<string, string[]>();
  for (const row of (data.days ?? []) as Array<{ day: string; activities: string[] }>) {
    byDay.set(String(row.day).slice(0, 10), row.activities ?? []);
  }
  return buildOverview(String(data.start_date).slice(0, 10), String(data.today).slice(0, 10), byDay);
}
