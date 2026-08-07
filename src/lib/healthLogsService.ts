import { supabase } from "@/integrations/supabase/client";
import { fireHealthMetricFeedback } from "@/lib/healthAlerts";

export interface HealthLog {
  id: string;
  user_id: string;
  log_type: "diabetes" | "bp" | "weight" | "water";
  logged_at: string;
  glucose_morning: number | null;
  glucose_evening: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  weight_kg: number | null;
  created_at: string;
}

export async function fetchHealthLogs(logType: string, userId?: string): Promise<HealthLog[]> {
  let query = supabase
    .from("health_logs" as any)
    .select("*")
    .eq("log_type", logType)
    .order("logged_at", { ascending: false })
    .limit(30);

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch health logs:", error);
    return [];
  }
  return (data as unknown as HealthLog[]) ?? [];
}

/**
 * Fetch several log types for one user in a SINGLE query.
 * Home used to fire four separate requests (diabetes/bp/weight/water) twice per
 * visit — this collapses them into one round trip and groups client-side.
 */
export async function fetchHealthLogsMulti(
  userId: string,
  logTypes: string[],
  perType = 30,
): Promise<Record<string, HealthLog[]>> {
  const grouped: Record<string, HealthLog[]> = {};
  for (const t of logTypes) grouped[t] = [];
  if (!userId || logTypes.length === 0) return grouped;

  const { data, error } = await supabase
    .from("health_logs" as any)
    .select("*")
    .eq("user_id", userId)
    .in("log_type", logTypes)
    .order("logged_at", { ascending: false })
    .limit(perType * logTypes.length);

  if (error) {
    console.error("Failed to fetch health logs:", error);
    return grouped;
  }

  for (const row of (data as unknown as HealthLog[]) ?? []) {
    const bucket = grouped[row.log_type];
    if (bucket && bucket.length < perType) bucket.push(row);
  }
  return grouped;
}

export async function insertHealthLog(log: Partial<Omit<HealthLog, "id" | "created_at">> & { user_id: string; log_type: HealthLog["log_type"] }) {
  const { data, error } = await supabase
    .from("health_logs" as any)
    .insert(log as any)
    .select()
    .single();

  if (error) {
    console.error("Failed to insert health log:", error);
    return null;
  }

  // Fetch previous weight for delta alerts
  let prevWeight: number | null = null;
  if (log.log_type === "weight") {
    const { data: prev } = await supabase
      .from("health_logs" as any)
      .select("weight_kg")
      .eq("user_id", log.user_id)
      .eq("log_type", "weight")
      .neq("id", (data as any).id)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    prevWeight = (prev as any)?.weight_kg ?? null;
  }

  void fireHealthMetricFeedback(log, prevWeight, { createInboxNotification: false });

  return data as unknown as HealthLog;
}

/** Seed initial health logs from onboarding data */
export async function insertOnboardingLogs(userId: string, data: {
  weight?: number;
  fastingGlucose?: number;
}) {
  const now = new Date().toISOString();
  const logs: Omit<HealthLog, "id" | "created_at">[] = [];

  if (data.weight) {
    logs.push({
      user_id: userId,
      log_type: "weight",
      logged_at: now,
      glucose_morning: null,
      glucose_evening: null,
      bp_systolic: null,
      bp_diastolic: null,
      weight_kg: data.weight,
    });
  }

  if (data.fastingGlucose) {
    logs.push({
      user_id: userId,
      log_type: "diabetes",
      logged_at: now,
      glucose_morning: data.fastingGlucose,
      glucose_evening: null,
      bp_systolic: null,
      bp_diastolic: null,
      weight_kg: null,
    });
  }

  if (logs.length === 0) return;

  // Onboarding writes exactly ONE baseline row per type. Any earlier rows are
  // phantom defaults written mid-onboarding — remove them so the user never sees
  // a fake "weight increased" delta (and no alert trigger fires against them).
  const types = Array.from(new Set(logs.map((l) => l.log_type)));
  await supabase
    .from("health_logs" as any)
    .delete()
    .eq("user_id", userId)
    .in("log_type", types);

  const { error } = await supabase
    .from("health_logs" as any)
    .insert(logs as any);


  if (error) {
    console.error("Failed to seed onboarding health logs:", error);
  }
}

/** Backfill initial logs from profile for existing users who onboarded before logging was added */
const BACKFILL_FLAG_PREFIX = "bb_health_backfilled_";

export async function backfillFromProfile(userId: string) {
  // Once a user has been backfilled (or is known to already have logs) we never
  // need to run the count + profile probe again on future app launches.
  const flagKey = `${BACKFILL_FLAG_PREFIX}${userId}`;
  try {
    if (localStorage.getItem(flagKey)) return;
  } catch {}

  const markDone = () => {
    try { localStorage.setItem(flagKey, "1"); } catch {}
  };

  // Check if any logs exist already
  const { count, error: countErr } = await supabase
    .from("health_logs" as any)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countErr) return;
  if (count && count > 0) { markDone(); return; } // already has logs

  // Fetch profile to get weight & fasting glucose
  const { data: profile, error: profErr } = await supabase
    .from("profiles" as any)
    .select("weight, deep_profiling, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (profErr || !profile) return;
  markDone();
  const p = profile as any;
  const logDate = p.created_at ?? new Date().toISOString();
  const logs: Omit<HealthLog, "id" | "created_at">[] = [];

  if (p.weight) {
    logs.push({
      user_id: userId, log_type: "weight", logged_at: logDate,
      glucose_morning: null, glucose_evening: null,
      bp_systolic: null, bp_diastolic: null, weight_kg: p.weight,
    });
  }

  const fg = p.deep_profiling?.fastingGlucose;
  if (fg) {
    logs.push({
      user_id: userId, log_type: "diabetes", logged_at: logDate,
      glucose_morning: fg, glucose_evening: null,
      bp_systolic: null, bp_diastolic: null, weight_kg: null,
    });
  }

  if (logs.length === 0) return;
  const { error } = await supabase.from("health_logs" as any).insert(logs as any);
  if (error) console.error("Failed to backfill health logs:", error);
}

/** Format a date string relative to today, always including time */
export function formatLogDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const time = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;

  const day = date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

export interface ProgressSummary {
  logType: "diabetes" | "bp" | "weight";
  firstValue: number;
  latestValue: number;
  change: number;          // latest - first
  changePercent: number;   // percentage change
  firstDate: string;
  latestDate: string;
  hasData: boolean;
}

/** Get the first and latest reading for a metric to compute progress */
export async function fetchProgressSummaries(userId?: string): Promise<ProgressSummary[]> {
  const types: Array<"diabetes" | "bp" | "weight"> = ["diabetes", "bp", "weight"];

  const summaries = await Promise.all(types.map(async (logType) => {
    // Fetch oldest entry
    let oldestQuery = supabase
      .from("health_logs" as any)
      .select("*")
      .eq("log_type", logType)
      .order("logged_at", { ascending: true })
      .limit(1);
    if (userId) oldestQuery = oldestQuery.eq("user_id", userId);
    const { data: oldest } = await oldestQuery;

    // Fetch latest entry
    let latestQuery = supabase
      .from("health_logs" as any)
      .select("*")
      .eq("log_type", logType)
      .order("logged_at", { ascending: false })
      .limit(1);
    if (userId) latestQuery = latestQuery.eq("user_id", userId);
    const { data: latest } = await latestQuery;

    const first = (oldest as unknown as HealthLog[] | null)?.[0];
    const last = (latest as unknown as HealthLog[] | null)?.[0];

    if (!first || !last) {
      return { logType, firstValue: 0, latestValue: 0, change: 0, changePercent: 0, firstDate: "", latestDate: "", hasData: false };
    }

    let firstVal = 0, latestVal = 0;
    if (logType === "weight") {
      firstVal = first.weight_kg ?? 0;
      latestVal = last.weight_kg ?? 0;
    } else if (logType === "diabetes") {
      // Use whichever glucose field has data (morning or evening)
      firstVal = first.glucose_morning ?? first.glucose_evening ?? 0;
      latestVal = last.glucose_morning ?? last.glucose_evening ?? 0;
    } else {
      firstVal = first.bp_systolic ?? 0;
      latestVal = last.bp_systolic ?? 0;
    }

    const change = Math.round((latestVal - firstVal) * 100) / 100;
    const changePercent = firstVal !== 0 ? Math.round((change / firstVal) * 100) : 0;

    return { logType, firstValue: firstVal, latestValue: latestVal, change, changePercent, firstDate: first.logged_at, latestDate: last.logged_at, hasData: firstVal > 0 || latestVal > 0 };
  }));

  return summaries;
}
