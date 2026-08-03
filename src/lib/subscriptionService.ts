import { supabase } from "@/integrations/supabase/client";

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  plan_price: number;
  duration_months: number;
  started_at: string;
  expires_at: string;
  status: "active" | "scheduled" | "expired" | "cancelled";
  change_type?: "new" | "upgrade" | "downgrade" | "renewal";
  credit_applied?: number;
  created_at: string;
}

export type PlanChangeMode = "new" | "upgrade" | "downgrade" | "renewal";

export interface PlanChangePreview {
  mode: PlanChangeMode;
  credit: number;
  amount_due: number;
  starts_at: string;
  expires_at: string;
  current_expires_at: string | null;
}


/**
 * Legacy plan_id values that were used before packages were seeded in the DB.
 * All new code should use plan_keys from `packages` directly.
 */
export const PLAN_KEY_ALIAS: Record<string, string> = {
  starter: "foundation",
  pro: "intensive",
};

export function normalizePlanKey(planId: string | null | undefined): string | null {
  if (!planId) return null;
  return PLAN_KEY_ALIAS[planId] ?? planId;
}

export async function fetchActiveSubscription(userId?: string): Promise<Subscription | null> {
  let query = supabase
    .from("subscriptions" as any)
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Failed to fetch subscription:", error);
    return null;
  }
  const sub = data as unknown as Subscription | null;
  // Treat time-expired subscriptions as inactive even if status not yet reconciled.
  if (sub && new Date(sub.expires_at).getTime() <= Date.now()) return null;
  return sub;
}

/** Latest subscription row regardless of status — used to detect expired users. */
export async function fetchLatestSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions" as any)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Failed to fetch latest subscription:", error);
    return null;
  }
  return data as unknown as Subscription | null;
}

export function isSubscriptionExpired(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.status !== "active") return true;
  return new Date(sub.expires_at).getTime() <= Date.now();
}

export async function createSubscription(sub: {
  user_id: string;
  plan_id: string;
  plan_name: string;
  plan_price: number;
  duration_months: number;
  started_at: string;
  expires_at: string;
}): Promise<Subscription> {
  const { data, error } = await (supabase as any).rpc("complete_demo_payment", {
    _plan_id: sub.plan_id,
    _plan_name: sub.plan_name,
    _plan_price: sub.plan_price,
    _duration_months: sub.duration_months,
  });

  if (error) {
    console.error("Failed to create subscription:", error);
    throw new Error(error.message || "Failed to create subscription");
  }
  return data as unknown as Subscription;
}

/** Activate any scheduled (downgraded) plan whose start date has arrived. */
export async function activateDueSubscriptions(userId?: string): Promise<void> {
  try {
    await (supabase as any).rpc("activate_due_subscriptions", { _user_id: userId ?? null });
  } catch (e) {
    console.warn("activate_due_subscriptions failed", e);
  }
}

/** A downgrade that has been paid for and starts when the current plan ends. */
export async function fetchScheduledSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions" as any)
    .select("*")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Failed to fetch scheduled subscription:", error);
    return null;
  }
  return data as unknown as Subscription | null;
}

/** What the change would cost and when it would start. */
export async function previewPlanChange(input: {
  plan_price: number;
  duration_months: number;
  mode: PlanChangeMode;
}): Promise<PlanChangePreview | null> {
  const { data, error } = await (supabase as any).rpc("preview_plan_change", {
    _plan_price: input.plan_price,
    _duration_months: input.duration_months,
    _mode: input.mode,
  });
  if (error) {
    console.error("Failed to preview plan change:", error);
    return null;
  }
  return data as PlanChangePreview;
}

/** Upgrade (starts now, prorated) or downgrade (starts at current expiry). */
export async function changeSubscriptionPlan(input: {
  plan_id: string;
  plan_name: string;
  plan_price: number;
  duration_months: number;
  mode: PlanChangeMode;
}): Promise<Subscription> {
  const { data, error } = await (supabase as any).rpc("change_subscription_plan", {
    _plan_id: input.plan_id,
    _plan_name: input.plan_name,
    _plan_price: input.plan_price,
    _duration_months: input.duration_months,
    _mode: input.mode,
  });
  if (error) {
    console.error("Failed to change plan:", error);
    throw new Error(error.message || "Failed to change plan");
  }
  return data as unknown as Subscription;
}

export interface PlanOption {
  id: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  direction: "upgrade" | "downgrade";
}

/** All other packages relative to the current one, split into upgrades and downgrades. */
export async function fetchPlanChangeOptions(currentPlanKey: string): Promise<PlanOption[]> {
  const normalizedPlanKey = normalizePlanKey(currentPlanKey) ?? currentPlanKey;
  const { data: pkgs } = await (supabase as any)
    .from("packages")
    .select("*")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  if (!pkgs) return [];
  const idx = pkgs.findIndex((p: any) => p.plan_key === normalizedPlanKey);
  if (idx === -1) return [];
  return pkgs
    .filter((_: any, i: number) => i !== idx)
    .map((p: any, i: number) => ({
      id: p.plan_key as string,
      name: p.name as string,
      tagline: (p.tagline ?? "") as string,
      monthlyPrice: p.base_monthly_price as number,
      direction: (pkgs.findIndex((q: any) => q.plan_key === p.plan_key) > idx ? "upgrade" : "downgrade") as
        | "upgrade"
        | "downgrade",
    }));
}

/** Get upgrade options for the current plan using DB packages by sort_order */
export async function fetchUpgradeOptions(currentPlanKey: string) {
  const all = await fetchPlanChangeOptions(currentPlanKey);
  return all.filter((p) => p.direction === "upgrade");
}

/** Packages below the current one — a downgrade starts when the current plan ends. */
export async function fetchDowngradeOptions(currentPlanKey: string) {
  const all = await fetchPlanChangeOptions(currentPlanKey);
  return all.filter((p) => p.direction === "downgrade");
}

/** Fetch a single package by plan_key for display */
export async function fetchPackageByPlanKey(planKey: string) {
  const normalizedPlanKey = normalizePlanKey(planKey) ?? planKey;
  const { data } = await (supabase as any)
    .from("packages")
    .select("*")
    .eq("plan_key", normalizedPlanKey)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.plan_key as string,
    name: data.name as string,
    tagline: (data.tagline ?? "") as string,
    features: (Array.isArray(data.features) ? data.features : []) as string[],
  };
}

