import { supabase } from "@/integrations/supabase/client";
import { getUser } from "@/lib/userStore";

export type OnboardingGradeCard = { title: string; description: string; icon: string };

export type OnboardingGrade = {
  points: number;
  grade: number;
  slug: string;
  kicker: string;
  headline: string;
  headline_highlight: string | null;
  accent: string;
  closing_line: string | null;
  cta_label: string;
  cards: OnboardingGradeCard[];
};

export const FALLBACK_GRADE: OnboardingGrade = {
  points: 0,
  grade: 3,
  slug: "severe",
  kicker: "Understanding Your Body",
  headline: "Here's what's happening",
  headline_highlight: "inside.",
  accent: "red",
  closing_line: null,
  cta_label: "So what can I do?",
  cards: [
    { title: "Insulin Resistance", description: "When your cells stop responding to insulin, glucose stays in your blood.", icon: "Lock" },
    { title: "Visceral Fat", description: "Fat around organs worsens insulin resistance — a vicious cycle.", icon: "Heart" },
    { title: "Lifestyle Triggers", description: "Poor sleep, stress, and sedentary habits amplify metabolic dysfunction.", icon: "RefreshCw" },
  ],
};

/** Builds the answer payload from everything captured in the first 5 onboarding steps. */
export function buildGradeAnswers(): Record<string, unknown> {
  const u = getUser();
  const profile = u.profile as any;
  const body = u.bodyMetrics as any;
  const clinical = u.clinical as any;
  const lifestyle = u.lifestyle as any;

  const height = body?.height ?? 170;
  const weight = body?.weight ?? 70;
  const bmi = body?.bmi ?? (height > 0 ? weight / Math.pow(height / 100, 2) : null);

  const diabetesType = clinical?.hasDiabetes
    ? clinical?.diabetesType ?? "not_sure"
    : "none";

  return {
    goals: profile?.goals ?? [],
    gender: profile?.gender ?? "male",
    age: profile?.age ?? null,
    bmi: bmi != null ? Number(bmi.toFixed(1)) : null,
    waist: body?.waist ?? null,
    diabetesType,
    hasHypertension: clinical?.hasHypertension ? "true" : "false",
    hasCardiovascular: clinical?.hasCardiovascular ? "true" : "false",
    smoking: lifestyle?.smoking ? "true" : "false",
    alcohol: lifestyle?.alcohol ?? null,
    activity: lifestyle?.activity ?? null,
    sleepHours: lifestyle?.sleepHours ?? null,
  };
}

let gradePromise: Promise<OnboardingGrade> | null = null;
let gradeCache: OnboardingGrade | null = null;
let cacheKey = "";

/** Local mirror of the server scoring rules — used when the RPC is unreachable
 *  (offline / flaky mobile network) so we never fall back to "severe" wrongly. */
function computeGradeLocally(a: Record<string, any>): OnboardingGrade {
  let pts = 0;

  const goalPts: Record<string, number> = { energy: 1, lifestyle: 2, weight: 3, diabetes: 4 };
  const goals: string[] = Array.isArray(a.goals) ? a.goals : [];
  pts += goals.reduce((m, g) => Math.max(m, goalPts[g] ?? 0), 0);

  const age = Number(a.age);
  if (isFinite(age)) pts += age >= 50 ? 2 : age >= 35 ? 1 : 0;

  const bmi = Number(a.bmi);
  if (isFinite(bmi) && bmi > 0) pts += bmi >= 30 ? 4 : bmi >= 25 ? 2 : 0;

  const waist = Number(a.waist);
  const isMale = String(a.gender ?? "male").toLowerCase() === "male";
  if (isFinite(waist) && waist > 0) {
    if (isMale) pts += waist >= 102 ? 3 : waist >= 90 ? 2 : 0;
    else pts += waist >= 88 ? 3 : waist >= 80 ? 2 : 0;
  }

  const dt: Record<string, number> = { none: 0, prediabetes: 3, not_sure: 3, type1: 4, type2: 5 };
  pts += dt[String(a.diabetesType ?? "none")] ?? 0;

  if (a.hasHypertension === "true") pts += 2;
  if (a.hasCardiovascular === "true") pts += 3;
  if (a.smoking === "true") pts += 2;

  const alc: Record<string, number> = { none: 0, moderate: 1, high: 2 };
  pts += alc[String(a.alcohol ?? "none")] ?? 0;

  const act: Record<string, number> = { active: 0, moderate: 1, light: 2, sedentary: 3 };
  pts += act[String(a.activity ?? "moderate")] ?? 0;

  const sleep = Number(a.sleepHours);
  if (isFinite(sleep) && sleep > 0) pts += sleep >= 7 ? 0 : sleep >= 6 ? 1 : sleep >= 5 ? 2 : 3;

  if (pts <= 4) {
    return {
      ...FALLBACK_GRADE,
      points: pts,
      grade: 1,
      slug: "normal",
      accent: "green",
      headline: "Your body is on the",
      headline_highlight: "right track.",
      closing_line: "You're doing well. Let's help you stay there – and becoming even healthier.",
      cards: [
        { title: "Healthy Insulin Function", description: "Your body is responding well to insulin. Keep it that way with consistent choices.", icon: "Shield" },
        { title: "Healthy Fat Distribution", description: "Maintaining a healthy waist helps protect your organs and supports long-term health.", icon: "WaistArrows" },
        { title: "Lifestyle Advantage", description: "Consistent habits today help prevent tomorrow's metabolic disease and keep you feeling your best.", icon: "Sprout" },
      ],
    };
  }
  if (pts <= 11) {
    return {
      ...FALLBACK_GRADE,
      points: pts,
      grade: 2,
      slug: "moderate",
      accent: "amber",
      headline: "Your body is giving you",
      headline_highlight: "early signals.",
    };
  }
  return { ...FALLBACK_GRADE, points: pts };
}

async function computeGrade(answers: Record<string, unknown>): Promise<OnboardingGrade> {
  try {
    const { data, error } = await (supabase as any).rpc("compute_onboarding_grade", {
      _answers: answers,
    });
    if (error || !data) return computeGradeLocally(answers as Record<string, any>);
    return data as OnboardingGrade;
  } catch {
    return computeGradeLocally(answers as Record<string, any>);
  }
}

/** Synchronously returns the grade if it has already been resolved. */
export function getCachedOnboardingGrade(): OnboardingGrade | null {
  const key = JSON.stringify(buildGradeAnswers());
  return key === cacheKey ? gradeCache : null;
}

/** Kick off the grade computation early (e.g. on the analyzing screen). */
export function prefetchOnboardingGrade(): Promise<OnboardingGrade> {
  const answers = buildGradeAnswers();
  const key = JSON.stringify(answers);
  if (!gradePromise || key !== cacheKey) {
    cacheKey = key;
    gradeCache = null;
    gradePromise = computeGrade(answers).then((g) => {
      gradeCache = g;
      return g;
    });
  }
  return gradePromise;
}

export function resetOnboardingGrade() {
  gradePromise = null;
  gradeCache = null;
  cacheKey = "";
}

export async function fetchOnboardingGrade(): Promise<OnboardingGrade> {
  return prefetchOnboardingGrade();
}


