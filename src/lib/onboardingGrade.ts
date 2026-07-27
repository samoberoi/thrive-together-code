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

async function computeGrade(): Promise<OnboardingGrade> {
  try {
    const { data, error } = await (supabase as any).rpc("compute_onboarding_grade", {
      _answers: buildGradeAnswers(),
    });
    if (error || !data) return FALLBACK_GRADE;
    return data as OnboardingGrade;
  } catch {
    return FALLBACK_GRADE;
  }
}

/** Synchronously returns the grade if it has already been resolved. */
export function getCachedOnboardingGrade(): OnboardingGrade | null {
  return gradeCache;
}

/** Kick off the grade computation early (e.g. on the analyzing screen). */
export function prefetchOnboardingGrade(): Promise<OnboardingGrade> {
  if (!gradePromise) {
    gradePromise = computeGrade().then((g) => {
      gradeCache = g;
      return g;
    });
  }
  return gradePromise;
}

export function resetOnboardingGrade() {
  gradePromise = null;
  gradeCache = null;
}

export async function fetchOnboardingGrade(): Promise<OnboardingGrade> {
  return prefetchOnboardingGrade();
}

