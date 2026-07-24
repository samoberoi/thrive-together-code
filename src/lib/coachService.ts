import { supabase } from "@/integrations/supabase/client";

export interface Coach {
  id: string;
  phone: string;
  name: string;
  description: string | null;
  specialization: string | null;
  coach_type: "starter_reset" | "active_reset" | "pro_transformation";
  years_experience: number;
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
  working_hours_start: string | null;
  working_hours_end: string | null;
  working_timezone: string | null;
}

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

/** Fetch the user's currently assigned coach */
export async function fetchAssignedCoach(userId: string): Promise<Coach | null> {
  const coachSelect = "id, name, phone, bio, description, specialization, coach_type, years_experience, total_consultations, avg_rating, total_ratings, avatar_url, languages, qualification, city, is_active, working_hours_start, working_hours_end, working_timezone";

  // Get active assignment
  const { data: assignment } = await supabase
    .from("coach_assignments" as any)
    .select("coach_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  let coachId: string | null = (assignment as any)?.coach_id ?? null;

  // Fallback: derive coach from profile.coach_name if assignment row is missing.
  if (!coachId) {
    const { data: profile } = await supabase
      .from("profiles" as any)
      .select("coach_name")
      .eq("user_id", userId)
      .maybeSingle();
    const coachName = (profile as any)?.coach_name as string | undefined;
    if (coachName) {
      const { data: byName } = await supabase
        .from("coaches" as any)
        .select(coachSelect)
        .eq("name", coachName)
        .eq("is_active", true)
        .maybeSingle();
      if (byName) return byName as unknown as Coach;
    }
    return null;
  }

  const { data: coach, error: cErr } = await supabase
    .from("coaches" as any)
    .select(coachSelect)
    .eq("id", coachId)
    .single();

  if (cErr) {
    console.error("Failed to fetch coach:", cErr);
    return null;
  }

  return coach as unknown as Coach;
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
