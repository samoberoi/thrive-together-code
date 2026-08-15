import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CYCLE_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "6 Months",
  yearly: "Yearly",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorpaySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!url || !anonKey || !serviceKey || !razorpayKeyId || !razorpaySecret) {
      throw new Error("Payment backend is not configured");
    }

    const admin = createClient(url, serviceKey);
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await asUser.auth.getUser();
    const userId = userData.user?.id;
    if (userError || !userId) return json({ error: "Unauthorized" }, 401);

    const { data: payment, error: paymentError } = await admin
      .from("razorpay_payments")
      .select("id, order_id, payment_id, plan_key, amount_paise, status, notes, created_at")
      .eq("user_id", userId)
      .eq("status", "paid")
      .not("payment_id", "is", null)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return json({ recovered: false });

    const notes = (payment.notes ?? {}) as Record<string, unknown>;
    if (notes.subscription_activated === true) return json({ recovered: true, already_processed: true });

    // A database status is not enough: confirm the payment directly with
    // Razorpay before granting access to an interrupted checkout.
    const razorpayResponse = await fetch(`https://api.razorpay.com/v1/payments/${payment.payment_id}`, {
      headers: { Authorization: `Basic ${btoa(`${razorpayKeyId}:${razorpaySecret}`)}` },
    });
    const razorpayPayment = await razorpayResponse.json();
    if (!razorpayResponse.ok || razorpayPayment.status !== "captured" || razorpayPayment.order_id !== payment.order_id) {
      return json({ recovered: false });
    }

    const months = Number(notes.duration_months ?? 1) || 1;
    const cycle = String(notes.billing_cycle ?? "monthly");
    const mode = String(notes.mode ?? "new");
    const planName = `${String(notes.name ?? payment.plan_key)} — ${CYCLE_LABEL[cycle] ?? CYCLE_LABEL.monthly}`;
    const paidAmount = Number(payment.amount_paise ?? 0) / 100;

    if (mode === "upgrade" || mode === "downgrade") {
      const { error } = await asUser.rpc("change_subscription_plan", {
        _plan_id: payment.plan_key,
        _plan_name: planName,
        _plan_price: paidAmount,
        _duration_months: months,
        _mode: mode,
      });
      if (error) throw error;
    } else {
      const { error } = await asUser.rpc("complete_demo_payment", {
        _plan_id: payment.plan_key,
        _plan_name: planName,
        _plan_price: paidAmount,
        _duration_months: months,
      });
      if (error) throw error;
    }

    const { error: updateError } = await admin.from("razorpay_payments").update({
      signature_verified: true,
      notes: { ...notes, subscription_activated: true, recovered_at: new Date().toISOString() },
    }).eq("id", payment.id);
    if (updateError) throw updateError;

    return json({ recovered: true, subscription_activated: true });
  } catch (error) {
    console.error("payment recovery failed", error);
    return json({ error: "Could not recover the captured payment" }, 500);
  }
});