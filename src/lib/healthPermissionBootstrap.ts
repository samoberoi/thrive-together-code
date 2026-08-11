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
import { logStartupEvent, reportStartupError } from "@/lib/startupDiagnostics";

const ASKED_KEY = "bbdo:health_permission_asked";

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

/**
 * Prompt for health access once per user/device. Safe to call on every login.
 * `force` re-opens the sheet for an explicit user action.
 */
export async function ensureNativeHealthPermission(
  userId: string,
  opts?: { force?: boolean },
): Promise<boolean> {
  if (!canUseNativeHealth()) return false;
  if (!opts?.force && hasAskedHealthPermission(userId)) {
    // Already prompted before — just keep data flowing silently.
    void enableHealthBackgroundSync();
    void syncTodaySteps().catch(() => {});
    return true;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const state = await getNativeHealthPermissionState();
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
        void syncTodaySteps().catch(() => {});
        window.dispatchEvent(new CustomEvent("health-permission-granted"));
      }
      return result.authorized;
    } catch (error) {
      reportStartupError("health permission bootstrap failed", error);
      markAsked(userId);
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
