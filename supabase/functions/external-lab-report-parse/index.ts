import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const normalize = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let reportId: string | null = null;
  try {
    const auth = req.headers.get("Authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const internal = req.headers.get("x-bbdo-internal") === serviceKey;
    if (!auth && !internal) return json({ error: "unauthenticated" }, 401);

    const client = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: auth ?? "" } } },
    );
    const { data: authData } = internal ? { data: { user: null } } : await client.auth.getUser();
    if (!internal && !authData.user) return json({ error: "unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    reportId = typeof body?.externalReportId === "string" ? body.externalReportId : null;
    if (!reportId) return json({ error: "externalReportId required" }, 400);

    // Reading through the caller-scoped client enforces patient/assigned-coach access.
    const reportClient = internal ? admin : client;
    const { data: report, error: reportError } = await reportClient
      .from("external_lab_reports")
      .select("id,user_id,file_path,file_name,mime_type,product_codes,collected_on")
      .eq("id", reportId)
      .maybeSingle();
    if (reportError || !report) return json({ error: "report not found or forbidden" }, 404);

    await admin.from("external_lab_reports").update({ status: "processing" }).eq("id", report.id);

    const { data: fileData, error: fileError } = await admin.storage
      .from("lab-reports")
      .download(report.file_path);
    if (fileError || !fileData) throw new Error(fileError?.message || "Could not read uploaded report");

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    const productCodes = Array.isArray(report.product_codes) ? report.product_codes : [];
    const [{ data: tests }, { data: catalogParams }] = await Promise.all([
      admin.from("thyrocare_tests").select("product_code,raw_data").in("product_code", productCodes),
      admin.from("lab_parameters").select("code,name,unit,ref_low,ref_high,group_name"),
    ]);

    const knownByName = new Map<string, any>();
    for (const p of catalogParams || []) {
      knownByName.set(normalize(String(p.code || "")), p);
      knownByName.set(normalize(String(p.name || "")), p);
    }

    const expected = new Map<string, { code: string; name: string }>();
    for (const test of tests || []) {
      const included = Array.isArray(test?.raw_data?.testsIncluded) ? test.raw_data.testsIncluded : [];
      for (const marker of included) {
        const name = String(marker?.name || marker?.code || "").trim();
        if (!name) continue;
        const code = String(marker?.code || name).trim();
        expected.set(normalize(code) || normalize(name), { code, name });
      }
    }

    const expectedList = [...expected.values()];
    const prompt = `Read this medical laboratory report and extract every reported test result.
Return strict JSON only in this shape:
{"results":[{"code":"expected code when matched","name":"test name as printed","value_numeric":12.3,"value_text":null,"unit":"unit or null","ref_low":1.0,"ref_high":10.0}]}

Expected panel markers:
${expectedList.map((m) => `${m.code} | ${m.name}`).join("\n")}

Rules:
- Extract every actual result visible in the uploaded report, not only abnormal values.
- Match expected markers by name even when wording or punctuation differs.
- Use value_numeric for numeric results. For results such as Positive, Negative or Reactive, set value_numeric null and value_text to the printed result.
- Copy units and numeric reference-range bounds when printed. Use null when unavailable.
- Never invent values and never return markers that have no result in the report.`;

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("Report extraction service is unavailable");
    const mime = report.mime_type || (String(report.file_name || "").toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    const gateway = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "file", file: { filename: report.file_name || "report", file_data: `data:${mime};base64,${base64}` } },
          ],
        }],
        response_format: { type: "json_object" },
      }),
    });
    const gatewayText = await gateway.text();
    if (!gateway.ok) throw new Error(`Extraction failed (${gateway.status})`);

    let outer: any = {};
    try { outer = JSON.parse(gatewayText); } catch { throw new Error("Invalid extraction response"); }
    let parsed: any = {};
    try { parsed = JSON.parse(outer?.choices?.[0]?.message?.content || "{}"); } catch { parsed = {}; }
    const extracted = Array.isArray(parsed?.results) ? parsed.results : [];

    const observedAt = report.collected_on
      ? new Date(`${report.collected_on}T08:00:00`).toISOString()
      : new Date().toISOString();
    const rows = extracted.flatMap((item: any) => {
      const rawName = String(item?.name || "").trim();
      const rawCode = String(item?.code || "").trim();
      if (!rawName && !rawCode) return [];
      const expectedMarker = expected.get(normalize(rawCode))
        || [...expected.values()].find((m) => normalize(m.name) === normalize(rawName));
      const known = knownByName.get(normalize(rawCode)) || knownByName.get(normalize(rawName));
      const numeric = item?.value_numeric == null ? null : Number(item.value_numeric);
      const text = item?.value_text == null ? null : String(item.value_text).trim();
      if (!Number.isFinite(numeric) && !text) return [];
      return [{
        user_id: report.user_id,
        order_id: null,
        report_id: null,
        external_report_id: report.id,
        parameter_code: known?.code || expectedMarker?.code || rawCode || rawName,
        parameter_name: known?.name || expectedMarker?.name || rawName || rawCode,
        value_numeric: Number.isFinite(numeric) ? numeric : null,
        value_text: text || null,
        unit: item?.unit || known?.unit || null,
        ref_low: item?.ref_low == null ? known?.ref_low ?? null : Number(item.ref_low),
        ref_high: item?.ref_high == null ? known?.ref_high ?? null : Number(item.ref_high),
        observed_at: observedAt,
        source: "external_upload_auto",
      }];
    });

    if (!rows.length) throw new Error("No marker values could be read from this report");
    await admin.from("lab_results").delete().eq("external_report_id", report.id);
    const { error: insertError } = await admin.from("lab_results").insert(rows);
    if (insertError) throw new Error(insertError.message);
    await admin.from("external_lab_reports").update({
      status: "reviewed",
      reviewed_at: new Date().toISOString(),
    }).eq("id", report.id);

    return json({ ok: true, count: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("external-lab-report-parse", message);
    if (reportId) await admin.from("external_lab_reports").update({ status: "parse_failed" }).eq("id", reportId);
    return json({ error: message }, 500);
  }
});