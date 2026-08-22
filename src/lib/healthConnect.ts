import { Capacitor } from "@capacitor/core";
import { Health, type HealthDataType, type HealthSample } from "@capgo/capacitor-health";
import type { HealthSnapshot } from "@/lib/appleHealth";
import { logStartupEvent, reportStartupError } from "@/lib/startupDiagnostics";
import {
  clipRecordsToRange,
  originOf,
  startOfLocalDay,
  sumField as sum,
  sumStepsDeduped,
  sanitizeDailySteps,
} from "@/lib/healthStepsMath";

/** True on native Android where Health Connect can (potentially) run. */
export function canUseHealthConnect() {
  return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform();
}

const READ_TYPES: HealthDataType[] = [
  "steps", "calories", "heartRate", "restingHeartRate", "weight", "bloodGlucose",
];

const STEPS_READ_OPTIONS = {
  read: ["steps"] as HealthDataType[],
  write: [] as HealthDataType[],
};

type HealthConnectPermissionState = {
  availability: "Available" | "NotInstalled" | "NotSupported" | "Unknown";
  authorized: boolean;
  canRequest: boolean;
  message: string;
};

const readOptions = { read: READ_TYPES, write: [] as HealthDataType[] };

let permissionTransitionActive = false;
let lastKnownStepsAuthorized = false;

function transitionState(): HealthConnectPermissionState {
  return {
    availability: "Available",
    authorized: lastKnownStepsAuthorized,
    canRequest: !lastKnownStepsAuthorized,
    message: lastKnownStepsAuthorized
      ? "Health Connect is connected."
      : "Complete the Health Connect permission screen.",
  };
}

function mapAvailability(available: boolean, reason?: string): HealthConnectPermissionState["availability"] {
  if (available) return "Available";
  return /install|provider|update/i.test(reason ?? "") ? "NotInstalled" : "NotSupported";
}

function isReadAuthorized(readAuthorized: HealthDataType[] | undefined, type: HealthDataType) {
  return readAuthorized?.includes(type) ?? false;
}

export async function getHealthConnectPermissionState(): Promise<HealthConnectPermissionState> {
  if (!canUseHealthConnect()) {
    return {
      availability: "Unknown",
      authorized: false,
      canRequest: false,
      message: "Open the installed Android app to connect Health Connect.",
    };
  }

  // Android emits app-resume and visibility events while the native permission
  // result is still being delivered. Never make a second plugin call in that
  // hand-off window.
  if (permissionTransitionActive) return transitionState();

  try {
    const status = await Health.isAvailable();
    const availability = mapAvailability(status.available, status.reason);
    if (availability === "NotInstalled") {
      return {
        availability,
        authorized: false,
        canRequest: true,
        message: "Install or update Health Connect, then allow permissions.",
      };
    }
    if (availability === "NotSupported") {
      return {
        availability,
        authorized: false,
        canRequest: false,
        message: "Health Connect is not supported on this Android device.",
      };
    }

    // Startup permission state is intentionally Steps-only. Requiring every
    // optional vital here made a granted Steps permission look unauthorized.
    const perms = await Health.checkAuthorization(STEPS_READ_OPTIONS);
    const authorized = isReadAuthorized(perms.readAuthorized, "steps");
    lastKnownStepsAuthorized = authorized;
    return {
      availability,
      authorized,
      canRequest: !authorized,
      message: authorized
        ? "Health Connect is connected."
        : "Allow Health Connect permissions to sync your Android vitals.",
    };
  } catch (e) {
    reportStartupError("health-connect permission check failed", e);
    return {
      availability: "Unknown",
      authorized: false,
      canRequest: true,
      message: "Health Connect permissions could not be checked. Tap Allow and try again.",
    };
  }
}

export async function requestHealthConnectAuthorization(): Promise<HealthConnectPermissionState> {
  if (!canUseHealthConnect()) return getHealthConnectPermissionState();
  if (permissionTransitionActive) return transitionState();

  permissionTransitionActive = true;
  document.documentElement.classList.add("bb-native-permission-flow");
  window.dispatchEvent(new CustomEvent("bbdo:native-permissions-started"));
  try {
    const status = await Health.isAvailable();
    const availability = mapAvailability(status.available, status.reason);
    if (!status.available) {
      return {
        availability,
        authorized: false,
        canRequest: availability === "NotInstalled",
        message: availability === "NotInstalled"
          ? "Install or update Health Connect, then allow permissions."
          : "Health Connect is not supported on this Android device.",
      };
    }

    logStartupEvent("health-connect authorization requested");
    const result = await Health.requestAuthorization(STEPS_READ_OPTIONS);
    const authorized = isReadAuthorized(result.readAuthorized, "steps");
    lastKnownStepsAuthorized = authorized;
    logStartupEvent("health-connect authorization result", authorized ? "granted" : "denied");

    if (authorized) {
      return {
        availability: "Available",
        authorized: true,
        canRequest: false,
        message: "Health Connect is connected.",
      };
    }

    return {
      availability,
      authorized: false,
      canRequest: true,
      message: "Health Connect permission was not granted. Tap Allow and enable the requested data types.",
    };
  } catch (e) {
    reportStartupError("health-connect permission request failed", e);
    return {
      availability: "Unknown",
      authorized: false,
      canRequest: true,
      message: "Health Connect permission request was cancelled or failed. Tap Allow and try again.",
    };
  } finally {
    // Let Capacitor finish restoring the WebView and dispatching appStateChange
    // before dashboard cards are allowed to query Health Connect.
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    permissionTransitionActive = false;
    document.documentElement.classList.remove("bb-native-permission-flow");
    window.dispatchEvent(new CustomEvent("bbdo:native-permissions-settled"));
  }
}

async function ensureAvailableAndAuthorized(): Promise<boolean> {
  const state = await getHealthConnectPermissionState();
  if (state.authorized) return true;
  // Snapshot reads run on dashboard mount, app resume, and a timer. They must
  // never launch Health Connect's permission Activity implicitly. Permission
  // requests are restricted to requestHealthConnectAuthorization(), which is
  // called by the visible Connect/Allow control after a deliberate user tap.
  logStartupEvent("health-connect read skipped", state.availability);
  return false;
}

function startOfToday() { return startOfLocalDay(); }
function endOfToday()   { return new Date(); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

async function aggregate(type: HealthDataType, start: Date, end: Date): Promise<HealthSample[] | null> {
  try {
    const res = await Health.readSamples({
      dataType: type,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 5000,
      ascending: true,
    });
    return res.samples ?? [];
  } catch (e) {
    console.warn(`health-connect readRecords ${type} failed`, e);
    return null;
  }
}



function last<T = any>(records: any[] | null): T | undefined {
  if (!records || records.length === 0) return undefined;
  return records[records.length - 1] as T;
}

/** Read Steps only — never blocked by other data types being un-granted. */
async function ensureStepsPermission(allowPrompt = true): Promise<void> {
  if (permissionTransitionActive) throw new Error("Health Connect permission is still being applied.");
  const status = await Health.isAvailable();
  const availability = mapAvailability(status.available, status.reason);
  if (availability === "NotSupported") {
    throw new Error("Health Connect is not supported on this Android device.");
  }
  if (availability === "NotInstalled") {
    throw new Error("Install or update Health Connect, then allow step permissions.");
  }
  const perms = await Health.checkAuthorization(STEPS_READ_OPTIONS);
  if (isReadAuthorized(perms.readAuthorized, "steps")) return;
  if (!allowPrompt) {
    // Never open the system permission screen from a background/auto sync —
    // it steals window focus and causes the status bar to flicker in a loop.
    throw new Error("Allow the Steps permission in Health Connect to sync your steps.");
  }
  const requested = await requestHealthConnectAuthorization();
  if (!requested.authorized) {
    throw new Error("Allow the Steps permission in Health Connect to sync your steps.");
  }
}

async function readAllSteps(start: Date, end: Date): Promise<any[]> {
  const result = await Health.readSamples({
    dataType: "steps",
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    limit: 10000,
    ascending: true,
  });
  return (result.samples ?? []).map((sample) => ({
    count: sample.value,
    startTime: sample.startDate,
    endTime: sample.endDate,
    metadata: { dataOrigin: sample.sourceId ?? sample.sourceName ?? "unknown" },
  }));
}


export type StepsSyncDiagnostics = {
  rawRecords: number;
  usedRecords: number;
  origins: Record<string, number>;
  windowStart: string;
  windowEnd: string;
  widened: boolean;
};

let lastDiagnostics: StepsSyncDiagnostics | null = null;
export function getLastStepsDiagnostics() {
  return lastDiagnostics;
}

/**
 * Health Connect enforces a per-app read quota. Hammering it (mount + resume +
 * visibility + timer + snapshot card) trips "rate limited request quota".
 * That is never a user-facing failure: we simply reuse the last good reading.
 */
export function isHealthRateLimited(e: any): boolean {
  const msg = String(e?.message ?? e ?? "");
  return /rate limit|quota has been exceeded|rate.?limited/i.test(msg);
}

const STEPS_MIN_INTERVAL_MS = 90_000;
let lastStepsValue: number | null = null;
let lastStepsAt = 0;
let rateLimitedUntil = 0;

export async function syncTodayStepsFromHealthConnect(
  opts?: { allowPrompt?: boolean },
): Promise<number | null> {
  const now = Date.now();
  const fresh = lastStepsValue != null && now - lastStepsAt < STEPS_MIN_INTERVAL_MS;
  const backingOff = now < rateLimitedUntil;
  if (!opts?.allowPrompt && (fresh || backingOff) && lastStepsValue != null) {
    return lastStepsValue;
  }

  try {
    const value = await readTodayStepsFromHealthConnect(opts);
    lastStepsValue = value;
    lastStepsAt = Date.now();
    rateLimitedUntil = 0;
    return value;
  } catch (e) {
    if (isHealthRateLimited(e)) {
      // Back off for 5 minutes and keep showing the last good number.
      rateLimitedUntil = Date.now() + 5 * 60_000;
      if (lastStepsValue != null) return lastStepsValue;
    }
    throw e;
  }
}

async function readTodayStepsFromHealthConnect(
  opts?: { allowPrompt?: boolean },
): Promise<number | null> {
  await ensureStepsPermission(opts?.allowPrompt ?? false);

  const start = startOfToday();
  const end = new Date();

  // Health Connect's "between" filter only returns records whose *start* falls
  // inside the window, so a watch bridge that writes one long record spanning
  // midnight (or back-fills with a shifted offset) is invisible to a strict
  // midnight->now read. Always read a wider window and clip to today ourselves.
  const raw = await readAllSteps(daysAgo(2), end);
  const widened = true;

  const scoped = clipRecordsToRange(raw, start, end);

  const perOrigin: Record<string, number> = {};
  for (const r of scoped) {
    const k = originOf(r);
    perOrigin[k] = (perOrigin[k] ?? 0) + Number(r?.count ?? 0);
  }

  lastDiagnostics = {
    rawRecords: raw.length,
    usedRecords: scoped.length,
    origins: perOrigin,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    widened,
  };

  if (raw.length === 0) {
    throw new Error(
      "Health Connect has no step records yet. Open your watch/health app, sync it, and make sure it's allowed to write Steps to Health Connect.",
    );
  }


  const deduped = sumStepsDeduped(scoped) ?? 0;
  if (deduped > 0) return sanitizeDailySteps(deduped);
  // Fallback: some providers write records without usable dataOrigin metadata.
  const total = sum(scoped, "count") ?? 0;
  if (total > 0) return sanitizeDailySteps(total);

  // Records exist, but none overlap today — genuinely 0 steps so far today.
  return 0;

}



const SNAPSHOT_MIN_INTERVAL_MS = 2 * 60_000;
let lastSnapshot: HealthSnapshot | null = null;
let lastSnapshotAt = 0;

export async function fetchHealthConnectSnapshot(): Promise<HealthSnapshot | null> {
  if (lastSnapshot && Date.now() - lastSnapshotAt < SNAPSHOT_MIN_INTERVAL_MS) {
    return lastSnapshot;
  }
  const ok = await ensureAvailableAndAuthorized();
  if (!ok) return null;



  const [todaySteps, active, hr, restingHr, weight, glucose] =
    await Promise.all([
      syncTodayStepsFromHealthConnect(),
      aggregate("calories", startOfToday(), endOfToday()),
      aggregate("heartRate", daysAgo(1), endOfToday()),
      aggregate("restingHeartRate", daysAgo(7), endOfToday()),
      aggregate("weight", daysAgo(30), endOfToday()),
      aggregate("bloodGlucose", daysAgo(7), endOfToday()),
    ]);

  const activeKcal = active?.reduce((total, sample) => total + Number(sample.value || 0), 0);

  const heartRateFromSeries = (() => {
    if (!hr || hr.length === 0) return undefined;
    const samples: number[] = [];
    for (const r of hr) {
      samples.push(Number(r?.value ?? 0));
    }
    if (!samples.length) return undefined;
    samples.sort((a, b) => a - b);
    return Math.round(samples[Math.floor(samples.length * 0.1)]);
  })();

  const lastRestingHr = last<any>(restingHr);
  const restingHeartRate = Number(lastRestingHr?.value ?? 0) || heartRateFromSeries;

  const lastWeight = last<any>(weight);
  const weightKg = (() => {
    if (!lastWeight) return undefined;
    const value = Number(lastWeight?.value ?? 0);
    if (!value) return undefined;
    const unit = lastWeight?.unit;
    return unit === "gram" ? value / 1000 : value;
  })();
  const weightAt = lastWeight?.endDate;

  const lastGlucose = last<any>(glucose);
  const glucoseMgDl = (() => {
    if (!lastGlucose) return undefined;
    const value = Number(lastGlucose?.value ?? 0);
    if (!value) return undefined;
    return Math.round(value);
  })();
  const glucoseAt = lastGlucose?.endDate;

  return {
    steps: todaySteps == null ? undefined : sanitizeDailySteps(todaySteps),
    activeCalories: activeKcal ? Math.round(activeKcal) : undefined,
    restingHeartRate,
    restingHeartRateAt: lastRestingHr?.endDate,
    weightKg,
    weightAt,
    glucoseMgDl,
    glucoseAt,
  };
}

export async function writeWeightToHealthConnect(kg: number, at?: Date): Promise<boolean> {
  if (!canUseHealthConnect() || !kg || kg <= 0) return false;
  try {
    const readOk = await ensureAvailableAndAuthorized();
    if (!readOk) return false;
    const writeOptions = { read: [] as HealthDataType[], write: ["weight"] as HealthDataType[] };
    const writePerms = await Health.checkAuthorization(writeOptions);
    if (!writePerms.writeAuthorized.includes("weight")) {
      const requested = await Health.requestAuthorization(writeOptions);
      if (!requested.writeAuthorized.includes("weight")) return false;
    }
    await Health.saveSample({
      dataType: "weight",
      value: kg,
      unit: "kilogram",
      startDate: (at ?? new Date()).toISOString(),
      endDate: (at ?? new Date()).toISOString(),
    });
    return true;
  } catch (e) {
    console.warn("writeWeightToHealthConnect failed", e);
    return false;
  }
}

export async function openHealthConnectSettings(): Promise<void> {
  try { await Health.openHealthConnectSettings(); } catch {}
}
