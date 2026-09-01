/**
 * Unified health provider — routes to Apple Health on iOS and Health Connect on Android.
 * Same API surface as the original appleHealth.ts, so UI components can call one thing.
 */
import { Capacitor } from "@capacitor/core";
import type { HealthSnapshot, EcgReading } from "@/lib/appleHealth";
import {
  canUseAppleHealthSteps,
  syncTodayStepsFromAppleHealth,
  fetchAppleHealthSnapshot,
  fetchLatestEcgFromAppleHealth,
  writeWeightToAppleHealth,
  enableAppleHealthBackgroundSync,
  onAppleHealthDataChanged,
  requestAppleHealthAuthorization,
} from "@/lib/appleHealth";
import {
  canUseHealthConnect,
  syncTodayStepsFromHealthConnect,
  fetchHealthConnectSnapshot,
  writeWeightToHealthConnect,
  getHealthConnectPermissionState,
  requestHealthConnectAuthorization,
  openHealthConnectSettings,
} from "@/lib/healthConnect";

export type { HealthSnapshot, EcgReading };

export async function fetchLatestEcg(): Promise<EcgReading | null> {
  if (isIOS()) return fetchLatestEcgFromAppleHealth();
  return null;
}

export function canReadEcg(): boolean {
  return isIOS();
}

export type NativeHealthPermissionState = {
  authorized: boolean;
  canRequest: boolean;
  message: string;
};

const isIOS = () => Capacitor.getPlatform() === "ios";
const isAndroid = () => Capacitor.getPlatform() === "android";

export function canUseNativeHealth(): boolean {
  return canUseAppleHealthSteps() || canUseHealthConnect();
}

/** Alias kept for legacy callers that still check "Apple Health steps". */
export const canUseHealthSteps = canUseNativeHealth;

const STEPS_SOURCE_KEY = "bbdo:health_steps_connected";

/** True when the device's health app is actually delivering step data. */
export function isHealthStepsConnected(): boolean {
  if (!canUseNativeHealth()) return false;
  try {
    return localStorage.getItem(STEPS_SOURCE_KEY) === "1";
  } catch {
    return false;
  }
}

function setHealthStepsConnected(connected: boolean) {
  try {
    localStorage.setItem(STEPS_SOURCE_KEY, connected ? "1" : "0");
  } catch {}
}

let stepsSyncInFlight: Promise<number | null> | null = null;

/**
 * Sync today's steps from the device health store.
 * `allowPrompt` must only be true for an explicit user action (tapping sync);
 * automatic syncs never open the OS permission screen, which would steal focus
 * and make the system UI flicker.
 */
export async function syncTodaySteps(opts?: { allowPrompt?: boolean }): Promise<number | null> {
  if (stepsSyncInFlight) return stepsSyncInFlight;
  const allowPrompt = opts?.allowPrompt ?? false;
  const run = (async () => {
    let steps: number | null = null;
    try {
      if (isIOS()) steps = await syncTodayStepsFromAppleHealth();
      else if (isAndroid()) steps = await syncTodayStepsFromHealthConnect({ allowPrompt });
    } catch (e) {
      setHealthStepsConnected(false);
      throw e;
    }
    setHealthStepsConnected(steps != null);
    return steps;
  })();
  stepsSyncInFlight = run.finally(() => { stepsSyncInFlight = null; });
  return stepsSyncInFlight;
}

export async function fetchHealthSnapshot(): Promise<HealthSnapshot | null> {
  if (isIOS()) return fetchAppleHealthSnapshot();
  if (isAndroid()) return fetchHealthConnectSnapshot();
  return null;
}

export async function writeWeight(kg: number, at?: Date): Promise<boolean> {
  if (isIOS()) return writeWeightToAppleHealth(kg, at);
  if (isAndroid()) return writeWeightToHealthConnect(kg, at);
  return false;
}

export async function getNativeHealthPermissionState(): Promise<NativeHealthPermissionState> {
  if (isAndroid()) return getHealthConnectPermissionState();
  if (isIOS()) {
    return {
      authorized: false,
      canRequest: true,
      message: "Allow Apple Health permissions to sync your vitals.",
    };
  }
  return {
    authorized: false,
    canRequest: false,
    message: "Open the installed mobile app to sync health data.",
  };
}

export async function requestNativeHealthAuthorization(): Promise<NativeHealthPermissionState> {
  if (isAndroid()) return requestHealthConnectAuthorization();
  if (isIOS()) {
    // Ask HealthKit directly. Never infer authorization from a step query —
    // an empty day would look like a denial and silently kill the sync.
    const granted = await requestAppleHealthAuthorization();
    return {
      authorized: granted,
      canRequest: !granted,
      message: granted
        ? "Apple Health is connected."
        : "Apple Health permission was not granted.",
    };
  }
  return getNativeHealthPermissionState();
}

export async function openNativeHealthSettings(): Promise<void> {
  if (isAndroid()) await openHealthConnectSettings();
}

export async function enableHealthBackgroundSync(): Promise<boolean> {
  if (isIOS()) return enableAppleHealthBackgroundSync();
  // Health Connect doesn't expose background delivery to third-party apps.
  return false;
}

export async function onHealthDataChanged(cb: () => void): Promise<() => void> {
  if (isIOS()) return onAppleHealthDataChanged(cb);
  return () => {};
}
