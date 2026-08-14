import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEV_OTPS: Record<string, string> = {
  "7777777777": "111111",
  "8373914073": "111111",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const phone = String(body?.phone ?? "").replace(/\D/g, "");
    const otp = String(body?.otp ?? "");
    const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";

    if (phone.length < 10) return json({ error: "Invalid phone number" }, 400);

    // Dev/test numbers bypass MSG91 entirely.
    if (DEV_OTPS[phone] !== undefined) {
      if (DEV_OTPS[phone] !== otp) return json({ error: "Wrong code" }, 401);
      return json({ ok: true, dev: true });
    }

    if (!accessToken || accessToken.length < 10) {
      return json({ error: "Missing verification token" }, 400);
    }

    const authKey = Deno.env.get("MSG91_AUTH_KEY");
    if (!authKey) {
      // Widget already verified the OTP client-side; without the auth key we
      // cannot re-verify server-side, so surface a clear configuration error.
      return json({ error: "SMS verification is not fully configured" }, 500);
    }

    const res = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authkey: authKey, "access-token": accessToken }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || String(data?.type).toLowerCase() === "error") {
      return json({ error: data?.message || "Verification failed" }, 401);
    }

    return json({ ok: true });
  } catch (error) {
    return json({ error: (error as Error).message || "Server error" }, 500);
  }
});
