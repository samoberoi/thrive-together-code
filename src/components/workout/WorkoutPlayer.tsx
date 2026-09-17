import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Pause,
  Play,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Shuffle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { extractYoutubeId } from "@/lib/exercise2ThumbnailService";
import { PHASE_LABEL, itemWorkSeconds, type PlayableItem } from "@/lib/workoutService";

interface Props {
  title: string;
  items: PlayableItem[];
  startIndex?: number;
  /** Called whenever the player moves to a new drill. */
  onPosition?: (index: number) => void;
  /** Called when a drill's work timer finishes. */
  onExerciseDone?: (item: PlayableItem) => void;
  /** Swap the drill at `index` for a fresh one; return false when nothing else fits. */
  onSwap?: (index: number) => void;
  onFinish?: () => void;
  onClose: () => void;
}

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function WorkoutPlayer({
  title,
  items,
  startIndex = 0,
  onPosition,
  onExerciseDone,
  onSwap,
  onFinish,
  onClose,
}: Props) {
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, items.length - 1)));
  const [resting, setResting] = useState(false);
  const [remaining, setRemaining] = useState(items[startIndex] ? itemWorkSeconds(items[startIndex]) : 30);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  const item = items[index];
  const next = items[index + 1];
  const videoId = item ? extractYoutubeId(item.exercise.youtube_url) : null;

  const totalSeconds = useMemo(
    () => items.reduce((s, i) => s + itemWorkSeconds(i) + i.rest_seconds, 0),
    [items]
  );
  const elapsedBefore = useMemo(
    () => items.slice(0, index).reduce((s, i) => s + itemWorkSeconds(i) + i.rest_seconds, 0),
    [items, index]
  );
  const itemWork = item ? itemWorkSeconds(item) : 0;
  const elapsed = elapsedBefore + (resting ? itemWork : 0) +
    ((resting ? item?.rest_seconds ?? 0 : itemWork) - remaining);
  const progressPct = totalSeconds ? Math.min(100, Math.round((elapsed / totalSeconds) * 100)) : 0;

  // Lock the page behind the player.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const goTo = useCallback(
    (i: number, phase: "work" | "rest" = "work") => {
      if (i >= items.length) {
        doneRef.current = true;
        setDone(true);
        onFinish?.();
        return;
      }
      setIndex(i);
      setResting(phase === "rest");
      setRemaining(phase === "rest" ? items[i].rest_seconds : itemWorkSeconds(items[i]));
      onPosition?.(i);
    },
    [items, onFinish, onPosition]
  );

  // Countdown.
  useEffect(() => {
    if (paused || done || !item) return;
    const t = window.setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1;
        if (!resting) {
          onExerciseDone?.(item);
          if (item.rest_seconds > 0 && index < items.length - 1) {
            setResting(true);
            return item.rest_seconds;
          }
          window.setTimeout(() => goTo(index + 1), 0);
          return 0;
        }
        window.setTimeout(() => goTo(index + 1), 0);
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [paused, done, resting, index, item, items.length, goTo, onExerciseDone]);

  // Keyboard shortcuts on web.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "ArrowLeft") goTo(Math.max(0, index - 1));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goTo, onClose]);

  const embed = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&rel=0&loop=1&playlist=${videoId}&playsinline=1&modestbranding=1`
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-[#0B1220] text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black truncate">{title}</p>
          <p className="text-[11px] text-white/60">
            {done ? "Session complete" : `Drill ${index + 1} of ${items.length}`}
          </p>
        </div>
        <button
          onClick={() => setMuted((m) => !m)}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
          aria-label="Close player"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="h-1 bg-white/10 shrink-0">
        <div className="h-full bg-[var(--bbdo-blue)]" style={{ width: `${progressPct}%` }} />
      </div>

      {done ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-400" />
          <p className="text-xl font-black">Workout complete</p>
          <p className="text-sm text-white/70">
            {items.length} drills · {mmss(totalSeconds)} of work. Logged to your progress.
          </p>
          <Button onClick={onClose} className="mt-2">
            Done
          </Button>
        </div>
      ) : (
        <>
          {/* Video */}
          <div className="relative flex-1 min-h-0 bg-black">
            {embed ? (
              <iframe
                key={`${item?.exercise.id}-${muted}`}
                src={embed}
                title={item?.exercise.name}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
                No video on this drill
              </div>
            )}

            {(resting || paused) && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                <p className="text-sm uppercase tracking-widest text-white/60">
                  {paused ? "Paused" : "Rest"}
                </p>
                <p className="text-6xl font-black tabular-nums">{remaining}</p>
                {resting && next && (
                  <p className="text-sm text-white/70 mt-2">Next: {next.exercise.name}</p>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <span
                  className={cn(
                    "inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide mb-1",
                    item?.phase === "warm_up" && "bg-amber-400/20 text-amber-300",
                    item?.phase === "main" && "bg-[var(--bbdo-blue)]/25 text-sky-300",
                    item?.phase === "cool_down" && "bg-emerald-400/20 text-emerald-300"
                  )}
                >
                  {PHASE_LABEL[item?.phase ?? "main"]}
                </span>
                <p className="text-lg font-black truncate">{item?.exercise.name}</p>
                {item?.mode === "reps" ? (
                  <p className="text-xs text-white/60 truncate">
                    As many reps as possible · target {item.reps} reps
                  </p>
                ) : (
                  item?.exercise.reps_duration && (
                    <p className="text-xs text-white/60 truncate">{item.exercise.reps_duration}</p>
                  )
                )}
              </div>
              <p className="text-4xl font-black tabular-nums shrink-0">{remaining}</p>
            </div>

            <div className="flex items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                onClick={() => goTo(Math.max(0, index - 1))}
                aria-label="Previous drill"
              >
                <SkipBack className="w-5 h-5" />
              </Button>
              <Button
                size="lg"
                className="rounded-full h-14 w-14 p-0 bg-white text-[#0B1220] hover:bg-white/90"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Resume" : "Pause"}
              >
                {paused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                onClick={() => goTo(index + 1)}
                aria-label="Next drill"
              >
                <SkipForward className="w-5 h-5" />
              </Button>
              {onSwap && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  onClick={() => onSwap(index)}
                  aria-label="Swap this drill"
                >
                  <Shuffle className="w-5 h-5" />
                </Button>
              )}
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {items.map((it, i) => (
                <button
                  key={`${it.exercise_id}-${i}`}
                  onClick={() => goTo(i)}
                  className={cn(
                    "shrink-0 px-2.5 h-7 rounded-md text-[11px] font-semibold border transition-colors",
                    i === index
                      ? "bg-white text-[#0B1220] border-white"
                      : i < index
                      ? "border-white/20 text-white/40"
                      : "border-white/25 text-white/80"
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
