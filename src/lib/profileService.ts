import { supabase } from "@/integrations/supabase/client";
import { getUser, saveUser } from "./userStore";
import { fireHealthMetricFeedback } from "@/lib/healthAlerts";

export interface ProfileRow {
  user_id: string;
  phone?: string;
  country?: string;
  country_code?: string;
  email?: string;
  name?: string;
  age?: number;
  gender?: string;
  goals?: any;
  height?: number;
  weight?: number;
  bmi?: number;
  bmi_category?: string;
  waist?: number;
  clinical?: any;
  lifestyle?: any;
  deep_profiling?: any;
  assessment?: any;
  avatar_url?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  onboarding_completed?: boolean;
  birth_date?: string;
  marital_status?: string;
  anniversary_date?: string;
  spouse_name?: string;
  coach_name?: string;
  created_at?: string;
  initial_health_score?: number;
  initial_assessment_date?: string;
}

// ─── Profile cache ───────────────────────────────────────────────────────
// Many screens call fetchProfile() on mount. Cache the row briefly (and dedupe
// concurrent requests) so navigating between tabs doesn't re-hit the backend.
const PROFILE_TTL_MS = 60_000;
type ProfileCacheEntry = { at: number; value: ProfileRow | null };
const profileCache = new Map<string, ProfileCacheEntry>();
const profileInFlight = new Map<string, Promise<ProfileRow | null>>();

export function invalidateProfileCache(userId?: string) {
  if (userId) {
    profileCache.delete(userId);
    profileInFlight.delete(userId);
  } else {
    profileCache.clear();
    profileInFlight.clear();
  }
}

/** Fetch profile from backend (cached for 60s; pass { force: true } to bypass) */
export async function fetchProfile(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<ProfileRow | null> {
  if (!userId) return null;

  if (!opts.force) {
    const cached = profileCache.get(userId);
    if (cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.value;
    const pending = profileInFlight.get(userId);
    if (pending) return pending;
  }

  const request = (async () => {
    const { data, error } = await supabase
      .from("profiles" as any)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch profile:", error);
      return null;
    }
    const row = data as unknown as ProfileRow | null;
    profileCache.set(userId, { at: Date.now(), value: row });
    return row;
  })();

  profileInFlight.set(userId, request);
  try {
    return await request;
  } finally {
    profileInFlight.delete(userId);
  }
}


/** Create a new profile row */
export async function createProfile(profile: ProfileRow) {
  const { data, error } = await supabase
    .from("profiles" as any)
    .insert(profile as any)
    .select()
    .single();

  if (error) {
    console.error("Failed to create profile:", error);
    return null;
  }
  invalidateProfileCache(profile.user_id);
  return data as unknown as ProfileRow;
}

/** Update an existing profile (upserts if missing) */
export async function updateProfile(userId: string, updates: Partial<ProfileRow>) {
  const shouldCheckHealthAlert =
    Object.prototype.hasOwnProperty.call(updates, "weight") ||
    !!(updates.clinical as any)?.systolicBP ||
    !!(updates.clinical as any)?.diastolicBP;
  const previousProfile = shouldCheckHealthAlert
    ? await fetchProfile(userId, { force: true })
    : null;
  invalidateProfileCache(userId);


  // Update first, insert only when no row exists.
  // An upsert always issues INSERT ... ON CONFLICT, which is checked against the
  // INSERT policy (auth.uid() = user_id) — that blocks coaches editing a patient's
  // profile even though they hold a valid UPDATE policy.
  let error: any = null;
  const { data: updated, error: updateError } = await supabase
    .from("profiles" as any)
    .update(updates as any)
    .eq("user_id", userId)
    .select("user_id");

  if (updateError) {
    error = updateError;
  } else if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase
      .from("profiles" as any)
      .insert({ user_id: userId, ...updates } as any);
    if (insertError) error = insertError;
  }

  invalidateProfileCache(userId);

  if (error) {
    console.error("Failed to update profile:", error);
    return false;
  }


  const nextWeight = Number((updates as any).weight);
  if (Number.isFinite(nextWeight) && previousProfile?.weight !== nextWeight) {
    const { error: weightLogError } = await supabase.from("health_logs" as any).insert({
      user_id: userId,
      log_type: "weight",
      logged_at: new Date().toISOString(),
      weight_kg: nextWeight,
    });
    if (weightLogError) {
      console.error("Failed to save weight health log:", weightLogError);
      void fireHealthMetricFeedback(
        { user_id: userId, log_type: "weight", weight_kg: nextWeight },
        previousProfile?.weight ?? null,
        { createInboxNotification: false },
      );
    }
  }

  const clinical = (updates.clinical ?? {}) as any;
  const previousClinical = (previousProfile?.clinical ?? {}) as any;
  const systolic = Number(clinical.systolicBP ?? clinical.bp_systolic ?? clinical.systolic ?? clinical.bloodPressureSystolic);
  const diastolic = Number(clinical.diastolicBP ?? clinical.bp_diastolic ?? clinical.diastolic ?? clinical.bloodPressureDiastolic);
  const previousSystolic = Number(previousClinical.systolicBP ?? previousClinical.bp_systolic ?? previousClinical.systolic ?? previousClinical.bloodPressureSystolic);
  const previousDiastolic = Number(previousClinical.diastolicBP ?? previousClinical.bp_diastolic ?? previousClinical.diastolic ?? previousClinical.bloodPressureDiastolic);
  const bpChanged = systolic !== previousSystolic || diastolic !== previousDiastolic;
  if (Number.isFinite(systolic) && Number.isFinite(diastolic) && bpChanged) {
    const { error: bpLogError } = await supabase.from("health_logs" as any).insert({
      user_id: userId,
      log_type: "bp",
      logged_at: new Date().toISOString(),
      bp_systolic: systolic,
      bp_diastolic: diastolic,
    });
    if (bpLogError) {
      console.error("Failed to save BP health log:", bpLogError);
      void fireHealthMetricFeedback(
        {
          user_id: userId,
          log_type: "bp",
          bp_systolic: systolic,
          bp_diastolic: diastolic,
        },
        null,
        { createInboxNotification: false },
      );
    }
  }

  return true;
}

/** Sync current localStorage data to backend */
export async function syncLocalToBackend(userId: string) {
  const local = getUser();

  const updates: Partial<ProfileRow> = {
    name: local.profile.name,
    age: local.profile.age,
    gender: local.profile.gender,
    goals: (local.profile as any).goals ?? [],
    height: local.bodyMetrics.height,
    weight: local.bodyMetrics.weight,
    bmi: local.bodyMetrics.bmi,
    bmi_category: local.bodyMetrics.bmiCategory,
    waist: (local.bodyMetrics as any).waist,
    clinical: local.clinical,
    lifestyle: local.lifestyle,
    deep_profiling: local.deepProfiling,
    assessment: local.assessment,
  };

  // Remove undefined values
  Object.keys(updates).forEach((key) => {
    if ((updates as any)[key] === undefined) delete (updates as any)[key];
  });

  return updateProfile(userId, updates);
}

/** Load backend profile into localStorage */
export function loadProfileToLocal(profile: ProfileRow) {
  const compact = (obj: Record<string, any>) =>
    Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null));

  // If DOB is present, derive age from it so stale ages (e.g. legacy imports) never win
  let derivedAge: number | undefined;
  if (profile.birth_date) {
    const d = new Date(profile.birth_date);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      if (d <= now) {
        let a = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
        derivedAge = Math.max(0, a);
      } else {
        derivedAge = 0;
      }
    }
  }

  const payload: any = {
    profile: compact({
      phone: profile.phone,
      country: profile.country,
      country_code: profile.country_code,
      name: profile.name,
      age: derivedAge ?? profile.age,
      gender: profile.gender,
      email: profile.email,
      goals: profile.goals,
    }),
    bodyMetrics: compact({
      height: profile.height,
      weight: profile.weight,
      bmi: profile.bmi,
      bmiCategory: profile.bmi_category,
      waist: profile.waist,
    }),
  };

  if (profile.clinical != null) payload.clinical = profile.clinical;
  if (profile.lifestyle != null) payload.lifestyle = profile.lifestyle;
  if (profile.deep_profiling != null) payload.deepProfiling = profile.deep_profiling;
  if (profile.assessment != null) payload.assessment = profile.assessment;
  if (profile.avatar_url != null) payload.avatarUrl = profile.avatar_url;

  saveUser(payload);
}
