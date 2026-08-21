import { supabase } from "@/integrations/supabase/client";
import type { ResultInput } from "@/lib/labResultsService";

export const EXTERNAL_LAB_BUCKET = "lab-reports";

export type ExternalLabReport = {
  id: string;
  user_id: string;
  recommendation_id: string | null;
  uploaded_by: string | null;
  product_codes: string[];
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  lab_name: string | null;
  collected_on: string | null;
  notes: string | null;
  status: string;
  reviewed_at: string | null;
  created_at: string;
};

export async function parseExternalReport(externalReportId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke("external-lab-report-parse", {
    body: { externalReportId },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "The report could not be read");
  return Number(data.count || 0);
}

/** Mark a coach recommendation as "client will get this done outside". */
export async function markExternalIntent(recommendationId: string, note?: string | null) {
  const { error } = await (supabase as any)
    .from("thyrocare_recommendations")
    .update({
      external_intent: true,
      external_requested_at: new Date().toISOString(),
      external_note: note?.trim() || null,
    })
    .eq("id", recommendationId);
  if (error) throw error;
}

/** Undo the "getting it done outside" intent. */
export async function clearExternalIntent(recommendationId: string) {
  const { error } = await (supabase as any)
    .from("thyrocare_recommendations")
    .update({ external_intent: false, external_requested_at: null })
    .eq("id", recommendationId);
  if (error) throw error;
}

export async function uploadExternalReport(opts: {
  userId: string;
  file: File;
  recommendationId?: string | null;
  productCodes?: string[];
  labName?: string | null;
  collectedOn?: string | null;
  notes?: string | null;
  uploadedBy?: string | null;
}): Promise<ExternalLabReport> {
  const { userId, file } = opts;
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(EXTERNAL_LAB_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await (supabase as any)
    .from("external_lab_reports")
    .insert({
      user_id: userId,
      recommendation_id: opts.recommendationId ?? null,
      uploaded_by: opts.uploadedBy ?? userId,
      product_codes: opts.productCodes ?? [],
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      lab_name: opts.labName?.trim() || null,
      collected_on: opts.collectedOn || null,
      notes: opts.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  const report = data as ExternalLabReport;
  await parseExternalReport(report.id);
  return { ...report, status: "reviewed", reviewed_at: new Date().toISOString() };
}

export async function fetchExternalReportsForUser(userId: string): Promise<ExternalLabReport[]> {
  const { data, error } = await (supabase as any)
    .from("external_lab_reports")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data || []) as ExternalLabReport[];
}

export async function fetchExternalReportsForUsers(userIds: string[]): Promise<ExternalLabReport[]> {
  if (!userIds.length) return [];
  const { data, error } = await (supabase as any)
    .from("external_lab_reports")
    .select("*")
    .in("user_id", userIds)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data || []) as ExternalLabReport[];
}

/** Short-lived signed URL for a private report file. */
export async function externalReportUrl(filePath: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(EXTERNAL_LAB_BUCKET)
    .createSignedUrl(filePath, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function deleteExternalReport(report: ExternalLabReport) {
  await supabase.storage.from(EXTERNAL_LAB_BUCKET).remove([report.file_path]).catch(() => null);
  const { error } = await (supabase as any).from("external_lab_reports").delete().eq("id", report.id);
  if (error) throw error;
}

/**
 * Save (replace) marker values captured from an uploaded outside report.
 * Values land in lab_results exactly like partner-lab values, so all
 * existing charts, deltas and the body investigation map work unchanged.
 */
export async function saveResultsForExternalReport(opts: {
  userId: string;
  externalReportId: string;
  observedAt: string;
  rows: ResultInput[];
}): Promise<void> {
  const { userId, externalReportId, observedAt, rows } = opts;

  await (supabase as any)
    .from("lab_results")
    .delete()
    .eq("user_id", userId)
    .eq("external_report_id", externalReportId);

  const payload = rows
    .filter((r) => r.value_numeric != null || (r.value_text && r.value_text.trim() !== ""))
    .map((r) => ({
      user_id: userId,
      order_id: null,
      report_id: null,
      external_report_id: externalReportId,
      parameter_code: r.parameter_code,
      parameter_name: r.parameter_name,
      value_numeric: r.value_numeric,
      value_text: r.value_text,
      unit: r.unit,
      ref_low: r.ref_low,
      ref_high: r.ref_high,
      observed_at: observedAt,
      source: "external_upload",
    }));

  if (payload.length) {
    const { error } = await (supabase as any).from("lab_results").insert(payload);
    if (error) throw error;
  }

  await (supabase as any)
    .from("external_lab_reports")
    .update({ status: "reviewed", reviewed_at: new Date().toISOString() })
    .eq("id", externalReportId);
}
