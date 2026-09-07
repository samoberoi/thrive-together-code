import { supabase } from "@/integrations/supabase/client";

export interface RegionFx {
  code: string;
  currency: string;
  symbol: string;
  fx_per_inr: number;
}

export const INR_REGION: RegionFx = { code: "IN", currency: "INR", symbol: "₹", fx_per_inr: 1 };

/** Loads currency + FX metadata for every configured pricing region (India included). */
export async function fetchRegionFxMap(): Promise<Map<string, RegionFx>> {
  const map = new Map<string, RegionFx>([["IN", INR_REGION]]);
  const { data } = await (supabase as any).from("pricing_regions").select("code, currency, symbol, fx_per_inr");
  for (const r of (data ?? []) as any[]) {
    const fx = Number(r.fx_per_inr);
    map.set(r.code, {
      code: r.code,
      currency: r.currency,
      symbol: r.symbol ?? "",
      fx_per_inr: Number.isFinite(fx) && fx > 0 ? fx : 1,
    });
  }
  return map;
}

export function regionOf(map: Map<string, RegionFx>, code?: string | null): RegionFx {
  if (!code || code === "IN") return INR_REGION;
  return map.get(code) ?? INR_REGION;
}

/** Money in the currency the member actually paid in. */
export function formatMoneyIn(amount: number, region: RegionFx): string {
  const n = Math.round(Number(amount) || 0);
  if (region.code === "IN") return `₹${n.toLocaleString("en-IN")}`;
  return `${region.symbol}${n.toLocaleString("en-US")}`;
}

/** Converts a native-currency amount back to INR for consolidated totals. */
export function toInr(amount: number, region: RegionFx): number {
  const n = Number(amount) || 0;
  if (region.code === "IN" || !region.fx_per_inr) return n;
  return n / region.fx_per_inr;
}

export function inrLabel(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
