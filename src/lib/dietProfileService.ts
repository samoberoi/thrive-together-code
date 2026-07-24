import { supabase } from "@/integrations/supabase/client";

export interface DietProfileRow {
  user_id: string;
  diet_preference?: string | null;
  diet_preferences?: string[] | null;
  allergies?: string[] | null;
  sub_preferences?: string[] | null;
  allergen_food_ids?: string[] | null;
}

export async function loadDietProfile(userId: string): Promise<DietProfileRow | null> {
  const { data, error } = await supabase
    .from("user_diet_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("loadDietProfile failed:", error);
    return null;
  }
  return (data as any) ?? null;
}

export async function saveDietProfile(userId: string, patch: Partial<DietProfileRow>): Promise<boolean> {
  const { error } = await supabase
    .from("user_diet_profiles")
    .upsert({ user_id: userId, ...patch } as any, { onConflict: "user_id" });
  if (error) {
    console.error("saveDietProfile failed:", error);
    return false;
  }
  return true;
}
