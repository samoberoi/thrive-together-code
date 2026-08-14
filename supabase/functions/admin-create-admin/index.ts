import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is an admin
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerRole } = await supabaseAdmin
      .from("user_roles").select("id")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();
    const phoneRaw = String(body?.phone || "").trim();
    const phone = phoneRaw.replace(/\D/g, "");

    if (!name) return new Response(JSON.stringify({ error: "Name is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (phone.length < 10) return new Response(JSON.stringify({ error: "Valid phone (10+ digits) required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const email = `${phone}@bbd.app`;
    const password = `bbd_${phone}_secure`;

    let userId: string | null = null;

    // Check if user already exists by email
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    const found = existing?.users?.find((u) => u.email === email);
    if (found) {
      userId = found.id;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (createErr) throw createErr;
      userId = created.user.id;
    }

    // Profile upsert
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (existingProfile) {
      await supabaseAdmin.from("profiles").update({ name, phone }).eq("user_id", userId);
    } else {
      await supabaseAdmin.from("profiles").insert({
        user_id: userId, name, phone, onboarding_completed: true,
      });
    }

    // Admin role
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles").select("id")
      .eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!existingRole) {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles").insert({ user_id: userId, role: "admin" });
      if (roleErr) throw roleErr;
    }

    return new Response(
      JSON.stringify({ success: true, userId, phone, message: `Admin created. Login with phone ${phone} using SMS OTP` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
