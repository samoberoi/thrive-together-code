import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";

export type VegType = "veg" | "non_veg" | "both";

export interface Supplement {
  id: string;
  name: string;
  category: string;
  description: string | null;
  default_dosage: string | null;
  default_frequency: string | null;
  default_timing: string | null;
  veg_type: VegType;
  is_active: boolean;
  created_at: string;
}


export interface ConditionRule {
  id: string;
  supplement_id: string;
  condition: string;
  severity: string;
  dosage: string;
  frequency: string;
  duration_weeks: number;
  timing: string | null;
  remarks: string | null;
  is_active: boolean;
  supplement_name?: string;
}

export interface UserSupplementPlan {
  id: string;
  user_id: string;
  assigned_by: string | null;
  plan_name: string;
  start_date: string;
  duration_weeks: number;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface PlanItem {
  id: string;
  plan_id: string;
  supplement_id: string;
  dosage: string;
  frequency: string;
  timing: string | null;
  remarks: string | null;
  is_active: boolean;
  duration_weeks: number;
  supplement?: Supplement;
}

export interface SupplementTracking {
  id: string;
  user_id: string;
  plan_item_id: string;
  date: string;
  taken: boolean;
  notes: string | null;
}

// ─── Supplements CRUD ─────────────────────────
export async function fetchSupplements(): Promise<Supplement[]> {
  const { data, error } = await supabase
    .from("supplement_master" as any)
    .select("*")
    .order("category, name");
  if (error) throw error;
  return (data as any) ?? [];
}

export async function updateSupplement(id: string, updates: Partial<Supplement>) {
  const { error } = await supabase
    .from("supplement_master" as any)
    .update(updates as any)
    .eq("id", id);
  if (error) throw error;
  logAudit({ module: "Supplements", action: "update", target_type: "supplement", target_id: id, target_label: updates.name ?? undefined, metadata: updates as any });
}

export async function createSupplement(supp: Partial<Supplement>) {
  const { data, error } = await supabase
    .from("supplement_master" as any)
    .insert(supp as any)
    .select("id")
    .single();
  if (error) throw error;
  const newId = (data as any)?.id;
  logAudit({ module: "Supplements", action: "create", target_type: "supplement", target_id: newId, target_label: supp.name ?? undefined });
  return newId;
}

// ─── Condition Rules ─────────────────────────
export async function fetchConditionRules(): Promise<ConditionRule[]> {
  const { data, error } = await supabase
    .from("supplement_condition_rules" as any)
    .select("*")
    .order("condition, severity, supplement_id");
  if (error) throw error;
  return (data as any) ?? [];
}

export async function createConditionRule(rule: Partial<ConditionRule>) {
  const { error } = await supabase
    .from("supplement_condition_rules" as any)
    .insert(rule as any);
  if (error) throw error;
  logAudit({ module: "Supplements", action: "create", target_type: "condition_rule", metadata: rule as any });
}

export async function updateConditionRule(id: string, updates: Partial<ConditionRule>) {
  const { error } = await supabase
    .from("supplement_condition_rules" as any)
    .update(updates as any)
    .eq("id", id);
  if (error) throw error;
  logAudit({ module: "Supplements", action: "update", target_type: "condition_rule", target_id: id, metadata: updates as any });
}

export async function deleteConditionRule(id: string) {
  const { error } = await supabase
    .from("supplement_condition_rules" as any)
    .delete()
    .eq("id", id);
  if (error) throw error;
  logAudit({ module: "Supplements", action: "delete", target_type: "condition_rule", target_id: id });
}

// ─── User Plans ─────────────────────────
/**
 * Latest plan for a user.
 *
 * Coach-facing screens MUST pass `includePaused` — a paused plan is still the
 * patient's plan and has to stay visible so the coach can resume or edit it.
 * Filtering on status='active' alone made a paused plan vanish behind
 * "No plan / nothing assigned" with no way back (pause was a one-way trap).
 * Patient-facing screens keep the active-only behaviour.
 */
export async function fetchUserPlan(
  userId: string,
  opts?: { includePaused?: boolean }
): Promise<UserSupplementPlan | null> {
  const statuses = opts?.includePaused ? ["active", "paused"] : ["active"];
  const { data, error } = await supabase
    .from("user_supplement_plans" as any)
    .select("*")
    .eq("user_id", userId)
    .in("status", statuses)
    // active wins over paused when both exist, then newest first
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

export async function createUserPlan(plan: Partial<UserSupplementPlan>): Promise<string> {
  const { data, error } = await supabase
    .from("user_supplement_plans" as any)
    .insert(plan as any)
    .select("id")
    .single();
  if (error) throw error;
  return (data as any).id;
}

export async function updateUserPlanStatus(id: string, status: string) {
  const { error } = await supabase
    .from("user_supplement_plans" as any)
    .update({ status } as any)
    .eq("id", id);
  if (error) throw error;
}

// ─── Plan Items ─────────────────────────
export async function fetchPlanItems(planId: string): Promise<PlanItem[]> {
  const { data, error } = await supabase
    .from("user_supplement_plan_items" as any)
    .select("*")
    .eq("plan_id", planId)
    .eq("is_active", true);
  if (error) throw error;
  return (data as any) ?? [];
}

export async function addPlanItem(item: Partial<PlanItem>) {
  const { error } = await supabase
    .from("user_supplement_plan_items" as any)
    .insert(item as any);
  if (error) throw error;
}

/** Insert many plan items in a single round-trip (fast, atomic). */
export async function addPlanItems(items: Partial<PlanItem>[]) {
  if (!items.length) return;
  const { error } = await supabase
    .from("user_supplement_plan_items" as any)
    .insert(items as any);
  if (error) throw error;
}


export async function removePlanItem(id: string) {
  const { error } = await supabase
    .from("user_supplement_plan_items" as any)
    .update({ is_active: false } as any)
    .eq("id", id);
  if (error) throw error;
}

export async function updatePlanItem(id: string, updates: Partial<PlanItem>) {
  const { error } = await supabase
    .from("user_supplement_plan_items" as any)
    .update(updates as any)
    .eq("id", id);
  if (error) throw error;
}

// ─── Tracking ─────────────────────────
export function localSupplementDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function fetchTodayTracking(userId: string, date: string): Promise<SupplementTracking[]> {
  const { data, error } = await supabase
    .from("user_supplement_tracking" as any)
    .select("*")
    .eq("user_id", userId)
    .eq("date", date);
  if (error) throw error;
  return (data as any) ?? [];
}

export async function toggleTracking(userId: string, planItemId: string, date: string, taken: boolean) {
  const { error } = await supabase
    .from("user_supplement_tracking" as any)
    .upsert({
      user_id: userId,
      plan_item_id: planItemId,
      date,
      taken,
    } as any, { onConflict: "user_id,plan_item_id,date" });
  if (error) throw error;
}

export async function fetchTrackingHistory(userId: string, days = 7): Promise<SupplementTracking[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("user_supplement_tracking" as any)
    .select("*")
    .eq("user_id", userId)
    .gte("date", localSupplementDateKey(since))
    .order("date", { ascending: false });
  if (error) throw error;
  return (data as any) ?? [];
}

// ─── Helpers ─────────────────────────
export const CONDITION_LABELS: Record<string, string> = {
  foundational: "Foundation Care: General Metabolic Health",
  deficiency: "Vitamin D and B12 Deficiency",
  insulin_resistance: "Insulin Resistance (IR), Inflammation & High Lipids",
  ir_stress: "IR / HbA1c / Stress",
  liver: "High Liver Enzymes / Fatty Liver",
  uric_acid: "High Uric Acid",
  thyroid: "High TSH / Hypothyroidism",
  metabolic_boost: "High Blood Glucose / HbA1c / IR – Metabolic Boosters",
};

export const CONDITION_ICONS: Record<string, string> = {
  foundational: "🛡️",
  deficiency: "💊",
  insulin_resistance: "🔥",
  ir_stress: "⚡",
  liver: "🫁",
  uric_acid: "💧",
  thyroid: "🦋",
  metabolic_boost: "🚀",
};

export const CONDITION_COLORS: Record<string, string> = {
  foundational: "bg-primary/10 text-primary",
  deficiency: "bg-secondary/10 text-secondary",
  insulin_resistance: "bg-amber-500/10 text-amber-500",
  ir_stress: "bg-orange-500/10 text-orange-500",
  liver: "bg-emerald-500/10 text-emerald-400",
  uric_acid: "bg-cyan-500/10 text-cyan-400",
  thyroid: "bg-purple-500/10 text-purple-400",
  metabolic_boost: "bg-destructive/10 text-destructive",
};

export const SEVERITY_COLORS: Record<string, string> = {
  mild: "bg-primary/15 text-primary border-primary/20",
  moderate: "bg-amber-500/15 text-amber-500 border-amber-500/20",
  severe: "bg-destructive/15 text-destructive border-destructive/20",
};

export const CATEGORY_COLORS: Record<string, string> = {
  vitamin: "text-secondary",
  metabolic: "text-primary",
  herbal: "text-emerald-400",
  booster: "text-amber-500",
};

export const CATEGORY_BG: Record<string, string> = {
  vitamin: "bg-secondary/10",
  metabolic: "bg-primary/10",
  herbal: "bg-emerald-500/10",
  booster: "bg-amber-500/10",
};

export const TIMING_ICONS: Record<string, string> = {
  "morning empty stomach": "🌅",
  "with first meal (FMOD)": "🍽️",
  "with meal": "🍽️",
  "before meal": "⏰",
  "before meal with water": "💧",
  "after meal": "🍽️",
  "evening": "🌙",
  "morning and evening": "🌅🌙",
  "empty stomach": "🌅",
  "before meals": "⏰",
  "morning": "🌅",
  "bedtime": "🌙",
  "with dinner": "🍽️",
  "with lunch": "🍽️",
  "with breakfast": "🌅",
};

// ─── Structured option catalogs used by the admin/coach editors ─────────────
// Everything the frontend can show for dose / frequency / timing lives here so
// the backend UIs render a curated dropdown instead of a free-text input.

export const DOSE_UNITS: { value: string; label: string; group: string }[] = [
  { value: "mg", label: "mg (milligrams)", group: "Weight" },
  { value: "mcg", label: "mcg (micrograms)", group: "Weight" },
  { value: "g", label: "g (grams)", group: "Weight" },
  { value: "IU", label: "IU (international units)", group: "Weight" },
  { value: "ml", label: "ml (millilitres)", group: "Liquid" },
  { value: "drops", label: "drops", group: "Liquid" },
  { value: "teaspoon", label: "teaspoon (tsp)", group: "Liquid" },
  { value: "tablespoon", label: "tablespoon (tbsp)", group: "Liquid" },
  { value: "cup", label: "cup", group: "Liquid" },
  { value: "capsule", label: "capsule", group: "Form" },
  { value: "tablet", label: "tablet", group: "Form" },
  { value: "softgel", label: "softgel", group: "Form" },
  { value: "sachet", label: "sachet", group: "Form" },
  { value: "scoop", label: "scoop", group: "Form" },
  { value: "gummy", label: "gummy", group: "Form" },
];

export const DOSE_VEHICLES: string[] = [
  "in water",
  "in warm water",
  "in milk",
  "in juice",
  "under the tongue",
  "chewed",
  "with food",
];

export const FREQUENCY_OPTIONS: string[] = [
  "once daily",
  "twice daily",
  "three times daily",
  "four times daily",
  "every other day",
  "weekly",
  "twice weekly",
  "as needed",
];

export const TIMING_OPTIONS: string[] = [
  "morning",
  "morning empty stomach",
  "with breakfast",
  "before meal",
  "before meal with water",
  "after meal",
  "with meal",
  "with first meal (FMOD)",
  "with lunch",
  "evening",
  "with dinner",
  "before meals",
  "morning and evening",
  "empty stomach",
  "bedtime",
];

/** Parse a stored dosage string like "500 mg" or "1 tablespoon in water" into parts. */
export function parseDosage(raw: string | null | undefined): { amount: string; unit: string; vehicle: string } {
  const value = (raw ?? "").trim();
  if (!value) return { amount: "", unit: "", vehicle: "" };
  // Amount = leading number (int/decimal/fraction like "1/2")
  const match = value.match(/^(\d+(?:[./]\d+)?|\d+\s*\d+\/\d+)\s*(.*)$/);
  if (!match) return { amount: "", unit: value, vehicle: "" };
  const amount = match[1].trim();
  const rest = match[2].trim();
  if (!rest) return { amount, unit: "", vehicle: "" };
  // Look for a matching known unit prefix.
  const knownUnit = DOSE_UNITS.map((u) => u.value)
    .sort((a, b) => b.length - a.length)
    .find((u) => rest.toLowerCase().startsWith(u.toLowerCase()));
  if (knownUnit) {
    const vehicle = rest.slice(knownUnit.length).trim();
    return { amount, unit: knownUnit, vehicle };
  }
  // Fallback: first word is unit, rest is vehicle.
  const [firstWord, ...restWords] = rest.split(/\s+/);
  return { amount, unit: firstWord, vehicle: restWords.join(" ") };
}

/** Combine amount + unit + vehicle back into the stored dosage string. */
export function formatDosage(parts: { amount?: string; unit?: string; vehicle?: string }): string {
  const amount = (parts.amount ?? "").trim();
  const unit = (parts.unit ?? "").trim();
  const vehicle = (parts.vehicle ?? "").trim();
  return [amount, unit, vehicle].filter(Boolean).join(" ");
}

