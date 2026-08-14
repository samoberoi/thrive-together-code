import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Staff OTP (admins + coaches).
// Real MSG91 SMS, sent and verified entirely server-side on this project —
// no browser widget, no domain whitelisting, no fixed default code.
// End-user OTP is untouched and still uses the MSG91 widget flow.

const MSG91 = "https://control.msg91.com/api/v5";
const OTP_LENGTH = 4;
const OTP_EXPIRY_MIN = 10;

const last10 = (v: string) => v.replace(/\D/g, "").slice(-10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String((body as any)?.action ?? "check");
    const phone = last10(String((body as any)?.phone ?? ""));
    const dial = String((body as any)?.dial ?? "91").replace(/\D/g, "") || "91";
    const otp = String((body as any)?.otp ?? "").replace(/\D/g, "");

    if (phone.length !== 10) return json({ ok: false, error: "Invalid phone number" }, 400);

    // ---- Is this phone an admin or a coach? -------------------------------
    let staff = false;

    const { data: coachRows } = await admin.from("coaches").select("phone").limit(1000);
    if ((coachRows ?? []).some((c: any) => last10(String(c.phone ?? "")) === phone)) staff = true;

    if (!staff) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, phone")
        .limit(5000);
      const ids = (profiles ?? [])
        .filter((p: any) => last10(String(p.phone ?? "")) === phone)
        .map((p: any) => p.user_id);
      if (ids.length) {
        const { data: roles } = await admin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids);
        staff = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "coach");
      }
    }

    if (action === "check") return json({ ok: true, staff });
    if (!staff) return json({ ok: false, error: "Not a staff number" }, 403);

    // ---- MSG91 server-side OTP --------------------------------------------
    const authKey = Deno.env.get("MSG91_AUTH_KEY") ?? "";
    if (!authKey) return json({ ok: false, error: "SMS service is not configured" }, 500);

    const templateId = Deno.env.get("MSG91_TEMPLATE_ID") ?? "";
    const senderId = Deno.env.get("MSG91_SENDER_ID") ?? "";
    const mobile = `${dial}${phone}`;

    const call = async (path: string, method: "GET" | "POST" = "GET") => {
      const res = await fetch(`${MSG91}/${path}`, {
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

    if (action === "send" || action === "retry") {
      const params = new URLSearchParams({
        mobile,
        otp_length: String(OTP_LENGTH),
        otp_expiry: String(OTP_EXPIRY_MIN),
      });
      if (templateId) params.set("template_id", templateId);
      if (senderId) params.set("sender", senderId);
      const { failed, data } = await call(`otp?${params.toString()}`, "POST");
      if (failed) return json({ ok: false, error: data?.message || "Could not send the code" }, 400);
      return json({ ok: true, reqId: data?.request_id ?? null });
    }

    if (action === "verify") {
      if (otp.length !== OTP_LENGTH) return json({ ok: false, error: `Enter the ${OTP_LENGTH}-digit code` }, 400);
      const { failed, data } = await call(`otp/verify?mobile=${mobile}&otp=${otp}`);
      if (failed) return json({ ok: false, error: data?.message || "Wrong code. Please try again." }, 401);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    return json({ ok: false, error: (error as Error).message || "Server error" }, 500);
  }
});
