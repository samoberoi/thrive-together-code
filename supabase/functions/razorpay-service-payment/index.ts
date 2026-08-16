// Razorpay collection for add-on services (Thyrocare lab tests, yoga packages).
//
// Two entry paths intentionally coexist:
//  1. `link`   — server-driven. Called by database triggers whenever a booking
//                row is created (including by app builds that have no checkout
//                screen). Creates a Razorpay Payment Link and notifies the user,
//                so money can be collected without shipping a new app version.
//  2. `order`  — client-driven. Newer app builds create an order and open
//                Razorpay Checkout in-app, then call `verify`.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const APP_ORIGIN = "https://bbdo.hyperrevamp.com";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function rzpAuth() {
  return `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}`;
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Kind = "lab" | "yoga";

interface Billable {
  kind: Kind;
  refId: string;
  userId: string;
  amountInr: number;
  description: string;
  paid: boolean;
}

/** Resolve what has to be paid straight from the booking row — never from the client. */
async function loadBillable(kind: Kind, refId: string): Promise<Billable | null> {
  if (kind === "yoga") {
    const { data } = await admin
      .from("yoga_bookings")
      .select("id, user_id, price_inr, package_type, payment_status")
      .eq("id", refId)
      .maybeSingle();
    if (!data) return null;
    return {
      kind,
      refId: data.id,
      userId: data.user_id,
      amountInr: Number(data.price_inr) || 0,
      description: `Yoga ${data.package_type === "private" ? "1:1" : "group"} package`,
      paid: data.payment_status === "paid",
    };
  }

  const { data } = await admin
    .from("thyrocare_orders")
    .select("id, user_id, amount, product_codes, payment_status")
    .eq("id", refId)
    .maybeSingle();
  if (!data) return null;

  let amount = Number(data.amount) || 0;
  if (!amount) {
    const codes: string[] = Array.isArray(data.product_codes) ? data.product_codes : [];
    if (codes.length) {
      const { data: tests } = await admin
        .from("thyrocare_tests")
        .select("product_code, rate, offer_rate")
        .in("product_code", codes);
      amount = (tests || []).reduce((s: number, t: any) => s + Number(t.offer_rate || t.rate || 0), 0);
      const { data: markup } = await admin.rpc("get_lab_test_markup_pct");
      const pct = Number(markup) || 0;
      if (pct > 0) amount = Math.round(amount * (1 + pct / 100));
    }
  }
  return {
    kind,
    refId: data.id,
    userId: data.user_id,
    amountInr: Math.round(amount),
    description: "Lab test — home sample collection",
    paid: data.payment_status === "paid",
  };
}

async function contactFor(userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("name, phone")
    .eq("user_id", userId)
    .maybeSingle();
  const phone = String((data as any)?.phone || "").replace(/\D/g, "").slice(-10);
  return { name: (data as any)?.name || "BBDO member", phone };
}

async function existingPayment(kind: Kind, refId: string) {
  const { data } = await admin
    .from("razorpay_payments")
    .select("id, order_id, status, notes")
    .eq("plan_key", `svc_${kind}`)
    .contains("notes", { ref_id: refId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as any;
}

/** Create (or reuse) a Razorpay Payment Link and notify the member. */
async function createLink(kind: Kind, refId: string) {
  const billable = await loadBillable(kind, refId);
  if (!billable) return json({ error: "Booking not found" }, 404);
  if (billable.paid) return json({ ok: true, already_paid: true });
  if (billable.amountInr <= 0) return json({ ok: false, error: "No price configured for this booking" }, 200);

  const prior = await existingPayment(kind, refId);
  if (prior?.notes?.short_url && prior.status !== "paid") {
    return json({ ok: true, short_url: prior.notes.short_url, reused: true });
  }

  const { name, phone } = await contactFor(billable.userId);
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: rzpAuth() },
    body: JSON.stringify({
      amount: Math.max(100, billable.amountInr * 100),
      currency: "INR",
      description: billable.description,
      customer: { name, contact: phone ? `+91${phone}` : undefined },
      notify: { sms: !!phone, email: false },
      reminder_enable: true,
      callback_url: `${APP_ORIGIN}/`,
      callback_method: "get",
      notes: { kind, ref_id: refId, user_id: billable.userId, source: "bbdo" },
    }),
  });
  const link = await res.json();
  if (!res.ok) {
    console.error("payment link failed", link);
    return json({ ok: false, error: link?.error?.description || "Razorpay error" }, 200);
  }

  await admin.from("razorpay_payments").insert({
    user_id: billable.userId,
    plan_key: `svc_${kind}`,
    order_id: link.id,
    amount_paise: link.amount,
    currency: "INR",
    status: "created",
    notes: { kind, ref_id: refId, short_url: link.short_url, link_id: link.id, description: billable.description },
  });

  try {
    await admin.rpc("create_notification", {
      _user_id: billable.userId,
      _title: kind === "yoga" ? "Complete your yoga package payment" : "Complete your lab test payment",
      _body: `₹${billable.amountInr} is pending for ${billable.description}. Tap to pay securely: ${link.short_url}`,
      _type: "payment",
      _icon: "💳",
      _action_url: link.short_url,
    });
  } catch (e) {
    console.error("notify failed", e);
  }

  return json({ ok: true, short_url: link.short_url, amount_inr: billable.amountInr });
}

/** Create a Razorpay order for in-app checkout (newer app builds). */
async function createOrder(kind: Kind, refId: string, userId: string) {
  const billable = await loadBillable(kind, refId);
  if (!billable) return json({ error: "Booking not found" }, 404);
  if (billable.userId !== userId) return json({ error: "Forbidden" }, 403);
  if (billable.paid) return json({ ok: true, already_paid: true });
  if (billable.amountInr <= 0) return json({ error: "No price configured for this booking" }, 400);

  const amountPaise = Math.max(100, billable.amountInr * 100);
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: rzpAuth() },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: `svc_${kind}_${refId.slice(0, 8)}_${Date.now()}`.slice(0, 40),
      notes: { kind, ref_id: refId, user_id: userId, source: "bbdo" },
    }),
  });
  const order = await res.json();
  if (!res.ok) return json({ error: order?.error?.description || "Razorpay error" }, 400);

  await admin.from("razorpay_payments").insert({
    user_id: userId,
    plan_key: `svc_${kind}`,
    order_id: order.id,
    amount_paise: amountPaise,
    currency: "INR",
    status: "created",
    notes: { kind, ref_id: refId, description: billable.description },
  });

  return json({
    ok: true,
    order_id: order.id,
    key_id: KEY_ID,
    amount: amountPaise,
    currency: "INR",
    description: billable.description,
    amount_inr: billable.amountInr,
  });
}

async function settle(kind: Kind, refId: string, paymentId: string) {
  if (kind === "yoga") {
    await admin
      .from("yoga_bookings")
      .update({ payment_status: "paid", payment_ref: paymentId })
      .eq("id", refId);
  } else {
    await admin
      .from("thyrocare_orders")
      .update({ payment_status: "paid" })
      .eq("id", refId);
  }
}

async function verify(body: any, userId: string | null) {
  const orderId = String(body.razorpay_order_id || "");
  const paymentId = String(body.razorpay_payment_id || "");
  const signature = String(body.razorpay_signature || "");
  if (!orderId || !paymentId || !signature) return json({ error: "Incomplete payment response" }, 400);

  const expected = await hmacSha256Hex(KEY_SECRET, `${orderId}|${paymentId}`);
  if (expected !== signature) return json({ verified: false, error: "Signature mismatch" }, 400);

  const { data: row } = await admin
    .from("razorpay_payments")
    .select("id, user_id, notes")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!row) return json({ verified: false, error: "Unknown order" }, 404);
  if (userId && row.user_id !== userId) return json({ verified: false, error: "Forbidden" }, 403);

  await admin
    .from("razorpay_payments")
    .update({ status: "paid", payment_id: paymentId, signature, signature_verified: true })
    .eq("id", row.id);

  const notes = (row.notes || {}) as any;
  if (notes.kind && notes.ref_id) await settle(notes.kind, notes.ref_id, paymentId);

  return json({ verified: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    if (!KEY_ID || !KEY_SECRET) throw new Error("Razorpay keys not configured");
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const kind: Kind = body.kind === "yoga" ? "yoga" : "lab";
    const refId = typeof body.ref_id === "string" ? body.ref_id : "";

    // `link` is called by database triggers and is safe to expose: it only ever
    // creates a payment link for an existing unpaid booking, and is idempotent.
    if (action === "link") {
      if (!refId) return json({ error: "ref_id required" }, 400);
      return await createLink(kind, refId);
    }

    // Authenticated actions.
    const authHeader = req.headers.get("Authorization") ?? "";
    let userId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const asUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data } = await asUser.auth.getUser();
      userId = data?.user?.id ?? null;
    }
    if (!userId) return json({ error: "Unauthorized" }, 401);

    if (action === "order") {
      if (!refId) return json({ error: "ref_id required" }, 400);
      return await createOrder(kind, refId, userId);
    }
    if (action === "verify") return await verify(body, userId);

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
