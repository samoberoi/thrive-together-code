import { useCallback, useEffect, useRef, useState } from "react";
import { isYoutubePlayerMessage } from "@/lib/youtubeEmbed";
import { isNativeVideoContextActive } from "@/lib/nativeVideoSession";

/**
 * Shared "did the user actually watch it?" tracker.
 *
 * Works across all three playback paths used in the app:
 *  - Web / Android WebView proxied player (postMessage progress + state events)
 *  - iOS native fullscreen player (no postMessage — credited via wall clock and
 *    the `bbdo:native-player-close` event which carries `elapsedSec`)
 *  - Any player that only reports "ended"
 *
 * When the credited watch time crosses the requirement, `onReached` fires once.
 * Call `reset()` to arm the tracker for the next round / set.
 */
export function useWatchCredit({
  active,
  videoId,
  requiredSec,
  onReached,
}: {
  active: boolean;
  videoId?: string;
  /** Max seconds of watch time needed. Short videos require 80% of their length. */
  requiredSec: number;
  onReached: () => void;
}) {
  const [watchedSec, setWatchedSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const watchedRef = useRef(0);
  const durationRef = useRef(0);
  const playingRef = useRef(false);
  const reachedRef = useRef(false);
  /** True once the proxied player (web / Android WebView) reports events. */
  const hasPlayerEventsRef = useRef(false);
  const lastTimeRef = useRef<number | null>(null);
  const onReachedRef = useRef(onReached);

  useEffect(() => { onReachedRef.current = onReached; }, [onReached]);

  // A round only counts once the clip has essentially been watched end to end.
  const effectiveRequired = (() => {
    const d = durationSec;
    if (d > 0) return Math.max(8, Math.round(d * 0.95));
    return requiredSec;
  })();


  const reset = useCallback(() => {
    watchedRef.current = 0;
    reachedRef.current = false;
    playingRef.current = false;
    lastTimeRef.current = null;
    setWatchedSec(0);
  }, []);

  const credit = useCallback((seconds: number) => {
    if (!(seconds > watchedRef.current)) return;
    watchedRef.current = seconds;
    setWatchedSec(seconds);
  }, []);

  /** Add real elapsed playback seconds (never counts paused/idle time). */
  const addWatched = useCallback((delta: number) => {
    if (!(delta > 0)) return;
    watchedRef.current = watchedRef.current + delta;
    setWatchedSec(watchedRef.current);
  }, []);

  // Reset whenever the surface becomes active.
  useEffect(() => {
    if (active) reset();
  }, [active, reset]);

  // Fire once the requirement is met (never on a zero-watch surface).
  useEffect(() => {
    if (!active || reachedRef.current) return;
    if (watchedSec <= 0) return;
    if (watchedSec < effectiveRequired) return;
    reachedRef.current = true;
    onReachedRef.current();
  }, [active, watchedSec, effectiveRequired]);


  // Player events (web + Android WebView proxied player).
  useEffect(() => {
    if (!active) return;
    const onMsg = (event: MessageEvent) => {
      const data = event?.data;
      if (!isYoutubePlayerMessage(data, videoId)) return;
      hasPlayerEventsRef.current = true;

      const d = Number(data.duration || 0);
      if (d > 0 && d !== durationRef.current) {
        durationRef.current = d;
        setDurationSec(d);
      }

      const t = Number(data.currentTime || 0);

      if (data.type === "ready") {
        // Player is loaded but NOT playing — do not credit anything yet.
        playingRef.current = false;
        lastTimeRef.current = null;
        return;
      }

      if (data.type === "progress") {
        if (!playingRef.current) {
          // Paused / buffering / not started: keep the clock frozen.
          lastTimeRef.current = t;
          return;
        }
        const prev = lastTimeRef.current;
        lastTimeRef.current = t;
        if (prev == null) return;
        const delta = t - prev;
        // Ignore seeks/jumps — credit only plausible real-time advances.
        if (delta > 0 && delta <= 2.5) addWatched(delta);
        return;
      }

      if (data.type === "state") {
        // 1 = playing, 3 = buffering, everything else is not watching.
        playingRef.current = data.state === 1;
        lastTimeRef.current = playingRef.current ? t : null;
        if (data.state === 0) {
          // Ended — full credit.
          credit(Math.max(watchedRef.current, durationRef.current || requiredSec, requiredSec));
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [active, videoId, credit, addWatched, requiredSec]);

  // Wall-clock fallback: ONLY for the iOS native fullscreen player, where the
  // webview is backgrounded and no postMessage progress arrives.
  useEffect(() => {
    if (!active) return;
    const iv = window.setInterval(() => {
      if (!isNativeVideoContextActive()) return;
      if (hasPlayerEventsRef.current) return;
      addWatched(1);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [active, addWatched]);


  // iOS native player reports the real elapsed time when it closes.
  useEffect(() => {
    if (!active) return;
    const onNativeClose = (event: Event) => {
      const detail = (event as CustomEvent).detail as { elapsedSec?: number } | undefined;
      const elapsed = Math.floor(Number(detail?.elapsedSec || 0));
      if (elapsed > 0) credit(elapsed);
    };
    window.addEventListener("bbdo:native-player-close", onNativeClose);
    return () => window.removeEventListener("bbdo:native-player-close", onNativeClose);
  }, [active, credit]);

  return {
    watchedSec: Math.floor(watchedSec),
    durationSec,
    requiredSec: effectiveRequired,
    progressPct: Math.min(100, Math.round((watchedSec / Math.max(1, effectiveRequired)) * 100)),
    reset,
    credit,
  };
}
