// Permanent, tap-time lab report link.
//
// The partner lab hands us short-lived signed S3 URLs that expire within hours.
// Anything that stored those links directly (including app versions already
// installed on phones) ends up showing an "ExpiredToken" XML page.
//
// This function is the stable link we store instead. On every open it asks the
// lab for a fresh file URL and 302-redirects to it, falling back to the last
// known vendor URL if the lab call fails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PARTNER_ID = Deno.env.get("THYROCARE_PARTNER_ID")!;
const DSA_CODE = Deno.env.get("THYROCARE_DSA_CODE")!;
const PASSWORD = Deno.env.get("THYROCARE_PASSWORD")!;
const configuredBaseUrl = Deno.env.get("THYROCARE_BASE_URL") || "";
const BASE_URL = (configuredBaseUrl.includes("thyrocare.com") && !configuredBaseUrl.includes("sandbox")
  ? configuredBaseUrl
  : "https://api.thyrocare.com").replace(/\/$/, "");

const sbAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Unguessable per-order token so a stable link is not a public directory. */
async function signOrder(orderId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("LAB_REPORT_LINK_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`lab-report:${orderId}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

async function getValidToken(): Promise<string> {
  const { data } = await sbAdmin
    .from("thyrocare_auth_cache")
    .select("bearer_token, expires_at")
    .eq("id", 1)
    .maybeSingle();
  if (data && new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.bearer_token;

  const res = await fetch(`${BASE_URL}/partners/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Partner-Id": PARTNER_ID,
      "Request-Id": "Pass",
      "Client-Type": "All",
      "Entity-Type": "DSA",
      "User-Agent": "BBDO-Lovable/1.0",
    },
    body: JSON.stringify({ username: DSA_CODE, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  const token = body?.data?.token || body?.token || body?.data?.accessToken || body?.accessToken;
  if (!token) throw new Error("lab auth failed");
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await sbAdmin.from("thyrocare_auth_cache").upsert({ id: 1, bearer_token: token, expires_at: expires });
  return token;
}

function pickUrl(data: any, rawText: string): string | null {
  if (typeof rawText === "string" && /^https?:\/\//i.test(rawText.trim())) return rawText.trim();
  const direct =
    data?.data?.url || data?.data?.reportUrl || data?.data?.pdfUrl || data?.data?.downloadUrl ||
    data?.url || data?.reportUrl || data?.pdfUrl || data?.downloadUrl;
  if (direct) return direct;
  const list: any[] =
    data?.data?.reports || data?.reports || data?.data?.patients?.[0]?.reports ||
    data?.data?.reportDetails || data?.reportDetails || [];
  for (const r of list) {
    const u = r?.url || r?.reportUrl || r?.pdfUrl || r?.downloadUrl;
    if (u) return u;
  }
  return null;
}

async function freshVendorUrl(orderId: string, leadId: string): Promise<string | null> {
  const token = await getValidToken();
  const headers = {
    "Content-Type": "application/json",
    "Partner-Id": PARTNER_ID,
    "Request-Id": crypto.randomUUID(),
    "API-Version": "1.0",
    "Client-Type": "DSA",
    "User-Agent": "BBDO-Lovable/1.0",
    Authorization: `Bearer ${token}`,
  };
  const candidates = [
    `${BASE_URL}/partners/v1/${encodeURIComponent(orderId)}/reports/${encodeURIComponent(leadId)}?type=pdf`,
    `${BASE_URL}/partners/v1/orders/reports?orderId=${encodeURIComponent(orderId)}${leadId ? `&leadId=${encodeURIComponent(leadId)}` : ""}&type=pdf`,
    `${BASE_URL}/partners/v1/orders/report?orderId=${encodeURIComponent(orderId)}${leadId ? `&leadId=${encodeURIComponent(leadId)}` : ""}&type=pdf`,
    `${BASE_URL}/partners/v1/orders/${encodeURIComponent(orderId)}/reports${leadId ? `/${encodeURIComponent(leadId)}` : ""}?type=pdf`,
    `${BASE_URL}/partners/v1/orders/${encodeURIComponent(orderId)}/reports?type=pdf${leadId ? `&leadId=${encodeURIComponent(leadId)}` : ""}`,
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { method: "GET", headers });
      const text = await r.text();
      if (!r.ok) continue;
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = {}; }
      const found = pickUrl(data, text);
      if (found) return found;
    } catch (_) { /* try the next shape */ }
  }
  return null;
}

function errorPage(message: string, status = 404) {
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:system-ui;padding:40px;text-align:center;color:#3C4043">
       <h2 style="color:#1A73E8">Report not available</h2>
       <p>${message}</p>
       <p style="font-size:13px;color:#80868B">Please try again in a little while, or contact your coach.</p>
     </div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("o") || "";
    const tok = url.searchParams.get("t") || "";
    if (!orderId) return errorPage("This report link is incomplete.", 400);
    if (tok !== (await signOrder(orderId))) return errorPage("This report link is not valid.", 403);

    const { data: order } = await sbAdmin
      .from("thyrocare_orders")
      .select("id, thyrocare_lead_id, raw_response")
      .eq("thyrocare_order_id", orderId)
      .maybeSingle();

    const raw: any = order?.raw_response || {};
    const rawData = raw?.data || raw;
    const leadId: string = order?.thyrocare_lead_id || rawData?.patients?.[0]?.id || rawData?.leadId || "";

    let target: string | null = null;
    try { target = await freshVendorUrl(orderId, leadId); } catch (e) {
      console.error("fresh report fetch failed", String((e as Error).message || e));
    }

    if (order?.id) {
      const { data: rows } = await sbAdmin
        .from("thyrocare_reports")
        .select("id, raw_data")
        .eq("order_id", order.id)
        .order("delivered_at", { ascending: false });
      if (target) {
        // Keep the newest known vendor link as an offline fallback.
        const row = (rows || [])[0];
        if (row) {
          await sbAdmin
            .from("thyrocare_reports")
            .update({ raw_data: { ...(row.raw_data || {}), vendor_url: target } })
            .eq("id", row.id);
        }
      } else {
        target = (rows || []).map((r: any) => r?.raw_data?.vendor_url).find(Boolean) || null;
      }
    }

    if (!target) return errorPage("We couldn't reach the lab for your report just now.");
    return Response.redirect(target, 302);
  } catch (e) {
    console.error("lab-report-open error", String((e as Error).message || e));
    return errorPage("Something went wrong opening this report.", 500);
  }
});
