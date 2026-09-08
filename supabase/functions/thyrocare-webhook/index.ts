// Public webhook receiver for Thyrocare order/report events.
// Configure this URL in Thyrocare partner portal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sbAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function syncReportToProfile(orderId: string) {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/lab-report-parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bbdo-internal": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify({ orderId }),
    });
  } catch (e) {
    console.error("lab result auto-sync failed", String((e as Error).message || e));
  }
}

/** Our permanent report link — the lab's own URLs expire within hours. */
async function permanentReportLink(thyrocareOrderId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`lab-report:${thyrocareOrderId}`));
  const tok = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
  return `${Deno.env.get("SUPABASE_URL")!}/functions/v1/lab-report-open?o=${encodeURIComponent(thyrocareOrderId)}&t=${tok}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventType =
    payload?.eventType || payload?.event || payload?.type || "unknown";
  const thyOrderId =
    payload?.orderId || payload?.OrderNo || payload?.data?.orderId || null;

  // Always log
  const { data: evt } = await sbAdmin
    .from("thyrocare_webhook_events")
    .insert({
      event_type: eventType,
      thyrocare_order_id: thyOrderId,
      payload,
    })
    .select()
    .single();

  let processError: string | null = null;
  try {
    if (thyOrderId) {
      const { data: order } = await sbAdmin
        .from("thyrocare_orders")
        .select("id, user_id")
        .eq("thyrocare_order_id", thyOrderId)
        .maybeSingle();

      if (order) {
        // Status updates
        const newStatus =
          payload?.status || payload?.data?.status || payload?.orderStatus;
        if (newStatus) {
          await sbAdmin
            .from("thyrocare_orders")
            .update({
              status: String(newStatus).toLowerCase(),
              status_detail: payload?.statusDetail || payload?.remarks || null,
            })
            .eq("id", order.id);
        }
        // Report delivered
        const reports: any[] =
          payload?.reports || payload?.data?.reports ||
          (payload?.reportUrl ? [{ url: payload.reportUrl }] : []);
        let hasReportUrl = false;
        for (const r of reports) {
          const reportUrl = r.url || r.reportUrl || null;
          if (reportUrl) hasReportUrl = true;
          await sbAdmin.from("thyrocare_reports").insert({
            order_id: order.id,
            user_id: order.user_id,
            report_url: reportUrl,
            report_type: r.type || r.reportType || null,
            parameters: r.parameters || null,
            raw_data: r,
          });
        }
        if (hasReportUrl) await syncReportToProfile(order.id);
        // Notify patient
        await sbAdmin.from("notifications").insert({
          user_id: order.user_id,
          title: "Lab test update",
          body: `Your lab test status: ${newStatus || eventType}`,
          type: "lab_test",
          icon: "🧪",
          action_url: "/dashboard?tab=profile",
        });
      }
    }
  } catch (e) {
    processError = String((e as Error).message || e);
  }

  if (evt) {
    await sbAdmin
      .from("thyrocare_webhook_events")
      .update({ processed: !processError, processing_error: processError })
      .eq("id", evt.id);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
