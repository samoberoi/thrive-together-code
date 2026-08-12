import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeAuthenticate = vi.fn();
const nativeCheck = vi.fn();
const packageAuthenticate = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "android",
  },
  registerPlugin: () => ({
    check: nativeCheck,
    authenticate: nativeAuthenticate,
  }),
}));

vi.mock("@aparajita/capacitor-biometric-auth", () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(),
    authenticate: packageAuthenticate,
  },
  BiometryType: {
    none: 0,
    faceId: 1,
    touchId: 2,
    fingerprintAuthentication: 3,
    faceAuthentication: 4,
    irisAuthentication: 5,
  },
  BiometryErrorType: { none: "none" },
}));

vi.mock("@/lib/nativePersistence", () => ({
  syncNativePersistenceFromLocalStorage: vi.fn(),
}));

vi.mock("@/lib/startupDiagnostics", () => ({
  logStartupEvent: vi.fn(),
  reportStartupError: vi.fn(),
}));

describe("Android biometric unlock", () => {
  beforeEach(() => {
    nativeAuthenticate.mockReset();
    nativeCheck.mockReset();
    packageAuthenticate.mockClear();
  });

  it("uses the first-party plugin and never the crashing third-party one", async () => {
    nativeAuthenticate.mockResolvedValue({ success: true });
    const { authenticateWithBiometrics, supportsBiometricGate } = await import("@/lib/biometric");

    expect(supportsBiometricGate()).toBe(true);
    await expect(authenticateWithBiometrics()).resolves.toBe(true);
    expect(nativeAuthenticate).toHaveBeenCalledTimes(1);
    expect(packageAuthenticate).not.toHaveBeenCalled();
  });

  it("fails open (never locks the user out) when the native plugin errors", async () => {
    nativeAuthenticate.mockRejectedValue(new Error("boom"));
    const { authenticateWithBiometrics } = await import("@/lib/biometric");

    await expect(authenticateWithBiometrics()).resolves.toBe(true);
    expect(packageAuthenticate).not.toHaveBeenCalled();
  });
});
