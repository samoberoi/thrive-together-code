import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sweeper-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Retries lab reports whose extraction never completed (AI gateway blips, key
// rotation, timeouts). Runs on a schedule so a client never has to re-upload.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("x-sweeper-token") ?? "";
  const expected = Deno.env.get("LAB_SWEEPER_TOKEN") ?? "";
  if (!expected || token !== expected) return json({ error: "forbidden" }, 403);

  const staleBefore = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data: reports, error } = await admin
    .from("external_lab_reports")
    .select("id,status,created_at,updated_at")
    .in("status", ["uploaded", "processing", "parse_failed"])
    .lt("created_at", staleBefore)
    .gt("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return json({ error: error.message }, 500);

  const results: Array<{ id: string; ok: boolean; detail?: string }> = [];
  for (const report of reports ?? []) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/external-lab-report-parse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bbdo-internal": SERVICE_KEY,
        },
        body: JSON.stringify({ externalReportId: report.id }),
      });
      const text = await res.text();
      results.push({ id: report.id, ok: res.ok, detail: res.ok ? undefined : text.slice(0, 200) });
    } catch (e) {
      results.push({ id: report.id, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log("lab-parse-sweeper", JSON.stringify({ scanned: reports?.length ?? 0, results }));
  return json({ scanned: reports?.length ?? 0, results });
});
