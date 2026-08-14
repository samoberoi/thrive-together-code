import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Staff OTP bypass. Admins and coaches skip MSG91 entirely and sign in with a
// fixed default code held server-side (STAFF_DEFAULT_OTP). End-user OTP is
// untouched and still goes through the MSG91 widget.

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
    const otp = String((body as any)?.otp ?? "").replace(/\D/g, "");

    if (phone.length !== 10) return json({ ok: false, error: "Invalid phone number" }, 400);

    // Is this phone an admin or a coach?
    let staff = false;

    const { data: coachRow } = await admin
      .from("coaches")
      .select("id, phone")
      .limit(1000);
    if ((coachRow ?? []).some((c: any) => last10(String(c.phone ?? "")) === phone)) staff = true;

    if (!staff) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, phone")
        .limit(2000);
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

    if (action === "verify") {
      if (!staff) return json({ ok: false, error: "Not a staff number" }, 403);
      const expected = (Deno.env.get("STAFF_DEFAULT_OTP") ?? "").replace(/\D/g, "");
      if (!expected) return json({ ok: false, error: "Staff OTP is not configured" }, 500);
      if (otp !== expected) return json({ ok: false, error: "Wrong code. Please try again." }, 401);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    return json({ ok: false, error: (error as Error).message || "Server error" }, 500);
  }
});
