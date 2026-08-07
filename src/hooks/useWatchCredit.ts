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
  const onReachedRef = useRef(onReached);

  useEffect(() => { onReachedRef.current = onReached; }, [onReached]);

  const effectiveRequired = (() => {
    const d = durationSec;
    if (d > 0) return Math.max(8, Math.min(requiredSec, Math.round(d * 0.8)));
    return requiredSec;
  })();

  const reset = useCallback(() => {
    watchedRef.current = 0;
    reachedRef.current = false;
    playingRef.current = false;
    setWatchedSec(0);
  }, []);

  const credit = useCallback((seconds: number) => {
    if (!(seconds > watchedRef.current)) return;
    watchedRef.current = seconds;
    setWatchedSec(seconds);
  }, []);

  // Reset whenever the surface becomes active.
  useEffect(() => {
    if (active) reset();
  }, [active, reset]);

  // Fire once the requirement is met.
  useEffect(() => {
    if (!active || reachedRef.current) return;
    if (watchedSec < effectiveRequired) return;
    reachedRef.current = true;
    onReachedRef.current();
  }, [active, watchedSec, effectiveRequired]);

  // Player events (web + Android).
  useEffect(() => {
    if (!active) return;
    const onMsg = (event: MessageEvent) => {
      const data = event?.data;
      if (!isYoutubePlayerMessage(data, videoId)) return;

      const d = Number(data.duration || 0);
      if (d > 0 && d !== durationRef.current) {
        durationRef.current = d;
        setDurationSec(d);
      }

      if (data.type === "progress" || data.type === "ready") {
        playingRef.current = true;
        credit(Math.floor(Number(data.currentTime || 0)));
        return;
      }

      if (data.type === "state") {
        playingRef.current = data.state === 1;
        if (data.state === 0) {
          // Ended — full credit.
          credit(Math.max(watchedRef.current, durationRef.current || requiredSec, requiredSec));
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [active, videoId, credit, requiredSec]);

  // Wall-clock fallback: covers the iOS native player (webview is backgrounded)
  // and any player that stops posting progress.
  useEffect(() => {
    if (!active) return;
    const iv = window.setInterval(() => {
      const nativeOpen = isNativeVideoContextActive();
      if (!nativeOpen && (document.hidden || !playingRef.current)) return;
      credit(watchedRef.current + 1);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [active, credit]);

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
    watchedSec,
    durationSec,
    requiredSec: effectiveRequired,
    progressPct: Math.min(100, Math.round((watchedSec / Math.max(1, effectiveRequired)) * 100)),
    reset,
    credit,
  };
}
