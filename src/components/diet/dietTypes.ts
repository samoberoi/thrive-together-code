export type CategorySlug = "sugar_spike" | "metabolic_essential" | "power_addon";
export type Recommendation = "avoid" | "limit" | "moderate" | "encourage";
export type GiBand = "low" | "low_med" | "medium" | "med_high" | "high";
export type DietType = string;

export interface FoodCategory {
  id: string; slug: CategorySlug; name: string; description: string | null; display_order: number;
}
export interface FoodFilter {
  id: string; category_id: string; slug: string; name: string; description: string | null;
  display_order: number; order_number: number | null; number_label: string | null;
  key_takeaways: string[]; cautionary_note: string | null; is_active: boolean;
}
export interface FoodItem {
  id: string; filter_id: string; name: string; alt_name: string | null;
  diet_type: DietType; serving_basis: string;
  serving_size_qty: number | null; serving_size_unit: string | null;
  serving_label: string | null; household_measure: string | null;
  household_grams: number | null;
  carbs_min: number | null; carbs_max: number | null;
  gi_min: number | null; gi_max: number | null; gi_band: GiBand | null;
  protein_g: number | null; fat_g: number | null; fiber_g: number | null; calories_kcal: number | null;
  recommendation: Recommendation;
  health_benefits: string[]; notes: string | null;
  is_jain_friendly: boolean; is_dairy_free: boolean; is_active: boolean; display_order: number;
}

export const giLabel: Record<GiBand, string> = {
  low: "Low GI", low_med: "Low–Med GI", medium: "Medium GI", med_high: "Med–High GI", high: "High GI",
};
export const giClass: Record<GiBand, string> = {
  low: "bg-emerald-500/15 text-emerald-700",
  low_med: "bg-emerald-500/15 text-emerald-700",
  medium: "bg-amber-500/15 text-amber-700",
  med_high: "bg-orange-500/15 text-orange-700",
  high: "bg-rose-500/15 text-rose-700",
};
export const recLabel: Record<Recommendation, string> = {
  encourage: "Encourage", moderate: "Moderate", limit: "Limit", avoid: "Avoid",
};
export const recClass: Record<Recommendation, string> = {
  encourage: "bg-emerald-500/15 text-emerald-700",
  moderate: "bg-blue-500/15 text-blue-700",
  limit: "bg-amber-500/15 text-amber-700",
  avoid: "bg-rose-500/15 text-rose-700",
};
export type DietBadgeMeta = { label: string; cls: string; title: string };

export const dietBadge: Record<DietType, DietBadgeMeta> = {
  vegan:   { label: "Vegan", cls: "bg-emerald-500/15 text-emerald-700", title: "Vegan" },
  veg:     { label: "Veg",   cls: "bg-green-500/15 text-green-700",     title: "Vegetarian" },
  eggitarian: { label: "Egg", cls: "bg-yellow-500/15 text-yellow-700", title: "Eggetarian" },
  non_veg: { label: "Non-veg", cls: "bg-rose-500/15 text-rose-700",     title: "Non-vegetarian" },
  jain:    { label: "Jain",  cls: "bg-amber-500/15 text-amber-700",     title: "Jain" },
};

export function getDietBadge(dietType: DietType | null | undefined): DietBadgeMeta {
  const key = dietType || "";
  if (dietBadge[key]) return dietBadge[key];
  const title = key
    ? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Diet type";
  return { label: title, cls: "bg-muted text-muted-foreground", title };
}

export function range(min: number | null, max: number | null, suffix = ""): string {
  if (min == null && max == null) return "—";
  if (min == null) return `${max}${suffix}`;
  if (max == null) return `${min}${suffix}`;
  if (min === max) return `${min}${suffix}`;
  return `${min}–${max}${suffix}`;
}

export function avgOf(min: number | null, max: number | null): number | null {
  if (min == null && max == null) return null;
  if (min == null) return max;
  if (max == null) return min;
  return (min + max) / 2;
}

export function portionGrams(item: FoodItem): number {
  return item.household_grams && item.household_grams > 0 ? item.household_grams : 100;
}

export function portionFactor(item: FoodItem): number {
  return portionGrams(item) / 100;
}

export function portionLabel(item: FoodItem): string {
  return item.household_measure || item.serving_label || "1 portion";
}

export function scaleMacro(value: number | null | undefined, item: FoodItem): number | null {
  if (value == null) return null;
  return Math.round(value * portionFactor(item) * 10) / 10;
}

export function scaleRange(min: number | null, max: number | null, item: FoodItem, suffix = ""): string {
  const scaledMin = scaleMacro(min, item);
  const scaledMax = scaleMacro(max, item);
  return range(scaledMin, scaledMax, suffix);
}

export function scaleCalories(value: number | null | undefined, item: FoodItem): number | null {
  if (value == null) return null;
  return Math.round(value * portionFactor(item));
}

export const giToScore: Record<GiBand, number> = {
  low: 45, low_med: 52, medium: 60, med_high: 70, high: 82,
};

export function sugarSpikeRisk(avgGi: number | null, totalCarbs: number): "low" | "moderate" | "high" {
  if (avgGi == null) return totalCarbs > 60 ? "moderate" : "low";
  const load = (avgGi * totalCarbs) / 100; // approx glycemic load
  if (load < 10) return "low";
  if (load < 20) return "moderate";
  return "high";
}

// ─── Diet preference matching (shared by Build My Plate + food library) ──────
export function normalizeDietPref(p: string | null | undefined): string | null {
  const v = (p || "").toLowerCase().trim().replace(/[-\s]/g, "_");
  if (!v) return null;
  if (v === "vegetarian" || v === "mixed") return "veg";
  if (v === "nonveg" || v === "non_vegetarian" || v === "nonvegetarian") return "non_veg";
  if (v === "eggetarian" || v === "eggeterian") return "eggitarian";
  return v;
}

/**
 * Does a food item fit ANY of the user's diet preferences?
 * veg → veg+vegan · vegan → vegan · jain → jain-friendly veg/vegan
 * eggitarian → veg+vegan+eggitarian · non_veg → everything
 * unknown/custom slug → exact diet_type match
 */
export function dietAllowsItem(
  prefs: string[],
  item: { diet_type?: string | null; is_jain_friendly?: boolean | null },
): boolean {
  if (!prefs.length) return true;
  const dt = (item.diet_type || "").toLowerCase();
  return prefs.some((raw) => {
    const p = normalizeDietPref(raw);
    if (!p) return false;
    if (p === "non_veg") return true;
    if (p === "vegan") return dt === "vegan";
    if (p === "veg") return dt === "veg" || dt === "vegan";
    if (p === "jain") return (dt === "veg" || dt === "vegan") && item.is_jain_friendly !== false;
    if (p === "eggitarian") return dt === "veg" || dt === "vegan" || dt === "eggitarian";
    return dt === p;
  });
}
