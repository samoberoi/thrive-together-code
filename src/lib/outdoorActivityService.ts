import { supabase } from "@/integrations/supabase/client";

// Newer than the generated database types.
const db = supabase as any;

export interface OutdoorActivity {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  met: number;
  distance_based: boolean;
  avg_speed_kmh: number | null;
  sort_order: number;
  enabled: boolean;
}

export type OutdoorActivityInput = Omit<OutdoorActivity, "id" | "slug">;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export async function listOutdoorActivities(onlyEnabled = false): Promise<OutdoorActivity[]> {
  let q = db.from("outdoor_activities").select("*").order("sort_order").order("name");
  if (onlyEnabled) q = q.eq("enabled", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OutdoorActivity[];
}

export async function createOutdoorActivity(input: OutdoorActivityInput): Promise<void> {
  const { error } = await db
    .from("outdoor_activities")
    .insert({ ...input, slug: slugify(input.name) });
  if (error) throw error;
}

export async function updateOutdoorActivity(
  id: string,
  patch: Partial<OutdoorActivityInput>
): Promise<void> {
  const { error } = await db
    .from("outdoor_activities")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteOutdoorActivity(id: string): Promise<void> {
  const { error } = await db.from("outdoor_activities").delete().eq("id", id);
  if (error) throw error;
}

export interface CalorieEstimate {
  activity: string;
  name: string;
  minutes: number;
  weight_kg: number;
  met: number;
  distance_km: number | null;
  pace_kmh: number | null;
  calories: number;
}

/**
 * Server-side estimate: MET x 3.5 x weight(kg) / 200 x minutes.
 * When the member logs a distance we scale the effort to their real pace;
 * when they don't, we project a distance from the activity's typical speed.
 */
export async function estimateActivityCalories(
  activitySlug: string,
  weightKg: number,
  minutes: number,
  distanceKm?: number | null
): Promise<CalorieEstimate> {
  const { data, error } = await db.rpc("estimate_activity_calories", {
    _activity_slug: activitySlug,
    _weight_kg: weightKg,
    _minutes: minutes,
    _distance_km: distanceKm ?? null,
  });
  if (error) throw error;
  return data as CalorieEstimate;
}

/** Same formula, computed locally — handy for instant previews. */
export function estimateCaloriesLocal(
  activity: OutdoorActivity,
  weightKg: number,
  minutes: number,
  distanceKm?: number | null
): CalorieEstimate {
  const w = Math.max(weightKg || 70, 25);
  const m = Math.max(minutes || 0, 0);
  let met = Number(activity.met);
  let dist = distanceKm ?? null;

  if (activity.distance_based && activity.avg_speed_kmh) {
    if (dist && dist > 0 && m > 0) {
      const speed = dist / (m / 60);
      met = Math.min(Math.max(met * (speed / Number(activity.avg_speed_kmh)), 1.5), Number(activity.met) * 2);
    } else if (dist == null) {
      dist = +(Number(activity.avg_speed_kmh) * (m / 60)).toFixed(2);
    }
  }

  return {
    activity: activity.slug,
    name: activity.name,
    minutes: m,
    weight_kg: w,
    met: +met.toFixed(2),
    distance_km: dist == null ? null : +dist.toFixed(2),
    pace_kmh: dist == null || m === 0 ? null : +(dist / (m / 60)).toFixed(2),
    calories: Math.round((met * 3.5 * w) / 200 * m),
  };
}
