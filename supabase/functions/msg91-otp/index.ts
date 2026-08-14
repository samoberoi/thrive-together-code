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
  const templateId = Deno.env.get("MSG91_TEMPLATE_ID") ?? "";
  const senderId = Deno.env.get("MSG91_SENDER_ID") ?? "";
  if (!authKey) return json({ error: "SMS service is not configured" }, 500);

  const call = async (path: string, method: "GET" | "POST" = "GET") => {
    const res = await fetch(`${API}/${path}`, {
      method,
      headers: { authkey: authKey, "Content-Type": "application/json" },
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 300) };
    }
    const failed = !res.ok || String(data?.type ?? "").toLowerCase() === "error";
    return { failed, data };
  };

  // MSG91 accepts a send request even when the account has no SMS credits on the
  // route — the message then never reaches the handset. Check up front so the
  // user sees a real reason instead of an OTP that never arrives.
  const routeBalance = async (): Promise<number | null> => {
    try {
      const res = await fetch(
        `https://control.msg91.com/api/balance.php?type=4&authkey=${encodeURIComponent(authKey)}`,
      );
      const text = (await res.text()).trim();
      const value = Number(text);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  };

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? "");
    const mobile = String(body?.identifier ?? "").replace(/\D/g, "");
    const otp = String(body?.otp ?? "").replace(/\D/g, "");

    if (mobile.length < 10) return json({ error: "Invalid phone number" }, 400);

    if (action === "send") {
      const balance = await routeBalance();
      if (balance !== null && balance <= 0) {
        return json(
          { error: "SMS credits exhausted on the MSG91 account. Please top up to receive OTPs." },
          503,
        );
      }

      const params = new URLSearchParams({
        mobile,
        otp_length: String(OTP_LENGTH),
        otp_expiry: String(OTP_EXPIRY_MIN),
      });
      if (templateId) params.set("template_id", templateId);
      if (senderId) params.set("sender", senderId);

      const { failed, data } = await call(`otp?${params.toString()}`, "POST");
      if (failed) return json({ error: data?.message || "Could not send the code" }, 400);
      return json({ ok: true, reqId: data?.request_id ?? null });
    }

    if (action === "retry") {
      // MSG91 v5 retry is a POST endpoint; issuing it as GET fails.
      const { failed, data } = await call(`otp/retry?mobile=${mobile}&retrytype=text`, "POST");
      if (failed) return json({ error: data?.message || "Could not resend the code" }, 400);
      return json({ ok: true });
    }

    if (action === "verify") {
      if (otp.length !== OTP_LENGTH) return json({ error: "Enter the 4-digit code" }, 400);
      const { failed, data } = await call(`otp/verify?mobile=${mobile}&otp=${otp}`);
      if (failed) return json({ error: data?.message || "Wrong code" }, 401);
      return json({ ok: true });
    }

    if (action === "health") {
      const balance = await routeBalance();
      return json({ ok: true, smsBalance: balance, templateConfigured: Boolean(templateId) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: (error as Error).message || "Server error" }, 500);
  }
});
