import { supabase } from "@/integrations/supabase/client";

export type BillingCycle = "monthly" | "quarterly" | "half_yearly" | "yearly";

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "6 Months",
  yearly: "Yearly",
};

export interface Package {
  id: string;
  plan_key: string;
  name: string;
  tagline: string | null;
  badge: string | null;
  accent: string;
  base_monthly_price: number;
  features: string[];
  enabled: boolean;
  sort_order: number;
  show_in_onboarding: boolean;
  assigns_coach: boolean;
}

export interface PackagePricing {
  id: string;
  package_id: string;
  billing_cycle: BillingCycle;
  discount_percent: number;
  enabled: boolean;
}

export interface PackageWithPricing extends Package {
  pricing: PackagePricing[];
}

export interface SelectedPlan {
  package_id: string;
  plan_key: string;
  name: string;
  billing_cycle: BillingCycle;
  duration_months: number;
  monthly_price: number; // discounted per-month
  total_price: number;   // billed amount for the period
  base_monthly_price: number;
  discount_percent: number;
  assigns_coach: boolean;
  /** new = first purchase, upgrade = starts today (prorated), downgrade = starts at current expiry */
  change_mode?: "new" | "upgrade" | "downgrade" | "renewal";
}

const SELECTED_KEY = "bb_selected_plan";

export async function fetchPackagesWithPricing(opts: { onlyEnabled?: boolean } = {}): Promise<PackageWithPricing[]> {
  const { onlyEnabled = false } = opts;
  let pkgQuery = (supabase as any).from("packages").select("*").order("sort_order", { ascending: true });
  if (onlyEnabled) pkgQuery = pkgQuery.eq("enabled", true);
  const { data: pkgs, error } = await pkgQuery;
  if (error || !pkgs) return [];
  const ids = pkgs.map((p: any) => p.id);
  if (ids.length === 0) return [];
  let prQuery = (supabase as any).from("package_pricing").select("*").in("package_id", ids);
  if (onlyEnabled) prQuery = prQuery.eq("enabled", true);
  const { data: pricing } = await prQuery;
  return pkgs.map((p: any) => ({
    ...p,
    features: Array.isArray(p.features) ? p.features : [],
    pricing: (pricing ?? []).filter((r: any) => r.package_id === p.id),
  }));
}

export function computePrice(basePrice: number, discountPercent: number, months: number) {
  const monthly = Math.round(basePrice * (1 - discountPercent / 100));
  const total = monthly * months;
  return { monthly, total };
}

export async function updatePackage(id: string, patch: Partial<Package>) {
  return (supabase as any).from("packages").update(patch).eq("id", id);
}

export async function updatePricing(id: string, patch: Partial<PackagePricing>) {
  return (supabase as any).from("package_pricing").update(patch).eq("id", id);
}

export function saveSelectedPlan(plan: SelectedPlan) {
  localStorage.setItem(SELECTED_KEY, JSON.stringify(plan));
}

export function getSelectedPlan(): SelectedPlan | null {
  try {
    const raw = localStorage.getItem(SELECTED_KEY);
    return raw ? (JSON.parse(raw) as SelectedPlan) : null;
  } catch {
    return null;
  }
}

/* ---------------- Regional pricing (admin backend) ---------------- */

export interface PricingRegion {
  code: string;
  name: string;
  currency: string;
  symbol: string;
  fx_per_inr: number;
  uplift_percent: number;
  round_to: number;
  sort_order: number;
  enabled: boolean;
}

export interface PackageRegionPrice {
  id: string;
  package_id: string;
  region_code: string;
  monthly_price: number;
  enabled: boolean;
}

export async function fetchPricingRegions(): Promise<PricingRegion[]> {
  const { data } = await (supabase as any)
    .from("pricing_regions")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r: any) => ({
    ...r,
    fx_per_inr: Number(r.fx_per_inr),
    uplift_percent: Number(r.uplift_percent),
    round_to: Number(r.round_to),
  }));
}

export async function fetchRegionPricing(packageIds?: string[]): Promise<PackageRegionPrice[]> {
  let q = (supabase as any).from("package_region_pricing").select("*");
  if (packageIds?.length) q = q.in("package_id", packageIds);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({ ...r, monthly_price: Number(r.monthly_price) }));
}

export async function upsertRegionPrice(row: {
  package_id: string;
  region_code: string;
  monthly_price: number;
  enabled: boolean;
}) {
  return (supabase as any)
    .from("package_region_pricing")
    .upsert(row, { onConflict: "package_id,region_code" });
}

/** Suggested regional monthly price: INR base -> local currency + uplift, rounded up. */
export function suggestRegionPrice(baseMonthlyInr: number, region: PricingRegion): number {
  const raw = baseMonthlyInr * region.fx_per_inr * (1 + region.uplift_percent / 100);
  const step = region.round_to > 0 ? region.round_to : 1;
  return Math.max(step, Math.ceil(raw / step) * step);
}

export function formatRegionMoney(amount: number, region: PricingRegion): string {
  return `${region.symbol}${amount.toLocaleString("en-US")}`;
}
