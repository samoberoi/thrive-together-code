import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Android hardware back button.
 *
 * Without an explicit listener the WebView swallows the press on SPA routes,
 * so the button felt dead. Behaviour now matches any native Android app:
 *  - a dismissible overlay is open  → close it
 *  - deeper in the app             → go back one screen
 *  - on a root/home screen         → single press moves the app to the
 *    background (no toast, no double-press, no hard exit)
 */
const ROOT_ROUTES = new Set([
  "/",
  "/home",
  "/dashboard",
  "/auth",
  "/coach-dashboard",
  "/admin-dashboard",
  "/partner-dashboard",
]);

function closeTopOverlay(): boolean {
  // Radix dialogs / sheets / drawers expose an open state we can close with Escape.
  const open = document.querySelector(
    '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-biometric-gate]',
  );
  if (!open) return false;
  if (open.hasAttribute("data-biometric-gate")) return true; // locked: swallow the press
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return true;
}

export default function AndroidBackHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);

  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

    const sub = CapApp.addListener("backButton", ({ canGoBack }) => {
      if (closeTopOverlay()) return;

      const atRoot = ROOT_ROUTES.has(pathRef.current);
      if (!atRoot && canGoBack && window.history.length > 1) {
        navigate(-1);
        return;
      }

      const now = Date.now();
      if (now - lastBackAt.current < 2000) {
        void CapApp.exitApp();
        return;
      }
      lastBackAt.current = now;
      toast("Press back again to exit");
    });

    return () => {
      void sub.then((s) => s.remove());
    };
  }, [navigate]);

  return null;
}
