import { supabase } from "@/integrations/supabase/client";
import type { HealthSnapshot } from "@/lib/appleHealth";

export type StoredHealthSnapshot = HealthSnapshot & {
  date: string;
  synced_at: string;
};

function todayKey(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

// Health syncs fire on every resume, every 5 minutes and on every HealthKit
// change event. Most of those carry identical numbers, so remember the last
// row we wrote and skip the upsert when nothing actually changed.
const lastSavedSnapshot = new Map<string, string>();

export function resetHealthSnapshotDedupe(userId?: string) {
  if (userId) lastSavedSnapshot.delete(userId);
  else lastSavedSnapshot.clear();
}

/** Upsert today's Apple Health snapshot for the given user (skips no-op writes). */
export async function saveHealthSnapshot(userId: string, snap: HealthSnapshot): Promise<void> {
  if (!userId) return;
  const row = {
    user_id: userId,
    date: todayKey(),
    steps: snap.steps ?? null,
    active_calories: snap.activeCalories ?? null,
    distance_meters: snap.distanceMeters ?? null,
    exercise_minutes: snap.exerciseMinutes ?? null,
    resting_heart_rate: snap.restingHeartRate ?? null,
    hrv_ms: snap.hrvMs ?? null,
    sleep_hours: snap.sleepHours ?? null,
    weight_kg: snap.weightKg ?? null,
    weight_at: snap.weightAt ?? null,
    glucose_mg_dl: snap.glucoseMgDl ?? null,
    glucose_at: snap.glucoseAt ?? null,
    synced_at: new Date().toISOString(),
  };
  // synced_at always changes, so compare everything else.
  const { synced_at: _syncedAt, ...comparable } = row;
  const signature = JSON.stringify(comparable);
  if (lastSavedSnapshot.get(userId) === signature) return;

  const { error } = await supabase
    .from("apple_health_snapshots" as any)
    .upsert(row, { onConflict: "user_id,date" });
  if (error) {
    console.warn("saveHealthSnapshot failed", error);
    return;
  }
  lastSavedSnapshot.set(userId, signature);
}

/** Load the most recent stored snapshot for a user (used on web, where HealthKit isn't available). */
export async function fetchLatestHealthSnapshot(userId: string): Promise<StoredHealthSnapshot | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("apple_health_snapshots" as any)
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("fetchLatestHealthSnapshot failed", error);
    return null;
  }
  if (!data) return null;
  const r = data as any;
  return {
    date: r.date,
    synced_at: r.synced_at,
    steps: r.steps ?? undefined,
    activeCalories: r.active_calories ?? undefined,
    distanceMeters: r.distance_meters ?? undefined,
    exerciseMinutes: r.exercise_minutes ?? undefined,
    restingHeartRate: r.resting_heart_rate ?? undefined,
    hrvMs: r.hrv_ms ?? undefined,
    sleepHours: r.sleep_hours != null ? Number(r.sleep_hours) : undefined,
    weightKg: r.weight_kg != null ? Number(r.weight_kg) : undefined,
    weightAt: r.weight_at ?? undefined,
    glucoseMgDl: r.glucose_mg_dl ?? undefined,
    glucoseAt: r.glucose_at ?? undefined,
  };
}

/** Fetch a range of snapshot rows (default last 30 days), oldest first. */
export async function fetchHealthSnapshotRange(
  userId: string,
  days = 30,
): Promise<StoredHealthSnapshot[]> {
  if (!userId) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("apple_health_snapshots" as any)
    .select("*")
    .eq("user_id", userId)
    .gte("date", since)
    .order("date", { ascending: true });
  if (error) {
    console.warn("fetchHealthSnapshotRange failed", error);
    return [];
  }
  return ((data ?? []) as any[]).map((r) => ({
    date: r.date,
    synced_at: r.synced_at,
    steps: r.steps ?? undefined,
    activeCalories: r.active_calories ?? undefined,
    distanceMeters: r.distance_meters ?? undefined,
    exerciseMinutes: r.exercise_minutes ?? undefined,
    restingHeartRate: r.resting_heart_rate ?? undefined,
    hrvMs: r.hrv_ms ?? undefined,
    sleepHours: r.sleep_hours != null ? Number(r.sleep_hours) : undefined,
    weightKg: r.weight_kg != null ? Number(r.weight_kg) : undefined,
    weightAt: r.weight_at ?? undefined,
    glucoseMgDl: r.glucose_mg_dl ?? undefined,
    glucoseAt: r.glucose_at ?? undefined,
  }));
}
