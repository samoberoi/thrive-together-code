import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPPORT_INBOX = "hello@byebyediabetesandobesity.com";

// Simple per-user throttle so the inbox can't be flooded.
const lastSent = new Map<string, number>();
const THROTTLE_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const name = String(body?.name ?? "").slice(0, 120).trim();
  const email = String(body?.email ?? "").slice(0, 200).trim();
  const userId = String(body?.userId ?? "").slice(0, 64).trim();
  const subject = String(body?.subject ?? "").slice(0, 120).trim();
  const message = String(body?.message ?? "").slice(0, 2000).trim();

  if (!subject || !message) {
    return new Response(JSON.stringify({ error: "Subject and message are required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const throttleKey = userId || email || "anon";
  const now = Date.now();
  const prev = lastSent.get(throttleKey) ?? 0;
  if (now - prev < THROTTLE_MS) {
    return new Response(JSON.stringify({ error: "Please wait a moment before sending another query." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Email not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const from = Deno.env.get("RESEND_FROM") || "BBDO <noreply@hyperrevamp.com>";
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 16px">New support query</h2>
      <table style="border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:4px 12px 4px 0;color:#666">From</td><td><strong>${esc(name || "App user")}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td>${esc(email || "—")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">User ID</td><td>${esc(userId || "—")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Subject</td><td><strong>${esc(subject)}</strong></td></tr>
      </table>
      <div style="background:#f6f6f6;border-radius:12px;padding:16px;white-space:pre-wrap">${esc(message)}</div>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [SUPPORT_INBOX],
      ...(email ? { reply_to: email } : {}),
      subject: `[BBDO Support] ${subject}`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("resend_error", res.status, detail);
    return new Response(JSON.stringify({ error: "Could not send right now" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  lastSent.set(throttleKey, now);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
