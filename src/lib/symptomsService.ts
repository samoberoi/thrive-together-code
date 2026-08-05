import { supabase } from "@/integrations/supabase/client";

export interface SymptomCategory {
  id: string;
  key: string;
  name: string;
  sort_order: number;
}

export interface SymptomOption {
  id: string;
  category_id: string;
  key: string;
  label: string;
  sort_order: number;
}

export interface SymptomCatalog {
  categories: SymptomCategory[];
  optionsByCategory: Record<string, SymptomOption[]>;
}

/** Fetch the active symptom catalog (categories + their options). */
export async function fetchSymptomCatalog(): Promise<SymptomCatalog> {
  const [{ data: cats }, { data: opts }] = await Promise.all([
    supabase
      .from("symptom_categories" as any)
      .select("id,key,name,sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("symptom_options" as any)
      .select("id,category_id,key,label,sort_order")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const categories = ((cats as any) || []) as SymptomCategory[];
  const optionsByCategory: Record<string, SymptomOption[]> = {};
  (((opts as any) || []) as SymptomOption[]).forEach((o) => {
    (optionsByCategory[o.category_id] ||= []).push(o);
  });

  return { categories, optionsByCategory };
}

export interface UserSymptoms {
  symptomKeys: string[];
  notes: string;
}

export async function loadUserSymptoms(userId: string): Promise<UserSymptoms> {
  const { data, error } = await supabase
    .from("user_symptoms" as any)
    .select("symptom_keys,notes")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("loadUserSymptoms failed:", error);
    return { symptomKeys: [], notes: "" };
  }
  return {
    symptomKeys: ((data as any)?.symptom_keys as string[] | null) || [],
    notes: ((data as any)?.notes as string | null) || "",
  };
}

/**
 * Save the user's symptom checklist.
 * Uses update-then-insert (never upsert) so a coach editing a patient passes
 * the UPDATE policy instead of hitting the stricter INSERT policy.
 */
export async function saveUserSymptoms(userId: string, value: UserSymptoms): Promise<boolean> {
  const payload = { symptom_keys: value.symptomKeys, notes: value.notes || null };

  const { data: updated, error: updateError } = await supabase
    .from("user_symptoms" as any)
    .update(payload as any)
    .eq("user_id", userId)
    .select("user_id");

  if (updateError) {
    console.error("saveUserSymptoms update failed:", updateError);
    return false;
  }
  if (updated && updated.length > 0) return true;

  const { error: insertError } = await supabase
    .from("user_symptoms" as any)
    .insert({ user_id: userId, ...payload } as any);

  if (insertError) {
    console.error("saveUserSymptoms insert failed:", insertError);
    return false;
  }
  return true;
}
