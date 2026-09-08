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

export function clearAccessDecisionCache(userId?: string) {
  if (userId) protectedAccessCache.delete(userId);
  else protectedAccessCache.clear();
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
  // Keep scheduled plan activation in the same parallel batch instead of making
  // every launch wait for an extra network round-trip first.
  const [, isAdmin, isCoach, isPartner, profile, activeSubscription] = await Promise.all([
    activateDueSubscriptions(userId),
    isAdminUser(userId),
    isCoachUser(userId),
    isChannelPartner(userId),
    fetchProfile(userId, { force: true }),
    fetchActiveSubscription(userId),
  ]);

  if (isAdmin) return "/admin-dashboard";
  if (isCoach) return "/coach-dashboard";
  if (isPartner) return "/partner-dashboard";

  if (activeSubscription) return "/home";
  if (profile?.onboarding_completed) return "/plans";
  if (profile?.name) return "/setup/purpose";
  return options.missingProfileRoute ?? null;
}

export async function resolveProtectedAccess(userId: string): Promise<ProtectedAccessDecision> {
  const cached = protectedAccessCache.get(userId);
  if (cached && Date.now() - cached.at < ACCESS_CACHE_MS) return cached.decision;

  const [, isAdmin, isCoach, isPartner, profile, activeSubscription] = await Promise.all([
    activateDueSubscriptions(userId),
    isAdminUser(userId),
    isCoachUser(userId),
    isChannelPartner(userId),
    fetchProfile(userId, { force: true }),
    fetchActiveSubscription(userId),
  ]);

  let decision: ProtectedAccessDecision;
  if (isAdmin || isCoach || isPartner || activeSubscription) decision = { allowed: true };
  else if (profile?.onboarding_completed) decision = { allowed: false, redirectTo: "/plans" };
  else if (profile?.name) decision = { allowed: false, redirectTo: "/setup/purpose" };
  else decision = { allowed: false, redirectTo: "/auth" };
  protectedAccessCache.set(userId, { at: Date.now(), decision });
  return decision;
}