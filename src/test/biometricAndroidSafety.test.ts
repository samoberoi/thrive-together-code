import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeAuthenticate = vi.fn();
const packageAuthenticate = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "android",
  },
  registerPlugin: () => ({
    check: vi.fn(),
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

describe("Android biometric launch safety", () => {
  beforeEach(() => {
    nativeAuthenticate.mockClear();
    packageAuthenticate.mockClear();
  });

  it("fails open without launching either Android biometric activity", async () => {
    const { authenticateWithBiometrics, supportsBiometricGate } = await import("@/lib/biometric");

    expect(supportsBiometricGate()).toBe(false);
    await expect(authenticateWithBiometrics()).resolves.toBe(true);
    expect(nativeAuthenticate).not.toHaveBeenCalled();
    expect(packageAuthenticate).not.toHaveBeenCalled();
  });
});