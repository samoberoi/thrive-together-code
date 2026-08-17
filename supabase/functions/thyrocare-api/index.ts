// Thyrocare B2C Middleware API gateway
// Actions: sync_catalog | serviceability | create_order | order_status | fetch_report | get_token
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PARTNER_ID = Deno.env.get("THYROCARE_PARTNER_ID")!;
const DSA_CODE = Deno.env.get("THYROCARE_DSA_CODE")!;
const PASSWORD = Deno.env.get("THYROCARE_PASSWORD")!;
const configuredBaseUrl = Deno.env.get("THYROCARE_BASE_URL") || "";
const BASE_URL = (configuredBaseUrl.includes("thyrocare.com") && !configuredBaseUrl.includes("sandbox")
  ? configuredBaseUrl
  : "https://api.thyrocare.com").replace(/\/$/, "");

const sbAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function syncReportToProfile(orderId: string) {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/lab-report-parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bbdo-internal": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify({ orderId }),
    });
  } catch (e) {
    console.error("lab result auto-sync failed", String((e as Error).message || e));
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function thyHeaders(clientType = "WEB"): Promise<Record<string, string>> {
  const token = await getValidToken();
  return {
    "Content-Type": "application/json",
    "Partner-Id": PARTNER_ID,
    "Request-Id": crypto.randomUUID(),
    "API-Version": "1.0",
    "Client-Type": clientType,
    "User-Agent": "BBDO-Lovable/1.0",
    Authorization: `Bearer ${token}`,
  };
}

async function getValidToken(force = false): Promise<string> {
  if (!force) {
    const { data } = await sbAdmin
      .from("thyrocare_auth_cache")
      .select("bearer_token, expires_at")
      .eq("id", 1)
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now() + 60_000) {
      return data.bearer_token;
    }
  }
  // Login: POST /partners/v1/auth/login (B2C middleware)
  const res = await fetch(`${BASE_URL}/partners/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Partner-Id": PARTNER_ID,
      "Request-Id": "Pass",
      "Client-Type": "All",
      "Entity-Type": "DSA",
      "User-Agent": "BBDO-Lovable/1.0",
    },
    body: JSON.stringify({ username: DSA_CODE, password: PASSWORD }),
  });
  const txt = await res.text();
  let body: any = {};
  try { body = JSON.parse(txt); } catch { /* keep raw */ }
  if (!res.ok) {
    throw new Error(`Thyrocare login failed (${res.status}): ${txt}`);
  }
  const token: string =
    body?.data?.token || body?.token || body?.access_token || body?.bearerToken;
  if (!token) throw new Error(`No token in login response: ${txt}`);
  const expiresIn: number = body?.data?.expiresIn || body?.expiresIn || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await sbAdmin.from("thyrocare_auth_cache").upsert({
    id: 1,
    bearer_token: token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  return token;
}

// Authenticated user for client requests
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

// ---- Actions ----

async function syncCatalog() {
  // GET catalog products from Thyrocare B2C middleware
  const res = await fetch(`${BASE_URL}/partners/v1/catalog/products?minPrice=0&maxPrice=999999&gender=MALE&page=1&pageSize=400`, {
    method: "GET",
    headers: await thyHeaders(),
  });
  const txt = await res.text();
  let body: any = {};
  try { body = JSON.parse(txt); } catch {}
  if (!res.ok) return json({ error: "catalog fetch failed", detail: txt }, 502);

  // Paginate through all pages
  const allItems: any[] = [];
  const firstList: any[] =
    body?.skuList || body?.data?.skuList || body?.data?.products || body?.products || body?.data || (Array.isArray(body) ? body : []);
  allItems.push(...firstList);
  let nextPage: number | null = body?.nextPage ?? (body?.isLastPage === false ? 2 : null);
  let safety = 20;
  while (nextPage && safety-- > 0) {
    const r = await fetch(`${BASE_URL}/partners/v1/catalog/products?minPrice=0&maxPrice=999999&gender=MALE&page=${nextPage}&pageSize=400`, {
      method: "GET",
      headers: await thyHeaders(),
    });
    if (!r.ok) break;
    const b: any = await r.json().catch(() => ({}));
    const l: any[] = b?.skuList || b?.data?.skuList || [];
    allItems.push(...l);
    nextPage = b?.isLastPage === false ? (b?.nextPage ?? null) : null;
  }

  const rows = allItems
    .map((p: any) => {
      const code = p.id || p.productCode || p.code || p.ProductCode || p.testCode;
      const name = p.name || p.productName || p.ProductName || p.testName;
      if (!code || !name) return null;
      return {
        product_code: String(code),
        product_name: String(name),
        product_type: p.type || p.productType || null,
        category: p.categories?.[0]?.name || p.category || p.categoryName || null,
        rate: Number(p.rate?.listingPrice || p.rate?.mrp || p.rate || p.MRP || p.mrp || 0) || null,
        offer_rate: Number(p.rate?.sellingPrice || p.offerRate || p.offerPrice || p.b2cRate || 0) || null,
        fasting_required: !!(p.flags?.isFastingRequired === true || p.fasting === "Yes" || p.fastingRequired === true),
        fasting_hours: Number(p.fastingHours || 0) || null,
        parameters_count: Number(p.noOfTestsIncluded || p.parametersCount || p.parameterCount || 0) || null,
        description: p.description || p.about || null,
        raw_data: p,
        // NOTE: never send is_active here — admin enable/disable state must survive a catalog sync.
        // New rows default to is_active = false and must be enabled explicitly by an admin.
        synced_at: new Date().toISOString(),
      };
    })
    .filter(Boolean) as any[];

  // Dedupe by product_code (last wins)
  const byCode = new Map<string, any>();
  for (const r of rows) byCode.set(r.product_code, r);
  const dedupedRows = Array.from(byCode.values());

  // Batch upsert in chunks
  let upserts = 0;
  const CHUNK = 100;
  for (let i = 0; i < dedupedRows.length; i += CHUNK) {
    const chunk = dedupedRows.slice(i, i + CHUNK);
    const { error } = await sbAdmin.from("thyrocare_tests").upsert(chunk, { onConflict: "product_code" });
    if (error) return json({ error: "upsert failed", detail: error.message, upserted: upserts }, 500);
    upserts += chunk.length;
  }
  return json({ ok: true, count: upserts });
}

async function serviceability(payload: any) {
  const pincode = String(payload?.pincode || "");
  if (!/^\d{6}$/.test(pincode)) return json({ ok: false, error: "invalid pincode" }, 200);
  // Per Thyrocare docs: GET /partners/v1/serviceability/pincodes returns serviceable pin lists.
  const res = await fetch(`${BASE_URL}/partners/v1/serviceability/pincodes`, {
    method: "GET",
    headers: await thyHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ ok: false, data, status: res.status }, 200);

  const serviceTypes: any[] =
    data?.serviceTypes ||
    data?.data?.serviceTypes ||
    (Array.isArray(data?.data) ? data.data : null) ||
    (Array.isArray(data) ? data : []);

  const matchedServiceTypes = serviceTypes
    .filter((group: any) => {
      const pins = Array.isArray(group?.pincodes) ? group.pincodes : [group?.pincode, group];
      return pins.some((pin: any) => String(pin) === pincode || String(pin?.pincode || "") === pincode);
    })
    .map((group: any) => group?.type || group?.serviceType || "ALL");

  const topLevelPins = Array.isArray(data?.pincodes)
    ? data.pincodes
    : Array.isArray(data?.data?.pincodes)
      ? data.data.pincodes
      : [];
  const topLevelMatch = topLevelPins.some((pin: any) => String(pin) === pincode || String(pin?.pincode || "") === pincode);
  const directMatch = String(data?.pincode || data?.data?.pincode || "") === pincode
    && (data?.serviceable ?? data?.isServiceable ?? data?.data?.serviceable ?? data?.data?.isServiceable ?? true) !== false;
  const serviceable = matchedServiceTypes.length > 0 || topLevelMatch || directMatch;

  return json({ ok: serviceable, serviceable, pincode, matchedServiceTypes, source: "serviceability/pincodes" });
}

async function availableSlots(payload: any) {
  const pincode = String(payload?.pincode || "");
  const date = String(payload?.date || "");
  if (!pincode || !date) return json({ error: "pincode and date required" }, 400);

  // Per Thyrocare B2C docs: POST /partners/v1/slots/search
  // Body: { appointmentDate (yyyy-MM-dd), pincode, patients: [{ name, gender, age, ageType, items: [{id,type,name}] }] }
  const productCodes: string[] = Array.isArray(payload?.productCodes) ? payload.productCodes : [];
  let items: Array<{ id: string; type: string; name: string }> = [];
  if (productCodes.length) {
    const { data: catalog } = await sbAdmin
      .from("thyrocare_tests")
      .select("product_code, product_name, product_type")
      .in("product_code", productCodes);
    items = (catalog || []).map((t: any) => ({
      id: String(t.product_code),
      type: t.product_type || "SSKU",
      name: t.product_name,
    }));
  }
  // Slots search REQUIRES non-empty items list per vendor validation.
  if (items.length === 0) {
    return json({ ok: false, error: "productCodes required for slot search", slots: [] }, 200);
  }

  const patientsIn: any[] = Array.isArray(payload?.patients) && payload.patients.length
    ? payload.patients
    : [{
        name: payload?.name || "Patient",
        age: Number(payload?.age) || 30,
        ageType: "YEAR",
        gender: String(payload?.gender || "Male").toUpperCase(),
      }];

  const reqBody = {
    appointmentDate: date,
    pincode,
    patients: patientsIn.map((p) => ({
      name: String(p?.name || "Patient"),
      gender: String(p?.gender || "Male").toUpperCase(),
      age: Number(p?.age) || 30,
      ageType: p?.ageType || "YEAR",
      items,
    })),
  };

  const res = await fetch(`${BASE_URL}/partners/v1/slots/search`, {
    method: "POST",
    headers: await thyHeaders(),
    body: JSON.stringify(reqBody),
  });
  const txt = await res.text();
  let body: any = {};
  try { body = JSON.parse(txt); } catch {}

  if (!res.ok) {
    return json({ ok: false, error: "slot search failed", detail: txt, slots: [] }, 200);
  }

  const rawList: any[] =
    body?.slots ||
    body?.data?.slots ||
    body?.availableSlots ||
    body?.data?.availableSlots ||
    (Array.isArray(body?.data) ? body.data : null) ||
    (Array.isArray(body) ? body : []);

  const slots = (rawList || [])
    .map((s: any) => {
      const start = s?.startTime || s?.start_time || s?.from || s?.slotStart || s?.start || s?.time || (typeof s === "string" ? s : null);
      const end = s?.endTime || s?.end_time || s?.to || s?.slotEnd || s?.end || null;
      const available = s?.available !== false && s?.isAvailable !== false && s?.status !== "UNAVAILABLE" && s?.isBookable !== false;
      if (!start) return null;
      const m = String(start).match(/(\d{1,2})(?:[:.](\d{2}))?/);
      if (!m) return null;
      const hh = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, "0");
      const mm = (m[2] || "00").padStart(2, "0");
      let endStr: string | null = null;
      if (end) {
        const em = String(end).match(/(\d{1,2})(?:[:.](\d{2}))?/);
        if (em) {
          endStr = `${String(Math.min(23, Math.max(0, Number(em[1])))).padStart(2, "0")}:${(em[2] || "00").padStart(2, "0")}`;
        }
      }
      return { start: `${hh}:${mm}`, end: endStr, available, raw: s };
    })
    .filter(Boolean);

  return json({ ok: true, source: "slots/search", slots, raw: body });
}




async function createOrder(payload: any, userId: string) {
  const required = ["beneficiary", "mobile", "pincode", "address", "productCodes"];
  for (const k of required) if (!payload?.[k]) return json({ error: `${k} required` }, 400);

  // Thyrocare validates the final address string at 25–200 characters. Older
  // app builds can submit a short/whitespace-heavy profile address, so enforce
  // the vendor contract here rather than requiring users to update the app.
  const rawAddress = String(payload.address || "").replace(/\s+/g, " ").trim();
  const addressParts = [
    rawAddress,
    String(payload.city || "").trim(),
    String(payload.state || "").trim(),
    String(payload.pincode || "").trim(),
    "India",
  ].filter(Boolean);
  let bookingAddress = Array.from(new Set(addressParts)).join(", ");
  if (bookingAddress.length < 25) bookingAddress = `${bookingAddress}, Home collection address`;
  bookingAddress = bookingAddress.slice(0, 200).trim();
  // A house/flat identifier is validated separately and must not contain the
  // complete postal address. Older clients only send one combined string, so
  // derive a compact identifier server-side without requiring an app update.
  const firstAddressPart = rawAddress.split(",").map((part) => part.trim()).find(Boolean);
  const houseNo = (firstAddressPart || "House").slice(0, 25);

  // Look up product details from cached catalog
  const { data: catalog } = await sbAdmin
    .from("thyrocare_tests")
    .select("product_code, product_name, product_type, rate, offer_rate")
    .in("product_code", payload.productCodes);
  const items = (catalog || []).map((t: any) => ({
    id: t.product_code,
    type: t.product_type || "SSKU",
    name: t.product_name,
    rate: { currency: "INR", mrp: String(t.rate || t.offer_rate || 0) },
    origin: { enteredBy: "BBDOApp", platform: "WEB" },
  }));
  const totalMrp = (catalog || []).reduce(
    (s: number, t: any) => s + Number(t.rate || t.offer_rate || 0),
    0,
  );

  const ageType = "YEAR";
  // Format phone as +91-XXXXXXXXXX
  const digits = String(payload.mobile).replace(/\D/g, "").slice(-10);
  const formattedPhone = `+91-${digits}`;
  // Format slot as HH:MM (accept "7", "7-8", "07:00", "7 AM" etc)
  const slotRaw = String(payload.collection_slot || "07:00").trim();
  let startTime = "07:00";
  const m = slotRaw.match(/(\d{1,2})(?:[:.](\d{2}))?/);
  if (m) {
    const hh = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, "0");
    const mm = (m[2] || "00").padStart(2, "0");
    startTime = `${hh}:${mm}`;
  }

  const reqBody = {
    address: {
      // Thyrocare validates this canonical `address` field at 25–200 chars.
      // Keep the component fields below for compatibility with older API variants.
      address: bookingAddress,
      houseNo,
      street: bookingAddress,
      addressLine1: bookingAddress,
      city: payload.city || "",
      state: payload.state || "",
      country: "India",
      pincode: String(payload.pincode),
    },
    email: payload.email && !/@bbd\.app$/i.test(payload.email) ? payload.email : "",
    contactNumber: formattedPhone,
    referredBy: { doctorId: "", doctorName: "" },
    appointment: {
      date: payload.collection_date,
      startTime,
      timeZone: "IST",
    },
    origin: {
      platform: "WEB",
      appId: "BBDO",
      portalType: "B2C",
      enteredBy: "BBDOApp",
      source: "B2C-CREATE-ORDER-API",
    },
    // We collect payment ourselves via Razorpay, so Thyrocare orders are always PREPAID.
    paymentDetails: { payType: "PREPAID" },
    attributes: {
      remarks: payload.notes || "",
      phleboNotes: "",
      campId: null,
      isReportHardCopyRequired: false,
      refOrderNo: (payload.recommendation_id || crypto.randomUUID()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 25),
      collectionType: "HOME_COLLECTION",
      alertMessage: [""],
    },
    config: {
      communication: {
        shareReport: true,
        shareReceipt: true,
        shareModes: { sms: true, whatsapp: true, email: true },
      },
    },

    patients: [
      {
        name: payload.beneficiary.name,
        gender: String(payload.beneficiary.gender || "Male").toUpperCase(),
        age: Number(payload.beneficiary.age) || 30,
        ageType,
        contactNumber: formattedPhone,
        email: payload.email && !/@bbd\.app$/i.test(payload.email) ? payload.email : "",
        attributes: {
          ulcUniqueCode: "",
          patientAddress: bookingAddress,
          externalPatientId: userId,
        },
        items,
      },
    ],
    price: {
      discounts: [],
      incentivePasson: { type: "PERCENTAGE", value: "0" },
    },
    orderOptions: { isPdpcOrder: false },
  };

  const res = await fetch(`${BASE_URL}/partners/v1/orders`, {
    method: "POST",
    headers: await thyHeaders(),
    body: JSON.stringify(reqBody),
  });
  const respText = await res.text();
  let respBody: any = {};
  try { respBody = JSON.parse(respText); } catch {}

  const thyOrderId =
    respBody?.data?.orderId || respBody?.orderId || respBody?.OrderNo || null;
  const leadId = respBody?.data?.leadId || respBody?.leadId || null;

  const { data: row, error } = await sbAdmin
    .from("thyrocare_orders")
    .insert({
      user_id: userId,
      recommendation_id: payload.recommendation_id || null,
      thyrocare_order_id: thyOrderId,
      thyrocare_lead_id: leadId,
      product_codes: payload.productCodes,
      beneficiary_name: payload.beneficiary.name,
      beneficiary_age: payload.beneficiary.age,
      beneficiary_gender: payload.beneficiary.gender,
      mobile: payload.mobile,
      email: payload.email,
      pincode: payload.pincode,
      address: bookingAddress,
      collection_date: payload.collection_date,
      collection_slot: payload.collection_slot,
      amount: respBody?.data?.amount || null,
      status: res.ok ? "created" : "failed",
      status_detail: res.ok ? null : respText.slice(0, 500),
      raw_request: reqBody,
      raw_response: respBody,
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);

  // mark recommendation booked
  if (payload.recommendation_id && res.ok) {
    await sbAdmin
      .from("thyrocare_recommendations")
      .update({ status: "booked" })
      .eq("id", payload.recommendation_id);
  }
  const vendorErrors = Array.isArray(respBody?.errors)
    ? respBody.errors.map((err: any) => err?.message).filter(Boolean).join("; ")
    : respBody?.message || respText;
  return json({ ok: res.ok, order: row, thyrocare: respBody, error: res.ok ? null : vendorErrors }, 200);
}

async function orderStatus(payload: any) {
  const orderId = payload?.thyrocare_order_id;
  if (!orderId) return json({ error: "thyrocare_order_id required" }, 400);
  const res = await fetch(`${BASE_URL}/partners/v1/orders/${encodeURIComponent(orderId)}?include=tracking,items,price`, {
    method: "GET",
    headers: await thyHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    const d = data?.data || data || {};
    const status = d?.status || data?.status;
    const leadId = d?.leadId || d?.LeadId || data?.leadId || d?.patients?.[0]?.id || null;
    const amount =
      d?.price?.netPayable ?? d?.amount ?? d?.totalAmount ?? d?.netAmount ?? null;
    const update: Record<string, unknown> = { raw_response: data };
    if (status) {
      update.status = String(status).toLowerCase();
      update.status_detail = d?.statusDetail || d?.remarks || null;
    }
    if (leadId) update.thyrocare_lead_id = String(leadId);
    if (amount != null) update.amount = Number(amount) || null;
    const apptDate = d?.appointmentDetails?.date || (d?.appointmentDate ? String(d.appointmentDate).slice(0, 10) : null);
    const apptStart = d?.appointmentDetails?.startTimeIn24HrFormat;
    const apptEnd = d?.appointmentDetails?.endTimeIn24HrFormat;
    if (apptDate) update.collection_date = apptDate;
    if (apptStart) update.collection_slot = apptEnd ? `${apptStart}-${apptEnd}` : apptStart;
    await sbAdmin
      .from("thyrocare_orders")
      .update(update)
      .eq("thyrocare_order_id", orderId);
  }
  return json({ ok: res.ok, data });
}


async function fetchReport(payload: any, userId: string) {
  const orderId = payload?.thyrocare_order_id;
  if (!orderId) return json({ error: "thyrocare_order_id required" }, 400);

  const { data: order } = await sbAdmin
    .from("thyrocare_orders")
    .select("id, user_id, thyrocare_lead_id, raw_response")
    .eq("thyrocare_order_id", orderId)
    .maybeSingle();

  const raw: any = order?.raw_response || {};
  const rawData = raw?.data || raw;
  const leadId: string =
    payload?.thyrocare_lead_id ||
    order?.thyrocare_lead_id ||
    rawData?.patients?.[0]?.id ||
    rawData?.leadId ||
    "";

  const candidates = [
    `${BASE_URL}/partners/v1/${encodeURIComponent(orderId)}/reports/${encodeURIComponent(leadId)}?type=pdf`,
    `${BASE_URL}/partners/v1/orders/reports?orderId=${encodeURIComponent(orderId)}${leadId ? `&leadId=${encodeURIComponent(leadId)}` : ""}&type=pdf`,
    `${BASE_URL}/partners/v1/orders/report?orderId=${encodeURIComponent(orderId)}${leadId ? `&leadId=${encodeURIComponent(leadId)}` : ""}&type=pdf`,
    `${BASE_URL}/partners/v1/orders/${encodeURIComponent(orderId)}/reports${leadId ? `/${encodeURIComponent(leadId)}` : ""}?type=pdf`,
    `${BASE_URL}/partners/v1/orders/${encodeURIComponent(orderId)}/reports?type=pdf${leadId ? `&leadId=${encodeURIComponent(leadId)}` : ""}`,
    `${BASE_URL}/partners/v1/orders/${encodeURIComponent(orderId)}/patients/${encodeURIComponent(leadId)}/reports?type=pdf`,
  ];

  let data: any = {};
  let lastStatus = 0;
  let lastText = "";
  let okUrl = "";
  for (const url of candidates) {
    const r = await fetch(url, { method: "GET", headers: await thyHeaders("DSA") });
    lastStatus = r.status;
    lastText = await r.text();
    try { data = JSON.parse(lastText); } catch { data = { raw: lastText }; }
    if (r.ok) { okUrl = url; break; }
  }
  if (!order) return json({ ok: true, data, warning: "no local order" });

  // Never destroy an already-delivered report because a later vendor call failed.
  const { data: existing } = await sbAdmin
    .from("thyrocare_reports")
    .select("id, report_url")
    .eq("order_id", order.id);
  const hasGoodExisting = (existing || []).some((r: any) => !!r.report_url);

  if (!okUrl) {
    console.error("fetch_report failed", { orderId, leadId, status: lastStatus, detail: lastText.slice(0, 500) });
    if (!hasGoodExisting) {
      await sbAdmin.from("thyrocare_reports").delete().eq("order_id", order.id);
      await sbAdmin.from("thyrocare_reports").insert({
        order_id: order.id,
        user_id: order.user_id,
        report_url: null,
        report_type: "Report ready — vendor file fetch failed",
        parameters: { status: lastStatus, detail: lastText.slice(0, 800), orderId, leadId },
        raw_data: data,
      });
    }
    return json({ ok: false, status: lastStatus, data, detail: lastText.slice(0, 800) }, 200);
  }


  const directReportUrl =
    (typeof lastText === "string" && /^https?:\/\//i.test(lastText.trim()) ? lastText.trim() : null) ||
    (typeof data === "string" && /^https?:\/\//i.test(data.trim()) ? data.trim() : null) ||
    data?.data?.url ||
    data?.data?.reportUrl ||
    data?.data?.pdfUrl ||
    data?.data?.downloadUrl ||
    data?.url ||
    data?.reportUrl ||
    data?.pdfUrl ||
    data?.downloadUrl ||
    null;
  const reports: any[] = directReportUrl
    ? [{ url: directReportUrl, type: "Lab Report", raw: data }]
    : data?.data?.reports || data?.reports || data?.data?.patients?.[0]?.reports || data?.data?.reportDetails || data?.reportDetails || [];
  await sbAdmin.from("thyrocare_reports").delete().eq("order_id", order.id);
  let hasReportUrl = false;
  for (const r of reports) {
    const url = r.url || r.reportUrl || r.pdfUrl || r.downloadUrl || null;
    if (url) hasReportUrl = true;
    await sbAdmin.from("thyrocare_reports").insert({
      order_id: order.id,
      user_id: order.user_id,
      report_url: url,
      report_type: r.type || r.reportType || r.name || "Lab Report",
      parameters: r.parameters || r.tests || null,
      raw_data: r,
    });
  }
  if (hasReportUrl) await syncReportToProfile(order.id);
  return json({ ok: true, count: reports.length, reports });
}

// ---- Router ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    // Public action: sync_catalog can be called by admins only
    const user = await getUser(req);
    if (!user) return json({ error: "unauthenticated" }, 401);

    switch (action) {
      case "get_token": {
        const { data: roles } = await sbAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        if (!roles?.some((r) => r.role === "admin"))
          return json({ error: "admin only" }, 403);
        const t = await getValidToken(true);
        return json({ ok: true, token_preview: t.slice(0, 12) + "..." });
      }
      case "sync_catalog": {
        return await syncCatalog();
      }
      case "serviceability":
        return await serviceability(body);
      case "available_slots":
        return await availableSlots(body);
      case "create_order":
        return await createOrder(body, user.id);
      case "order_status":
        return await orderStatus(body);
      case "fetch_report":
        return await fetchReport(body, user.id);
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    console.error("thyrocare-api error", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
