import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Server-side MSG91 OTP (API v5). Runs entirely on the backend so it works
// identically on web, Android and iOS — no browser widget, no captcha, no
// domain whitelisting. 4-digit codes for every user, including admins.

const API = "https://control.msg91.com/api/v5";
const OTP_LENGTH = 4;
const OTP_EXPIRY_MIN = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authKey = Deno.env.get("MSG91_AUTH_KEY") ?? "";
  if (!authKey) return json({ error: "SMS service is not configured" }, 500);

  const call = async (path: string, method: "GET" | "POST" = "GET") => {
    const res = await fetch(`${API}/${path}`, {
      method,
      headers: { authkey: authKey, "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({} as any));
    const failed = !res.ok || String(data?.type ?? "").toLowerCase() === "error";
    return { failed, data };
  };

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? "");
    const mobile = String(body?.identifier ?? "").replace(/\D/g, "");
    const otp = String(body?.otp ?? "").replace(/\D/g, "");

    if (mobile.length < 10) return json({ error: "Invalid phone number" }, 400);


    if (action === "diag") {
      const probes: Record<string, unknown> = {};
      const raw = async (url: string, method: "GET" | "POST" = "GET") => {
        try {
          const res = await fetch(url, { method, headers: { authkey: authKey, "Content-Type": "application/json" } });
          const text = await res.text();
          return { status: res.status, body: text.slice(0, 800) };
        } catch (e) {
          return { error: String(e) };
        }
      };
      probes.templates = await raw(`${API}/otp/templates`);
      probes.balance = await raw("https://control.msg91.com/api/balance.php?type=4&authkey=" + authKey);
      probes.send = await raw(`${API}/otp?mobile=${mobile}&otp_length=${OTP_LENGTH}&otp_expiry=${OTP_EXPIRY_MIN}`, "POST");
      probes.hasTemplate = Boolean(Deno.env.get("MSG91_TEMPLATE_ID"));
      probes.hasSender = Boolean(Deno.env.get("MSG91_SENDER_ID"));
      return json({ ok: true, probes });
    }

    if (action === "send") {
      const { failed, data } = await call(
        `otp?mobile=${mobile}&otp_length=${OTP_LENGTH}&otp_expiry=${OTP_EXPIRY_MIN}`,
        "POST",
      );
      if (failed) return json({ error: data?.message || "Could not send the code" }, 400);
      return json({ ok: true, reqId: data?.request_id ?? null });
    }

    if (action === "retry") {
      const { failed, data } = await call(`otp/retry?mobile=${mobile}&retrytype=text`);
      if (failed) return json({ error: data?.message || "Could not resend the code" }, 400);
      return json({ ok: true });
    }

    if (action === "verify") {
      if (otp.length !== OTP_LENGTH) return json({ error: "Enter the 4-digit code" }, 400);
      const { failed, data } = await call(`otp/verify?mobile=${mobile}&otp=${otp}`);
      if (failed) return json({ error: data?.message || "Wrong code" }, 401);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: (error as Error).message || "Server error" }, 500);
  }
});
