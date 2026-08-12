/**
 * One-time native health permission bootstrap.
 *
 * Runs right after a user signs in (any role — patient, coach, admin) so the
 * OS health sheet (Apple Health / Health Connect) is presented automatically,
 * exactly like push notifications. No manual "Allow health" button needed.
 */
import {
  canUseNativeHealth,
  getNativeHealthPermissionState,
  requestNativeHealthAuthorization,
  enableHealthBackgroundSync,
  syncTodaySteps,
} from "@/lib/healthProvider";
import { logTodaySteps } from "@/lib/movementUserService";
import { logStartupEvent, reportStartupError } from "@/lib/startupDiagnostics";

// v2 deliberately invalidates the old marker. The previous flow wrote its
// marker even when Android failed to display Health Connect because another
// permission activity (usually push) was still open.
const ASKED_KEY = "bbdo:health_permission_asked_v2";

function askedKey(userId: string) {
  return `${ASKED_KEY}:${userId}`;
}

export function hasAskedHealthPermission(userId: string) {
  try {
    return localStorage.getItem(askedKey(userId)) === "1";
  } catch {
    return false;
  }
}

function markAsked(userId: string) {
  try {
    localStorage.setItem(askedKey(userId), "1");
  } catch {
    /* ignore */
  }
}

let inFlight: Promise<boolean> | null = null;

async function syncAndPersistSteps(userId: string) {
  const steps = await syncTodaySteps({ allowPrompt: false });
  if (steps == null) return false;
  await logTodaySteps(userId, steps);
  window.dispatchEvent(new CustomEvent("health-log-saved"));
  return true;
}

/**
 * Prompt for health access once per user/device. Safe to call on every login.
 * `force` re-opens the sheet for an explicit user action.
 */
export async function ensureNativeHealthPermission(
  userId: string,
  opts?: { force?: boolean; allowPrompt?: boolean },
): Promise<boolean> {
  if (!canUseNativeHealth()) return false;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const state = await getNativeHealthPermissionState();
      if (state.authorized) {
        markAsked(userId);
        void enableHealthBackgroundSync();
        void syncAndPersistSteps(userId).catch(() => {});
        return true;
      }
      if (!opts?.force && hasAskedHealthPermission(userId)) {
        // A real denial is respected. Crucially, merely having an old marker is
        // no longer treated as proof that health access is authorized.
        return false;
      }
      // Android Health Connect is backed by a separate permission Activity.
      // Never launch that Activity as a side effect of app startup: doing so
      // while the dashboard and notification setup are mounting can destroy
      // the WebView task on resume. The health card's explicit Allow action
      // calls this function with force=true and remains the only prompt path.
      if (opts?.allowPrompt === false && !opts?.force) {
        return false;
      }
      if (!state.authorized && !state.canRequest && !opts?.force) {
        markAsked(userId);
        return false;
      }
      logStartupEvent("health permission bootstrap requested");
      const result = await requestNativeHealthAuthorization();
      markAsked(userId);
      logStartupEvent(
        "health permission bootstrap result",
        result.authorized ? "granted" : "denied",
      );
      if (result.authorized) {
        void enableHealthBackgroundSync();
        void syncAndPersistSteps(userId).catch(() => {});
        window.dispatchEvent(new CustomEvent("health-permission-granted"));
      }
      return result.authorized;
    } catch (error) {
      reportStartupError("health permission bootstrap failed", error);
      // Do not poison future launches when Android failed before showing the
      // permission activity. Only a completed permission result is marked.
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
