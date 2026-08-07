import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Wind, X } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useAuth } from "@/contexts/AuthContext";
import { useBreathSessionsToday } from "@/hooks/useBreathSessionsToday";
import { BREATH_PROTOCOL_VIDEO, getBreathYoutubeId, recordBreathSession } from "@/lib/breathProtocol";
import { isNativeIOSApp, youtubePlayerProxyUrl } from "@/lib/youtubeEmbed";
import NativeYouTubePlayer from "@/components/exercises/NativeYouTubePlayer";

// A round only counts once the user has effectively watched the full protocol.
// Video is 76s — credit after ~60s of watch time to allow for buffering/pause.
const REQUIRED_WATCH_SEC = 60;

export default function BreathProtocolDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const { count, goal, completed, refresh } = useBreathSessionsToday();
  const [saving, setSaving] = useState(false);
  const [videoId, setVideoId] = useState(BREATH_PROTOCOL_VIDEO.youtubeId);
  const [useNativePlayer] = useState(() => isNativeIOSApp());

  // Watch tracking — the round unlocks only after enough playback time.
  const [watchedSec, setWatchedSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const watchedRef = useRef(0);
  const loggedThisRoundRef = useRef(false);
  const savingRef = useRef(false);

  const unlocked = watchedSec >= REQUIRED_WATCH_SEC;

  useEffect(() => {
    let cancelled = false;
    getBreathYoutubeId().then((v) => { if (!cancelled) setVideoId(v); });
    return () => { cancelled = true; };
  }, []);

  const embedSrc = useMemo(
    () => youtubePlayerProxyUrl(videoId, { autoplay: false }),
    [videoId],
  );

  const resetWatch = useCallback(() => {
    watchedRef.current = 0;
    loggedThisRoundRef.current = false;
    setWatchedSec(0);
    setPlaying(false);
  }, []);

  const logRound = useCallback(async () => {
    if (!user || savingRef.current) return false;
    if (completed) return false;
    savingRef.current = true;
    setSaving(true);
    const ok = await recordBreathSession(user.id, "video");
    setSaving(false);
    savingRef.current = false;
    if (ok) {
      loggedThisRoundRef.current = true;
      await refresh();
      const next = Math.min(goal, count + 1);
      if (next >= goal) toast.success("BBDO Breath Protocol complete for today ✨");
      else toast.success(`Round ${next} of ${goal} logged`);
      // Next round needs its own full watch.
      resetWatch();
      return true;
    }
    return false;
  }, [user, completed, refresh, goal, count, resetWatch]);


  // Reset watch counters each time the drawer opens.
  useEffect(() => {
    if (!open) return;
    resetWatch();
  }, [open, resetWatch]);

  // Count watch time only while the player reports playback (or, on players that
  // don't report state, while the drawer is visible after the user hit play).
  useEffect(() => {
    if (!open || completed || !playing) return;
    const iv = window.setInterval(() => {
      if (document.hidden) return;
      watchedRef.current += 1;
      setWatchedSec(watchedRef.current);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [open, completed, playing]);

  // Trust player-reported progress / state when available.
  useEffect(() => {
    if (!open) return;
    const onMsg = (event: MessageEvent) => {
      const d = event?.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "progress" && typeof d.currentTime === "number") {
        setPlaying(true);
        if (d.currentTime > watchedRef.current) {
          watchedRef.current = d.currentTime;
          setWatchedSec(d.currentTime);
        }
      } else if (d.type === "state") {
        if (d.state === 1) setPlaying(true);
        if (d.state === 2) setPlaying(false);
        if (d.state === 0) {
          // ended — full watch credited, auto-log the round
          setPlaying(false);
          watchedRef.current = Math.max(watchedRef.current, REQUIRED_WATCH_SEC);
          setWatchedSec(watchedRef.current);
          if (!loggedThisRoundRef.current) void logRound();
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open, logRound]);

  const progressPct = Math.min(100, Math.round((count / goal) * 100));
  const watchPct = Math.min(100, Math.round((watchedSec / REQUIRED_WATCH_SEC) * 100));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-background border-t border-border px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto overscroll-contain">
        <DrawerHeader className="px-0 pb-2 flex-row items-center justify-between">
          <DrawerTitle className="text-foreground text-lg font-black flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--bbdo-blue)" }}>
              <Wind className="w-[18px] h-[18px] text-white" strokeWidth={1.8} />
            </span>
            BBDO Breath Protocol
          </DrawerTitle>
          <button aria-label="Close" onClick={() => onOpenChange(false)} className="no-pill w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </DrawerHeader>

        <p className="text-[13px] text-muted-foreground leading-snug">
          {BREATH_PROTOCOL_VIDEO.description}
        </p>

        {/* Progress ring */}
        <div className="mt-3 rounded-2xl bg-card border border-border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Today</span>
            <span className="text-xs font-black tabular-nums" style={{ color: completed ? "#10B981" : "var(--bbdo-blue)" }}>
              {count}/{goal} rounds
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full"
              style={{ background: completed ? "#10B981" : "var(--bbdo-blue)" }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            {completed
              ? "Beautifully done — you've completed all 4 rounds today."
              : `Watch and breathe along. ${goal - count} more round${goal - count === 1 ? "" : "s"} to close today's loop.`}
          </p>
        </div>

        {/* Video */}
        <div className="mt-3 rounded-2xl overflow-hidden bg-black border border-border relative" style={{ aspectRatio: "16 / 9" }}>
          {useNativePlayer ? (
            <NativeYouTubePlayer
              key={videoId}
              videoId={videoId}
              title="BBDO Daily Breath Protocol"
              start={0}
            />
          ) : (
            <iframe
              key={embedSrc}
              src={embedSrc}
              title="BBDO Daily Breath Protocol"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 w-full h-full"
            />
          )}
        </div>

        {/* Watch progress */}
        {!completed && !unlocked && (
          <div className="mt-3 rounded-2xl bg-muted/60 border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Watch progress</span>
              <span className="text-[11px] font-black tabular-nums text-muted-foreground">{watchPct}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-background overflow-hidden">
              <motion.div
                initial={false}
                animate={{ width: `${watchPct}%` }}
                transition={{ duration: 0.2, ease: "linear" }}
                className="h-full rounded-full"
                style={{ background: "var(--bbdo-blue)" }}
              />
            </div>
          </div>
        )}

        <div
          className="mt-3 w-full min-h-14 rounded-2xl text-white font-bold text-[15px] flex items-center justify-center gap-2 px-4 text-center"
          style={{ background: completed ? "#10B981" : "var(--bbdo-blue)" }}
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Logging your round…</>
          ) : completed ? (
            <><CheckCircle2 className="w-4 h-4" /> All 4 rounds done today</>
          ) : (
            <>Just watch — the round logs itself ({count + 1}/{goal})</>
          )}
        </div>
        </DrawerHeader>

        <p className="text-[13px] text-muted-foreground leading-snug">
          {BREATH_PROTOCOL_VIDEO.description}
        </p>

        {/* Progress ring */}
        <div className="mt-3 rounded-2xl bg-card border border-border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Today</span>
            <span className="text-xs font-black tabular-nums" style={{ color: completed ? "#10B981" : "var(--bbdo-blue)" }}>
              {count}/{goal} rounds
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full"
              style={{ background: completed ? "#10B981" : "var(--bbdo-blue)" }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            {completed
              ? "Beautifully done — you've completed all 4 rounds today."
              : `Watch and breathe along. ${goal - count} more round${goal - count === 1 ? "" : "s"} to close today's loop.`}
          </p>
        </div>

        {/* Video */}
        <div className="mt-3 rounded-2xl overflow-hidden bg-black border border-border relative" style={{ aspectRatio: "16 / 9" }}>
          {useNativePlayer ? (
            <NativeYouTubePlayer
              key={videoId}
              videoId={videoId}
              title="BBDO Daily Breath Protocol"
              start={0}
            />
          ) : (
            <iframe
              key={embedSrc}
              src={embedSrc}
              title="BBDO Daily Breath Protocol"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 w-full h-full"
            />
          )}
        </div>

        {/* Watch progress */}
        {!completed && !unlocked && (
          <div className="mt-3 rounded-2xl bg-muted/60 border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Watch progress</span>
              <span className="text-[11px] font-black tabular-nums text-muted-foreground">{watchPct}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-background overflow-hidden">
              <motion.div
                initial={false}
                animate={{ width: `${watchPct}%` }}
                transition={{ duration: 0.2, ease: "linear" }}
                className="h-full rounded-full"
                style={{ background: "var(--bbdo-blue)" }}
              />
            </div>
          </div>
        )}

        <button
          onClick={onComplete}
          disabled={saving || completed || !unlocked}
          className="mt-3 w-full h-14 rounded-2xl text-white font-bold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          style={{ background: completed ? "#10B981" : "var(--bbdo-blue)" }}
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : completed ? (
            <><CheckCircle2 className="w-4 h-4" /> All 4 rounds done today</>
          ) : !unlocked ? (
            <><Lock className="w-4 h-4" /> Watch the protocol to unlock ({remainingWatch}s)</>
          ) : (
            <>Mark this round complete ({count + 1}/{goal})</>
          )}
        </button>

        <p className="text-[11px] text-muted-foreground text-center mt-2 leading-snug">
          Ritual · Morning · Afternoon · Evening · Night
        </p>
      </DrawerContent>
    </Drawer>
  );
}
