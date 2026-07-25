import { supabase } from "@/integrations/supabase/client";

export interface DietPlating {
  id: string;
  user_id: string;
  plan_start_date: string;
  day_index: number;
  meal_slot: "first_meal" | "mid_bite" | "last_meal" | "breakfast" | "lunch" | "snack" | "dinner";
  plate_data: { title?: string; items?: string[] } | any;
  calories: number | null;
}

export function normalizeDietPreference(value: string | null | undefined): string {
  const v = (value || "").toLowerCase().trim().replace(/[-\s]/g, "_");
  if (!v || v === "mixed") return "veg";
  if (v === "vegetarian") return "veg";
  if (v === "nonveg" || v === "non_vegetarian" || v === "nonvegetarian") return "non_veg";
  return v;
}

export async function fetchPlatingForUser(userId: string) {
  const { data, error } = await supabase
    .from("diet_platings")
    .select("*")
    .eq("user_id", userId)
    .order("plan_start_date", { ascending: false })
    .order("day_index", { ascending: true })
    .order("meal_slot", { ascending: true });
  if (error) return [] as DietPlating[];
  return (data ?? []) as any[] as DietPlating[];
}

export async function regeneratePlating(userId: string, diet?: string) {
  const args: any = { _user_id: userId };
  if (diet) args._diet = normalizeDietPreference(diet);
  const { data, error } = await supabase.rpc("generate_diet_plating" as any, args);
  if (error) throw error;
  return data as number;
}

export async function updatePlate(plateId: string, plateData: any) {
  const { error } = await supabase
    .from("diet_platings")
    .update({ plate_data: plateData })
    .eq("id", plateId);
  if (error) throw error;
}

export async function swapPlate(plateId: string) {
  const { data, error } = await supabase.rpc("swap_diet_plate" as any, {
    _plate_id: plateId,
    _seed: Math.floor(Math.random() * 1_000_000),
  });
  if (error) throw error;
  return data as any;
}

export interface ApprovedFood {
  id: string;
  name: string;
  filter_id: string;
  filter_name: string;
  category_name: string;
  diet_type: string;
}

export async function fetchApprovedFoods(diet: string): Promise<ApprovedFood[]> {
  const normalized = normalizeDietPreference(diet);
  const dietTypes = normalized === "vegan"
    ? ["vegan"]
    : normalized === "veg" || normalized === "jain" || normalized === "eggitarian"
    ? ["vegan", "veg"]
    : ["vegan", "veg", "non_veg"];
  const { data, error } = await (supabase as any)
    .from("food_items")
    .select("id, name, filter_id, diet_type, recommendation, is_active, food_filters(name, food_categories(name))")
    .eq("is_active", true)
    .in("recommendation", ["encourage", "moderate"])
    .in("diet_type", dietTypes)
    .order("name");
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    filter_id: r.filter_id,
    filter_name: r.food_filters?.name ?? "Other",
    category_name: r.food_filters?.food_categories?.name ?? "Other",
    diet_type: r.diet_type,
  }));
}

export async function fetchCurrentDietPreference(userId: string): Promise<string> {
  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from("user_diet_profiles")
      .select("diet_preference, diet_preferences")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("lifestyle")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const row = data as any;
  const prefs = (row?.diet_preferences as string[] | null | undefined)?.map(normalizeDietPreference).filter(Boolean) ?? [];
  const single = row?.diet_preference ? normalizeDietPreference(row.diet_preference) : "";
  const profileDiet = (profile as any)?.lifestyle?.diet ? normalizeDietPreference((profile as any).lifestyle.diet) : "";
  return prefs[0] || single || profileDiet || "veg";
}

export function dayIndexForToday(planStartDate: string) {
  const start = new Date(planStartDate + "T00:00:00");
  const now = new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, Math.min(29, diff));
}
