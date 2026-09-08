import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpCircle, X } from "lucide-react";
import { App as CapApp } from "@capacitor/app";
import { checkForAppUpdate, openStore, type UpdateInfo } from "@/lib/appUpdate";

const DISMISS_KEY = "bbdo:update-dismissed";

export default function AppUpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  const run = async () => {
    const res = await checkForAppUpdate();
    if (!res) { setInfo(null); return; }
    if (!res.force) {
      try {
        if (localStorage.getItem(DISMISS_KEY) === res.version) { setInfo(null); return; }
      } catch {}
    }
    setInfo(res);
  };

  useEffect(() => {
    run();
    let remove: (() => void) | undefined;
    CapApp.addListener("appStateChange", ({ isActive }) => { if (isActive) run(); })
      .then((h) => { remove = () => h.remove(); })
      .catch(() => {});
    return () => { remove?.(); };
  }, []);

  const dismiss = () => {
    try { if (info) localStorage.setItem(DISMISS_KEY, info.version); } catch {}
    setInfo(null);
  };

  return (
    <AnimatePresence>
      {info && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed left-0 right-0 z-[70]"
          style={{ top: "calc(env(safe-area-inset-top, 0px))" }}
        >
          <div className="mx-auto w-full max-w-[430px] px-3">
            <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 backdrop-blur px-3 py-2.5 shadow-lg">
              <ArrowUpCircle className="w-5 h-5 text-primary flex-shrink-0" strokeWidth={1.8} />
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold leading-tight">
                  New version available
                </p>
                <p className="text-muted-foreground text-xs leading-snug break-words">
                  {info.notes ? info.notes : `Update to v${info.version} for the latest improvements.`}
                </p>
              </div>
              <button
                onClick={() => openStore(info.storeUrl)}
                className="flex-shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
              >
                Update
              </button>
              {!info.force && (
                <button onClick={dismiss} aria-label="Dismiss" className="flex-shrink-0 text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
