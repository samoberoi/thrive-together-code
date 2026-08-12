import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const checkAvailability = vi.fn();
const checkHealthPermissions = vi.fn();
const requestHealthPermissions = vi.fn();
const readRecords = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "android",
  },
  registerPlugin: () => ({}),
}));

vi.mock("capacitor-health-connect", () => ({
  HealthConnect: {
    checkAvailability,
    checkHealthPermissions,
    requestHealthPermissions,
    readRecords,
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
    checkAvailability.mockResolvedValue({ availability: "Available" });
    checkHealthPermissions.mockResolvedValue({ hasAllPermissions: false });
  });

  it("does not open a permission activity during an automatic snapshot read", async () => {
    const { fetchHealthConnectSnapshot } = await import("@/lib/healthConnect");

    await expect(fetchHealthConnectSnapshot()).resolves.toBeNull();
    expect(checkAvailability).toHaveBeenCalledOnce();
    expect(checkHealthPermissions).toHaveBeenCalledOnce();
    expect(requestHealthPermissions).not.toHaveBeenCalled();
    expect(readRecords).not.toHaveBeenCalled();
  });

  it("does not open Health Connect from the startup permission bootstrap", async () => {
    const { ensureNativeHealthPermission } = await import("@/lib/healthPermissionBootstrap");

    await expect(
      ensureNativeHealthPermission("android-user", { allowPrompt: true }),
    ).resolves.toBe(false);
    expect(requestHealthPermissions).not.toHaveBeenCalled();
  });

  it("keeps the required Health Connect manifest wiring and current push channel", () => {
    const manifest = readFileSync(
      resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml"),
      "utf8",
    );

    expect(manifest).toContain("androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE");
    expect(manifest).toContain("android.intent.action.VIEW_PERMISSION_USAGE");
    expect(manifest).toContain('android:name="android.permission.health.READ_STEPS"');
    expect(manifest).toContain('android:value="bbdo-alerts-v10"');
    expect(manifest).not.toContain('android:value="bbdo-alerts-v9"');
  });
});