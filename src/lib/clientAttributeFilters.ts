/**
 * Shared attribute filters (gender, health condition, age band, BMI band) used
 * by the super-admin user list and the coach client list so both screens slice
 * members exactly the same way.
 */

export interface AttributeProfile {
  gender?: string | null;
  age?: number | null;
  bmi?: number | null;
  bmi_category?: string | null;
  clinical?: any;
  deep_profiling?: any;
}

/* ── Gender ─────────────────────────────────────────────────────────── */

export type GenderFilter = "all" | "female" | "male" | "other";

export const GENDER_OPTIONS: { value: GenderFilter; label: string }[] = [
  { value: "all", label: "All genders" },
  { value: "female", label: "Women" },
  { value: "male", label: "Men" },
  { value: "other", label: "Other / not set" },
];

export function normalizeGender(g: string | null | undefined): GenderFilter {
  const v = String(g || "").trim().toLowerCase();
  if (v.startsWith("f") || v === "woman" || v === "women") return "female";
  if (v.startsWith("m") || v === "man" || v === "men") return "male";
  return "other";
}

export function matchesGender(p: AttributeProfile, filter: GenderFilter): boolean {
  if (filter === "all") return true;
  return normalizeGender(p.gender) === filter;
}

/* ── Health conditions ──────────────────────────────────────────────── */

export type ConditionFilter =
  | "all"
  | "pcos"
  | "diabetes"
  | "prediabetes"
  | "hypertension"
  | "thyroid"
  | "fatty_liver"
  | "cardiovascular"
  | "insulin"
  | "vitamin_d"
  | "belly_fat"
  | "high_stress"
  | "obesity";

export const CONDITION_OPTIONS: { value: ConditionFilter; label: string }[] = [
  { value: "all", label: "All conditions" },
  { value: "pcos", label: "PMOS / PCOS (women)" },
  { value: "diabetes", label: "Diabetes" },
  { value: "prediabetes", label: "Prediabetes" },
  { value: "hypertension", label: "Hypertension" },
  { value: "thyroid", label: "Thyroid" },
  { value: "fatty_liver", label: "Fatty liver" },
  { value: "cardiovascular", label: "Heart condition" },
  { value: "insulin", label: "On insulin" },
  { value: "vitamin_d", label: "Vitamin D deficiency" },
  { value: "belly_fat", label: "Visible belly fat" },
  { value: "high_stress", label: "High stress" },
  { value: "obesity", label: "Obese (BMI 30+)" },
];

const yes = (v: any) =>
  v === true || v === 1 || ["yes", "true", "1", "y"].includes(String(v ?? "").trim().toLowerCase());

export function matchesCondition(p: AttributeProfile, filter: ConditionFilter): boolean {
  if (filter === "all") return true;
  const d = (p.deep_profiling ?? {}) as Record<string, any>;
  const c = (p.clinical ?? {}) as Record<string, any>;
  const diabetesType = String(c.diabetesType ?? "").toLowerCase();

  switch (filter) {
    case "pcos":
      return yes(d.pcos) && normalizeGender(p.gender) !== "male";
    case "diabetes":
      return yes(c.hasDiabetes) || (!!diabetesType && diabetesType !== "prediabetes" && diabetesType !== "not_sure");
    case "prediabetes":
      return diabetesType === "prediabetes";
    case "hypertension":
      return yes(c.hasHypertension) || yes(d.hypertension) || yes(d.bpMedication);
    case "thyroid":
      return yes(d.thyroid) || yes(d.thyroidMedication) ||
        ["hypothyroid", "hyperthyroid"].includes(String(d.thyroidType ?? "").toLowerCase());
    case "fatty_liver":
      return yes(d.fattyLiver);
    case "cardiovascular":
      return yes(c.hasCardiovascular);
    case "insulin":
      return String(d.medications ?? "").toLowerCase().startsWith("insulin");
    case "vitamin_d":
      return yes(d.vitaminD);
    case "belly_fat":
      return yes(d.bellyFat);
    case "high_stress":
      return String(d.stressLevel ?? "").toLowerCase() === "high";
    case "obesity":
      return (Number(p.bmi) || 0) >= 30 || String(p.bmi_category ?? "").toLowerCase().includes("obes");
  }
}

/* ── Age bands ──────────────────────────────────────────────────────── */

export type AgeFilter = "all" | "under30" | "30_44" | "45_59" | "60plus";

export const AGE_OPTIONS: { value: AgeFilter; label: string }[] = [
  { value: "all", label: "All ages" },
  { value: "under30", label: "Under 30" },
  { value: "30_44", label: "30 – 44" },
  { value: "45_59", label: "45 – 59" },
  { value: "60plus", label: "60 and above" },
];

export function matchesAge(p: AttributeProfile, filter: AgeFilter): boolean {
  if (filter === "all") return true;
  const a = Number(p.age);
  if (!Number.isFinite(a) || a <= 0) return false;
  if (filter === "under30") return a < 30;
  if (filter === "30_44") return a >= 30 && a < 45;
  if (filter === "45_59") return a >= 45 && a < 60;
  return a >= 60;
}

/* ── BMI bands ──────────────────────────────────────────────────────── */

export type BmiFilter = "all" | "under" | "normal" | "over" | "obese";

export const BMI_OPTIONS: { value: BmiFilter; label: string }[] = [
  { value: "all", label: "All BMI" },
  { value: "under", label: "Underweight (<18.5)" },
  { value: "normal", label: "Normal (18.5 – 24.9)" },
  { value: "over", label: "Overweight (25 – 29.9)" },
  { value: "obese", label: "Obese (30+)" },
];

export function matchesBmi(p: AttributeProfile, filter: BmiFilter): boolean {
  if (filter === "all") return true;
  const b = Number(p.bmi);
  if (!Number.isFinite(b) || b <= 0) return false;
  if (filter === "under") return b < 18.5;
  if (filter === "normal") return b >= 18.5 && b < 25;
  if (filter === "over") return b >= 25 && b < 30;
  return b >= 30;
}

/** Every attribute filter in one call. */
export function matchesAttributes(
  p: AttributeProfile,
  f: { gender: GenderFilter; condition: ConditionFilter; age: AgeFilter; bmi: BmiFilter },
): boolean {
  return matchesGender(p, f.gender) && matchesCondition(p, f.condition) && matchesAge(p, f.age) && matchesBmi(p, f.bmi);
}

export const labelOf = <T extends string>(opts: { value: T; label: string }[], v: T) =>
  opts.find((o) => o.value === v)?.label ?? "";
