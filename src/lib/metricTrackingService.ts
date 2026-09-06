import { supabase } from "@/integrations/supabase/client";

export type TrackedMetric = "bp" | "diabetes" | "weight" | "water";

export interface MetricPref {
  metric: TrackedMetric;
  enabled: boolean;
  frequency: "daily" | "custom";
  /** 0 = Sunday … 6 = Saturday */
  days_of_week: number[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function defaultPref(metric: TrackedMetric): MetricPref {
  return { metric, enabled: true, frequency: "daily", days_of_week: ALL_DAYS };
}

function normalise(row: any, metric: TrackedMetric): MetricPref {
  const days = Array.isArray(row?.days_of_week) && row.days_of_week.length > 0
    ? row.days_of_week.map((d: any) => Number(d)).filter((d: number) => d >= 0 && d <= 6)
    : ALL_DAYS;
  return {
    metric,
    enabled: row?.enabled !== false,
    frequency: row?.frequency === "custom" ? "custom" : "daily",
    days_of_week: days,
  };
}

/** All tracking preferences for a user, with sensible defaults for missing rows. */
export async function fetchMetricPrefs(userId: string): Promise<Record<TrackedMetric, MetricPref>> {
  const prefs: Record<TrackedMetric, MetricPref> = {
    bp: defaultPref("bp"),
    diabetes: defaultPref("diabetes"),
    weight: defaultPref("weight"),
    water: defaultPref("water"),
  };
  if (!userId) return prefs;
  try {
    const { data } = await (supabase as any)
      .from("metric_tracking_prefs")
      .select("metric, enabled, frequency, days_of_week")
      .eq("user_id", userId);
    for (const row of (data ?? []) as any[]) {
      const m = row.metric as TrackedMetric;
      if (m in prefs) prefs[m] = normalise(row, m);
    }
  } catch {
    /* defaults */
  }
  return prefs;
}

export async function fetchMetricPref(userId: string, metric: TrackedMetric): Promise<MetricPref> {
  const all = await fetchMetricPrefs(userId);
  return all[metric];
}

export async function saveMetricPref(userId: string, pref: MetricPref): Promise<boolean> {
  const payload = {
    user_id: userId,
    metric: pref.metric,
    enabled: pref.enabled,
    frequency: pref.frequency,
    days_of_week: pref.frequency === "daily" ? ALL_DAYS : pref.days_of_week,
  };
  const { error } = await (supabase as any)
    .from("metric_tracking_prefs")
    .upsert(payload, { onConflict: "user_id,metric" });
  if (error) console.error("Failed to save tracking preference", error);
  return !error;
}

/** Should this metric's ring appear today? */
export function isScheduledToday(pref: MetricPref | undefined, date = new Date()): boolean {
  if (!pref || !pref.enabled) return false;
  if (pref.frequency === "daily") return true;
  return pref.days_of_week.includes(date.getDay());
}

export function scheduleSummary(pref: MetricPref): string {
  if (!pref.enabled) return "Not tracking";
  if (pref.frequency === "daily") return "Every day";
  if (pref.days_of_week.length === 0) return "No days selected";
  const sorted = [...pref.days_of_week].sort((a, b) => a - b);
  return sorted.map((d) => DAY_NAMES[d].slice(0, 3)).join(" · ");
}
