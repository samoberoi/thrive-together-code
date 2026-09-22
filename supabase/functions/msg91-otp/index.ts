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

  if (!authKey) return json({ error: "SMS service is not configured" }, 500);

  const call = async (path: string, method: "GET" | "POST" = "GET", bodyData?: any) => {
    const url = new URL(`${API}/${path}`);
    
    // For GET requests, we might still want to support query params if needed,
    // but for POST we use the body.
    const res = await fetch(url.toString(), {
      method,
      headers: { 
        authkey: authKey, 
        "Content-Type": "application/json" 
      },
      body: bodyData ? JSON.stringify(bodyData) : undefined,
    });
    
    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 300) };
    }
    const failed = !res.ok || String(data?.type ?? "").toLowerCase() === "error";
    return { failed, data, status: res.status };
  };

  const sendOtp = async (mobile: string) => {
    // For MSG91 API v5 OTP, template_id is mandatory for actual delivery in most 
    // accounts (especially for DLT compliance in India). Sending without it 
    // often returns a 200 OK + request_id but fails to generate a log or SMS.
    const body: any = {
      mobile,
      otp_length: OTP_LENGTH,
      otp_expiry: OTP_EXPIRY_MIN,
    };
    
    if (templateId) {
      body.template_id = templateId;
    }

    return call("otp", "POST", body);
  };

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? "");
    const mobile = String(body?.identifier ?? "").replace(/\D/g, "");
    const otp = String(body?.otp ?? "").replace(/\D/g, "");

    if (mobile.length < 10) return json({ error: "Invalid phone number" }, 400);

    if (action === "send" || action === "retry") {
      const { failed, data } = await sendOtp(mobile);
      if (failed) return json({ error: data?.message || "Could not send the code" }, 400);
      return json({ ok: true, reqId: data?.request_id ?? null });
    }

    if (action === "verify") {
      if (otp.length !== OTP_LENGTH) return json({ error: "Enter the 4-digit code" }, 400);
      // Verification typically remains a GET request with query params in MSG91 v5
      const { failed, data } = await call(`otp/verify?mobile=${mobile}&otp=${otp}`, "GET");
      if (failed) return json({ error: data?.message || "Wrong code" }, 401);
      return json({ ok: true });
    }

    if (action === "health") {
      return json({
        ok: true,
        mode: templateId ? "template-id" : "default-template",
        otpLength: OTP_LENGTH,
        hasTemplateId: !!templateId,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: (error as Error).message || "Server error" }, 500);
  }
});
