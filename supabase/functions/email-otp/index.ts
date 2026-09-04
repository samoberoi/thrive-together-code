import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const SendSchema = z.object({
  action: z.literal("send"),
  email: z.string().email().max(160),
});

const VerifySchema = z.object({
  action: z.literal("verify"),
  email: z.string().email().max(160),
  code: z.string().regex(/^\d{4}$/),
  region_code: z.string().max(8).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
});

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
/** Deterministic password, mirrored by the client sign-in call. */
const passwordFor = (email: string) => `bbd_email_${email}_secure`;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function findUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data?.users?.find((u: any) => String(u.email).toLowerCase() === email);
    if (user) return user;
    if (!data?.users || data.users.length < 1000) break;
  }
  return null;
}

function otpEmailHtml(code: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:18px;padding:32px;box-shadow:0 8px 30px rgba(15,32,66,0.08);">
        <tr><td style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#6b7280;font-weight:700;">Bye Bye Diabetes &amp; Obesity</td></tr>
        <tr><td style="padding-top:12px;font-size:24px;font-weight:800;color:#0f172a;">Your verification code</td></tr>
        <tr><td style="padding-top:8px;font-size:14px;color:#4b5563;line-height:1.6;">Use the code below to sign in. It expires in ${OTP_TTL_MINUTES} minutes.</td></tr>
        <tr><td align="center" style="padding:26px 0;">
          <div style="display:inline-block;font-size:36px;letter-spacing:14px;font-weight:800;color:#1d4ed8;background:#eff6ff;border-radius:14px;padding:16px 24px;">${code}</div>
        </td></tr>
        <tr><td style="font-size:12px;color:#9ca3af;line-height:1.6;">If you didn't request this code, you can safely ignore this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (body?.action === "send") {
      const parsed = SendSchema.safeParse(body);
      if (!parsed.success) return json({ error: "A valid email address is required" }, 400);
      const email = normalizeEmail(parsed.data.email);

      // Simple throttle: one code per 30 seconds per address.
      const { data: recent } = await admin
        .from("email_otp_codes")
        .select("created_at")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1);
      const last = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0;
      if (last && Date.now() - last < 30_000) {
        return json({ error: "Please wait a few seconds before requesting another code." }, 429);
      }

      const code = String(Math.floor(1000 + Math.random() * 9000));
      const codeHash = await sha256(`${email}:${code}`);
      await admin.from("email_otp_codes").update({ consumed: true }).eq("email", email).eq("consumed", false);
      const { error: insertError } = await admin.from("email_otp_codes").insert({
        email,
        code_hash: codeHash,
        expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
      });
      if (insertError) throw insertError;

      const apiKey = Deno.env.get("RESEND_API_KEY");
      if (!apiKey) return json({ error: "Email sending is not configured yet." }, 500);
      const from = Deno.env.get("RESEND_FROM") || "BBDO <noreply@byebyediabetesandobesity.com>";

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [email],
          subject: `${code} is your BBDO verification code`,
          html: otpEmailHtml(code),
          text: `Your BBDO verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        console.error("resend_error", res.status, detail);
        return json({ error: "We couldn't send the email. Please check the address and try again." }, 502);
      }
      return json({ ok: true });
    }

    const parsed = VerifySchema.safeParse(body);
    if (!parsed.success) return json({ error: "Enter the 4-digit code sent to your email" }, 400);
    const email = normalizeEmail(parsed.data.email);
    const { code, region_code, country } = parsed.data;

    const { data: rows } = await admin
      .from("email_otp_codes")
      .select("*")
      .eq("email", email)
      .eq("consumed", false)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = rows?.[0];
    if (!row) return json({ error: "This code has expired. Please request a new one." }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from("email_otp_codes").update({ consumed: true }).eq("id", row.id);
      return json({ error: "This code has expired. Please request a new one." }, 400);
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await admin.from("email_otp_codes").update({ consumed: true }).eq("id", row.id);
      return json({ error: "Too many attempts. Please request a new code." }, 429);
    }
    const codeHash = await sha256(`${email}:${code}`);
    if (codeHash !== row.code_hash) {
      await admin.from("email_otp_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return json({ error: "Wrong code. Please try again." }, 400);
    }
    await admin.from("email_otp_codes").update({ consumed: true }).eq("id", row.id);

    const password = passwordFor(email);
    let user: any = null;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { email },
    });
    if (!createError) {
      user = created.user;
    } else if (String(createError?.message || "").toLowerCase().includes("already")) {
      user = await findUserByEmail(admin, email);
      if (!user) throw createError;
      const { data, error } = await admin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
      });
      if (error) throw error;
      user = data.user;
    } else {
      throw createError;
    }

    await admin.from("profiles").upsert(
      {
        user_id: user.id,
        email,
        region_code: region_code ?? null,
        country: country ?? null,
      },
      { onConflict: "user_id" },
    );
    await admin.from("user_roles").upsert({ user_id: user.id, role: "user" }, { onConflict: "user_id,role" });

    return json({ ok: true });
  } catch (err: any) {
    console.error("email-otp error", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
