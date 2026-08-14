import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
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
    const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!KEY_ID || !KEY_SECRET) throw new Error("Razorpay keys not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) throw new Error("Payment backend is not configured");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    // User-scoped client so auth.uid()-based RPCs (proration, coupon rules) work.
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const jwt = authHeader.slice(7);
    const { data: claimsData, error: claimsError } = await asUser.auth.getClaims(jwt);
    const userId = claimsData?.claims?.sub;
    if (claimsError || typeof userId !== "string") return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const planKey: string = body.plan_key || "onboarding_test";
    const billingCycle: string = CYCLE_MONTHS[body.billing_cycle] ? body.billing_cycle : "monthly";
    const mode: string = ["new", "upgrade", "downgrade", "renewal"].includes(body.mode) ? body.mode : "new";
    const couponCode: string | null = typeof body.coupon_code === "string" && body.coupon_code.trim()
      ? body.coupon_code.trim()
      : null;

    const { data: pkg, error: pkgErr } = await admin
      .from("packages")
      .select("plan_key, name, base_monthly_price, assigns_coach")
      .eq("plan_key", planKey)
      .eq("enabled", true)
      .maybeSingle();
    if (pkgErr || !pkg) throw new Error("Package not found");

    // ---- Authoritative amount, computed server-side ----
    const months = CYCLE_MONTHS[billingCycle] ?? 1;
    const { data: pricing } = await admin
      .from("package_pricing")
      .select("discount_percent, enabled, billing_cycle, package_id, packages!inner(plan_key)")
      .eq("packages.plan_key", planKey)
      .eq("billing_cycle", billingCycle)
      .maybeSingle();

    const discountPercent = Number((pricing as any)?.discount_percent ?? 0);
    const monthlyPrice = Math.round(Number(pkg.base_monthly_price) * (1 - discountPercent / 100));
    let amount = monthlyPrice * months;

    // Proration credit for upgrades / scheduling for downgrades.
    let credit = 0;
    if (mode === "upgrade" || mode === "downgrade") {
      const { data: preview } = await asUser.rpc("preview_plan_change", {
        _plan_price: amount,
        _duration_months: months,
        _mode: mode,
      });
      if (preview && typeof (preview as any).amount_due === "number") {
        credit = Number((preview as any).credit ?? 0);
        amount = Number((preview as any).amount_due);
      }
    }

    // Coupon discount, re-validated on the server.
    let couponDiscount = 0;
    let validatedCoupon: string | null = null;
    if (couponCode) {
      const { data: cv } = await asUser.rpc("validate_coupon", {
        _code: couponCode,
        _amount: amount,
        _plan_key: planKey,
        _billing_cycle: billingCycle,
      });
      if (cv && (cv as any).valid) {
        couponDiscount = Number((cv as any).discount_amount ?? 0);
        validatedCoupon = String((cv as any).code ?? couponCode);
      }
    }

    amount = Math.max(0, amount - couponDiscount);

    const amountPaise = Math.max(100, Math.round(amount * 100));
    const receipt = `bbdo_${userId.slice(0, 8)}_${Date.now()}`;

    const auth = btoa(`${KEY_ID}:${KEY_SECRET}`);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: { user_id: userId, plan_key: planKey, cycle: billingCycle, mode, source: "bbdo" },
      }),
    });
    const order = await rzpRes.json();
    if (!rzpRes.ok) {
      console.error("Razorpay order create failed", order);
      return json({ error: order?.error?.description || "Razorpay error" }, 400);
    }

    await admin.from("razorpay_payments").insert({
      user_id: userId,
      plan_key: planKey,
      order_id: order.id,
      amount_paise: amountPaise,
      currency: "INR",
      status: "created",
      notes: {
        receipt,
        name: pkg.name,
        billing_cycle: billingCycle,
        duration_months: months,
        mode,
        credit,
        coupon_code: validatedCoupon,
        coupon_discount: couponDiscount,
        assigns_coach: pkg.assigns_coach !== false,
      },
    });

    return json({
      order_id: order.id,
      key_id: KEY_ID,
      amount: amountPaise,
      currency: "INR",
      plan_name: pkg.name,
      duration_months: months,
      credit,
      coupon_discount: couponDiscount,
    });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
