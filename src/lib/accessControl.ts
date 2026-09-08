import { fetchProfile } from "@/lib/profileService";
import { activateDueSubscriptions, fetchActiveSubscription } from "@/lib/subscriptionService";
import { isAdminUser, isCoachUser } from "@/lib/roleService";
import { isChannelPartner } from "@/lib/channelPartnerService";

export type ProtectedAccessDecision = {
  allowed: boolean;
  redirectTo?: string;
};

const ACCESS_CACHE_MS = 60_000;
const protectedAccessCache = new Map<string, { at: number; decision: ProtectedAccessDecision }>();
const postAuthRouteCache = new Map<string, { at: number; route: string | null }>();
const ACCESS_TIMEOUT_MS = 6_000;

function bounded<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ACCESS_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export function clearAccessDecisionCache(userId?: string) {
  if (userId) {
    protectedAccessCache.delete(userId);
    postAuthRouteCache.delete(userId);
  } else {
    protectedAccessCache.clear();
    postAuthRouteCache.clear();
  }
}

async function resolvePrivilegedRoute(userId: string): Promise<string | null> {
  const [isAdmin, isCoach, isPartner] = await Promise.all([
    isAdminUser(userId),
    isCoachUser(userId),
    isChannelPartner(userId),
  ]);

  if (isAdmin) return "/admin-dashboard";
  if (isCoach) return "/coach-dashboard";
  if (isPartner) return "/partner-dashboard";
  return null;
}

export async function resolvePostAuthRoute(
  userId: string,
  options: { missingProfileRoute?: string | null } = {},
): Promise<string | null> {
  const cached = postAuthRouteCache.get(userId);
  if (cached && Date.now() - cached.at < ACCESS_CACHE_MS) return cached.route;

  // Keep scheduled plan activation in the same parallel batch instead of making
  // every launch wait for an extra network round-trip first.
  const result = await bounded(Promise.all([
    activateDueSubscriptions(userId),
    isAdminUser(userId),
    isCoachUser(userId),
    isChannelPartner(userId),
    fetchProfile(userId, { force: true }),
    fetchActiveSubscription(userId),
  ]), null);

  if (!result) return cached?.route ?? "/plans";
  const [, isAdmin, isCoach, isPartner, profile, activeSubscription] = result;

  let route: string | null;
  if (isAdmin) route = "/admin-dashboard";
  else if (isCoach) route = "/coach-dashboard";
  else if (isPartner) route = "/partner-dashboard";
  else if (activeSubscription) route = "/home";
  else if (profile?.onboarding_completed) route = "/plans";
  else if (profile?.name) route = "/setup/purpose";
  else route = options.missingProfileRoute ?? null;

  postAuthRouteCache.set(userId, { at: Date.now(), route });
  return route;
}

export async function resolveProtectedAccess(userId: string): Promise<ProtectedAccessDecision> {
  const cached = protectedAccessCache.get(userId);
  if (cached && Date.now() - cached.at < ACCESS_CACHE_MS) return cached.decision;

  const result = await bounded(Promise.all([
    activateDueSubscriptions(userId),
    isAdminUser(userId),
    isCoachUser(userId),
    isChannelPartner(userId),
    fetchProfile(userId, { force: true }),
    fetchActiveSubscription(userId),
  ]), null);

  // A stalled mobile resume request must never leave an endless gate. Reuse a
  // recent decision when possible; otherwise fall back to the safe plan screen.
  if (!result) return cached?.decision ?? { allowed: false, redirectTo: "/plans" };
  const [, isAdmin, isCoach, isPartner, profile, activeSubscription] = result;

  let decision: ProtectedAccessDecision;
  if (isAdmin || isCoach || isPartner || activeSubscription) decision = { allowed: true };
  else if (profile?.onboarding_completed) decision = { allowed: false, redirectTo: "/plans" };
  else if (profile?.name) decision = { allowed: false, redirectTo: "/setup/purpose" };
  else decision = { allowed: false, redirectTo: "/auth" };
  protectedAccessCache.set(userId, { at: Date.now(), decision });
  return decision;
}