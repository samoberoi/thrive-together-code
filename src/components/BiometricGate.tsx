import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { App as CapApp } from "@capacitor/app";
import { useAuth } from "@/contexts/AuthContext";
import {
  authenticateWithBiometrics,
  getBiometricDiagnostics,
  isBiometricAvailable,
  isNative,
  getBiometryLabel,
  setBiometricEnabled,
  supportsBiometricGate,
  type BiometricDiagnostics,
} from "@/lib/biometric";
import { Button } from "@/components/ui/button";
import { useLocation } from "react-router-dom";
import {
  extendNativeVideoSuppression,
  isNativeVideoContextActive,
  readNativeVideoSuppressUntil,
} from "@/lib/nativeVideoSession";

// NOTE: /tour is intentionally NOT gated — it runs once, immediately after
// payment as part of onboarding. Gating it behind biometrics on Android was
// leaving the page in a `pointer-events-none` state (Skip / Next unclickable).
const BIOMETRIC_PROTECTED_ROUTES = new Set([
  "/home",
  "/dashboard",
  "/notifications",
  "/admin-dashboard",
  "/admin/users-insights",
  "/coach-dashboard",
  "/partner-dashboard",
]);

function isAndroidNativeApp() {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

function waitForAndroidPermissionFlow(): Promise<void> {
  if (!isAndroidNativeApp()) return Promise.resolve();
  const permissionFlowActive = () =>
    document.documentElement.classList.contains("bb-native-permission-flow") ||
    document.visibilityState !== "visible";
  if (!permissionFlowActive()) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let timer: number | null = null;
    const finishWhenStable = () => {
      if (settled || permissionFlowActive()) return;
      settled = true;
      window.removeEventListener("bbdo:native-permissions-settled", scheduleCheck);
      document.removeEventListener("visibilitychange", scheduleCheck);
      if (timer != null) window.clearTimeout(timer);
      // Let Android fully re-attach the resumed Activity before BiometricPrompt.
      timer = window.setTimeout(resolve, 750);
    };
    const scheduleCheck = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(finishWhenStable, 100);
    };
    window.addEventListener("bbdo:native-permissions-settled", scheduleCheck);
    document.addEventListener("visibilitychange", scheduleCheck);
    scheduleCheck();
  });
}

/**
 * Native-only Face ID / biometric gate.
 * - Prompts ONCE per app launch (cold start / process start) when an
 *   authenticated session exists.
 * - Returning from background (app switching, notifications, camera, video)
 *   never re-prompts. Only fully killing and relaunching the app does.
 * - On failure the app stays locked behind a full-screen overlay with a
 *   "Try again" button (iOS); Android fails open so users aren't trapped.
 */

// Module-scoped: lives for the lifetime of the JS process. A cold app launch
// re-evaluates this module, which is exactly the "relaunch" semantics we want.
let processUnlocked = false;

export function markBiometricProcessUnlocked() {
  processUnlocked = true;
}

export default function BiometricGate({ children }: { children: ReactNode }) {
  const { session, loading, signOut } = useAuth();
  const location = useLocation();
  const [locked, setLocked] = useState<boolean>(false);
  const [authenticating, setAuthenticating] = useState<boolean>(false);
  const [biometryChecked, setBiometryChecked] = useState<boolean>(false);
  const [biometryAvailable, setBiometryAvailable] = useState<boolean>(false);
  const [diagnostics, setDiagnostics] = useState<BiometricDiagnostics | null>(null);
  const [label, setLabel] = useState<string>("Face ID");
  const [unlockedTick, setUnlockedTick] = useState(0);
  const lastAuthAt = useRef<number>(processUnlocked ? Date.now() : 0);
  const authenticatingRef = useRef(false);

  const isVideoSuppressActive = useCallback(() => {
    return Date.now() < readNativeVideoSuppressUntil() || isNativeVideoContextActive();
  }, []);

  const unlockForProcess = useCallback(() => {
    processUnlocked = true;
    lastAuthAt.current = Date.now();
    authenticatingRef.current = false;
    setLocked(false);
    setAuthenticating(false);
    setBiometryChecked(true);
    setUnlockedTick((t) => t + 1);
  }, []);

  // Native biometric gate runs on both iOS (Face ID / Touch ID) and Android
  // (Fingerprint / Face Unlock). On Android we're resilient — if biometry
  // isn't enrolled we let the user in rather than trap them behind the lock.
  const native = isNative();
  const biometricGateSupported = supportsBiometricGate();
  const startupShield =
    biometricGateSupported && loading && !processUnlocked && !isVideoSuppressActive();
  const shouldGate =
    biometricGateSupported &&
    !loading &&
    !processUnlocked &&
    !!session &&
    BIOMETRIC_PROTECTED_ROUTES.has(location.pathname);
  const gateVisible =
    !processUnlocked &&
    !isVideoSuppressActive() &&
    (startupShield || (shouldGate && (locked || authenticating || lastAuthAt.current === 0)));


  const runAuth = useCallback(async () => {
    if (authenticatingRef.current) return;
    await waitForAndroidPermissionFlow();
    if (!shouldGate) return;
    if (isVideoSuppressActive()) {
      lastAuthAt.current = Date.now();
      setLocked(false);
      setAuthenticating(false);
      setBiometryChecked(true);
      return;
    }
    authenticatingRef.current = true;
    setLocked(true);
    setAuthenticating(true);
    setBiometryChecked(false);
    const nextDiagnostics = await getBiometricDiagnostics();
    setDiagnostics(nextDiagnostics);
    setLabel(nextDiagnostics.label || await getBiometryLabel());
    let available = await isBiometricAvailable();
    if (!available) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      available = await isBiometricAvailable();
    }
    setBiometryAvailable(available);
    setBiometryChecked(true);
    if (isVideoSuppressActive()) {
      authenticatingRef.current = false;
      setAuthenticating(false);
      lastAuthAt.current = Date.now();
      setLocked(false);
      return;
    }
    // On Android, if biometry isn't enrolled/available, don't trap the user
    // behind the lock screen — just let them in. iOS keeps the strict gate.
    const isAndroid = isAndroidNativeApp();
    if (!available && isAndroid) {
      authenticatingRef.current = false;
      setAuthenticating(false);
      lastAuthAt.current = Date.now();
      setLocked(false);
      return;
    }
    let ok = false;
    try {
      ok = await authenticateWithBiometrics("Unlock BBDO");
    } catch (err) {
      console.warn("Biometric auth threw:", err);
      ok = false;
    }
    authenticatingRef.current = false;
    setAuthenticating(false);
    if (ok) {
      setBiometricEnabled(true);
      lastAuthAt.current = Date.now();
      setLocked(false);
    } else if (isAndroid) {
      // Android: failure shouldn't lock the user out of their own app.
      lastAuthAt.current = Date.now();
      setLocked(false);
    } else {
      setLocked(true);
    }
  }, [isVideoSuppressActive, shouldGate]);

  // Initial gate when a session appears
  useEffect(() => {
    if (!shouldGate) {
      setLocked(false);
      setAuthenticating(false);
      authenticatingRef.current = false;
      setBiometryChecked(false);
      setBiometryAvailable(false);
      lastAuthAt.current = 0;
      return;
    }
    if (isVideoSuppressActive()) {
      lastAuthAt.current = Date.now();
      setLocked(false);
      setAuthenticating(false);
      setBiometryChecked(true);
      return;
    }
    let cancelled = false;
    setLocked(true);
    setBiometryChecked(false);
    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (cancelled) return;
      await runAuth();
    })();
    return () => {
      cancelled = true;
    };
  }, [isVideoSuppressActive, runAuth, shouldGate, session?.user?.id]);

  useEffect(() => {
    if (!native) return;
    const suppressVideoUnlock = () => {
      extendNativeVideoSuppression();
      lastAuthAt.current = Date.now();
      setLocked(false);
      setAuthenticating(false);
      setBiometryChecked(true);
    };
    window.addEventListener("bbdo:native-player-open", suppressVideoUnlock);
    window.addEventListener("bbdo:native-player-close", suppressVideoUnlock);
    return () => {
      window.removeEventListener("bbdo:native-player-open", suppressVideoUnlock);
      window.removeEventListener("bbdo:native-player-close", suppressVideoUnlock);
    };
  }, [native]);

  // Re-lock whenever the native app leaves the foreground, then prompt on resume.
  useEffect(() => {
    if (!shouldGate) return;
    const sub = CapApp.addListener("appStateChange", ({ isActive }) => {
      // Suppress re-lock if the native YouTube player was just used.
      // iOS's fullscreen presentation puts the WKWebView into background
      // and back — that should not force a Face ID re-prompt.
      if (isVideoSuppressActive()) {
        lastAuthAt.current = Date.now();
        setLocked(false);
        setAuthenticating(false);
        setBiometryChecked(true);
        return;
      }
      if (!isActive) {
        inactiveStartedAt.current = Date.now();
        return;
      }
      const inactiveFor = inactiveStartedAt.current ? Date.now() - inactiveStartedAt.current : 0;
      inactiveStartedAt.current = null;
      // Capacitor emits appStateChange for native overlays (YouTube player,
      // Face ID, permission sheets), not only true app backgrounding. Do not
      // re-lock for short/native transitions; that caused the video-close lock hang.
      if (inactiveFor > 0 && inactiveFor < 2 * 60 * 1000) {
        lastAuthAt.current = Date.now();
        setLocked(false);
        setAuthenticating(false);
        setBiometryChecked(true);
        return;
      }
      if (lastAuthAt.current === 0 || inactiveFor >= 2 * 60 * 1000) {
        void runAuth();
      }
    });
    return () => {
      void sub.then((s) => s.remove());
    };
  }, [isVideoSuppressActive, runAuth, shouldGate]);

  return (
    <>
      <div className={gateVisible ? "pointer-events-none opacity-0" : undefined}>
        {children}
      </div>
      {gateVisible && (
        <div
          data-biometric-gate=""
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-background px-8 text-center text-foreground"
        >
          <div className="text-5xl">🔒</div>
          <div>
            <h2 className="text-xl font-semibold mb-2">App locked</h2>
            <p className="text-muted-foreground text-sm">
              {startupShield || !biometryChecked
                ? "Checking your secure session…"
                : `Use ${label} to unlock BBDO.`}
            </p>
          </div>
          {biometryChecked && (
            <Button
              onClick={() => void runAuth()}
              className="rounded-full px-6 font-semibold"
            >
              Unlock with {label}
            </Button>
          )}
          {biometryChecked && !biometryAvailable && (
            <div className="flex max-w-xs flex-col items-center gap-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Face ID is not available on this device right now. Your device passcode can unlock this app if it is enabled.
              </p>
              {diagnostics && (
                <p className="rounded-xl bg-muted/70 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                  Status: {diagnostics.code || "unavailable"}
                  {diagnostics.reason ? ` — ${diagnostics.reason}` : ""}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => void signOut()}
                className="rounded-full px-5 text-muted-foreground"
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
