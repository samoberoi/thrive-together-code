// ─── User Store (localStorage-backed) ────────────────────────────────────────
// Since no backend is available, we persist everything in localStorage.

import type {
  UserProfile,
  BodyMetrics,
  ClinicalData,
  LifestyleData,
  HealthAssessment,
} from "./healthEngine";

const KEY = "bb_user";

export interface StoredUser {
  /** Auth user id this cache belongs to — guards against stale cross-account data. */
  ownerId?: string | null;
  profile: Partial<UserProfile>;
  bodyMetrics: Partial<BodyMetrics>;
  clinical: Partial<ClinicalData>;
  lifestyle: Partial<LifestyleData>;
  assessment: HealthAssessment | null;
  deepProfiling: Record<string, any> | null;
  avatarUrl: string | null;
  /** True once the user actually submitted the BodyStats step (or has server values). */
  bodyStatsConfirmed?: boolean;
}

const defaults: StoredUser = {
  profile: {},
  bodyMetrics: {},
  clinical: {},
  lifestyle: {},
  assessment: null,
  deepProfiling: null,
  avatarUrl: null,
  bodyStatsConfirmed: false,
};


export function getUser(): StoredUser {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    return JSON.parse(raw) as StoredUser;
  } catch {
    return { ...defaults };
  }
}

export function saveUser(data: Partial<StoredUser>): StoredUser {
  const current = getUser();
  const updated: StoredUser = {
    ...current,
    ...data,
    profile: { ...current.profile, ...data.profile },
    bodyMetrics: { ...current.bodyMetrics, ...data.bodyMetrics },
    clinical: { ...current.clinical, ...data.clinical },
    lifestyle: { ...current.lifestyle, ...data.lifestyle },
    assessment: data.assessment !== undefined ? data.assessment : current.assessment,
    deepProfiling: data.deepProfiling !== undefined ? data.deepProfiling : current.deepProfiling,
    avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : current.avatarUrl,
  };
  localStorage.setItem(KEY, JSON.stringify(updated));
  // Notify same-tab listeners that user data has changed
  window.dispatchEvent(new CustomEvent("bb_user_updated"));
  return updated;
}

export function getUserName(): string {
  return getUser().profile.name ?? "Friend";
}

export function getHealthScore(): number {
  return getUser().assessment?.healthScore ?? 72;
}

export function clearUser(): void {
  localStorage.removeItem(KEY);
}

/**
 * Bind the local cache to a specific auth user. If the cache belongs to a
 * different (or unknown legacy) account, drop it so leftover test-profile data
 * — e.g. an old patient name — can never be shown or pushed back to the server.
 * Returns true when the cache was cleared.
 */
export function ensureCacheOwner(userId: string): boolean {
  const current = getUser();
  if (current.ownerId === userId) return false;
  localStorage.removeItem(KEY);
  localStorage.setItem(KEY, JSON.stringify({ ...defaults, ownerId: userId }));
  window.dispatchEvent(new CustomEvent("bb_user_updated"));
  return true;
}
