/**
 * Platform adapter — single source of truth for iOS/Android/web detection and
 * runtime CSS variables that layout primitives depend on.
 *
 * Publishes on <html>:
 *   - platform class:  bb-ios | bb-android | bb-web
 *   - --kb-h : current on-screen-keyboard height in px (0 when hidden)
 *   - --nav-h : bottom-nav height (updated by AppBottomBar)
 *   - --nav-clear : calc(var(--nav-h) + safe area) — content bottom padding
 *
 * Uses visualViewport (works on both iOS Safari/WKWebView and modern Android
 * Chrome/WebView) — no Capacitor Keyboard plugin required.
 */

export type Platform = "ios" | "android" | "web";

let cached: Platform | null = null;

export function getPlatform(): Platform {
  if (cached) return cached;
  if (typeof navigator === "undefined") return (cached = "web");
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1)) {
    return (cached = "ios");
  }
  if (/Android/i.test(ua)) return (cached = "android");
  return (cached = "web");
}

export const isIOS = () => getPlatform() === "ios";
export const isAndroid = () => getPlatform() === "android";
export const isNative = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("bb-native");

let installed = false;

/**
 * Install platform class + keyboard-height tracker. Call once from main.tsx.
 * Idempotent.
 */
export function installPlatformAdapter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const root = document.documentElement;
  const p = getPlatform();
  root.classList.add(`bb-${p}`);

  // Seed CSS vars so calc() never falls back to unresolved values.
  const setVar = (k: string, v: string) => root.style.setProperty(k, v);
  setVar("--kb-h", "0px");
  if (!getComputedStyle(root).getPropertyValue("--nav-h").trim()) {
    setVar("--nav-h", "0px");
  }

  const vv = window.visualViewport;
  if (!vv) return;

  const measure = () => {
    // Keyboard height ≈ layout viewport height − visual viewport height − offsetTop.
    const layout = window.innerHeight;
    const visible = vv.height;
    const offsetTop = vv.offsetTop || 0;
    const kb = Math.max(0, Math.round(layout - visible - offsetTop));
    // On desktop / non-keyboard viewport resizes we still want 0.
    setVar("--kb-h", `${kb}px`);
    root.classList.toggle("kb-open", kb > 40);
  };

  vv.addEventListener("resize", measure);
  vv.addEventListener("scroll", measure);
  window.addEventListener("orientationchange", measure);
  // First frame — VisualViewport reports layout dims before keyboard settles.
  requestAnimationFrame(measure);
}
