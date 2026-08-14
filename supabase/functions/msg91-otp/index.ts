import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Server-side MSG91 widget OTP flow.
// Works even when the browser widget script is blocked (native webviews,
// ad-blockers, poor networks) — which is why some users never received an SMS.

const WIDGET_ID = "356b71685561353436363635";
const TOKEN_AUTH = "478181TOAfR90F2N691ae1eeP1";
const BASE = "https://control.msg91.com/api/v5/widget";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const post = async (path: string, payload: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetId: WIDGET_ID, tokenAuth: TOKEN_AUTH, ...payload }),
    });
    const data = await res.json().catch(() => ({} as any));
    const isError = !res.ok || String(data?.type ?? "").toLowerCase() === "error";
    return { isError, data, status: res.status };
  };

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? "");
    const identifier = String(body?.identifier ?? "").replace(/\D/g, "");
    const reqId = typeof body?.reqId === "string" ? body.reqId : "";
    const otp = String(body?.otp ?? "").replace(/\D/g, "");

    if (action === "send" || action === "retry") {
      if (identifier.length < 10) return json({ error: "Invalid phone number" }, 400);
      const { isError, data } = action === "send"
        ? await post("sendOtp", { identifier })
        : await post("retryOtp", { reqId: reqId || undefined, identifier, retryChannel: "11" });
      if (isError) return json({ error: data?.message || "Could not send the code" }, 400);
      return json({ ok: true, reqId: data?.message ? String(data.message) : reqId || null });
    }

    if (action === "verify") {
      if (!otp) return json({ error: "Enter the code" }, 400);
      if (!reqId) return json({ error: "Session expired. Request a new code." }, 400);
      const { isError, data } = await post("verifyOtp", { reqId, otp });
      if (isError) return json({ error: data?.message || "Wrong code" }, 401);

      // `message` is the access token when verification succeeds — validate it
      // against MSG91 so a spoofed client response can never mint a session.
      const accessToken = typeof data?.message === "string" ? data.message : "";
      const authKey = Deno.env.get("MSG91_AUTH_KEY");
      if (accessToken && authKey) {
        const res = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authkey: authKey, "access-token": accessToken }),
        });
        const v = await res.json().catch(() => ({} as any));
        if (!res.ok || String(v?.type ?? "").toLowerCase() === "error") {
          return json({ error: v?.message || "Verification failed" }, 401);
        }
      }
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: (error as Error).message || "Server error" }, 500);
  }
});
