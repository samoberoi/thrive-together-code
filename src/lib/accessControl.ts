import { fetchProfile } from "@/lib/profileService";
import { activateDueSubscriptions, fetchActiveSubscription } from "@/lib/subscriptionService";
import { isAdminUser, isCoachUser } from "@/lib/roleService";
import { isChannelPartner } from "@/lib/channelPartnerService";

export type ProtectedAccessDecision = {
  allowed: boolean;
  redirectTo?: string;
};

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
  // A scheduled downgrade becomes the live plan the moment the previous one ends.
  await activateDueSubscriptions(userId);
  const [isAdmin, isCoach, isPartner, profile, activeSubscription] = await Promise.all([
    isAdminUser(userId),
    isCoachUser(userId),
    isChannelPartner(userId),
    fetchProfile(userId),
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
  await activateDueSubscriptions(userId);
  const [isAdmin, isCoach, isPartner, profile, activeSubscription] = await Promise.all([
    isAdminUser(userId),
    isCoachUser(userId),
    isChannelPartner(userId),
    fetchProfile(userId),
    fetchActiveSubscription(userId),
  ]);

  if (isAdmin || isCoach || isPartner) return { allowed: true };

  if (activeSubscription) return { allowed: true };
  if (profile?.onboarding_completed) return { allowed: false, redirectTo: "/plans" };
  if (profile?.name) return { allowed: false, redirectTo: "/setup/purpose" };
  return { allowed: false, redirectTo: "/auth" };
}