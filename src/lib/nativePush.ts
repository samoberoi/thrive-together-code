/**
 * Native push registration for iOS (APNs) and Android (FCM).
 *
 * Web/PWA push is handled elsewhere via the Web Push subscription flow — this
 * module only runs on Capacitor native. It requests permission, registers
 * with the OS push service, and upserts the device token into
 * `device_push_tokens` so a server-side sender can target it later.
 *
 * The server-side APNs sender reads this token from `device_push_tokens`.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const APP_VERSION = (globalThis as any).__APP_VERSION__ ?? "1.0.0";
export const BBDO_PUSH_CHANNEL_ID = "bbdo-alerts-v13";
const ANDROID_FIREBASE_GENERATION = "com.hyperrevamp.bbdo:bbdoapp:73939371932:v4";
const ANDROID_TOKEN_RESET_KEY = `bbdo_fcm_token_reset_${ANDROID_FIREBASE_GENERATION}`;

const BBDONotifications = registerPlugin<{
  refreshAuthorization: () => Promise<{
    authorizationStatus: number;
    soundSetting: number;
    alertSetting: number;
    timeSensitiveSetting?: number;
  }>;
}>("BBDONotifications");

const BBDOAndroidPush = registerPlugin<{
  getToken: () => Promise<{ token?: string }>;
  refreshToken: () => Promise<{ token?: string }>;
}>("BBDOAndroidPush");

let registered = false;
let registeringListeners = false;
let activeUserId: string | null = null;
let lastRegistrationToken: string | null = null;
let tokenWaiters: Array<(token: string) => void> = [];
let lastAttemptAt = 0;

export function isNativePushSupported(): boolean {
  // Both iOS (APNs) and Android (FCM via google-services.json) are wired up.
  return Capacitor.isNativePlatform();
}

export function currentPlatform(): "ios" | "android" | "web" {
  const p = Capacitor.getPlatform();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  return "web";
}

async function upsertToken(userId: string, token: string) {
  const platform = currentPlatform();
  const { error } = await (supabase as any)
    .from("device_push_tokens")
    .upsert(
      {
        user_id: userId,
        token,
        platform,
        app_version: APP_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" },
    );
  if (error) {
    console.warn("[push] token upsert failed", {
      code: (error as any)?.code,
      message: (error as any)?.message,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
      platform,
    });
    throw error;
  }

  // Prevent duplicate native banners caused by old tokens remaining valid after
  // app reinstalls/upgrades. Keep the newest token per user per OS.
  await (supabase as any)
    .from("device_push_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform)
    .neq("token", token);
}

async function fetchStoredToken(userId: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("device_push_tokens")
    .select("token")
    .eq("user_id", userId)
    .eq("platform", currentPlatform())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[push] failed to read stored token", error);
    return null;
  }
  return (data as any)?.token ?? null;
}

function waitForToken(timeoutMs = 8_000): Promise<string | null> {
  if (lastRegistrationToken) return Promise.resolve(lastRegistrationToken);

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      tokenWaiters = tokenWaiters.filter((waiter) => waiter !== done);
      resolve(null);
    }, timeoutMs);

    const done = (token: string) => {
      window.clearTimeout(timer);
      resolve(token);
    };

    tokenWaiters.push(done);
  });
}

function resolveTokenWaiters(token: string) {
  const waiters = tokenWaiters;
  tokenWaiters = [];
  waiters.forEach((resolve) => resolve(token));
}

async function refreshIosNotificationAuthorization() {
  if (currentPlatform() !== "ios") return;
  try {
    const settings = await BBDONotifications.refreshAuthorization();
    console.log("[push] iOS notification authorization:", settings);
  } catch (err) {
    console.warn("[push] iOS notification authorization refresh failed", err);
  }
}

async function getAndroidFcmTokenFallback(): Promise<string | null> {
  if (currentPlatform() !== "android") return null;
  try {
    const result = await BBDOAndroidPush.getToken();
    const token = typeof result?.token === "string" ? result.token.trim() : "";
    return token || null;
  } catch (err) {
    console.warn("[push] android direct FCM token fallback failed", err);
    return null;
  }
}

async function refreshAndroidFcmToken(): Promise<string | null> {
  if (currentPlatform() !== "android") return null;
  try {
    const result = await BBDOAndroidPush.refreshToken();
    const token = typeof result?.token === "string" ? result.token.trim() : "";
    return token || null;
  } catch (err) {
    console.warn("[push] android FCM token refresh failed", err);
    return null;
  }
}

async function resetAndroidFcmTokenAfterChannelUpgrade() {
  if (currentPlatform() !== "android") return;
  if (localStorage.getItem(ANDROID_TOKEN_RESET_KEY) === "1") return;

  try {
    localStorage.removeItem("bbdo_fcm_token_reset_bbdo-alerts-v7");
    localStorage.removeItem("bbdo_fcm_token_reset_com.hyperrevamp.bbdo:bbdoapp:73939371932:v2");
    localStorage.removeItem("bbdo_fcm_token_reset_com.hyperrevamp.bbdo:bbdoapp:73939371932:v3");
    // Do not unregister/delete the server token here. Channel sound changes are
    // independent of FCM tokens, and unregistering during app resume can leave
    // Android with no usable token if the replacement registration event is
    // delayed by Play Services. Stale rows are removed only after a new token is
    // successfully upserted, or by the sender when FCM returns UNREGISTERED.
  } catch (err) {
    console.warn("[push] android token reset skipped", err);
  } finally {
    localStorage.setItem(ANDROID_TOKEN_RESET_KEY, "1");
  }
}

async function attachPushListenersOnce() {
  if (registered || registeringListeners) return;
  registeringListeners = true;
  try {
    await PushNotifications.addListener("registration", async (t) => {
      try {
        lastRegistrationToken = t.value;
        resolveTokenWaiters(t.value);
        const uid = activeUserId;
        if (!uid) throw new Error("No active user for push token");
        await upsertToken(uid, t.value);
        // eslint-disable-next-line no-console
        console.log("[push] token registered:", t.value.slice(0, 12) + "…");
      } catch (err) {
        console.warn("[push] failed to store token", err);
      }
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] registration error", err);
    });

    await PushNotifications.addListener(
      "pushNotificationReceived",
      (n) => {
        console.log("[push] received in-app:", n);
        if (currentPlatform() !== "android") return;

        // FCM does not display its notification payload while Android has the
        // app in the foreground. Mirror it through LocalNotifications so a
        // visible banner and the configured Hummingbird sound are still shown.
        const title = typeof n.title === "string" && n.title.trim()
          ? n.title.trim()
          : "BBDO notification";
        const body = typeof n.body === "string" && n.body.trim()
          ? n.body.trim()
          : "You have a new notification.";
        void LocalNotifications.schedule({
          notifications: [{
            id: Math.floor(Date.now() % 2_147_000_000),
            title,
            body,
            sound: "bbdo_chime.wav",
            channelId: BBDO_PUSH_CHANNEL_ID,
            schedule: { at: new Date(Date.now() + 250) },
            autoCancel: true,
            extra: n.data ?? {},
          }],
        }).catch((err) => console.warn("[push] foreground notification failed", err));
      },
    );

    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (a) => {
        console.log("[push] tapped:", a);
      },
    );

    registered = true;
  } finally {
    registeringListeners = false;
  }
}

const PUSH_PROMPT_ASKED_KEY = "bbdo_push_prompt_asked";

function hasAskedPushPermission(): boolean {
  try {
    return localStorage.getItem(PUSH_PROMPT_ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

function markPushPromptAsked() {
  try {
    localStorage.setItem(PUSH_PROMPT_ASKED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Call once after the user is signed in. Safe to call again — listeners are
 * only attached the first time; permission is re-checked without prompting
 * if already granted.
 *
 * IMPORTANT (Android): the OS permission sheet steals window focus, which fires
 * `appStateChange` again. Re-prompting on every resume created a prompt →
 * resume → prompt loop that made the status bar / system UI flicker. So we ask
 * at most once per install unless the user explicitly taps "Enable notifications"
 * (`interactive: true`).
 */
export async function registerNativePush(
  userId: string,
  opts: { interactive?: boolean; allowPrompt?: boolean } = {},
): Promise<{ ok: true; token?: string } | { ok: false; reason: string }> {
  if (!isNativePushSupported()) {
    return { ok: false, reason: "not_native" };
  }

  try {
    activeUserId = userId;
    const now = Date.now();
    if (now - lastAttemptAt < 5_000) {
      const token = lastRegistrationToken ?? (await fetchStoredToken(userId));
      return { ok: true, token: token ?? undefined };
    }
    lastAttemptAt = now;

    const storedTokenBeforeRegistration = await fetchStoredToken(userId);

    await attachPushListenersOnce();

    let perm = await PushNotifications.checkPermissions();
    const canPrompt = perm.receive === "prompt" || perm.receive === "prompt-with-rationale";
    if (
      canPrompt &&
      opts.allowPrompt !== false &&
      (opts.interactive || !hasAskedPushPermission())
    ) {
      markPushPromptAsked();
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      return { ok: false, reason: "permission_denied" };
    }

    await refreshIosNotificationAuthorization();

    // Same iOS permission family. Only ever request when the push permission is
    // already granted (above) — never as a second prompt after a denial.
    try {
      let localPerm = await LocalNotifications.checkPermissions();
      if (
        (localPerm.display === "prompt" || localPerm.display === "prompt-with-rationale") &&
        (opts.interactive || !hasAskedPushPermission())
      ) {
        markPushPromptAsked();
        localPerm = await LocalNotifications.requestPermissions();
      }
    } catch (err) {
      console.warn("[push] local alert permission setup failed", err);
    }


    // Android channels are immutable after first creation. This channel uses
    // only the bundled Hummingbird file. Native pushes must never also trigger
    // WebAudio, otherwise users hear a second synthesized sound.
    if (currentPlatform() === "android") {
      try {
        await resetAndroidFcmTokenAfterChannelUpgrade();
        const channel = {
          id: BBDO_PUSH_CHANNEL_ID,
          name: "BBDO notifications",
          description: "Reminders, coach messages, and health nudges",
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
          sound: "bbdo_chime.wav",
        } as const;
        await PushNotifications.createChannel(channel);
        await LocalNotifications.createChannel(channel);
      } catch (err) {
        console.warn("[push] android channel setup failed", err);
      }
    }

    await PushNotifications.register();
    const registrationToken = await waitForToken(12_000);
    const androidFallbackToken = registrationToken
      ? null
      : storedTokenBeforeRegistration
        ? await getAndroidFcmTokenFallback()
        : await refreshAndroidFcmToken();
    const resolvedToken = registrationToken ?? androidFallbackToken;
    if (resolvedToken) {
      lastRegistrationToken = resolvedToken;
      await upsertToken(userId, resolvedToken);
    }
    const token = resolvedToken ?? (await fetchStoredToken(userId));
    return { ok: true, token: token ?? undefined };
  } catch (err: any) {
    console.warn("[push] setup failed", err);
    return { ok: false, reason: err?.message ?? "setup_failed" };
  }
}

/** UI wrapper: registers and toasts the outcome. */
export async function registerNativePushWithToast(userId: string) {
  if (!isNativePushSupported()) {
    toast.info("Push notifications require the native mobile app.");
    return;
  }
  const res = await registerNativePush(userId, { interactive: true, allowPrompt: true });
  if (res.ok === true) {
    if (res.token) {
      toast.success("Push notifications enabled for this phone");
    } else {
      toast.warning("Permission is on, but the phone token has not arrived yet. Try again in a few seconds.");
    }
    return;
  }
  if (res.reason === "permission_denied") {
    toast.error("Permission denied — enable notifications in phone settings.");
    return;
  }
  toast.error(`Push setup failed: ${res.reason}`);
}
