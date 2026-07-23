import { Capacitor } from "@capacitor/core";

const LOG_PREFIX = "[BBDO startup]";
const STARTUP_LOG_KEY = "bb_startup_diagnostics";
const MAX_LOGS = 40;

type StartupLogEntry = {
  at: string;
  label: string;
  message: string;
  stack?: string;
};

function stringifyReason(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: value.message || value.name, stack: value.stack };
  }
  if (typeof value === "string") return { message: value };
  try {
    return { message: JSON.stringify(value) };
  } catch {
    return { message: String(value) };
  }
}

function persistStartupLog(entry: StartupLogEntry) {
  try {
    const existing = localStorage.getItem(STARTUP_LOG_KEY);
    const parsed = existing ? JSON.parse(existing) : [];
    const logs = Array.isArray(parsed) ? parsed : [];
    logs.push(entry);
    localStorage.setItem(STARTUP_LOG_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
  } catch {
    /* logging must never crash startup */
  }
}

export function logStartupEvent(label: string, detail?: unknown) {
  const message = detail == null ? "ok" : stringifyReason(detail).message;
  const entry: StartupLogEntry = { at: new Date().toISOString(), label, message };
  persistStartupLog(entry);
  console.info(LOG_PREFIX, label, message);
}

export function reportStartupError(label: string, error: unknown) {
  const normalized = stringifyReason(error);
  const entry: StartupLogEntry = {
    at: new Date().toISOString(),
    label,
    message: normalized.message,
    stack: normalized.stack,
  };
  persistStartupLog(entry);
  console.error(LOG_PREFIX, label, normalized.message, normalized.stack || "");
}

export function installStartupDiagnostics() {
  const win = window as Window & { __bbStartupDiagnosticsInstalled?: boolean };
  if (win.__bbStartupDiagnosticsInstalled) return;
  win.__bbStartupDiagnosticsInstalled = true;

  /* Viewport sizing is handled entirely in CSS via 100svh + env(safe-area-inset-*).
     No JS measurement — that used to cause stale --bbdo-viewport-height values
     on Android when the system bars toggled. */

  try {
    const platform = Capacitor.getPlatform();
    document.documentElement.classList.add("bb-app", `bb-${platform}`);
    if (Capacitor.isNativePlatform()) {
      document.documentElement.classList.add("bb-native");
    }
    logStartupEvent("environment", {
      platform,
      native: Capacitor.isNativePlatform(),
      href: window.location.href,
      userAgent: navigator.userAgent,
    });
  } catch (error) {
    reportStartupError("environment failed", error);
  }

  window.addEventListener("error", (event) => {
    reportStartupError("window.onerror", event.error || event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportStartupError("window.onunhandledrejection", event.reason);
  });
}

export function renderStartupFailure(error: unknown) {
  const normalized = stringifyReason(error);
  const root = document.getElementById("root");
  if (!root) return;
  const escapeHtml = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const safeDetails = escapeHtml(`${normalized.message}\n\n${normalized.stack || ""}`);
  root.innerHTML = `
    <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;background:#fff;color:#0f1a3d;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;">
      <div style="max-width:420px;width:100%;border:1px solid rgba(15,26,61,.12);border-radius:18px;padding:20px;box-shadow:0 16px 40px rgba(15,26,61,.10);">
        <div style="font-size:13px;font-weight:700;color:#ea6a5e;margin-bottom:8px;">Startup failed</div>
        <div style="font-size:20px;font-weight:800;line-height:1.15;margin-bottom:10px;">The app hit a JavaScript error before login restore could finish.</div>
        <pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.45;background:#f6f7fb;border-radius:12px;padding:12px;max-height:260px;overflow:auto;">${safeDetails}</pre>
      </div>
    </div>
  `;
}