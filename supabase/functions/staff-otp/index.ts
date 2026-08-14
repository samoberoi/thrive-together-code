import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Staff OTP (admins + coaches).
// Staff membership and OTP verification are enforced entirely server-side.
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

    const phoneVariants = [phone, `91${phone}`, `+91${phone}`];
    const { data: coachRows } = await admin
      .from("coaches")
      .select("phone")
      .in("phone", phoneVariants)
      .limit(1);
    if ((coachRows ?? []).length > 0) staff = true;

    if (!staff) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, phone")
        .in("phone", phoneVariants)
        .limit(10);
      const ids = new Set((profiles ?? [])
        .map((p: any) => p.user_id)
        .filter(Boolean));

      // Only scan legacy auth identities when there is no matching profile.
      if (!ids.size) {
        for (let page = 1; page <= 10; page += 1) {
          const { data: authPage, error: authError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (authError) break;
          for (const user of authPage.users) {
            if (last10(String(user.email ?? "").split("@")[0]) === phone) ids.add(user.id);
          }
          if (authPage.users.length < 1000) break;
        }
      }

      if (ids.size) {
        const { data: roles } = await admin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", [...ids]);
        staff = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "coach");
      }
    }

    if (action === "check") return json({ ok: true, staff });
    // `send` is also the single staff-detection call used by the login screen.
    // A non-staff response falls through to the existing end-user widget flow.
    if (!staff && (action === "send" || action === "retry")) {
      return json({ ok: true, staff: false, reqId: null });
    }
    if (!staff) return json({ ok: false, error: "Not a staff number" }, 403);

    const authKey = Deno.env.get("MSG91_AUTH_KEY") ?? "";
    if (!authKey) return json({ ok: false, error: "SMS service is not configured" }, 500);

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
      // Use MSG91's account-default OTP template and SMS channel, exactly like
      // the working end-user route. Do not pass stale template or sender IDs.
      const { failed, data } = await call(`otp?${params.toString()}`, "POST");
      if (failed) return json({ ok: false, error: data?.message || "Could not send the code" }, 400);
      return json({ ok: true, staff: true, reqId: data?.request_id ?? null });
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
