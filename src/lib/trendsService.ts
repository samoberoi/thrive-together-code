import { supabase } from "@/integrations/supabase/client";

export type TrendMetric = "health" | "weight" | "glucose" | "steps";

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function todayKey(): string {
  return dateKey(new Date().toISOString());
}

/** Record (upsert) today's health score so the trend has a daily datapoint. */
export async function recordDailyHealthScore(userId: string, score: number): Promise<void> {
  if (!userId || !Number.isFinite(score)) return;
  try {
    await (supabase as any)
      .from("health_score_daily")
      .upsert({ user_id: userId, date: todayKey(), score }, { onConflict: "user_id,date" });
  } catch {
    /* non-blocking */
  }
}

/** The date the user joined (profile creation), used as the default trend start. */
export async function fetchJoinDate(userId: string): Promise<string | null> {
  try {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("created_at")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.created_at ? dateKey(data.created_at) : null;
  } catch {
    return null;
  }
}

function dedupeByDate(points: TrendPoint[]): TrendPoint[] {
  const map = new Map<string, number>();
  for (const p of points) if (Number.isFinite(p.value)) map.set(p.date, p.value);
  return [...map.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Load a metric series for a user between two dates (inclusive, YYYY-MM-DD).
 * Sources: health_score_daily, health_logs and apple_health_snapshots.
 */
export async function fetchTrendSeries(
  userId: string,
  metric: TrendMetric,
  start: string,
  end: string,
): Promise<TrendPoint[]> {
  if (!userId) return [];
  const endExclusive = new Date(`${end}T23:59:59.999`).toISOString();
  const startIso = new Date(`${start}T00:00:00.000`).toISOString();

  try {
    if (metric === "health") {
      const { data } = await (supabase as any)
        .from("health_score_daily")
        .select("date, score")
        .eq("user_id", userId)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
      return dedupeByDate(((data as any[]) ?? []).map((r) => ({ date: r.date, value: Number(r.score) })));
    }

    if (metric === "steps") {
      // Steps live in two places: apple_health_snapshots (iOS snapshot card)
      // and health_logs.steps_count (the daily steps ring on every platform).
      // Merge both, keeping the larger value per day.
      const [{ data: snaps }, { data: logs }] = await Promise.all([
        (supabase as any)
          .from("apple_health_snapshots")
          .select("date, steps")
          .eq("user_id", userId)
          .gte("date", start)
          .lte("date", end)
          .order("date", { ascending: true }),
        (supabase as any)
          .from("health_logs")
          .select("logged_at, steps_count")
          .eq("user_id", userId)
          .eq("log_type", "steps")
          .gte("logged_at", startIso)
          .lte("logged_at", endExclusive)
          .order("logged_at", { ascending: true }),
      ]);
      const byDate = new Map<string, number>();
      for (const r of ((snaps as any[]) ?? [])) {
        if (r.steps == null) continue;
        byDate.set(r.date, Math.max(byDate.get(r.date) ?? 0, Number(r.steps)));
      }
      for (const r of ((logs as any[]) ?? [])) {
        if (r.steps_count == null) continue;
        const d = dateKey(r.logged_at);
        byDate.set(d, Math.max(byDate.get(d) ?? 0, Number(r.steps_count)));
      }
      return dedupeByDate([...byDate.entries()].map(([date, value]) => ({ date, value })));

    }

    const logType = metric === "weight" ? "weight" : "diabetes";
    const [{ data: logs }, { data: snaps }] = await Promise.all([
      (supabase as any)
        .from("health_logs")
        .select("logged_at, weight_kg, glucose_morning, glucose_evening")
        .eq("user_id", userId)
        .eq("log_type", logType)
        .gte("logged_at", startIso)
        .lte("logged_at", endExclusive)
        .order("logged_at", { ascending: true }),
      (supabase as any)
        .from("apple_health_snapshots")
        .select("date, weight_kg, glucose_mg_dl")
        .eq("user_id", userId)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true }),
    ]);

    const points: TrendPoint[] = [];
    for (const r of ((snaps as any[]) ?? [])) {
      const v = metric === "weight" ? r.weight_kg : r.glucose_mg_dl;
      if (v != null) points.push({ date: r.date, value: Number(v) });
    }
    for (const r of ((logs as any[]) ?? [])) {
      const v =
        metric === "weight"
          ? r.weight_kg
          : (r.glucose_morning ?? r.glucose_evening);
      if (v != null) points.push({ date: dateKey(r.logged_at), value: Number(v) });
    }
    return dedupeByDate(points);
  } catch {
    return [];
  }
}
