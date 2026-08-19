import { supabase } from "@/integrations/supabase/client";

export type LabParameter = {
  id: string;
  code: string;
  name: string;
  group_name: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  direction: "higher_better" | "lower_better" | "in_range";
  is_key_marker: boolean;
  display_order: number;
  product_codes: string[];
};

export type LabResult = {
  id: string;
  user_id: string;
  report_id: string | null;
  order_id: string | null;
  external_report_id?: string | null;
  parameter_code: string;
  parameter_name: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  status: "low" | "normal" | "high" | null;
  observed_at: string;
  is_baseline: boolean;
  delta_vs_baseline: number | null;
  delta_vs_previous: number | null;
  trend: "improving" | "worsening" | "stable" | "baseline" | null;
  source: string;
  created_at: string;
};

/** Fetch catalog parameters for a list of product codes (deduped, ordered). */
export async function fetchParametersForProducts(productCodes: string[]): Promise<LabParameter[]> {
  if (!productCodes.length) return [];
  const { data, error } = await (supabase as any)
    .from("lab_parameters")
    .select("*")
    .overlaps("product_codes", productCodes)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as LabParameter[];
}

/** All catalog parameters (admin). */
export async function fetchAllParameters(): Promise<LabParameter[]> {
  const { data, error } = await (supabase as any)
    .from("lab_parameters")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as LabParameter[];
}

/** All results for a user (newest first). */
export async function fetchUserResults(userId: string): Promise<LabResult[]> {
  const { data, error } = await (supabase as any)
    .from("lab_results")
    .select("*")
    .eq("user_id", userId)
    .order("observed_at", { ascending: false });
  if (error) throw error;
  return (data || []) as LabResult[];
}

/** Latest value per parameter for a user. */
export function latestResultsByParam(results: LabResult[]): Record<string, LabResult> {
  const map: Record<string, LabResult> = {};
  for (const r of results) {
    const prev = map[r.parameter_code];
    if (!prev || new Date(r.observed_at) > new Date(prev.observed_at)) {
      map[r.parameter_code] = r;
    }
  }
  return map;
}

export type ResultInput = {
  parameter_code: string;
  parameter_name: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
};

/**
 * Replace results for a given (user, order, observed_at) batch.
 * Deletes existing rows for the order then inserts the new batch.
 */
export async function saveResultsForOrder(opts: {
  userId: string;
  orderId: string | null;
  reportId: string | null;
  observedAt: string; // ISO
  source?: string;
  rows: ResultInput[];
}): Promise<void> {
  const { userId, orderId, reportId, observedAt, source = "manual", rows } = opts;
  // Remove prior rows tied to this order (re-entry replaces).
  if (orderId) {
    await (supabase as any).from("lab_results").delete().eq("user_id", userId).eq("order_id", orderId);
  }
  const payload = rows
    .filter((r) => r.value_numeric != null || (r.value_text && r.value_text.trim() !== ""))
    .map((r) => ({
      user_id: userId,
      order_id: orderId,
      report_id: reportId,
      parameter_code: r.parameter_code,
      parameter_name: r.parameter_name,
      value_numeric: r.value_numeric,
      value_text: r.value_text,
      unit: r.unit,
      ref_low: r.ref_low,
      ref_high: r.ref_high,
      observed_at: observedAt,
      source,
    }));
  if (!payload.length) return;
  const { error } = await (supabase as any).from("lab_results").insert(payload);
  if (error) throw error;
}

/** Friendly delta string for a numeric value, given direction. */
export function formatDelta(delta: number | null, unit?: string | null) {
  if (delta == null || delta === 0) return null;
  const sign = delta > 0 ? "+" : "−";
  const abs = Math.abs(delta);
  const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10;
  return `${sign}${rounded}${unit ? ` ${unit}` : ""}`;
}
