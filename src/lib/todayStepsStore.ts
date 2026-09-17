/**
 * Single source of truth for TODAY'S step count.
 *
 * Every surface that shows today's steps — the home ring, the Today's Steps
 * card, the Movement screen and the Steps trend/share card — reads from this
 * store. Previously each one fetched independently at different moments, so
 * the ring above and the chart below could legitimately disagree.
 *
 * One timer syncs the device health store (Health Connect / HealthKit) every
 * five minutes while the app is visible, writes the value to health_logs and
 * notifies every subscriber at once.
 */
import { canUseNativeHealth, syncTodaySteps } from "@/lib/healthProvider";
import { isHealthRateLimited } from "@/lib/healthConnect";
import { fetchTodaySteps, logTodaySteps } from "@/lib/movementUserService";
import { sanitizeDailySteps } from "@/lib/healthStepsMath";
import { useEffect, useState } from "react";

/** How often we re-read the phone's health store while the app is open. */
export const STEPS_SYNC_INTERVAL_MS = 5 * 60_000;
/** Human-readable promise shown in the UI so the cadence is never a mystery. */
export const STEPS_SYNC_LABEL = "Syncs every 5 minutes";

export interface TodayStepsState {
  /** Local date key (YYYY-MM-DD) the count belongs to. */
  day: string;
  steps: number;
  lastSyncedAt: number | null;
  syncing: boolean;
}

function localDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let state: TodayStepsState = {
  day: localDayKey(),
  steps: 0,
  lastSyncedAt: null,
  syncing: false,
};

const listeners = new Set<(s: TodayStepsState) => void>();

function emit(next: Partial<TodayStepsState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      /* ignore */
    }
  });
}

export function getTodayStepsState(): TodayStepsState {
  return state;
}

export function subscribeTodaySteps(fn: (s: TodayStepsState) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Roll the counter over at local midnight instead of showing yesterday. */
function ensureCurrentDay() {
  const day = localDayKey();
  if (day !== state.day) emit({ day, steps: 0, lastSyncedAt: null });
}

let inFlight: Promise<number> | null = null;

/**
 * Read the device health store (when available), persist it, and publish the
 * result. Falls back to the stored value so the web and non-health devices
 * still show the same number everywhere.
 */
export async function refreshTodaySteps(userId: string): Promise<number> {
  if (!userId) return state.steps;
  if (inFlight) return inFlight;
  ensureCurrentDay();

  inFlight = (async () => {
    emit({ syncing: true });
    let best = state.steps;
    try {
      const stored = await fetchTodaySteps(userId);
      if (stored > best) best = stored;
    } catch {
      /* ignore */
    }

    if (canUseNativeHealth()) {
      try {
        const live = await syncTodaySteps({ allowPrompt: false });
        if (live != null) {
          const clean = sanitizeDailySteps(live);
          if (clean !== best) {
            // Health store is authoritative for today, even if it reads lower
            // (e.g. a duplicate source was removed).
            best = clean;
          }
          await logTodaySteps(userId, clean);
        }
      } catch (error) {
        if (!isHealthRateLimited(error)) {
          console.warn("today steps sync failed", error);
        }
      }
    }

    ensureCurrentDay();
    emit({ steps: best, lastSyncedAt: Date.now(), syncing: false });
    // Legacy consumers still listen for this.
    window.dispatchEvent(new CustomEvent("health-log-saved"));
    return best;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

let autoStop: (() => void) | null = null;
let autoUserId: string | null = null;

/** Start the shared 5-minute sync loop. Safe to call from several places. */
export function startTodayStepsAutoSync(userId: string): () => void {
  if (autoStop && autoUserId === userId) return autoStop;
  autoStop?.();
  autoUserId = userId;

  let lastAt = 0;
  const run = (minGapMs = 0) => {
    const now = Date.now();
    if (minGapMs && now - lastAt < minGapMs) return;
    lastAt = now;
    void refreshTodaySteps(userId).catch(() => {});
  };

  run();

  const id = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    run();
  }, STEPS_SYNC_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") run(30_000);
  };
  document.addEventListener("visibilitychange", onVisible);

  autoStop = () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
    if (autoUserId === userId) {
      autoUserId = null;
      autoStop = null;
    }
  };
  return autoStop;
}

/** Subscribe a component to the shared count. */
export function useTodaySteps(userId?: string) {
  const [snapshot, setSnapshot] = useState<TodayStepsState>(state);

  useEffect(() => subscribeTodaySteps(setSnapshot), []);

  useEffect(() => {
    if (!userId) return;
    return startTodayStepsAutoSync(userId);
  }, [userId]);

  return {
    ...snapshot,
    refresh: () => (userId ? refreshTodaySteps(userId) : Promise.resolve(snapshot.steps)),
  };
}

/** "Last synced 8:42 AM" helper. */
export function formatSyncedAt(ts: number | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
