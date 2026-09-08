import { supabase } from "@/integrations/supabase/client";

/** Health-risk snapshot for a member, derived from the last 7 days of logs. */
export interface RiskSnapshot {
  maxGlucose: number | null;
  maxSystolic: number | null;
  maxDiastolic: number | null;
  lastLoggedAt: string | null;
}

export const SEVERE_GLUCOSE = 200;
export const HIGH_GLUCOSE = 160;
export const SEVERE_SYSTOLIC = 160;
export const SEVERE_DIASTOLIC = 100;
export const HIGH_SYSTOLIC = 140;
export const HIGH_DIASTOLIC = 90;

export const isSevereSugar = (r?: RiskSnapshot) => (r?.maxGlucose ?? 0) >= SEVERE_GLUCOSE;
export const isHighSugar = (r?: RiskSnapshot) => (r?.maxGlucose ?? 0) >= HIGH_GLUCOSE;
export const isSevereBp = (r?: RiskSnapshot) =>
  (r?.maxSystolic ?? 0) >= SEVERE_SYSTOLIC || (r?.maxDiastolic ?? 0) >= SEVERE_DIASTOLIC;
export const isHighBp = (r?: RiskSnapshot) =>
  (r?.maxSystolic ?? 0) >= HIGH_SYSTOLIC || (r?.maxDiastolic ?? 0) >= HIGH_DIASTOLIC;

/**
 * One batched read of the last 7 days of blood-sugar / BP logs, reduced to the
 * worst reading per member so the admin list can filter on severity.
 */
export async function fetchRiskSnapshots(userIds: string[]): Promise<Map<string, RiskSnapshot>> {
  const out = new Map<string, RiskSnapshot>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return out;

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data } = await (supabase as any)
    .from("health_logs")
    .select("user_id, log_type, logged_at, glucose_morning, glucose_evening, bp_systolic, bp_diastolic")
    .in("log_type", ["diabetes", "bp"])
    .gte("logged_at", since.toISOString())
    .order("logged_at", { ascending: false })
    .limit(20000);

  for (const row of ((data as any[]) ?? [])) {
    const prev = out.get(row.user_id) ?? {
      maxGlucose: null, maxSystolic: null, maxDiastolic: null, lastLoggedAt: null,
    };
    const g = Math.max(Number(row.glucose_morning) || 0, Number(row.glucose_evening) || 0);
    if (g > 0) prev.maxGlucose = Math.max(prev.maxGlucose ?? 0, g);
    const s = Number(row.bp_systolic) || 0;
    const d = Number(row.bp_diastolic) || 0;
    if (s > 0) prev.maxSystolic = Math.max(prev.maxSystolic ?? 0, s);
    if (d > 0) prev.maxDiastolic = Math.max(prev.maxDiastolic ?? 0, d);
    if (!prev.lastLoggedAt || String(row.logged_at) > prev.lastLoggedAt) prev.lastLoggedAt = row.logged_at;
    out.set(row.user_id, prev);
  }
  return out;
}
