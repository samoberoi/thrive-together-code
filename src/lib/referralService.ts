import { supabase } from "@/integrations/supabase/client";

export interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  referral_code: string;
  status: string;
  reward_granted: boolean;
  reward_days?: number | null;
  created_at: string;
}

/** Get or create the current user's referral code */
export async function getOrCreateReferralCode(userId: string): Promise<string | null> {
  // Try to fetch existing
  const { data: existing } = await supabase
    .from("referral_codes" as any)
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();

  if ((existing as any)?.code) return (existing as any).code;

  // Create one — the DB trigger auto-generates the code
  const { data: created, error } = await supabase
    .from("referral_codes" as any)
    .insert({ user_id: userId, code: "" } as any)
    .select("code")
    .single();

  if (error) {
    console.error("Failed to create referral code:", error);
    return null;
  }
  return (created as any)?.code ?? null;
}

/** Fetch all referrals made by this user */
export async function fetchMyReferrals(userId: string): Promise<Referral[]> {
  const { data, error } = await supabase
    .from("referrals" as any)
    .select("*")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch referrals:", error);
    return [];
  }
  return (data as unknown as Referral[]) ?? [];
}

/** Reward days credited to the referrer, by the referred user's plan duration. */
export const REFERRAL_REWARD_DAYS_BY_MONTHS: Record<number, number> = {
  12: 60, // yearly → 2 months free
  6: 30,  // half-yearly → 1 month free
  3: 15,  // quarterly → 15 days free
  1: 7,   // monthly → 1 week free
};

/** Invite message — no web URL; users install from the app stores and paste the code. */
export function buildShareMessage(code: string): string {
  return [
    `Hey! I've been using ByeByeDiabetes (BBDO) to manage my health and it's been amazing.`,
    ``,
    `Download the app from the App Store (iOS) or Google Play Store (Android), then copy and paste this referral code during sign-up:`,
    ``,
    code,
    ``,
    `Yearly plan = 2 months free for me, 6 months = 1 month, quarterly = 15 days, monthly = 1 week. Thanks for joining! 🎉`,
  ].join("\n");
}

/** Share via Web Share API or copy to clipboard */
export async function shareReferralCode(code: string, userName: string): Promise<"shared" | "copied" | "failed"> {
  const text = buildShareMessage(code);

  if (navigator.share) {
    try {
      await navigator.share({ title: "Join ByeByeDiabetes", text });
      return "shared";
    } catch {
      // User cancelled
    }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
