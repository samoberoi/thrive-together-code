import { supabase } from "@/integrations/supabase/client";
import { fetchPricingRegions, type PricingRegion } from "@/lib/packageService";

export interface AuthRegion {
  code: string;
  name: string;
  currency: string;
  symbol: string;
  flag: string;
  /** India keeps phone + SMS OTP; every other region uses email OTP. */
  method: "phone" | "email";
}

export const INDIA_REGION: AuthRegion = {
  code: "IN",
  name: "India",
  currency: "INR",
  symbol: "₹",
  flag: "🇮🇳",
  method: "phone",
};

const REGION_FLAGS: Record<string, string> = {
  US: "🇺🇸",
  CA: "🇨🇦",
  AU: "🇦🇺",
  GB: "🇬🇧",
  AE: "🇦🇪",
  ROW: "🌍",
};

const REGION_KEY = "bb_region_code";

export function getStoredRegionCode(): string {
  try {
    return localStorage.getItem(REGION_KEY) || INDIA_REGION.code;
  } catch {
    return INDIA_REGION.code;
  }
}

export function setStoredRegionCode(code: string) {
  try {
    localStorage.setItem(REGION_KEY, code);
  } catch {
    /* storage unavailable */
  }
}

/** India first, then every enabled backend pricing region. */
export async function fetchAuthRegions(): Promise<AuthRegion[]> {
  const regions = await fetchPricingRegions();
  return [
    INDIA_REGION,
    ...regions
      .filter((r) => r.enabled)
      .map((r) => ({
        code: r.code,
        name: r.name,
        currency: r.currency,
        symbol: r.symbol,
        flag: REGION_FLAGS[r.code] ?? "🌍",
        method: "email" as const,
      })),
  ];
}

export interface RegionPriceContext {
  region: PricingRegion | null;
  /** package_id -> monthly price in the region currency */
  prices: Record<string, number>;
  symbol: string;
  currency: string;
  locale: string;
}

export const INR_CONTEXT: RegionPriceContext = {
  region: null,
  prices: {},
  symbol: "₹",
  currency: "INR",
  locale: "en-IN",
};

/** Live regional prices for the given region; India (or missing data) falls back to INR. */
export async function fetchRegionPriceContext(regionCode: string): Promise<RegionPriceContext> {
  if (!regionCode || regionCode === INDIA_REGION.code) return INR_CONTEXT;
  const [regions, { data }] = await Promise.all([
    fetchPricingRegions(),
    (supabase as any)
      .from("package_region_pricing")
      .select("package_id, monthly_price, enabled")
      .eq("region_code", regionCode),
  ]);
  const region = regions.find((r) => r.code === regionCode && r.enabled) ?? null;
  if (!region) return INR_CONTEXT;
  const prices: Record<string, number> = {};
  (data ?? []).forEach((row: any) => {
    if (row.enabled === false) return;
    prices[row.package_id] = Number(row.monthly_price);
  });
  return {
    region,
    prices,
    symbol: region.symbol,
    currency: region.currency,
    locale: "en-US",
  };
}

export function formatMoney(amount: number, ctx: RegionPriceContext) {
  return `${ctx.symbol}${Math.round(amount).toLocaleString(ctx.locale)}`;
}

/**
 * Keeps regional prices in sync in real time — the admin can change them in the
 * backend and open plan screens update without a reload.
 */
export function subscribeRegionPricing(regionCode: string, onChange: () => void) {
  if (!regionCode || regionCode === INDIA_REGION.code) return () => {};
  const channel = (supabase as any)
    .channel(`region-pricing-${regionCode}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "package_region_pricing", filter: `region_code=eq.${regionCode}` },
      onChange,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "pricing_regions" }, onChange)
    .subscribe();
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* channel already gone */
    }
  };
}
