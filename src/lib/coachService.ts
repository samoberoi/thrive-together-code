import { supabase } from "@/integrations/supabase/client";

export interface Coach {
  id: string;
  phone: string;
  name: string;
  description: string | null;
  specialization: string | null;
  coach_type: "starter_reset" | "active_reset" | "pro_transformation";
  bbdo_community_exp: number;
  total_consultations: number;
  avg_rating: number;
  total_ratings: number;
  avatar_url: string | null;
  is_active: boolean;
  email: string | null;
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  pan_card: string | null;
  aadhaar_card: string | null;
  qualification: string | null;
  languages: string[] | null;
  bio: string | null;
  start_date: string | null;
  commission_percent: number | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  aadhaar_doc_url: string | null;
  pan_doc_url: string | null;
  working_hours_start?: string | null;
  working_hours_end?: string | null;
  working_timezone?: string | null;
}

const COACH_PUBLIC_SELECT = "id, name, phone, bio, description, specialization, coach_type, bbdo_community_exp, total_consultations, avg_rating, total_ratings, avatar_url, languages, qualification, city, is_active";

export interface CoachAssignment {
  id: string;
  user_id: string;
  coach_id: string;
  assigned_at: string;
  is_active: boolean;
}

export interface CoachRating {
  id: string;
  user_id: string;
  coach_id: string;
  rating: number;
  review: string | null;
  created_at: string;
}

export async function resolveCurrentCoach(user: any, select = "*"): Promise<Coach | null> {
  if (!user?.id) return null;

  const rawPhone: string | undefined =
    user.phone ||
    (user.email && user.email.endsWith("@bbd.app") ? user.email.split("@")[0] : undefined);

  if (rawPhone) {
    try {
      await supabase.rpc("link_coach_to_user" as any, { _user_id: user.id, _phone: rawPhone });
    } catch {}
  }

  const { data: coachRows } = await supabase
    .from("coaches" as any)
    .select(select)
    .eq("user_id", user.id)
    .eq("is_active", true);

  const rows = ((coachRows as any[]) ?? []) as Coach[];
  if (rows.length <= 1) return rows[0] ?? null;

  const coachIds = rows.map((row: any) => row.id).filter(Boolean);
  const { data: assignmentRows } = await supabase
    .from("coach_assignments" as any)
    .select("coach_id")
    .in("coach_id", coachIds)
    .eq("is_active", true);

  const counts = new Map<string, number>();
  ((assignmentRows as any[]) ?? []).forEach((row) => {
    counts.set(row.coach_id, (counts.get(row.coach_id) ?? 0) + 1);
  });

  return rows.sort((a: any, b: any) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0] ?? null;
}

/** Fetch the user's currently assigned coach */
export async function fetchAssignedCoach(userId: string): Promise<Coach | null> {
  const normalizeCoach = (row: any): Coach | null => {
    if (!row?.id || !row?.name) return null;
    return {
      id: row.id,
      phone: row.phone ?? "",
      name: row.name,
      description: row.description ?? null,
      specialization: row.specialization ?? null,
      coach_type: row.coach_type ?? "active_reset",
      bbdo_community_exp: row.bbdo_community_exp ?? 0,
      total_consultations: row.total_consultations ?? 0,
      avg_rating: Number(row.avg_rating ?? 5),
      total_ratings: row.total_ratings ?? 0,
      avatar_url: row.avatar_url ?? null,
      is_active: row.is_active ?? true,
      email: row.email ?? null,
      date_of_birth: row.date_of_birth ?? null,
      emergency_contact_name: row.emergency_contact_name ?? null,
      emergency_contact_phone: row.emergency_contact_phone ?? null,
      address_line1: row.address_line1 ?? null,
      address_line2: row.address_line2 ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      pincode: row.pincode ?? null,
      pan_card: row.pan_card ?? null,
      aadhaar_card: row.aadhaar_card ?? null,
      qualification: row.qualification ?? null,
      languages: row.languages ?? null,
      bio: row.bio ?? null,
      start_date: row.start_date ?? null,
      commission_percent: row.commission_percent ?? null,
      bank_name: row.bank_name ?? null,
      bank_account_number: row.bank_account_number ?? null,
      bank_ifsc: row.bank_ifsc ?? null,
      aadhaar_doc_url: row.aadhaar_doc_url ?? null,
      pan_doc_url: row.pan_doc_url ?? null,
      working_hours_start: row.working_hours_start ?? null,
      working_hours_end: row.working_hours_end ?? null,
      working_timezone: row.working_timezone ?? null,
    };
  };

  const loadResolvedCoach = async (): Promise<Coach | null> => {
    const { data: resolved, error } = await supabase.rpc("get_assigned_coach" as any, { _user_id: userId });
    if (error) console.warn("Assigned coach resolver failed, falling back:", error);
    const resolvedRow = Array.isArray(resolved) ? resolved[0] : resolved;
    return normalizeCoach(resolvedRow);
  };

  const rpcCoach = await loadResolvedCoach();
  if (rpcCoach) return rpcCoach;

  // If a paid coach plan exists but the assignment row is missing, repair it once.
  try {
    const { data: activeSub } = await supabase
      .from("subscriptions" as any)
      .select("plan_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const planId = (activeSub as any)?.plan_id as string | undefined;
    if (planId && !["foundation", "starter"].includes(planId)) {
      await autoAssignCoach(userId, planId);
      const repairedCoach = await loadResolvedCoach();
      if (repairedCoach) return repairedCoach;
    }
  } catch {}

  const byNameFallback = async (): Promise<Coach | null> => {
    const { data: profile } = await supabase
      .from("profiles" as any)
      .select("coach_name")
      .eq("user_id", userId)
      .maybeSingle();
    const coachName = (profile as any)?.coach_name as string | undefined;
    if (!coachName?.trim()) return null;
    const { data: byName } = await supabase
      .from("coaches" as any)
      .select(COACH_PUBLIC_SELECT)
      .ilike("name", coachName.trim())
      .eq("is_active", true)
      .maybeSingle();
    return normalizeCoach(byName);
  };

  // Get active assignment
  const { data: assignment } = await supabase
    .from("coach_assignments" as any)
    .select("coach_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  const coachId: string | null = (assignment as any)?.coach_id ?? null;

  if (!coachId) {
    return byNameFallback();
  }

  const { data: coach, error: cErr } = await supabase
    .from("coaches" as any)
    .select(COACH_PUBLIC_SELECT)
    .eq("id", coachId)
    .maybeSingle();

  if (cErr || !coach) {
    console.warn("Coach lookup by id failed, falling back to name:", cErr);
    return byNameFallback();
  }

  return normalizeCoach(coach);
}



/** Auto-assign a coach based on subscription plan */
export async function autoAssignCoach(userId: string, planId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("assign_coach_for_plan" as any, {
    _user_id: userId,
    _plan_id: planId,
  });

  if (error) {
    console.error("Failed to auto-assign coach:", error);
    return null;
  }

  return data as string;
}

/** Submit or update a coach rating */
export async function rateCoach(userId: string, coachId: string, rating: number, review?: string): Promise<boolean> {
  const { error } = await supabase
    .from("coach_ratings" as any)
    .upsert(
      { user_id: userId, coach_id: coachId, rating, review: review ?? null } as any,
      { onConflict: "user_id,coach_id" }
    );

  if (error) {
    console.error("Failed to rate coach:", error);
    return false;
  }

  // Update coach's avg rating
  const { data: ratings } = await supabase
    .from("coach_ratings" as any)
    .select("rating")
    .eq("coach_id", coachId);

  if (ratings && ratings.length > 0) {
    const avg = (ratings as any[]).reduce((sum: number, r: any) => sum + r.rating, 0) / ratings.length;
    await supabase
      .from("coaches" as any)
      .update({ avg_rating: Math.round(avg * 10) / 10, total_ratings: ratings.length } as any)
      .eq("id", coachId);
  }

  return true;
}

/** Fetch user's rating for a specific coach */
export async function fetchMyRating(userId: string, coachId: string): Promise<CoachRating | null> {
  const { data, error } = await supabase
    .from("coach_ratings" as any)
    .select("*")
    .eq("user_id", userId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error) return null;
  return data as unknown as CoachRating | null;
}

/** Map coach_type (legacy enum) to package label */
export function coachTypeLabel(type: string): string {
  switch (type) {
    case "starter_reset": return "Active Health Tracker Coach";
    case "active_reset": return "Active Health Tracker Coach";
    case "pro_transformation": return "Intensive Reversal Care Coach";
    default: return "Health Coach";
  }
}
