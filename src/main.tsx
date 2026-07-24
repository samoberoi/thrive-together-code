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

// Global typography — Montserrat
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";

async function bootstrap() {
    installStartupDiagnostics();
    installPlatformAdapter();
  try {
    logStartupEvent("bootstrap started");
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Mobile bundle is missing auth configuration. Rebuild the web bundle with the project environment before syncing iOS.");
    }
    await hydrateNativePersistence();
    logStartupEvent("native persistence hydrated");
    installNativePersistenceMirror();
    installNativePersistenceLifecycleFlush();
    bindAudioUnlock();
    const { default: App } = await import("./App.tsx");
    logStartupEvent("react app imported");
    createRoot(document.getElementById("root")!).render(<App />);
    logStartupEvent("react app mounted");
  } catch (error) {
    reportStartupError("bootstrap failed", error);
    renderStartupFailure(error);
    throw error;
  }
}

void bootstrap();
