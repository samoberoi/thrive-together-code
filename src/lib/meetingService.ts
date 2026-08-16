import { supabase } from "@/integrations/supabase/client";

export type MeetingType = "onboarding" | "weekly_checkpoint" | "quarterly_review" | "consultation" | "followup";
export type MeetingStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export interface CoachMeeting {
  id: string;
  coach_id: string;
  user_id: string;
  scheduled_at: string;
  duration_min: number;
  meeting_link: string | null;
  meeting_type: MeetingType;
  status: MeetingStatus;
  agenda: string | null;
  notes: string | null;
  created_at: string;
}

export async function fetchMeetingsForUser(userId: string) {
  const { data, error } = await supabase
    .from("coach_meetings")
    .select("*")
    .eq("user_id", userId)
    .order("scheduled_at", { ascending: false });
  if (error) {
    console.error(error);
    return [] as CoachMeeting[];
  }
  return (data ?? []) as CoachMeeting[];
}

export async function fetchUpcomingMeetingsForUser(userId: string) {
  const { data, error } = await supabase
    .from("coach_meetings")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order("scheduled_at", { ascending: true });
  if (error) return [] as CoachMeeting[];
  return (data ?? []) as CoachMeeting[];
}

export async function fetchMeetingsForCoach(coachId: string) {
  const { data, error } = await supabase
    .from("coach_meetings")
    .select("*")
    .eq("coach_id", coachId)
    .order("scheduled_at", { ascending: false });
  if (error) {
    console.error(error);
    return [] as CoachMeeting[];
  }
  return (data ?? []) as CoachMeeting[];
}

export async function scheduleMeeting(input: {
  coach_id: string;
  user_id: string;
  scheduled_at: string;
  duration_min?: number;
  meeting_link?: string | null;
  meeting_type: MeetingType;
  agenda?: string | null;
  created_by?: string | null;
}) {
  // A second meeting booked for the same patient + coach on the same calendar day is a
  // reschedule, not an extra session. Cancel the earlier one so the patient's app doesn't
  // keep showing the stale time (e.g. 11:30 AM after a move to 2 PM).
  try {
    const at = new Date(input.scheduled_at);
    const dayStart = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 23, 59, 59, 999);
    await supabase
      .from("coach_meetings")
      .update({ status: "cancelled" })
      .eq("user_id", input.user_id)
      .eq("coach_id", input.coach_id)
      .eq("status", "scheduled")
      .gte("scheduled_at", dayStart.toISOString())
      .lte("scheduled_at", dayEnd.toISOString());
  } catch (e) {
    console.error("Could not cancel superseded meeting", e);
  }

  const { data, error } = await supabase
    .from("coach_meetings")
    .insert({
      coach_id: input.coach_id,
      user_id: input.user_id,
      scheduled_at: input.scheduled_at,
      duration_min: input.duration_min ?? 30,
      meeting_link: input.meeting_link ?? null,
      meeting_type: input.meeting_type,
      agenda: input.agenda ?? null,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CoachMeeting;
}

/** Move an existing meeting to a new time (keeps the same row, so no duplicate shows up). */
export async function rescheduleMeeting(id: string, scheduled_at: string, duration_min?: number) {
  const patch: any = { scheduled_at, status: "scheduled" };
  if (duration_min) patch.duration_min = duration_min;
  const { error } = await supabase.from("coach_meetings").update(patch).eq("id", id);
  if (error) throw error;
}


export async function updateMeetingStatus(id: string, status: MeetingStatus, notes?: string) {
  const { error } = await supabase
    .from("coach_meetings")
    .update({ status, notes: notes ?? undefined })
    .eq("id", id);
  if (error) throw error;
}

export async function updateMeeting(id: string, patch: Partial<CoachMeeting>) {
  const { error } = await supabase.from("coach_meetings").update(patch as any).eq("id", id);
  if (error) throw error;
}

export function meetingTypeLabel(t: MeetingType) {
  switch (t) {
    case "onboarding": return "Onboarding";
    case "weekly_checkpoint": return "Weekly Checkpoint";
    case "quarterly_review": return "Quarterly Review";
    case "consultation": return "Consultation";
    default: return "Follow-up";
  }
}
