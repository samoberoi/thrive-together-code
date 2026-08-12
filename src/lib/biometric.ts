import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  BiometricAuth,
  BiometryType,
  BiometryError,
  BiometryErrorType,
  AndroidBiometryStrength,
  type CheckBiometryResult,
} from "@aparajita/capacitor-biometric-auth";
import { syncNativePersistenceFromLocalStorage } from "@/lib/nativePersistence";
import { logStartupEvent, reportStartupError } from "@/lib/startupDiagnostics";

const ENABLED_KEY = "bb_biometric_enabled";
const DISABLED_KEY = "bb_biometric_disabled";
export const BIOMETRIC_PREFERENCE_CHANGED_EVENT = "bb_biometric_preference_changed";

type NativeBiometricCheck = {
  available: boolean;
  biometryAvailable?: boolean;
  deviceSecure: boolean;
  biometryType: string;
  label: string;
  code: string;
  reason: string;
};

type BBDOBiometricsPlugin = {
  check(): Promise<NativeBiometricCheck>;
  authenticate(options: { reason: string }): Promise<{ success: boolean }>;
};

const BBDOBiometrics = registerPlugin<BBDOBiometricsPlugin>("BBDOBiometrics");

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export type BiometricDiagnostics = {
  native: boolean;
  platform: string;
  available: boolean;
  deviceSecure: boolean;
  label: string;
  code: string;
  reason: string;
  raw?: CheckBiometryResult;
};

function labelForBiometryType(type: BiometryType): string {
  switch (type) {
    case BiometryType.faceId:
      return "Face ID";
    case BiometryType.touchId:
      return "Touch ID";
    case BiometryType.fingerprintAuthentication:
      return "Fingerprint";
    case BiometryType.faceAuthentication:
      return "Face Unlock";
    case BiometryType.irisAuthentication:
      return "Iris";
    default:
      return Capacitor.getPlatform() === "ios" ? "Face ID / Touch ID" : "Biometrics";
  }
}

export async function getBiometricDiagnostics(): Promise<BiometricDiagnostics> {
  const platform = Capacitor.getPlatform();
  if (!isNative()) {
    return {
      native: false,
      platform,
      available: false,
      deviceSecure: false,
      label: "Face ID / Touch ID / Fingerprint",
      code: "web-preview",
      reason: "Biometric unlock only runs in the installed mobile app.",
    };
  }

  try {
    logStartupEvent("biometric check", "BBDOBiometrics.check");
    const info = await BBDOBiometrics.check();
    logStartupEvent("biometric check result", `${info.code}:${info.label}`);
    return {
      native: true,
      platform,
      available: Boolean(info.available),
      deviceSecure: Boolean(info.deviceSecure),
      label: info.label || (platform === "ios" ? "Face ID / Touch ID" : "Biometrics"),
      code: info.code || (info.available ? "available" : "unavailable"),
      reason: info.reason || "Device biometric status checked.",
    };
  } catch (error) {
    reportStartupError("BBDOBiometrics.check failed", error);
    /* Fall through to the package plugin for older installed builds. */
  }

  try {
    logStartupEvent("biometric check", "BiometricAuth.checkBiometry");
    const info = await BiometricAuth.checkBiometry();
    return {
      native: true,
      platform,
      available: info.isAvailable && info.biometryType !== BiometryType.none,
      deviceSecure: info.deviceIsSecure,
      label: labelForBiometryType(info.biometryType),
      code: info.code || BiometryErrorType.none,
      reason: info.reason || "Device biometric status checked.",
      raw: info,
    };
  } catch (error) {
    reportStartupError("BiometricAuth.checkBiometry failed", error);
    const err = error as BiometryError;
    return {
      native: true,
      platform,
      available: false,
      deviceSecure: false,
      label: platform === "ios" ? "Face ID / Touch ID" : "Biometrics",
      code: err?.code || "plugin-error",
      reason: err?.message || "Native biometric plugin did not respond.",
    };
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const info = await BBDOBiometrics.check();
    if (info.available) return true;
  } catch {
    /* Fall through to the package plugin. */
  }
  try {
    const info = await BiometricAuth.checkBiometry();
    return info.isAvailable && info.biometryType !== BiometryType.none;
  } catch {
    return false;
  }
}

export async function getBiometryLabel(): Promise<string> {
  try {
    const info = await BBDOBiometrics.check();
    if (info.label) return info.label;
  } catch {
    /* Fall through to the package plugin. */
  }
  try {
    const info = await BiometricAuth.checkBiometry();
    return labelForBiometryType(info.biometryType);
  } catch {
    return Capacitor.getPlatform() === "ios" ? "Face ID / Touch ID" : "Biometrics";
  }
}

export function isBiometricEnabled(): boolean {
  return isNative();
}

export function isBiometricSetupPending(): boolean {
  return false;
}

export function shouldRequireBiometricUnlock(): boolean {
  return isNative();
}

export function setBiometricEnabled(_on = true) {
  localStorage.setItem(ENABLED_KEY, "1");
  localStorage.removeItem(DISABLED_KEY);
  void syncNativePersistenceFromLocalStorage();
  window.dispatchEvent(new CustomEvent(BIOMETRIC_PREFERENCE_CHANGED_EVENT));
}

export async function authenticateWithBiometrics(
  reason = "Unlock BBDO"
): Promise<boolean> {
  if (isNative()) {
    try {
      logStartupEvent("biometric authenticate", "BBDOBiometrics.authenticate");
      const result = await BBDOBiometrics.authenticate({ reason });
      logStartupEvent("biometric authenticate result", result.success !== false ? "success" : "failed");
      return result.success !== false;
    } catch (error) {
      reportStartupError("BBDOBiometrics.authenticate failed", error);
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (!/not implemented|unimplemented|plugin/i.test(message)) {
        console.warn("Native biometric auth failed:", message);
        return false;
      }
    }
  }

  // Android: BiometricPrompt throws a fatal IllegalArgumentException when a
  // negative button is combined with device-credential fallback, which kills
  // the whole process (app closes to the launcher). Never send that combo.
  const android = Capacitor.getPlatform() === "android";

  try {
    logStartupEvent("biometric authenticate", "BiometricAuth.authenticate");
    await BiometricAuth.authenticate(
      android
        ? {
            reason,
            cancelTitle: "Cancel",
            allowDeviceCredential: false,
            androidTitle: "BBDO",
            androidConfirmationRequired: false,
            androidBiometryStrength: AndroidBiometryStrength.weak,
          }
        : {
            reason,
            cancelTitle: "Cancel",
            allowDeviceCredential: true,
            iosFallbackTitle: "Use passcode",
          }
    );
    return true;
  } catch (err) {
    reportStartupError("BiometricAuth.authenticate failed", err);
    const e = err as BiometryError;
    console.warn("Biometric auth failed:", e?.message ?? err);
    return false;
  }
}

