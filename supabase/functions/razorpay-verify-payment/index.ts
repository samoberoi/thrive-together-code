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

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!KEY_SECRET) throw new Error("Razorpay secret not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) throw new Error("Payment backend is not configured");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const jwt = authHeader.slice(7);
    // Validate against the auth server (works for both legacy and asymmetric signing keys).
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (userErr || typeof userId !== "string") {
      console.error("auth failed", userErr?.message);
      return json({ error: "Unauthorized" }, 401);
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: "Missing fields" }, 400);
    }

    const expected = await hmacSha256Hex(KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    const verified = expected === razorpay_signature;

    const { data: existing } = await admin
      .from("razorpay_payments")
      .select("id, user_id, plan_key, amount_paise, status, notes")
      .eq("order_id", razorpay_order_id)
      .maybeSingle();

    await admin.from("razorpay_payments").update({
      payment_id: razorpay_payment_id,
      signature: razorpay_signature,
      signature_verified: verified,
      status: verified ? "paid" : "signature_failed",
    }).eq("order_id", razorpay_order_id);

    if (!verified) return json({ verified: false }, 400);

    if (!existing || existing.user_id !== userId) {
      return json({ error: "Order does not belong to this user" }, 403);
    }

    // Idempotency: never activate the same order twice.
    if (existing.status === "paid") return json({ verified: true, already_processed: true });

    const notes = (existing.notes ?? {}) as Record<string, any>;
    const months = Number(notes.duration_months ?? 1) || 1;
    const cycle = String(notes.billing_cycle ?? "monthly");
    const mode = String(notes.mode ?? "new");
    const paidAmount = (existing.amount_paise ?? 0) / 100;
    const planName = `${notes.name ?? existing.plan_key} — ${CYCLE_LABEL[cycle] ?? CYCLE_LABEL.monthly}`;

    if (mode === "upgrade" || mode === "downgrade") {
      const { error } = await asUser.rpc("change_subscription_plan", {
        _plan_id: existing.plan_key,
        _plan_name: planName,
        _plan_price: paidAmount,
        _duration_months: months,
        _mode: mode,
      });
      if (error) console.error("change_subscription_plan failed", error);
    } else {
      const { error } = await asUser.rpc("complete_demo_payment", {
        _plan_id: existing.plan_key,
        _plan_name: planName,
        _plan_price: paidAmount,
        _duration_months: months,
      });
      if (error) {
        console.error("complete_demo_payment failed", error);
        // Fallback so a paid user is never left without access.
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + months);
        await admin.from("subscriptions").insert({
          user_id: existing.user_id,
          plan_id: existing.plan_key,
          plan_name: planName,
          plan_price: paidAmount,
          duration_months: months,
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          status: "active",
        });
      }
    }

    // Record coupon redemption only after money has actually moved.
    if (notes.coupon_code) {
      const { error } = await asUser.rpc("redeem_coupon", {
        _code: notes.coupon_code,
        _amount: paidAmount + Number(notes.coupon_discount ?? 0),
        _plan_key: existing.plan_key,
        _billing_cycle: cycle,
      });
      if (error) console.warn("redeem_coupon failed", error);
    }

    return json({ verified: true, duration_months: months, mode });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
