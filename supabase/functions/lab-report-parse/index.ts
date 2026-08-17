// Auto-extract lab values from a Thyrocare PDF report and persist into lab_results.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as pdfjsLib from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sbAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data } = await sb.auth.getUser();
  return data.user;
}

async function fetchPdf(url: string): Promise<{ bytes: Uint8Array; base64: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`PDF fetch failed ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return { bytes, base64: btoa(bin) };
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await (pdfjsLib as any).getDocument({ data: bytes, disableWorker: true, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; s: string }>>();
    for (const item of content.items || []) {
      const s = String((item as any).str || "").trim();
      if (!s) continue;
      const transform = (item as any).transform || [0, 0, 0, 0, 0, 0];
      const y = Math.round(Number(transform[5] || 0) / 3) * 3;
      const x = Number(transform[4] || 0);
      const line = rows.get(y) || [];
      line.push({ x, s });
      rows.set(y, line);
    }
    pages.push([...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) =>
      items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ")
    ).join("\n"));
  }
  return pages.join("\n");
}

const aliasMap: Record<string, string[]> = {
  HBA: ["HBA1C", "GLYCOSYLATED HEMOGLOBIN"], HBA1C: ["HBA1C", "GLYCOSYLATED HEMOGLOBIN"],
  FBS: ["FASTING BLOOD SUGAR(GLUCOSE)", "FASTING BLOOD SUGAR", "GLUCOSE FASTING", "BLOOD SUGAR (F)"],
  CHOL: ["TOTAL CHOLESTEROL", "CHOLESTEROL - TOTAL"], HCHO: ["HDL CHOLESTEROL - DIRECT", "HDL CHOLESTEROL"],
  LDL: ["LDL CHOLESTEROL - DIRECT", "LDL CHOLESTEROL"], TRIG: ["TRIGLYCERIDES"], VLDL: ["VLDL CHOLESTEROL"], NHDL: ["NON-HDL CHOLESTEROL"],
  "TC/H": ["TC/ HDL CHOLESTEROL RATIO", "TC / HDL CHOLESTEROL RATIO"], "TRI/H": ["TRIG / HDL RATIO", "TRIG/HDL RATIO"], "LDL/": ["LDL / HDL RATIO", "LDL/HDL RATIO"], "HD/LD": ["HDL / LDL RATIO", "HDL/LDL RATIO"],
  SCRE: ["CREATININE - SERUM", "SERUM CREATININE", "CREATININE-SERUM"],
  UALB: ["URINARY MICROALBUMIN", "URINE MICROALBUMIN"],
  SGOT: ["ASPARTATE AMINOTRANSFERASE (SGOT )", "ASPARTATE AMINOTRANSFERASE (SGOT)", "ASPARTATE AMINOTRANSFERASE", "SGOT (AST)"],
  SGPT: ["ALANINE TRANSAMINASE (SGPT)", "ALANINE TRANSAMINASE", "SGPT (ALT)"],
  TSH: ["THYROID STIMULATING HORMONE", "ULTRASENSITIVE TSH", "TSH"], T3: ["TOTAL TRIIODOTHYRONINE", "TOTAL T3"], T4: ["TOTAL THYROXINE", "TOTAL T4"], FT3: ["FREE TRIIODOTHYRONINE", "FREE T3"], FT4: ["FREE THYROXINE", "FREE T4"],
  VITD: ["25-OH VITAMIN D (TOTAL)", "VITAMIN D (25-OH)"], "25OHD": ["25-OH VITAMIN D (TOTAL)"], VITD3: ["25-OH VITAMIN D (TOTAL)"], VITB12: ["VITAMIN B-12", "VITAMIN B12"], B12: ["VITAMIN B-12", "VITAMIN B12"],
  HB: ["HEMOGLOBIN"], UREA: ["UREA"], URIC: ["URIC ACID"], CALC: ["CALCIUM"], GGT: ["GAMMA GLUTAMYL TRANSFERASE", "GGT"], ALP: ["ALKALINE PHOSPHATASE"], TBIL: ["BILIRUBIN - TOTAL", "TOTAL BILIRUBIN"], ALB: ["ALBUMIN - SERUM", "ALBUMIN"], TP: ["PROTEIN - TOTAL", "TOTAL PROTEIN"], IRON: ["IRON"], FERR: ["FERRITIN"], TIBC: ["TOTAL IRON BINDING CAPACITY", "TIBC"], HSCRP: ["HIGH SENSITIVITY C-REACTIVE PROTEIN", "HS-CRP"], CRP: ["C-REACTIVE PROTEIN"], INSF: ["INSULIN - FASTING", "FASTING INSULIN"], HOMA: ["HOMA INSULIN RESISTANCE INDEX", "HOMA-IR"],
};

const TECH_RE =
  /\b(PHOTOMETRY|CALCULATED|H\.P\.L\.C|HPLC|CMIA|ECLIA|CLIA|COLORIMETRY|TURBIDIMETRY|ISE|IMPEDANCE|NEPHELOMETRY|IMMUNOTURBIDIMETRY)\b/;

function normLabel(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9./()<>\- ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Word groups that must agree between the printed test name and the alias,
 *  so urine analytes never get stored as blood analytes (and ratios/derived
 *  values never overwrite the direct measurement). */
const CONTEXT_GROUPS = [["URINE", "URINARY"], ["RATIO"], ["AVERAGE"], ["EST.", "ESTIMATED", "EGFR"], ["INDEX"]];

function contextMatches(label: string, alias: string) {
  for (const group of CONTEXT_GROUPS) {
    const inLabel = group.some((w) => label.includes(w));
    const inAlias = group.some((w) => alias.includes(w));
    if (inLabel !== inAlias) return false;
  }
  return true;
}

/** Test-name portion of a report row: everything before the technology column
 *  (or before the first numeric value when the technology column is missing). */
function labelOf(line: string) {
  const t = TECH_RE.exec(line);
  const raw = t ? line.slice(0, t.index) : line.split(/(?:^|\s)[<>]?\s*\d/)[0];
  return normLabel(raw);
}

function extractFromText(text: string, params: any[]) {
  const lines = text.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const results: Array<{ code: string; value: number; unit?: string | null }> = [];
  const seen = new Set<string>();
  for (const p of params) {
    const code = String(p.code);
    const aliases = [...(aliasMap[code] || []), p.name, code].filter(Boolean).map((a) => normLabel(String(a)));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const label = labelOf(line);
      if (label.length < 3) continue;
      // Exact test-name match only (no loose substring), plus sample/derivation guard.
      const alias = aliases.find((a) =>
        a.length >= 3 &&
        (label === a || label === `${a}:` || label.startsWith(`${a} `)) &&
        contextMatches(label, a)
      );
      if (!alias) continue;
      const after = line.slice(label.length);
      let m = after.match(/(?:^|\s)([<>]?)\s*(\d+(?:\.\d+)?)\s*([A-Za-zµμ%/0-9.^-]+)?/);
      // Some rows print the value on the next line.
      if (!m && lines[i + 1]) m = lines[i + 1].match(/^\s*([<>]?)\s*(\d+(?:\.\d+)?)\s*([A-Za-zµμ%/0-9.^-]+)?/);
      if (!m) continue;
      if (m[1]) break; // "<5.5" style — not a measured value, skip this parameter
      const value = Number(m[2]);
      if (!Number.isFinite(value) || seen.has(code)) continue;
      results.push({ code, value, unit: m[3] || p.unit || null });
      seen.add(code);
      break;
    }
  }
  return results;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const internal = req.headers.get("x-bbdo-internal") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const user = internal ? null : await getUser(req);
    if (!internal && !user) return json({ error: "unauthenticated" }, 401);
    const orderId: string = body?.orderId;
    if (!orderId) return json({ error: "orderId required" }, 400);

    // Load order (uuid)
    const { data: order, error: oErr } = await sbAdmin
      .from("thyrocare_orders")
      .select("id, user_id, product_codes, collection_date")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr || !order) return json({ error: "order not found" }, 404);

    // Authorization: owner, admin, or assigned coach
    if (!internal && user && order.user_id !== user.id) {
      const [{ data: roles }, { data: owns }] = await Promise.all([
        sbAdmin.from("user_roles").select("role").eq("user_id", user.id),
        sbAdmin.rpc("coach_owns_patient", { _patient_user_id: order.user_id }),
      ]);
      const isAdmin = roles?.some((r: any) => r.role === "admin");
      if (!isAdmin && !owns) return json({ error: "forbidden" }, 403);
    }

    // Latest report URL
    const { data: report } = await sbAdmin
      .from("thyrocare_reports")
      .select("id, report_url")
      .eq("order_id", order.id)
      .not("report_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!report?.report_url) return json({ error: "no report url yet" }, 400);

    // Parameter catalog for this order's packages. Some vendor catalog refreshes
    // change the package id without updating lab_parameters.product_codes, so
    // fall back to the concrete test ids returned on the booked order.
    const { data: mappedParams, error: pErr } = await sbAdmin
      .from("lab_parameters")
      .select("code, name, unit, ref_low, ref_high, group_name")
      .overlaps("product_codes", order.product_codes || []);
    if (pErr) return json({ error: pErr.message }, 500);
    let params = mappedParams || [];
    if (!params.length) {
      const { data: fullOrder } = await sbAdmin
        .from("thyrocare_orders")
        .select("raw_response")
        .eq("id", order.id)
        .maybeSingle();
      const raw = fullOrder?.raw_response?.data || fullOrder?.raw_response || {};
      const testCodes = Array.from(new Set(
        (raw?.patients || []).flatMap((patient: any) =>
          (patient?.items || []).flatMap((item: any) =>
            (item?.tests || []).map((test: any) => String(test?.testId || test?.id || "").trim())
          )
        ).filter(Boolean),
      ));
      if (testCodes.length) {
        const { data: codeParams, error: codeErr } = await sbAdmin
          .from("lab_parameters")
          .select("code, name, unit, ref_low, ref_high, group_name")
          .in("code", testCodes);
        if (codeErr) return json({ error: codeErr.message }, 500);
        params = codeParams || [];
      }
    }
    if (!params?.length) return json({ error: "no catalog parameters" }, 400);

    const pdf = await fetchPdf(report.report_url);
    let extracted: Array<{ code: string; value: number; unit?: string | null }> = [];
    try {
      extracted = extractFromText(await extractPdfText(pdf.bytes), params);
    } catch (e) {
      console.error("pdf text extraction failed", String((e as Error).message || e));
    }

    // Fallback to Gemini only for scanned/opaque PDFs.
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!extracted.length && !lovableKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const catalogList = params.map((p: any) =>
      `${p.code} | ${p.name}${p.unit ? ` (${p.unit})` : ""}`
    ).join("\n");

    const systemPrompt = `You extract lab test values from PDF medical reports. Return STRICT JSON only.
You will receive a catalog of expected parameters (code | name (unit)). For every parameter found in the PDF, return its numeric value exactly as printed (do not convert units). If a parameter is not present in the PDF, omit it. Match by name primarily; ignore minor wording differences.`;

    const userPrompt = `Catalog (extract values for these codes when present):
${catalogList}

Return JSON in this exact shape:
{"results":[{"code":"<catalog code>","value":<number>,"unit":"<as printed or null>"}]}

Rules:
- value must be a number (e.g. 5.6, 110, 12). No strings, no ranges.
- If the PDF shows ranges like "<10" or "Negative", omit that row.
- Do not invent values. Only include parameters you actually see in the PDF.`;

    if (!extracted.length) {
    const gatewayRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "file",
                file: {
                  filename: "report.pdf",
                  file_data: `data:application/pdf;base64,${pdf.base64}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const gwText = await gatewayRes.text();
    if (!gatewayRes.ok) {
      console.error("gateway error", gatewayRes.status, gwText.slice(0, 500));
      return json({ error: "AI extraction failed", status: gatewayRes.status, detail: gwText.slice(0, 500) }, 502);
    }
    let gw: any = {};
    try { gw = JSON.parse(gwText); } catch { return json({ error: "invalid AI response" }, 502); }
    const content: string = gw?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { results: [] }; }
    extracted =
      Array.isArray(parsed?.results) ? parsed.results : [];
    }

    // Map to lab_results rows by joining with catalog
    const byCode = new Map(params.map((p: any) => [String(p.code), p]));
    const observedAt = (() => {
      if (order.collection_date) return new Date(`${order.collection_date}T08:00:00`).toISOString();
      return new Date().toISOString();
    })();

    const rows = extracted
      .map((e) => {
        const p: any = byCode.get(String(e.code));
        if (!p) return null;
        const num = typeof e.value === "number" ? e.value : Number(e.value);
        if (!Number.isFinite(num)) return null;
        return {
          user_id: order.user_id,
          order_id: order.id,
          report_id: report.id,
          parameter_code: p.code,
          parameter_name: p.name,
          value_numeric: num,
          value_text: null,
          unit: e.unit || p.unit || null,
          ref_low: p.ref_low,
          ref_high: p.ref_high,
          observed_at: observedAt,
          source: "auto_pdf",
        };
      })
      .filter(Boolean);

    if (!rows.length) {
      return json({ ok: false, count: 0, message: "No values extracted from PDF" }, 200);
    }

    // Replace any prior rows for this order
    await sbAdmin.from("lab_results").delete().eq("user_id", order.user_id).eq("order_id", order.id);
    const { error: insErr } = await sbAdmin.from("lab_results").insert(rows as any[]);
    if (insErr) return json({ error: insErr.message }, 500);

    return json({ ok: true, count: rows.length });
  } catch (e) {
    console.error("lab-report-parse error", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
