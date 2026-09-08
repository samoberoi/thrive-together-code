import { supabase } from "@/integrations/supabase/client";

/**
 * Lab report links from the partner lab are short-lived signed S3 URLs — the
 * stored link expires within hours and then shows a raw "ExpiredToken" page.
 * Always ask the backend for a fresh link at the moment of the tap, and only
 * fall back to the stored one if the refresh fails.
 */
export async function openLabReport(opts: {
  thyrocareOrderId?: string | null;
  thyrocareLeadId?: string | null;
  fallbackUrl?: string | null;
}): Promise<boolean> {
  const { thyrocareOrderId, thyrocareLeadId, fallbackUrl } = opts;

  // Open the tab synchronously so mobile browsers don't block it.
  const win = window.open("", "_blank", "noopener,noreferrer");

  let url: string | null = null;
  if (thyrocareOrderId) {
    try {
      const { data } = await supabase.functions.invoke("thyrocare-api", {
        body: {
          action: "fetch_report",
          thyrocare_order_id: thyrocareOrderId,
          thyrocare_lead_id: thyrocareLeadId || undefined,
        },
      });
      const reports: any[] = (data as any)?.reports || [];
      url =
        reports.map((r) => r?.url || r?.reportUrl || r?.pdfUrl || r?.downloadUrl).find(Boolean) ||
        null;
      if (!url) {
        // Backend kept an existing row — read the freshly-stored link.
        const { data: rows } = await (supabase as any)
          .from("thyrocare_orders")
          .select("id")
          .eq("thyrocare_order_id", thyrocareOrderId)
          .maybeSingle();
        if (rows?.id) {
          const { data: reps } = await (supabase as any)
            .from("thyrocare_reports")
            .select("report_url, delivered_at")
            .eq("order_id", rows.id)
            .order("delivered_at", { ascending: false });
          url = (reps || []).map((r: any) => r.report_url).find(Boolean) || null;
        }
      }
    } catch {
      url = null;
    }
  }

  url = url || fallbackUrl || null;
  if (!url) {
    win?.close();
    return false;
  }
  if (win) win.location.href = url;
  else window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
