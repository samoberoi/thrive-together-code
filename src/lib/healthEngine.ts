// ─── Health Risk Engine v2 ────────────────────────────────────────────────────
// 5-Category Scoring: Disease Severity, Obesity & Fat, Treatment Load,
// Lifestyle, and Metabolic Blockers.

export interface UserProfile {
  name: string;
  age: number;
  gender: string;
  email?: string;
}

export interface BodyMetrics {
  height: number; // cm
  weight: number; // kg
  bmi: number;
  bmiCategory: string;
  waist?: number; // cm
}

export interface ClinicalData {
  hba1c: number;
  systolicBP: number;
  diastolicBP: number;
  cholesterol?: number;
  hasDiabetes: boolean;
  hasHypertension: boolean;
  hasCardiovascular: boolean;
  familyHistoryDiabetes: boolean;
  familyHistoryHeart: boolean;
  diabetesType?: string;
}

export interface LifestyleData {
  smoking: boolean;
  alcohol: "none" | "moderate" | "high";
  activity: "sedentary" | "light" | "moderate" | "active";
  sleepHours: number;
  diet?: string;
}

export interface DeepProfilingData {
  fastingGlucose?: number;
  postMealGlucose?: number;
  hba1cInput?: number;
  diabetesDuration?: string;
  medications?: string; // none, metformin, multiple_oral, insulin, insulin_plus
  medicationCount?: string; // 0_1, 2_3, 4_plus
  bpMedication?: boolean;
  lipidMedication?: boolean;
  thyroidMedication?: boolean;
  thyroid?: string; // no, yes, unsure  (onboarding-level)
  thyroidType?: string; // hypothyroid, hyperthyroid, unsure (profile-level detail)
  vitaminD?: string; // no, yes, unsure
  fattyLiver?: string; // no, yes, unsure
  pcos?: string; // no, yes, unsure  (labelled "PMOS" in the UI)
  uricAcid?: number; // mg/dL, most recent known reading
  kidneyDisease?: string; // no, yes, unsure
  kidneyStones?: string; // no, yes
  ironDeficiency?: string; // no, yes, unsure
  stressLevel?: string; // low, moderate, high
  bellyFat?: boolean;
  dietQuality?: string; // poor, average, good
  waterIntake?: string;
  medicationsList?: { name: string; dosage: string; timing: string }[];
}

export interface HealthAssessment {
  bmi: number;
  bmiCategory: string;
  totalRisk: number;
  healthScore: number;
  riskCategory: string;
  recommendedProgram: string;
  overrideTriggered: boolean;
  breakdown: {
    diseaseSeverity: number;
    obesityFat: number;
    treatmentLoad: number;
    lifestyle: number;
    metabolicBlockers: number;
  };
}

export interface AppUserData {
  profile: UserProfile;
  bodyMetrics: BodyMetrics;
  clinical: ClinicalData;
  lifestyle: LifestyleData;
  deepProfiling: DeepProfilingData;
  assessment: HealthAssessment;
}

// ─── Infer Clinical Values from Yes/No Answers ───────────────────────────────

export function inferClinicalValues(clinical: ClinicalData): ClinicalData {
  const inferred = { ...clinical };
  if (clinical.hasDiabetes) {
    inferred.hba1c = Math.max(clinical.hba1c ?? 0, 7.5);
  } else {
    inferred.hba1c = clinical.hba1c ?? 5.0;
  }
  if (clinical.hasHypertension) {
    inferred.systolicBP = Math.max(clinical.systolicBP ?? 0, 140);
    inferred.diastolicBP = Math.max(clinical.diastolicBP ?? 0, 90);
  } else {
    inferred.systolicBP = clinical.systolicBP ?? 115;
    inferred.diastolicBP = clinical.diastolicBP ?? 75;
  }
  return inferred;
}

// ─── BMI Calculation (WHO adult classification) ──────────────────────────────
// Underweight <18.5 · Normal 18.5–24.9 · Overweight 25.0–29.9
// Obesity Class I 30.0–34.9 · Class II 35.0–39.9 · Class III ≥40
// Backed by the `bmi_categories` table and `get_bmi_category` RPC in the DB.

export function bmiCategoryFor(bmi: number): string {
  if (!isFinite(bmi) || bmi <= 0) return "Normal weight";
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25)   return "Normal weight";
  if (bmi < 30)   return "Overweight";
  if (bmi < 35)   return "Obesity Class I";
  if (bmi < 40)   return "Obesity Class II";
  return "Obesity Class III";
}

export function calculateBMI(heightCm: number, weightKg: number): { bmi: number; bmiCategory: string } {
  const h = heightCm / 100;
  const bmi = parseFloat((weightKg / (h * h)).toFixed(1));
  return { bmi, bmiCategory: bmiCategoryFor(bmi) };
}


// ─── Category 1: Disease Severity Score (Max 25) ─────────────────────────────

function hba1cPoints(hba1c: number): number {
  if (hba1c < 5.7) return 0;
  if (hba1c < 6.5) return 5;
  if (hba1c < 8.0) return 10;
  if (hba1c < 10) return 15;
  return 20;
}

function fastingGlucosePoints(glucose: number): number {
  if (glucose < 100) return 0;
  if (glucose <= 125) return 3;
  if (glucose <= 160) return 5;
  return 7;
}

function diseaseSeverityScore(hba1c: number, fastingGlucose: number): number {
  return Math.min(25, hba1cPoints(hba1c) + fastingGlucosePoints(fastingGlucose));
}

// ─── Category 2: Obesity & Fat Score (Max 20) ────────────────────────────────

function bmiPoints(bmi: number): number {
  if (bmi < 18.5) return 5;
  if (bmi < 23) return 0;
  if (bmi < 25) return 5;
  if (bmi < 30) return 10;
  return 15;
}

function waistPoints(waistCm: number, gender: string): number {
  // Asian thresholds: Male >90cm, Female >80cm
  if (gender === "female" && waistCm > 80) return 5;
  if (gender === "male" && waistCm > 90) return 5;
  if (waistCm > 90) return 5; // default if gender unknown
  return 0;
}

function bellyFatPoints(hasBellyFat: boolean): number {
  return hasBellyFat ? 3 : 0;
}

function obesityFatScore(bmi: number, waistCm: number, gender: string, hasBellyFat: boolean): number {
  return Math.min(20, bmiPoints(bmi) + waistPoints(waistCm, gender) + bellyFatPoints(hasBellyFat));
}

// ─── Category 3: Treatment Load Score (Max 20) ──────────────────────────────

function medicationCountPoints(count: string): number {
  if (count === "0_1") return 2;
  if (count === "2_3") return 5;
  if (count === "4_plus") return 8;
  return 0; // none
}

function treatmentLoadScore(deep: DeepProfilingData): number {
  let pts = 0;

  // Medication count
  pts += medicationCountPoints(deep.medicationCount ?? "none");

  // Insulin
  const onInsulin = deep.medications === "insulin" || deep.medications === "insulin_plus";
  if (onInsulin) pts += 10;

  // BP medication
  if (deep.bpMedication) pts += 3;

  // Lipid medication
  if (deep.lipidMedication) pts += 3;

  // Thyroid medication
  if (deep.thyroidMedication) pts += 2;

  return Math.min(20, pts);
}

// ─── Category 4: Lifestyle Score (Max 20) ────────────────────────────────────

function activityPoints(activity: string): number {
  if (activity === "sedentary") return 8;
  if (activity === "light") return 5;
  if (activity === "moderate") return 2;
  return 0; // active
}

function dietQualityPoints(quality: string): number {
  if (quality === "poor") return 5;
  if (quality === "average") return 3;
  return 0; // good
}

function sleepPoints(hours: number): number {
  if (hours < 6) return 4;
  if (hours < 7) return 2;
  return 0;
}

function stressPoints(level: string): number {
  if (level === "high") return 4;
  if (level === "moderate") return 2;
  return 0;
}

function lifestyleScore(lifestyle: LifestyleData, deep: DeepProfilingData): number {
  let pts = 0;
  pts += activityPoints(lifestyle.activity);
  pts += dietQualityPoints(deep.dietQuality ?? "average");
  pts += sleepPoints(lifestyle.sleepHours);
  pts += stressPoints(deep.stressLevel ?? "moderate");
  if (lifestyle.smoking) pts += 5;
  if (lifestyle.alcohol === "high") pts += 3;
  return Math.min(20, pts);
}

// ─── Category 5: Metabolic Blockers Score (Max 15) ──────────────────────────

function metabolicBlockersScore(deep: DeepProfilingData, gender: string): number {
  let pts = 0;
  if (deep.thyroid === "yes" || deep.thyroidType === "hypothyroid" || deep.thyroidType === "hyperthyroid") pts += 4;
  if (deep.vitaminD === "yes") pts += 3;
  if (deep.fattyLiver === "yes") pts += 5;
  if (gender === "female" && deep.pcos === "yes") pts += 5;
  return Math.min(15, pts);
}

// ─── Main Calculator ──────────────────────────────────────────────────────────

export function calculateHealthScore(
  body: BodyMetrics,
  clinical: ClinicalData,
  lifestyle: LifestyleData,
  deep?: DeepProfilingData,
  gender?: string,
): HealthAssessment {
  const dp = deep ?? {};
  const g = gender ?? "male";

  // Determine effective HbA1c: prefer deep profiling input, then clinical
  const effectiveHba1c = dp.hba1cInput ?? clinical.hba1c;
  const effectiveFastingGlucose = dp.fastingGlucose ?? (clinical.hasDiabetes ? 140 : 90);

  // Category scores
  const cat1 = diseaseSeverityScore(effectiveHba1c, effectiveFastingGlucose);
  const cat2 = obesityFatScore(body.bmi, body.waist ?? 75, g, dp.bellyFat ?? false);
  const cat3 = treatmentLoadScore(dp);
  const cat4 = lifestyleScore(lifestyle, dp);
  const cat5 = metabolicBlockersScore(dp, g);

  const totalRisk = cat1 + cat2 + cat3 + cat4 + cat5;
  let healthScore = 100 - totalRisk;
  if (healthScore < 27) healthScore = 27;
  if (healthScore > 95) healthScore = 95;

  // Risk category
  let riskCategory = "Good";
  if (healthScore >= 70) riskCategory = "Good";
  else if (healthScore >= 60) riskCategory = "Wake-up Call";
  else if (healthScore >= 50) riskCategory = "Attention Required";
  else if (healthScore >= 40) riskCategory = "Moderate Risk";
  else riskCategory = "High Risk";

  // Recommended program
  let recommendedProgram = "Preventive Wellness Program";
  if (healthScore >= 85) recommendedProgram = "Preventive Wellness Program";
  else if (healthScore >= 70) recommendedProgram = "Lifestyle Optimization Program";
  else if (healthScore >= 50) recommendedProgram = "Metabolic Correction Plan";
  else if (healthScore >= 30) recommendedProgram = "Intensive Metabolic Reversal";
  else recommendedProgram = "Critical Care Referral";

  // Override rule: HbA1c ≥ 8.5 OR Insulin = Yes OR Score ≤ 30
  const onInsulin = dp.medications === "insulin" || dp.medications === "insulin_plus";
  const overrideTriggered = effectiveHba1c >= 8.5 || onInsulin || healthScore <= 30;

  if (overrideTriggered) {
    recommendedProgram = "High Risk Clinical Supervision";
  }

  return {
    bmi: body.bmi,
    bmiCategory: body.bmiCategory,
    totalRisk,
    healthScore,
    riskCategory,
    recommendedProgram,
    overrideTriggered,
    breakdown: {
      diseaseSeverity: cat1,
      obesityFat: cat2,
      treatmentLoad: cat3,
      lifestyle: cat4,
      metabolicBlockers: cat5,
    },
  };
}

// ─── Program Descriptions ─────────────────────────────────────────────────────

export const programDescriptions: Record<string, string> = {
  "Preventive Wellness Program": "You're doing great! This program keeps you ahead with healthy habits, nutrition, and stress management.",
  "Lifestyle Optimization Program": "Fine-tune your lifestyle with guided meals, movement routines, and sleep optimization.",
  "Metabolic Correction Plan": "A structured 90-day plan targeting metabolic markers with coaching, meal plans, and daily tracking.",
  "Intensive Metabolic Reversal": "Intensive 6-month plan with weekly doctor check-ins, personalized diet, and clinical monitoring.",
  "Critical Care Referral": "Immediate clinical intervention recommended. Our team will connect you with the right specialists.",
  "High Risk Clinical Supervision": "You need close medical supervision. Our clinical team will guide every step of your recovery.",
};
