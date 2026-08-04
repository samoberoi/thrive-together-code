import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Caller must be an admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: caller } = await admin.auth.getUser(token);
    if (!caller?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.user.id);
    if (!(callerRoles ?? []).some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Admins only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;

    // Protected: anyone with a privileged role, or listed in coaches
    const { data: privRoles } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "coach", "channel_partner"]);
    const { data: coachRows } = await admin.from("coaches").select("user_id");
    const keep = new Set<string>();
    for (const r of privRoles ?? []) keep.add((r as any).user_id);
    for (const c of coachRows ?? []) if ((c as any).user_id) keep.add((c as any).user_id);

    // Enumerate all auth users
    const targets: string[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const users = data?.users ?? [];
      for (const u of users) if (!keep.has(u.id)) targets.push(u.id);
      if (users.length < 1000) break;
      page++;
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({ dryRun: true, toDelete: targets.length, kept: keep.size }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let deleted = 0;
    const errors: string[] = [];
    for (const id of targets) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) errors.push(`${id}: ${error.message}`);
      else deleted++;
    }

    return new Response(JSON.stringify({ deleted, kept: keep.size, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
