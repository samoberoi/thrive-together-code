import { Capacitor } from "@capacitor/core";
import { HealthConnect } from "capacitor-health-connect";
import type { HealthConnectAvailability, RecordType } from "capacitor-health-connect";
import type { HealthSnapshot } from "@/lib/appleHealth";
import { logStartupEvent, reportStartupError } from "@/lib/startupDiagnostics";
import {
  clipRecordsToRange,
  originOf,
  startOfLocalDay,
  sumField as sum,
  sumStepsDeduped,
} from "@/lib/healthStepsMath";

/** True on native Android where Health Connect can (potentially) run. */
export function canUseHealthConnect() {
  return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform();
}

const READ_TYPES: RecordType[] = [
  "Steps",
  "ActiveCaloriesBurned",
  "HeartRateSeries",
  "RestingHeartRate",
  "Weight",
  "BloodGlucose",
] ;

type HealthConnectPermissionState = {
  availability: HealthConnectAvailability | "Unknown";
  authorized: boolean;
  canRequest: boolean;
  message: string;
};

const readOptions = { read: READ_TYPES, write: [] as RecordType[] };

export async function getHealthConnectPermissionState(): Promise<HealthConnectPermissionState> {
  if (!canUseHealthConnect()) {
    return {
      availability: "Unknown",
      authorized: false,
      canRequest: false,
      message: "Open the installed Android app to connect Health Connect.",
    };
  }

  try {
    const status = await HealthConnect.checkAvailability();
    if (status.availability === "NotInstalled") {
      return {
        availability: status.availability,
        authorized: false,
        canRequest: true,
        message: "Install or update Health Connect, then allow permissions.",
      };
    }
    if (status.availability === "NotSupported") {
      return {
        availability: status.availability,
        authorized: false,
        canRequest: false,
        message: "Health Connect is not supported on this Android device.",
      };
    }

    const perms = await HealthConnect.checkHealthPermissions(readOptions);
    const authorized = !!perms?.hasAllPermissions;
    return {
      availability: status.availability,
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

  try {
    const status = await HealthConnect.checkAvailability();
    if (status.availability === "NotSupported") return getHealthConnectPermissionState();

    logStartupEvent("health-connect authorization requested");
    const result = await HealthConnect.requestHealthPermissions(readOptions);
    logStartupEvent("health-connect authorization result", result?.hasAllPermissions ? "granted" : "denied");

    if (result?.hasAllPermissions) {
      return {
        availability: "Available",
        authorized: true,
        canRequest: false,
        message: "Health Connect is connected.",
      };
    }

    return {
      availability: status.availability,
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
  }
}

async function ensureAvailableAndAuthorized(): Promise<boolean> {
  const state = await getHealthConnectPermissionState();
  if (state.authorized) return true;
  if (state.availability !== "Available" && state.availability !== "NotInstalled") {
    logStartupEvent("health-connect availability", state.availability);
    throw new Error(state.message);
  }

  const requested = await requestHealthConnectAuthorization();
  if (!requested.authorized) throw new Error(requested.message);
  return true;
}

function startOfToday() { return startOfLocalDay(); }
function endOfToday()   { return new Date(); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

async function aggregate(type: RecordType, start: Date, end: Date): Promise<any | null> {
  try {
    const res: any = await (HealthConnect as any).readRecords({
      type,
      timeRangeFilter: {
        type: "between",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
    return res?.records ?? [];
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
  const status = await HealthConnect.checkAvailability();
  if (status.availability === "NotSupported") {
    throw new Error("Health Connect is not supported on this Android device.");
  }
  if (status.availability === "NotInstalled") {
    throw new Error("Install or update Health Connect, then allow step permissions.");
  }
  const stepsOnly = { read: ["Steps"] as RecordType[], write: [] as RecordType[] };
  const perms = await HealthConnect.checkHealthPermissions(stepsOnly);
  if (perms?.hasAllPermissions) return;
  if (!allowPrompt) {
    // Never open the system permission screen from a background/auto sync —
    // it steals window focus and causes the status bar to flicker in a loop.
    throw new Error("Allow the Steps permission in Health Connect to sync your steps.");
  }
  const requested = await HealthConnect.requestHealthPermissions(stepsOnly);
  if (!requested?.hasAllPermissions) {
    throw new Error("Allow the Steps permission in Health Connect to sync your steps.");
  }
}

async function readAllSteps(start: Date, end: Date): Promise<any[]> {
  const records: any[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 20; i++) {
    const res: any = await (HealthConnect as any).readRecords({
      type: "Steps",
      timeRangeFilter: {
        type: "between",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      pageSize: 1000,
      pageToken,
    });
    records.push(...(res?.records ?? []));
    pageToken = res?.pageToken || undefined;
    if (!pageToken) break;
  }
  return records;
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

export async function syncTodayStepsFromHealthConnect(
  opts?: { allowPrompt?: boolean },
): Promise<number | null> {
  await ensureStepsPermission(opts?.allowPrompt ?? false);
  // Health Connect rejects/ignores ranges that end in the future on some OEMs.
  const start = startOfToday();
  const end = new Date();

  let raw = await readAllSteps(start, end);
  let widened = false;
  if (raw.length === 0) {
    // Some OEMs / watch bridges write records with UTC-shifted or long-span
    // windows that a strict "since local midnight" filter misses entirely.
    // Read a wider window and clip it back to today ourselves.
    widened = true;
    raw = await readAllSteps(daysAgo(2), end);
  }

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
  if (deduped > 0) return Math.max(0, Math.round(deduped));
  // Fallback: some providers write records without usable dataOrigin metadata.
  const total = sum(scoped, "count") ?? 0;
  if (total > 0) return Math.max(0, Math.round(total));

  // Records exist, but none overlap today — genuinely 0 steps so far today.
  return 0;

}



export async function fetchHealthConnectSnapshot(): Promise<HealthSnapshot | null> {
  const ok = await ensureAvailableAndAuthorized();
  if (!ok) return null;

  const [steps, active, hr, restingHr, weight, glucose] =
    await Promise.all([
      aggregate("Steps", startOfToday(), endOfToday()),
      aggregate("ActiveCaloriesBurned", startOfToday(), endOfToday()),
      aggregate("HeartRateSeries", daysAgo(1), endOfToday()),
      aggregate("RestingHeartRate", daysAgo(7), endOfToday()),
      aggregate("Weight", daysAgo(30), endOfToday()),
      aggregate("BloodGlucose", daysAgo(7), endOfToday()),
    ]);

  const stepsTotal = sumStepsDeduped(steps);
  const activeKcal = active ? active.reduce(
    (a: number, r: any) => a + Number(r?.energy?.value ?? r?.energy ?? 0),
    0,
  ) : undefined;

  const heartRateFromSeries = (() => {
    if (!hr || hr.length === 0) return undefined;
    const samples: number[] = [];
    for (const r of hr) {
      const arr = r?.samples ?? [];
      for (const s of arr) samples.push(Number(s?.beatsPerMinute ?? 0));
    }
    if (!samples.length) return undefined;
    samples.sort((a, b) => a - b);
    return Math.round(samples[Math.floor(samples.length * 0.1)]);
  })();

  const lastRestingHr = last<any>(restingHr);
  const restingHeartRate = Number(lastRestingHr?.beatsPerMinute ?? 0) || heartRateFromSeries;

  const lastWeight = last<any>(weight);
  const weightKg = (() => {
    if (!lastWeight) return undefined;
    const value = Number(lastWeight?.weight?.value ?? lastWeight?.weight ?? 0);
    if (!value) return undefined;
    const unit = lastWeight?.weight?.unit;
    return unit === "gram" ? value / 1000 : value;
  })();
  const weightAt = lastWeight?.time ?? lastWeight?.endTime;

  const lastGlucose = last<any>(glucose);
  const glucoseMgDl = (() => {
    if (!lastGlucose) return undefined;
    const value = Number(lastGlucose?.level?.value ?? 0);
    if (!value) return undefined;
    return Math.round(lastGlucose?.level?.unit === "millimolesPerLiter" ? value * 18.0182 : value);
  })();
  const glucoseAt = lastGlucose?.time;

  return {
    steps: stepsTotal != null ? Math.round(stepsTotal) : undefined,
    activeCalories: activeKcal ? Math.round(activeKcal) : undefined,
    restingHeartRate,
    restingHeartRateAt: lastRestingHr?.time,
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
    const writePerms = await HealthConnect.checkHealthPermissions({ read: [], write: ["Weight"] });
    if (!writePerms?.hasAllPermissions) {
      const requested = await HealthConnect.requestHealthPermissions({ read: [], write: ["Weight"] });
      if (!requested?.hasAllPermissions) return false;
    }
    await (HealthConnect as any).insertRecords({
      records: [{
        type: "Weight",
        time: (at ?? new Date()).toISOString(),
        weight: { value: kg, unit: "kilogram" },
      }],
    });
    return true;
  } catch (e) {
    console.warn("writeWeightToHealthConnect failed", e);
    return false;
  }
}

export async function openHealthConnectSettings(): Promise<void> {
  try { await (HealthConnect as any).openHealthConnectSetting?.(); } catch {}
}
