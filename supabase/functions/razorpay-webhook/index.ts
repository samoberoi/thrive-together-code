import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const WH_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    if (!WH_SECRET) throw new Error("Webhook secret not configured");

    const signature = req.headers.get("x-razorpay-signature") ?? "";
    const raw = await req.text();
    const expected = await hmacSha256Hex(WH_SECRET, raw);
    if (expected !== signature) {
      console.warn("Webhook signature mismatch");
      return new Response("invalid signature", { status: 400, headers: corsHeaders });
    }

    const event = JSON.parse(raw);
    const payment = event?.payload?.payment?.entity;
    const order = event?.payload?.order?.entity;
    const link = event?.payload?.payment_link?.entity;
    // Payment links are recorded under their link id, plan orders under the order id.
    const orderId = link?.id || payment?.order_id || order?.id;
    if (!orderId) return new Response("ok", { headers: corsHeaders });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const paidEvent = event?.event === "payment.captured"
      || event?.event === "order.paid"
      || event?.event === "payment_link.paid";
    const status = paidEvent ? "paid" : event?.event === "payment.failed" ? "failed" : event?.event ?? "unknown";

    const { data: rows } = await supabase.from("razorpay_payments").update({
      status,
      payment_id: payment?.id ?? undefined,
      raw_event: event,
    }).eq("order_id", orderId).select("plan_key, notes");

    // Add-on services (lab tests, yoga packages) are marked paid on their own rows.
    if (paidEvent) {
      for (const row of rows ?? []) {
        const notes = (row as any)?.notes || {};
        if (!notes.kind || !notes.ref_id) continue;
        if (notes.kind === "yoga") {
          await supabase.from("yoga_bookings")
            .update({ payment_status: "paid", payment_ref: payment?.id ?? orderId })
            .eq("id", notes.ref_id);
        } else if (notes.kind === "lab") {
          await supabase.from("thyrocare_orders")
            .update({ payment_status: "paid" })
            .eq("id", notes.ref_id);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
