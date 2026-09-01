import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { logStartupEvent, reportStartupError } from "@/lib/startupDiagnostics";

type HealthAvailability = { available: boolean };
type HealthAuthorization = { granted: boolean };
import { sanitizeDailySteps } from "@/lib/healthStepsMath";

type TodaySteps = { steps: number; startDate: string; endDate: string };

export type HealthSnapshot = {
  steps?: number;
  activeCalories?: number;
  distanceMeters?: number;
  exerciseMinutes?: number;
  weightKg?: number;
  weightAt?: string;
  restingHeartRate?: number;
  restingHeartRateAt?: string;
  hrvMs?: number;
  hrvAt?: string;
  glucoseMgDl?: number;
  glucoseAt?: string;
  sleepHours?: number;
  sleepAwakeMin?: number;
  sleepRemMin?: number;
  sleepCoreMin?: number;
  sleepDeepMin?: number;
  sleepUnspecifiedMin?: number;
  sleepStart?: string;
  sleepEnd?: string;
};

export type EcgReading = {
  classification?: string;
  symptomsStatus?: string;
  averageHeartRate?: number;
  numberOfVoltageMeasurements?: number;
  samplingFrequencyHz?: number;
  startDate?: string;
  endDate?: string;
  voltagesMicroV?: number[];
};

type BBDOHealthKitPlugin = {
  isAvailable(): Promise<HealthAvailability>;
  requestAuthorization(): Promise<HealthAuthorization>;
  getTodayStepCount(): Promise<TodaySteps>;
  getHealthSnapshot?(): Promise<HealthSnapshot>;
  getLatestEcg?(): Promise<EcgReading>;
  saveWeight?(opts: { kg: number; at?: string }): Promise<{ saved: boolean }>;
  enableBackgroundSync?(): Promise<{ enabled: boolean }>;
  addListener?(
    event: "healthDataChanged",
    cb: (data: { type: string }) => void,
  ): Promise<PluginListenerHandle> | PluginListenerHandle;
};

const BBDOHealthKit = registerPlugin<BBDOHealthKitPlugin>("BBDOHealthKit");

export function canUseAppleHealthSteps() {
  return Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();
}

/**
 * HealthKit throws "No data available for the specified predicate" whenever a
 * query window simply has no samples. That is an empty result, not a failure —
 * treating it as an error used to surface a red banner and, worse, made the
 * permission bootstrap believe Apple Health was unauthorized.
 */
export function isNoHealthDataError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "").toLowerCase();
  return msg.includes("no data available");
}

/** Ask HealthKit for read/write access. Returns true when the sheet completed. */
export async function requestAppleHealthAuthorization(): Promise<boolean> {
  if (!canUseAppleHealthSteps()) return false;
  try {
    const availability = await BBDOHealthKit.isAvailable();
    if (!availability.available) return false;
    const res = await BBDOHealthKit.requestAuthorization();
    return res?.granted !== false;
  } catch (error) {
    if (isNoHealthDataError(error)) return true;
    reportStartupError("healthkit authorization failed", error);
    return false;
  }
}

export async function syncTodayStepsFromAppleHealth(): Promise<number | null> {
  if (!canUseAppleHealthSteps()) return null;

  try {
    logStartupEvent("healthkit availability check");
    const availability = await BBDOHealthKit.isAvailable();
    logStartupEvent("healthkit availability result", availability.available ? "available" : "unavailable");
    if (!availability.available) return null;

    logStartupEvent("healthkit authorization requested");
    await BBDOHealthKit.requestAuthorization();
    const result = await BBDOHealthKit.getTodayStepCount();
    logStartupEvent("healthkit steps result", String(result.steps || 0));
    return sanitizeDailySteps(Number(result.steps || 0));
  } catch (error) {
    if (isNoHealthDataError(error)) return 0;
    reportStartupError("healthkit sync failed", error);
    throw error;
  }
}

export async function fetchAppleHealthSnapshot(): Promise<HealthSnapshot | null> {
  if (!canUseAppleHealthSteps()) return null;
  try {
    const availability = await BBDOHealthKit.isAvailable();
    if (!availability.available) return null;
    await BBDOHealthKit.requestAuthorization();
    if (typeof BBDOHealthKit.getHealthSnapshot !== "function") {
      const steps = await BBDOHealthKit.getTodayStepCount();
      return { steps: sanitizeDailySteps(Number(steps.steps || 0)) };
    }
    const snap = await BBDOHealthKit.getHealthSnapshot();
    return snap ?? null;
  } catch (error) {
    if (isNoHealthDataError(error)) return {};
    reportStartupError("healthkit snapshot failed", error);
    return null;
  }
}

/** Fetch the most recent ECG reading (Apple Watch, iOS 14+). */
export async function fetchLatestEcgFromAppleHealth(): Promise<EcgReading | null> {
  if (!canUseAppleHealthSteps()) return null;
  try {
    const availability = await BBDOHealthKit.isAvailable();
    if (!availability.available) return null;
    await BBDOHealthKit.requestAuthorization();
    if (typeof BBDOHealthKit.getLatestEcg !== "function") return null;
    const ecg = await BBDOHealthKit.getLatestEcg();
    if (!ecg || !ecg.startDate) return null;
    return ecg;
  } catch (error) {
    if (!isNoHealthDataError(error)) reportStartupError("healthkit ecg failed", error);
    return null;
  }
}

/** Write a weight sample back to Apple Health. */
export async function writeWeightToAppleHealth(kg: number, at?: Date): Promise<boolean> {
  if (!canUseAppleHealthSteps() || !kg || kg <= 0) return false;
  try {
    if (typeof BBDOHealthKit.saveWeight !== "function") return false;
    const r = await BBDOHealthKit.saveWeight({ kg, at: (at ?? new Date()).toISOString() });
    return !!r?.saved;
  } catch (e) {
    console.warn("writeWeightToAppleHealth failed", e);
    return false;
  }
}

/** Enable HealthKit background delivery so iOS wakes the app on new samples. */
export async function enableAppleHealthBackgroundSync(): Promise<boolean> {
  if (!canUseAppleHealthSteps()) return false;
  try {
    if (typeof BBDOHealthKit.enableBackgroundSync !== "function") return false;
    const r = await BBDOHealthKit.enableBackgroundSync();
    return !!r?.enabled;
  } catch (e) {
    console.warn("enableAppleHealthBackgroundSync failed", e);
    return false;
  }
}

/** Subscribe to native "healthDataChanged" events. Returns unsubscribe fn. */
export async function onAppleHealthDataChanged(cb: () => void): Promise<() => void> {
  if (!canUseAppleHealthSteps() || typeof BBDOHealthKit.addListener !== "function") {
    return () => {};
  }
  try {
    const handle = await Promise.resolve(BBDOHealthKit.addListener("healthDataChanged", () => cb()));
    return () => { try { (handle as PluginListenerHandle).remove(); } catch {} };
  } catch {
    return () => {};
  }
}
