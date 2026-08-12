import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const isAvailable = vi.fn();
const checkAuthorization = vi.fn();
const requestAuthorization = vi.fn();
const readSamples = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "android",
  },
  registerPlugin: () => ({}),
}));

vi.mock("@capgo/capacitor-health", () => ({
  Health: {
    isAvailable,
    checkAuthorization,
    requestAuthorization,
    readSamples,
  },
}));

vi.mock("@/lib/startupDiagnostics", () => ({
  logStartupEvent: vi.fn(),
  reportStartupError: vi.fn(),
}));

vi.mock("@/lib/movementUserService", () => ({
  logTodaySteps: vi.fn(),
}));

describe("Android Health Connect permission safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAvailable.mockResolvedValue({ available: true, platform: "android" });
    checkAuthorization.mockResolvedValue({ readAuthorized: [], readDenied: ["steps"], writeAuthorized: [], writeDenied: [] });
  });

  it("does not open a permission activity during an automatic snapshot read", async () => {
    const { fetchHealthConnectSnapshot } = await import("@/lib/healthConnect");

    await expect(fetchHealthConnectSnapshot()).resolves.toBeNull();
    expect(isAvailable).toHaveBeenCalledOnce();
    expect(checkAuthorization).toHaveBeenCalledOnce();
    expect(requestAuthorization).not.toHaveBeenCalled();
    expect(readSamples).not.toHaveBeenCalled();
  });

  it("does not open Health Connect from the startup permission bootstrap", async () => {
    const { ensureNativeHealthPermission } = await import("@/lib/healthPermissionBootstrap");

    await expect(
      ensureNativeHealthPermission("android-user", { allowPrompt: true }),
    ).resolves.toBe(false);
    expect(requestAuthorization).not.toHaveBeenCalled();
  });

  it("keeps the required Health Connect manifest wiring and current push channel", () => {
    const manifest = readFileSync(
      resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml"),
      "utf8",
    );

    expect(manifest).toContain("androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE");
    expect(manifest).toContain("android.intent.action.VIEW_PERMISSION_USAGE");
    expect(manifest).toContain('android:name="android.permission.health.READ_STEPS"');
    expect(manifest).toContain('android:value="bbdo-alerts-v11"');
    expect(manifest).not.toContain('android:value="bbdo-alerts-v10"');
  });

  it("uses a Capacitor 8-compatible health plugin instead of the legacy Capacitor 5 bridge", () => {
    const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    const config = readFileSync(resolve(process.cwd(), "capacitor.config.ts"), "utf8");
    expect(packageJson).toContain('"@capgo/capacitor-health"');
    expect(packageJson).not.toContain('"capacitor-health-connect"');
    expect(config).toContain('"@capgo/capacitor-health"');
  });
});