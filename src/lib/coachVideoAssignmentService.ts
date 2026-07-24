import { supabase } from "@/integrations/supabase/client";

export type AssignmentModule = "exercise" | "yoga";

export interface CoachVideoAssignment {
  id: string;
  coach_id: string;
  patient_user_id: string;
  module: AssignmentModule;
  item_key: string;
  created_at: string;
}

export async function listPatientAssignments(
  patientUserId: string,
  module: AssignmentModule,
): Promise<CoachVideoAssignment[]> {
  const { data, error } = await supabase
    .from("coach_video_assignments" as any)
    .select("*")
    .eq("patient_user_id", patientUserId)
    .eq("module", module);
  if (error) throw error;
  return (data ?? []) as any as CoachVideoAssignment[];
}

export async function setPatientAssignments(params: {
  coachId: string;
  patientUserId: string;
  module: AssignmentModule;
  itemKeys: string[];
}): Promise<void> {
  const { coachId, patientUserId, module, itemKeys } = params;
  const existing = await listPatientAssignments(patientUserId, module);
  const existingKeys = new Set(existing.map((a) => a.item_key));
  const desiredKeys = new Set(itemKeys);

  const toDelete = existing.filter((a) => !desiredKeys.has(a.item_key)).map((a) => a.id);
  const toInsert = itemKeys
    .filter((k) => !existingKeys.has(k))
    .map((k) => ({
      coach_id: coachId,
      patient_user_id: patientUserId,
      module,
      item_key: k,
    }));

  if (toDelete.length) {
    const { error } = await supabase
      .from("coach_video_assignments" as any)
      .delete()
      .in("id", toDelete);
    if (error) throw error;
  }
  if (toInsert.length) {
    const { error } = await supabase
      .from("coach_video_assignments" as any)
      .insert(toInsert as any);
    if (error) throw error;
  }
}

/** Fetch the current user's assigned items for a module. Returns null when the user has no coach (foundation package). */
export async function fetchMyAssignedItems(
  userId: string,
  module: AssignmentModule,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("coach_video_assignments" as any)
    .select("item_key")
    .eq("patient_user_id", userId)
    .eq("module", module);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => r.item_key);
}
