import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.hyperrevamp.bbdo";
const APNS_ENVIRONMENT = (Deno.env.get("APNS_ENVIRONMENT") ?? "sandbox").toLowerCase();
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "";
const BBDO_PUSH_CHANNEL_ID = "bbdo-alerts-v14";
const BBDO_PUSH_SOUND = "bbdo_chime";
const BBDO_IOS_PUSH_SOUND = "bbdo_chime.wav";

type ApnsAttempt = {
  ok: boolean;
  status: number;
  environment: "sandbox" | "production";
  response: Record<string, unknown> | null;
};

type PushBody = {
  title?: unknown;
  body?: unknown;
  actionUrl?: unknown;
  notificationId?: unknown;
  backendDispatch?: unknown;
  delaySeconds?: unknown;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedJwt: { token: string; exp: number } | null = null;

async function createApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp - 60 > now) return cachedJwt.token;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(APNS_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = base64url(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }));
  const claims = base64url(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }));
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  const token = `${signingInput}.${base64url(signature)}`;
  cachedJwt = { token, exp: now + 45 * 60 };
  return token;
}

function validText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > max) return null;
  return clean;
}

function validUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean) ? clean : null;
}

function validDelaySeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(20, Math.round(value)));
}

function parseApnsResponse(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function apnsHosts(): Array<{ environment: "sandbox" | "production"; host: string }> {
  const production = { environment: "production" as const, host: "api.push.apple.com" };
  const sandbox = { environment: "sandbox" as const, host: "api.sandbox.push.apple.com" };
  return APNS_ENVIRONMENT === "production" ? [production, sandbox] : [sandbox, production];
}

async function sendApnsAttempt(token: string, jwt: string, payload: Record<string, unknown>, target: { environment: "sandbox" | "production"; host: string }): Promise<ApnsAttempt> {
  const res = await fetch(`https://${target.host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, environment: target.environment, response: parseApnsResponse(text) };
}

// ============ FCM v1 (Android) ============
let cachedFcm: { token: string; exp: number; projectId: string } | null = null;

function pemToPkcs8(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getFcmAccessToken(): Promise<{ token: string; projectId: string } | null> {
  if (!FCM_SERVICE_ACCOUNT_JSON) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedFcm && cachedFcm.exp - 60 > now) return { token: cachedFcm.token, projectId: cachedFcm.projectId };

  let sa: any;
  try { sa = JSON.parse(FCM_SERVICE_ACCOUNT_JSON); } catch { return null; }
  if (!sa.private_key || !sa.client_email || !sa.project_id) return null;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error("FCM token exchange failed", data);
    return null;
  }
  cachedFcm = { token: data.access_token, exp: now + (data.expires_in ?? 3600), projectId: sa.project_id };
  return { token: cachedFcm.token, projectId: cachedFcm.projectId };
}

async function sendFcm(deviceToken: string, title: string, body: string, actionUrl: string): Promise<{ ok: boolean; status: number; response: unknown }> {
  const creds = await getFcmAccessToken();
  if (!creds) return { ok: false, status: 0, response: { error: "FCM not configured" } };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${creds.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title, body },
        data: { action_url: actionUrl, type: "app_notification" },
        android: {
          priority: "HIGH",
          notification: {
            sound: BBDO_PUSH_SOUND,
            channel_id: BBDO_PUSH_CHANNEL_ID,
            default_vibrate_timings: true,
            default_light_settings: true,
            notification_priority: "PRIORITY_MAX",
          },
        },
      },
    }),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }
  console.log("FCM send", { projectId: creds.projectId, tokenPrefix: deviceToken.slice(0, 12), status: res.status, ok: res.ok });
  return { ok: res.ok, status: res.status, response: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("diagnose") === "fcm") {
    const creds = await getFcmAccessToken();
    return json(200, { ok: true, fcmConfigured: Boolean(creds), fcmProjectId: creds?.projectId ?? null });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    const raw = (await req.json().catch(() => null)) as PushBody | null;
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return json(401, { ok: false, error: "Missing auth token" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let targetUserId: string;
    let title: string;
    let body: string;
    let actionUrl = "/home?tab=profile";
    const delaySeconds = validDelaySeconds(raw?.delaySeconds);

    if (raw?.backendDispatch === true) {
      let dispatchAuthorized = bearer === ANON_KEY || bearer === SERVICE_ROLE;
      if (!dispatchAuthorized) {
        // Key rotation / format migration safety net: accept any credential of THIS
        // project that can read a service-role-only table (anon/authenticated cannot).
        try {
          const probe = await fetch(
            `${SUPABASE_URL}/rest/v1/user_roles?select=user_id&limit=1`,
            { headers: { apikey: bearer, Authorization: `Bearer ${bearer}` } },
          );
          dispatchAuthorized = probe.ok;
        } catch (_e) {
          dispatchAuthorized = false;
        }
      }
      if (!dispatchAuthorized) {
        return json(401, { ok: false, error: "Invalid backend dispatch token" });
      }
      const notificationId = validUuid(raw.notificationId);
      if (!notificationId) return json(400, { ok: false, error: "Valid notificationId is required" });

      const { data: notification, error: notificationError } = await admin
        .from("notifications")
        .select("id, user_id, title, body, type, action_url, created_at")
        .eq("id", notificationId)
        .maybeSingle();

      if (notificationError) throw notificationError;
      if (!notification) return json(404, { ok: false, error: "Notification not found" });

      const createdAt = Date.parse((notification as any).created_at ?? "");
      if (!Number.isFinite(createdAt) || createdAt < Date.now() - 30 * 60 * 1000) {
        return json(410, { ok: false, error: "Notification dispatch window expired" });
      }

      targetUserId = (notification as any).user_id;
      title = validText((notification as any).title, 120) ?? "BBDO notification";
      body = validText((notification as any).body, 500) ?? "You have a new app notification.";
      actionUrl = typeof (notification as any).action_url === "string" ? (notification as any).action_url.slice(0, 240) : "/home?tab=profile";
    } else {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser(bearer);
      if (userError || !userData.user) return json(401, { ok: false, error: "Invalid auth token" });

      const validatedTitle = validText(raw?.title, 120);
      const validatedBody = validText(raw?.body, 500);
      if (!validatedTitle || !validatedBody) return json(400, { ok: false, error: "Title and body are required" });

      targetUserId = userData.user.id;
      title = validatedTitle;
      body = validatedBody;
      actionUrl = typeof raw?.actionUrl === "string" ? raw.actionUrl.slice(0, 240) : "/home?tab=profile";
    }

    const { data: tokens, error: tokenError } = await admin
      .from("device_push_tokens")
      .select("id, token, platform, updated_at")
      .eq("user_id", targetUserId)
      .in("platform", ["ios", "android"])
      .order("updated_at", { ascending: false });

    if (tokenError) throw tokenError;
    if (!tokens?.length) return json(200, { ok: true, sent: 0, note: "No device token registered" });

    // One logged-in phone can leave multiple historical APNs/FCM tokens behind
    // after reinstalls or upgrades. Sending all accepted historical tokens causes
    // duplicate native banners. Keep only the latest row per platform, and also
    // de-dupe identical token strings defensively.
    const latestByPlatform = new Map<string, { id: string; token: string; platform: string; updated_at?: string }>();
    const seenTokenStrings = new Set<string>();
    for (const row of tokens as Array<{ id: string; token: string; platform: string; updated_at?: string }>) {
      if (seenTokenStrings.has(row.token)) continue;
      seenTokenStrings.add(row.token);
      if (!latestByPlatform.has(row.platform)) latestByPlatform.set(row.platform, row);
    }

    const activeTokens = Array.from(latestByPlatform.values());
    const staleTokenIds = (tokens as Array<{ id: string; token: string; platform: string }>).filter(
      (row) => !activeTokens.some((active) => active.id === row.id),
    ).map((row) => row.id);
    if (staleTokenIds.length > 0) {
      await admin.from("device_push_tokens").delete().in("id", staleTokenIds);
    }

    const iosTokens = activeTokens.filter((t) => t.platform === "ios");
    const androidTokens = activeTokens.filter((t) => t.platform === "android");

    if (delaySeconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }

    const apnsConfigured = Boolean(APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY);
    const jwt = iosTokens.length && apnsConfigured ? await createApnsJwt() : "";
    const hosts = apnsHosts();
    // APNs normal alerts must use a plain sound string. The previous dictionary
    // form is only reliable for critical-alert entitlement payloads and can be
    // accepted by APNs while iOS still delivers the banner silently.
    const apnsPayload = {
      aps: {
        alert: { title, body },
        sound: BBDO_IOS_PUSH_SOUND,
        badge: 1,
        "interruption-level": "time-sensitive",
        "relevance-score": 1,
        "mutable-content": 1,
      },
      action_url: actionUrl,
      type: "app_notification",
    };

    const iosResults = await Promise.all((apnsConfigured ? iosTokens : []).map(async (row) => {
      const attempts: ApnsAttempt[] = [];
      const first = await sendApnsAttempt(row.token, jwt, apnsPayload, hosts[0]);
      attempts.push(first);

      const firstReason = typeof first.response?.reason === "string" ? first.response.reason : "";
      if (!first.ok && firstReason === "BadDeviceToken") {
        attempts.push(await sendApnsAttempt(row.token, jwt, apnsPayload, hosts[1]));
      }

      const success = attempts.find((attempt) => attempt.ok);
      const last = attempts[attempts.length - 1];
      const lastReason = typeof last.response?.reason === "string" ? last.response.reason : "";
      if (!success && (last.status === 410 || lastReason === "Unregistered" || (lastReason === "BadDeviceToken" && attempts.length > 1))) {
        await admin.from("device_push_tokens").delete().eq("id", row.id);
      }
      console.log("APNs push attempt", { ok: Boolean(success), attempts: attempts.map((a) => ({ status: a.status, environment: a.environment, reason: a.response?.reason ?? null })) });
      return { platform: "ios", ok: Boolean(success), status: success?.status ?? last.status, environment: success?.environment ?? last.environment, response: success?.response ?? last.response, attempts };
    }));

    const androidResults = await Promise.all(androidTokens.map(async (row) => {
      const result = await sendFcm(row.token, title, body, actionUrl);
      const resp = result.response as any;
      const errStatus = resp?.error?.status ?? resp?.error?.details?.[0]?.errorCode ?? "";
      if (!result.ok && (result.status === 404 || errStatus === "UNREGISTERED" || errStatus === "INVALID_ARGUMENT" || errStatus === "NOT_FOUND")) {
        await admin.from("device_push_tokens").delete().eq("id", row.id);
      }
      console.log("FCM push attempt", { ok: result.ok, status: result.status, error: resp?.error ?? null });
      return { platform: "android", ok: result.ok, status: result.status, response: result.response };
    }));

    const results = [...iosResults, ...androidResults];
    const senderMismatch = androidResults.some((r) => {
      const resp = r.response as any;
      return resp?.error?.status === "PERMISSION_DENIED"
        || resp?.error?.message === "SenderId mismatch"
        || resp?.error?.details?.some?.((d: any) => d?.errorCode === "SENDER_ID_MISMATCH");
    });

    return json(200, {
      ok: results.some((r) => r.ok),
      sent: results.filter((r) => r.ok).length,
      attempted: results.length,
      environment: APNS_ENVIRONMENT,
      note: senderMismatch ? "Android push credentials mismatch. Update the backend FCM service account to match the Android app Firebase file, then reinstall/register once." : undefined,
      results,
    });
  } catch (error) {
    console.error("send-health-push error", error);
    return json(500, { ok: false, error: (error as Error).message });
  }
});
