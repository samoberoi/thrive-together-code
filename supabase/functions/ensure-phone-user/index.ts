import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const BodySchema = z.object({
  phone: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().length(10)),
  country: z.string().max(80).nullable().optional(),
  country_code: z.string().max(8).nullable().optional(),
});

const SUPERADMIN_PHONE = "8373914073";

async function findUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data?.users?.find((u: any) => String(u.email).toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (!data?.users || data.users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Valid phone number required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { phone, country, country_code } = parsed.data;

    const email = `${phone}@bbd.app`;
    const password = `bbd_${phone}_secure`;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let user = null;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { phone },
      });

    if (!createError) {
      user = created.user;
    } else if (String(createError?.message || "").toLowerCase().includes("already")) {
      user = await findUserByEmail(admin, email);
      if (!user) throw createError;
      const { data, error } = await admin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        user_metadata: { ...(user.user_metadata ?? {}), phone },
      });
      if (error) throw error;
      user = data.user;
    } else {
      throw createError;
    }

    await admin.from("profiles").upsert(
      {
        user_id: user.id,
        phone,
        country: country ?? null,
        country_code: country_code ?? null,
      },
      { onConflict: "user_id" },
    );
    await admin.from("user_roles").upsert({ user_id: user.id, role: "user" }, { onConflict: "user_id,role" });

    // This fixed-code account is the designated superadmin. The production
    // database can contain a stale role row from an older auth-user identity,
    // so bind the admin role to the identity that was actually authenticated.
    if (phone === SUPERADMIN_PHONE) {
      const { error: roleError } = await admin
        .from("user_roles")
        .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
      if (roleError) throw roleError;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});