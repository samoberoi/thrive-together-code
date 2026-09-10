import { useRbac } from "@/hooks/useRbac";

/** Package keys that have no assigned coach (Package 1). */
export const FOUNDATION_PACKAGE_KEYS = ["foundation", "starter"];

const CACHE_KEY = "bbdo_package_key";

function cachedPackageKey(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

export function isFoundationPackage(packageKey?: string | null): boolean {
  const key = packageKey ?? cachedPackageKey();
  return !!key && FOUNDATION_PACKAGE_KEYS.includes(key);
}

export interface CareTerms {
  /** True when the user is on Foundation Care — no personal coach exists. */
  isFoundation: boolean;
  /** "your coach" / "the BBDO care team" */
  carer: string;
  /** "Your coach" / "The BBDO care team" */
  Carer: string;
  /** "coach" / "BBDO care team" (no article) */
  carerNoun: string;
  /** Pick foundation wording or coach wording. */
  pick: (foundationText: string, coachText: string) => string;
}

export function careTermsFor(packageKey?: string | null): CareTerms {
  const isFoundation = isFoundationPackage(packageKey);
  return {
    isFoundation,
    carer: isFoundation ? "the BBDO care team" : "your coach",
    Carer: isFoundation ? "The BBDO care team" : "Your coach",
    carerNoun: isFoundation ? "BBDO care team" : "coach",
    pick: (f, c) => (isFoundation ? f : c),
  };
}

/** Terminology that adapts to plans without a personal coach (Foundation Care). */
export function useCareTerms(packageKeyOverride?: string | null): CareTerms {
  const { packageKey } = useRbac();
  return careTermsFor(packageKeyOverride ?? packageKey);
}
