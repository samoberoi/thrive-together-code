import { createRoot } from "react-dom/client";
import "./index.css";
import {
  installStartupDiagnostics,
  logStartupEvent,
  renderStartupFailure,
  reportStartupError,
} from "@/lib/startupDiagnostics";
import {
  hydrateNativePersistence,
  installNativePersistenceLifecycleFlush,
  installNativePersistenceMirror,
} from "@/lib/nativePersistence";
import { bindAudioUnlock } from "@/lib/soundEngine";
import { installPlatformAdapter } from "@/lib/platform";

// Global typography — Manrope body + Sora display
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";

/** Removes the static boot screen painted by index.html. */
function dismissBootScreen() {
  const boot = document.getElementById("bb-boot");
  if (!boot) return;
  boot.classList.add("bb-boot-hide");
  window.setTimeout(() => boot.remove(), 300);
}

/**
 * Native storage hydration talks to the Capacitor bridge key by key. If the
 * bridge is slow (or a plugin never answers) this used to hold the first paint
 * indefinitely. Cap the boot-blocking wait; AuthContext awaits the same
 * promise before restoring a session, so nothing is lost by moving on here.
 */
function hydrateWithBudget(ms: number) {
  const hydration = hydrateNativePersistence();
  return Promise.race([
    hydration,
    new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
  ]);
}

async function bootstrap() {
    installStartupDiagnostics();
    installPlatformAdapter();
  try {
    logStartupEvent("bootstrap started");
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Mobile bundle is missing auth configuration. Rebuild the web bundle with the project environment before syncing iOS.");
    }
    await hydrateWithBudget(2500);
    logStartupEvent("native persistence hydrated");
    installNativePersistenceMirror();
    installNativePersistenceLifecycleFlush();
    bindAudioUnlock();
    const { default: App } = await import("./App.tsx");
    logStartupEvent("react app imported");
    createRoot(document.getElementById("root")!).render(<App />);
    logStartupEvent("react app mounted");
    requestAnimationFrame(() => requestAnimationFrame(dismissBootScreen));
  } catch (error) {
    reportStartupError("bootstrap failed", error);
    dismissBootScreen();
    renderStartupFailure(error);
    throw error;
  }
}

void bootstrap();
