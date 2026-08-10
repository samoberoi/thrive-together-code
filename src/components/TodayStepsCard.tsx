import { useCallback, useEffect, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { motion } from "framer-motion";
import { Footprints, ChevronRight, Flame, RefreshCw, Watch } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchProfile } from "@/lib/profileService";
import { canUseNativeHealth, isHealthStepsConnected, syncTodaySteps } from "@/lib/healthProvider";
import { healthSourceLabel } from "@/lib/platformLabels";
import {
  fetchMovementOverview,
  logTodaySteps,
  type MovementOverview,
} from "@/lib/movementUserService";

const HEALTH_SYNC_INTERVAL_MS = 5 * 60_000;

export default function TodayStepsCard({ onOpenMovement }: { onOpenMovement?: () => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<MovementOverview | null>(null);
  const [syncingHealth, setSyncingHealth] = useState(false);
  const [healthSyncError, setHealthSyncError] = useState<string | null>(null);
  const healthStepsAvailable = canUseNativeHealth();
  const [healthConnected, setHealthConnected] = useState(() => isHealthStepsConnected());

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const p = await fetchProfile(user.id);
      const ov = await fetchMovementOverview(user.id, {
        bmiCategory: (p as any)?.bmi_category ?? null,
        activityLevel: (p as any)?.lifestyle?.activity ?? (p as any)?.activity_level ?? null,
        age: (p as any)?.age ?? null,
        weightKg: (p as any)?.weight ?? null,
        heightCm: (p as any)?.height ?? null,
      });
      setData(ov);
    } catch {}
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const syncHealthSteps = useCallback(async (showToast = false) => {
    if (!user) return;
    setSyncingHealth(true);
    setHealthSyncError(null);
    try {
      const steps = await syncTodaySteps();
      if (steps == null) {
        setHealthConnected(false);
        const message = `${healthSourceLabel()} is not available on this device`;
        setHealthSyncError(message);
        if (showToast) toast.error(message);
        return;
      }
      setHealthConnected(true);
      await logTodaySteps(user.id, steps);
      if (showToast) toast.success(`Synced ${steps.toLocaleString("en-IN")} ${healthSourceLabel()} steps`);
      window.dispatchEvent(new CustomEvent("health-log-saved"));
      await load();
    } catch (error: any) {
      setHealthConnected(false);
      const message = error?.message || `Couldn't sync ${healthSourceLabel()} steps`;
      setHealthSyncError(message);
      if (showToast) toast.error(message);
      console.warn(`${healthSourceLabel()} steps sync failed`, error);
    } finally {
      setSyncingHealth(false);
    }
  }, [load, user]);

  useEffect(() => {
    if (!user || !healthStepsAvailable) return;
    const sync = async () => {
      await syncHealthSteps(false);
    };
    void sync();
  }, [healthStepsAvailable, syncHealthSteps, user]);

  useEffect(() => {
    if (!user || !healthStepsAvailable) return;
    const sub = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void syncHealthSteps(false);
    });
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncHealthSteps(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sub.then((s) => s.remove());
    };
  }, [healthStepsAvailable, syncHealthSteps, user]);

  // Keep step counts fresh while the app is open (every 5 minutes) so users
  // walking with the app in the foreground see their steps move.
  useEffect(() => {
    if (!user || !healthStepsAvailable) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void syncHealthSteps(false);
    }, HEALTH_SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [healthStepsAvailable, syncHealthSteps, user]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener("health-log-saved", handler);
    return () => window.removeEventListener("health-log-saved", handler);
  }, [load]);

  if (!user) return null;

  const target = data?.targetSteps || 6000;
  const today = data?.todaySteps || 0;
  const ratio = Math.min(1, target ? today / target : 0);
  const hit = today >= target;

  const handleHealthSync = async () => {
    await syncHealthSteps(true);
  };

  return (
    <motion.div
      className="liquid-glass rounded-3xl p-5 relative overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        type="button"
        onClick={onOpenMovement}
        className="absolute top-4 right-4 inline-flex items-center gap-0.5 text-[11px] font-bold text-primary"
      >
        Movement <ChevronRight className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
            <circle cx="32" cy="32" r="27" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
            <circle
              cx="32" cy="32" r="27" fill="none"
              stroke="var(--bbdo-red)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${ratio * 169.6} 169.6`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Footprints className="w-5 h-5 text-primary" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">Today's Steps</p>
          <p className="text-2xl font-black text-foreground leading-tight">
            {today.toLocaleString("en-IN")}
            <span className="text-xs text-muted-foreground font-medium"> / {target.toLocaleString("en-IN")}</span>
          </p>
          <p className="text-[11px] mt-0.5">
            {hit ? (
              <span className="text-emerald-600 font-bold inline-flex items-center gap-1">
                <Flame className="w-3 h-3" /> Daily goal hit!
              </span>
            ) : (
              <span className="text-muted-foreground">
                Level {data?.progress.current_level ?? 1} · {data?.level?.name ?? "Get moving"}
              </span>
            )}
          </p>
        </div>
      </div>

      {healthStepsAvailable && (
        <div className="mt-4 rounded-2xl border border-border bg-background px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Watch className="h-4 w-4 shrink-0 text-primary" />
              <p className="truncate text-[12px] font-semibold text-muted-foreground">
                {healthSourceLabel()} steps sync automatically
              </p>
            </div>
            <button
              type="button"
              onClick={handleHealthSync}
              disabled={syncingHealth}
              aria-label={`Sync ${healthSourceLabel()} steps`}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${syncingHealth ? "animate-spin" : ""}`} />
            </button>
          </div>
          {healthSyncError && (
            <p className="mt-2 text-[11px] font-medium leading-snug text-destructive">
              {healthSyncError}
            </p>
          )}
        </div>
      )}

    </motion.div>
  );
}
