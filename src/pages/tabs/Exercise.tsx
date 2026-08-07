import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Play, Check, Lock, Sparkles, Flame, Target, Dumbbell, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  listExercises,
  listCategories,
  listBadges,
  extractYoutubeId,
  parseTargetSets,
  summarizeExerciseProgress,
  getCompletedExerciseIdsFromLogs,
  DAILY_EXERCISE_GOAL,
  tierForPackageKey,
  type Exercise,
  type ExerciseCategory,
  type ExerciseBadge,
  type ExerciseTier,
  PLAN_LABEL,
  TIER_COLOR,
  PLAN_FOR_TIER,
} from "@/lib/exerciseService";
import { useTodayExerciseProgress } from "@/hooks/useTodayExerciseProgress";
import { EmptyState } from "@/components/shared";
import SoleusProtocolDrawer from "@/components/SoleusProtocolDrawer";
import { useSoleusSessionsToday } from "@/hooks/useSoleusSessionsToday";
import { SOLEUS_PROTOCOL_VIDEO } from "@/lib/soleusProtocol";

import NativeYouTubePlayer from "@/components/exercises/NativeYouTubePlayer";
import { isNativeAndroidApp, isNativeIOSApp, isYoutubePlayerMessage, youtubePlayerProxyUrl } from "@/lib/youtubeEmbed";
import { accumulateWatched, loadWatched, markCompleted, recordProgress, saveDuration } from "@/lib/videoProgressStore";
import { useCoachAssignedItems } from "@/hooks/useCoachAssignedItems";

const FALLBACK_SHORT_VIDEO_SEC = 120;

interface Props {
  packageKey: string | null;
}

type LogRow = { exercise_id: string; logged_at: string; sets_done?: number | null };

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Modal player that auto-logs a set once the drill is watched, and reports watched minutes. */
function WatchModal({
  exercise,
  onClose,
  onCompleted,
  onProgress,
}: {
  exercise: Exercise;
  onClose: () => void;
  /** Fired each time a full watch is credited — logs one set, modal stays open. */
  onCompleted: () => void;
  /** Fired with newly watched seconds so repeats keep counting toward minutes. */
  onProgress: (deltaSec: number, durationSec: number, completed: boolean, flush?: boolean) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const firedRef = useRef(false);
  const lastWatchedRef = useRef({ watched: 0, duration: 0, completed: false });
  const lastReportedSecRef = useRef(0);
  const creditedWatchedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const lastPosRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  const videoId = extractYoutubeId(exercise.youtube_url);
  const [playerError, setPlayerError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [useNativePlayer] = useState(() => isNativeIOSApp());
  // Android used to force the raw youtube-nocookie embed ("simple" mode) but the nested
  // iframe caused a play→immediate-pause loop under WebView. Use the JS-API path instead.
  const [useAndroidSimpleEmbed] = useState(() => false);
  const playerSrc = videoId
    ? youtubePlayerProxyUrl(videoId, { autoplay: !useAndroidSimpleEmbed, simple: useAndroidSimpleEmbed })
    : "";

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const reportDelta = useCallback(
    (watchedSec: number, durationSec: number, completed: boolean, flush = false) => {
      const safeWatched = Math.max(0, Math.floor(watchedSec || 0));
      const deltaSec = Math.max(0, safeWatched - lastReportedSecRef.current);
      if (deltaSec > 0) onProgressRef.current(deltaSec, durationSec, completed, flush);
      else if (flush) onProgressRef.current(0, durationSec, completed, true);
      lastReportedSecRef.current = Math.max(lastReportedSecRef.current, safeWatched);
    },
    [],
  );

  // Wall-clock fallback: iOS native player and Android simple embed do not
  // post progress events, so we track elapsed time while the modal is open
  // and credit it on close (capped to avoid runaway values).
  const wallClockStartedAtRef = useRef<number>(Date.now());
  const noPostMessagePath = useNativePlayer || useAndroidSimpleEmbed;

  const wallClockElapsedSec = useCallback(
    (overrideSec?: number) => Math.min(4 * 60 * 60, Math.max(0, Math.floor(overrideSec ?? ((Date.now() - wallClockStartedAtRef.current) / 1000)))),
    [],
  );

  const handleClose = useCallback(
    (nativeResult?: { elapsedSec?: number }) => {
      if (noPostMessagePath) {
        reportDelta(wallClockElapsedSec(nativeResult?.elapsedSec), FALLBACK_SHORT_VIDEO_SEC, false, true);
      } else {
        const { watched, duration, completed } = lastWatchedRef.current;
        reportDelta(watched, duration, completed, true);
      }
      onClose();
    },
    [noPostMessagePath, onClose, reportDelta, wallClockElapsedSec],
  );

  useEffect(() => {
    if (!noPostMessagePath) return;
    wallClockStartedAtRef.current = Date.now();
    lastReportedSecRef.current = 0;
    creditedWatchedRef.current = 0;
    // Periodically credit seconds while the video is open.
    const interval = window.setInterval(() => {
      reportDelta(wallClockElapsedSec(), FALLBACK_SHORT_VIDEO_SEC, false);
    }, 1000);
    return () => {
      window.clearInterval(interval);
      reportDelta(wallClockElapsedSec(), FALLBACK_SHORT_VIDEO_SEC, false, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noPostMessagePath, reportDelta, wallClockElapsedSec]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (useAndroidSimpleEmbed || event.source !== iframeRef.current?.contentWindow) return;
      if (!isYoutubePlayerMessage(event.data, videoId || undefined)) return;

      if (event.data.type === "error") {
        setPlayerError(true);
        return;
      }

      if (event.data.type === "progress" || event.data.type === "ready") {
        const currentTime = Number(event.data.currentTime || 0);
        const now = Date.now();
        const duration = Math.floor(event.data.duration || 0);
        lastWatchedRef.current = { watched: Math.max(lastWatchedRef.current.watched, Math.floor(currentTime)), duration, completed: lastWatchedRef.current.completed };
        if (event.data.type === "ready") {
          lastPosRef.current = currentTime;
          return;
        }
        const wall = lastTickRef.current ? (now - lastTickRef.current) / 1000 : 0;
        const posDelta = currentTime - lastPosRef.current;
        if (lastTickRef.current && wall > 0 && posDelta > 0 && posDelta <= wall + 1.5) {
          creditedWatchedRef.current += posDelta;
          if (creditedWatchedRef.current - lastReportedSecRef.current >= 5) {
            reportDelta(creditedWatchedRef.current, duration, false);
          }
        }
        lastTickRef.current = now;
        lastPosRef.current = currentTime;
      }

      if (event.data.type === "state") {
        const currentTime = Number(event.data.currentTime || 0);
        if (event.data.state === 1) {
          lastTickRef.current = Date.now();
          lastPosRef.current = currentTime;
        } else {
          lastTickRef.current = null;
        }
      }

      if (event.data.type === "state" && event.data.state === 0 && !firedRef.current) {
        firedRef.current = true;
        const duration = Math.floor(event.data.duration || lastWatchedRef.current.duration || 0);
        lastWatchedRef.current = { watched: duration, duration, completed: true };
        reportDelta(Math.max(creditedWatchedRef.current, duration), duration, true, true);
        window.setTimeout(() => { firedRef.current = false; }, 1500);
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      const { watched, duration, completed } = lastWatchedRef.current;
      const credited = Math.max(creditedWatchedRef.current, completed ? duration : 0);
      if (watched > 0 || credited > 0) reportDelta(credited || watched, duration, completed, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useAndroidSimpleEmbed, videoId]);

  // Cross-platform set credit: one real watch (full clip, capped at 3 minutes)
  // logs one set. Works on web, Android WebView and the iOS native player.
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => { onCompletedRef.current = onCompleted; }, [onCompleted]);
  const setResetRef = useRef<() => void>(() => {});
  const handleSetWatched = useCallback(() => {
    onCompletedRef.current();
    setResetRef.current();
  }, []);
  const { watchedSec: setWatchedSec, requiredSec: setRequiredSec, progressPct: setWatchPct, reset: resetSetWatch } =
    useWatchCredit({
      active: true,
      videoId: videoId || undefined,
      requiredSec: SET_WATCH_SEC,
      onReached: handleSetWatched,
    });
  useEffect(() => { setResetRef.current = resetSetWatch; }, [resetSetWatch]);



  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => handleClose()}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden bg-black ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video">
          {videoId ? (
            useNativePlayer ? (
              <NativeYouTubePlayer key={`${videoId}-${retryKey}`} videoId={videoId} title={exercise.name} onNativeClose={handleClose} />
            ) : (
              <iframe
                key={`${videoId}-${retryKey}`}
                ref={iframeRef}
                src={playerSrc}
                title={exercise.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="w-full h-full border-0"
              />
            )
          ) : null}
          {playerError && !useNativePlayer && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-5 text-center">
              <p className="text-sm font-bold text-white">Video is still loading. Please try once more.</p>
              <button
                onClick={() => {
                  setPlayerError(false);
                  setRetryKey((value) => value + 1);
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black"
              >
                Retry
              </button>
            </div>
          )}
        </div>
        <div className="px-4 py-3 bg-black/80 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-white text-sm font-black truncate">{exercise.name}</p>
            <p className="text-white/60 text-[11px]">
              Every second you watch counts toward today's minutes.
            </p>
          </div>
          <button
            onClick={() => handleClose()}
            className="text-white/80 text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


export default function ExerciseTab({ packageKey }: Props) {
  const { user } = useAuth();
  const userTier = tierForPackageKey(packageKey);
  // All paid tiers see the full exercise library (coach assignment gating removed).
  const isCoachManaged = false;
  const { items: assignedItems, loading: assignmentsLoading } = useCoachAssignedItems("exercise", isCoachManaged);

  const [categories, setCategories] = useState<ExerciseCategory[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [badges, setBadges] = useState<ExerciseBadge[]>([]);
  const [earnedKeys, setEarnedKeys] = useState<Set<string>>(new Set());
  const { minutes: todayMinutes, setMinutes: setTodayMinutes, refresh: loadTodayMinutes, goal: dailyGoalMinutes } = useTodayExerciseProgress(DAILY_EXERCISE_GOAL);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);

  /** Save watched seconds locally first, then let the shared video sync push it to the backend. */
  const saveWatchProgress = useCallback(
    async (ex: Exercise, deltaSec: number, durationSec: number, completed: boolean, flush = false) => {
      if (!user) return;
      const videoKey = `exercise:${ex.id}`;
      const youtube = extractYoutubeId(ex.youtube_url) || undefined;
      const previous = loadWatched()[videoKey];
      const safeDuration = Math.max(durationSec || 0, previous?.durationSec || 0, FALLBACK_SHORT_VIDEO_SEC);
      const roundedDelta = Math.max(0, Math.round(deltaSec));
      if (youtube && safeDuration > 0) saveDuration(youtube, safeDuration);
      if (roundedDelta < 1) {
        if (flush && previous) {
          recordProgress(videoKey, previous.progressSec || previous.todayWatchedSec || 0, safeDuration, youtube, { flush: true });
        }
        return;
      }
      accumulateWatched(videoKey, roundedDelta, safeDuration, youtube, { flush });
      recordProgress(videoKey, Math.min(safeDuration, (previous?.progressSec ?? 0) + roundedDelta), safeDuration, youtube, { flush });
      if (completed) markCompleted(videoKey, safeDuration, youtube, { flush });
      setTodayMinutes((prev) => prev + roundedDelta / 60);
      window.setTimeout(() => void loadTodayMinutes(), flush ? 250 : 1800);
    },
    [user, loadTodayMinutes],
  );

  const [activeTier, setActiveTier] = useState<ExerciseTier | "all">("all");
  const [activeCat, setActiveCat] = useState<string | "all">("all");
  const [watching, setWatching] = useState<Exercise | null>(null);
  const [todayLogs, setTodayLogs] = useState<LogRow[]>([]);
  const [allLogs, setAllLogs] = useState<LogRow[]>([]);
  const [soleusOpen, setSoleusOpen] = useState(false);
  const { count: soleusCount, goal: soleusGoal, completed: soleusDone } = useSoleusSessionsToday();


  const loadLogs = useCallback(async () => {
    if (!user) return;
    const [{ data: todayData }, { data: allData }] = await Promise.all([
      (supabase as any)
        .from("user_exercise_logs")
        .select("exercise_id, logged_at, sets_done")
        .eq("user_id", user.id)
        .gte("logged_at", startOfTodayISO()),
      (supabase as any)
        .from("user_exercise_logs")
        .select("exercise_id, logged_at, sets_done")
        .eq("user_id", user.id),
    ]);
    setTodayLogs((todayData as LogRow[]) ?? []);
    setAllLogs((allData as LogRow[]) ?? []);
    const { data: earned } = await (supabase as any)
      .from("user_exercise_badges")
      .select("badge_key")
      .eq("user_id", user.id);
    setEarnedKeys(new Set(((earned as any[]) ?? []).map((e) => e.badge_key)));
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasLoadedOnceRef.current) setLoading(true);
      try {
        const [cats, exs, bds] = await Promise.all([listCategories(), listExercises(), listBadges()]);
        if (cancelled) return;
        setCategories(cats);
        setExercises(exs.filter((e) => e.enabled));
        setBadges(bds.filter((b) => b.enabled));
        hasLoadedOnceRef.current = true;
        if (!cancelled) setLoading(false);
        await Promise.all([loadLogs(), loadTodayMinutes()]);
      } catch (e: any) {
        toast.error(e?.message || "Couldn't load exercises");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLogs, loadTodayMinutes]);

  const setsByExercise = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of todayLogs) m.set(l.exercise_id, (m.get(l.exercise_id) ?? 0) + Math.max(1, Number(l.sets_done) || 1));
    return m;
  }, [todayLogs]);

  const visibleTiers = useMemo<ExerciseTier[]>(() => {
    const out: ExerciseTier[] = [];
    for (let t = 1; t <= userTier; t++) out.push(t as ExerciseTier);
    return out;
  }, [userTier]);

  const accessibleExercises = useMemo(
    () => exercises.filter((e) => visibleTiers.includes(e.tier as ExerciseTier)),
    [exercises, visibleTiers],
  );

  const completedExerciseIds = useMemo(() => {
    return getCompletedExerciseIdsFromLogs(accessibleExercises, allLogs);
  }, [accessibleExercises, allLogs]);

  useEffect(() => {
    if (activeTier !== "all" && !visibleTiers.includes(activeTier)) setActiveTier("all");
  }, [visibleTiers, activeTier]);

  const filtered = useMemo(() => {
    const assignedSet = isCoachManaged && assignedItems ? new Set(assignedItems) : null;
    return exercises
      // Coach-assigned items bypass the tier gate — if the coach explicitly
      // assigned it, the user gets to see it regardless of their plan tier.
      .filter((e) => (assignedSet ? assignedSet.has(e.id) : visibleTiers.includes(e.tier as ExerciseTier)))
      .filter((e) => (activeTier === "all" ? true : e.tier === activeTier))
      .filter((e) => (activeCat === "all" ? true : e.category_id === activeCat))
      .sort((a, b) => (a.tier - b.tier) || (a.sort_order - b.sort_order));
  }, [exercises, activeTier, activeCat, visibleTiers, isCoachManaged, assignedItems]);

  // Daily goal is admin-configured MINUTES of exercise watch time.
  const todayProgress = useMemo(
    () => summarizeExerciseProgress(accessibleExercises, todayLogs, 5),
    [accessibleExercises, todayLogs],
  );
  const goalPct = Math.min(100, Math.round((todayMinutes / Math.max(1, dailyGoalMinutes)) * 100));
  const goalMet = todayMinutes >= dailyGoalMinutes;
  const remainingMinutes = Math.max(0, dailyGoalMinutes - todayMinutes);

  // Badge awarding runs server-side (public.award_exercise_badges) so the rules
  // — distinct-days-of-practice, tier gating, one badge per calendar day —
  // can't be bypassed by rapid client logs. We just call it and refresh.
  const evaluateBadges = useCallback(
    async (_nextCompleted: Set<string>) => {
      if (!user) return;
      const { error } = await (supabase as any).rpc("award_exercise_badges", { _user_id: user.id });
      if (error) return;
      const { data: earned } = await (supabase as any)
        .from("user_exercise_badges")
        .select("badge_key")
        .eq("user_id", user.id);
      const nextKeys = new Set<string>(((earned as any[]) ?? []).map((e) => e.badge_key));
      const added = [...nextKeys].filter((k) => !earnedKeys.has(k));
      if (added.length) {
        setEarnedKeys(nextKeys);
        added.forEach((key) => {
          const b = badges.find((x) => x.key === key);
          if (b) toast.success(`Badge unlocked: ${b.name}`);
        });
      }
    },
    [user, badges, earnedKeys],
  );

  const logSetFromWatch = async (ex: Exercise) => {
    if (!user) return;
    const target = parseTargetSets(ex.sets);
    const done = setsByExercise.get(ex.id) ?? 0;
    if (done >= target) {
      toast(`✅ ${ex.name} already has all ${target} sets today`);
      return;
    }
    const wasCompleted = completedExerciseIds.has(ex.id);
    const { error } = await (supabase as any)
      .from("user_exercise_logs")
      .insert({ user_id: user.id, exercise_id: ex.id, sets_done: 1 });
    if (error) {
      toast.error(error.message || "Couldn't log set");
      return;
    }
    const nowDone = done + 1;
    const remain = Math.max(0, target - nowDone);
    if (nowDone >= target) toast.success(`✅ ${ex.name} complete`);
    else toast.success(`Set ${nowDone}/${target} logged — watch ${remain} more to finish`);

    const loggedAt = new Date().toISOString();
    setTodayLogs((prev) => [...prev, { exercise_id: ex.id, logged_at: loggedAt, sets_done: 1 }]);
    setAllLogs((prev) => [...prev, { exercise_id: ex.id, logged_at: loggedAt, sets_done: 1 }]);
    window.dispatchEvent(new CustomEvent("exercise-log-saved"));

    if (!wasCompleted && nowDone >= target) {
      const next = new Set(completedExerciseIds);
      next.add(ex.id);
      await evaluateBadges(next);
    }
  };

  if (loading || (isCoachManaged && assignmentsLoading)) {
    return <div className="theme-exercise px-4 md:px-6 pt-6 pb-10 min-h-[60vh]" aria-hidden />;
  }

  if (isCoachManaged && assignedItems && assignedItems.length === 0) {
    return (
      <div className="theme-exercise px-4 md:px-6 pt-6 pb-10">
        <EmptyState
          icon={Dumbbell}
          title="Awaiting your coach's plan"
          description="Your coach hasn't assigned any exercises yet. You'll see them here as soon as your plan is ready."
        />
      </div>
    );
  }


  return (
    <div className="theme-exercise px-4 md:px-6 pt-3 md:pt-8 pb-10 space-y-4">
      {/* HERO — BBDO Soleus Push-Ups (matches yoga hero look & feel) */}
      <motion.button
        onClick={() => setSoleusOpen(true)}
        whileTap={{ scale: 0.99 }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="no-pill w-full text-left rounded-2xl overflow-hidden shadow-card relative"
        style={{ background: "linear-gradient(135deg, #3D0A0A 0%, #8B0000 55%, #E00101 100%)" }}
      >
        <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full bg-white/10 blur-2xl pointer-events-none" />

        {/* Big thumbnail */}
        <div className="relative w-full bg-black/40" style={{ aspectRatio: "16 / 9" }}>
          <img
            src={`https://i.ytimg.com/vi/${SOLEUS_PROTOCOL_VIDEO.youtubeId}/maxresdefault.jpg`}
            alt="BBDO Soleus Push-Ups"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              if (!el.dataset.fallback) {
                el.dataset.fallback = "1";
                el.src = `https://i.ytimg.com/vi/${SOLEUS_PROTOCOL_VIDEO.youtubeId}/hqdefault.jpg`;
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/95 text-foreground flex items-center justify-center shadow-lift">
              <Play className="w-7 h-7 md:w-8 md:h-8 ml-0.5" fill="currentColor" />
            </div>
          </div>
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/95 text-foreground text-[10px] font-black uppercase tracking-[0.14em]">
              <Dumbbell className="w-3 h-3" /> BBDO Hero Ritual
            </span>
            {soleusDone && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black text-white" style={{ background: "#10B981" }}>
                <CheckCircle2 className="w-3 h-3" /> Done today
              </span>
            )}
          </div>
          <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-black/70 text-white text-[11px] font-black">3×/day</div>
        </div>

        {/* Info + rounds */}
        <div className="relative p-4 md:p-5 text-white">
          <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/80">Exercise Library · Hero</p>
          <h1 className="text-[20px] md:text-2xl font-black leading-tight mt-1">
            Soleus Push-Ups
          </h1>
          <p className="text-[12px] md:text-[13px] text-white/85 mt-1 leading-snug">
            Post-meal calf pump · complete 3 rounds every day.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/80">Today</span>
                <span className="text-[11px] font-black tabular-nums">{soleusCount}/{soleusGoal} rounds</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <motion.div
                  initial={false}
                  animate={{ width: `${Math.min(100, (soleusCount / soleusGoal) * 100)}%` }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full"
                  style={{ background: soleusDone ? "#10B981" : "#FFFFFF" }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.button>

      {/* Plan header — compact */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[10px] font-black tracking-[0.18em] uppercase text-muted-foreground">Exercise</p>
          <h2 className="text-base font-black tracking-tight text-foreground truncate">
            {PLAN_LABEL[PLAN_FOR_TIER[userTier]]}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded-full text-[10px] font-bold text-muted-foreground">
            <Flame className="w-3 h-3" /> Tier {userTier}
          </span>
          <span className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded-full text-[10px] font-bold text-muted-foreground">
            <Trophy className="w-3 h-3" /> {earnedKeys.size}/{badges.length}
          </span>
        </div>
      </div>

      {/* Compact daily-goal marker — matches yoga */}
      <div
        className="rounded-xl px-3.5 py-2.5 flex items-center gap-3 shadow-card"
        style={{ background: "var(--pillar-exercise)" }}
      >
        <div className="flex items-center gap-1.5 shrink-0 text-white">
          <Target className="w-3.5 h-3.5" />
          <span className="text-[10px] font-black uppercase tracking-[0.14em]">Daily goal</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="h-1.5 rounded-full bg-white/25 overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${goalPct}%` }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full"
              style={{ background: goalMet ? "#10B981" : "#FFFFFF" }}
            />
          </div>
        </div>
        <span className="text-[11px] font-black tabular-nums text-white shrink-0">
          {todayMinutes.toLocaleString("en-IN", { maximumFractionDigits: 1 })}/{dailyGoalMinutes}m
        </span>
        {goalMet && <CheckCircle2 className="w-4 h-4 text-white shrink-0" />}
      </div>


      {/* Fasting-window session breakdown removed for end users —
          the live daily-goal ring already reflects the active fasting protocol. */}

      {/* Tier tabs */}
      {visibleTiers.length >= 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button
            onClick={() => setActiveTier("all")}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              activeTier === "all"
                ? "bg-[var(--bbdo-blue)] text-white shadow-card"
                : "bg-[var(--bbdo-surface)] text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {visibleTiers.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTier(t)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                activeTier === t
                  ? "text-white shadow-card"
                  : "bg-[var(--bbdo-surface)] text-muted-foreground hover:text-foreground"
              }`}
              style={activeTier === t ? { background: TIER_COLOR[t] } : undefined}
            >
              Tier {t} · {PLAN_LABEL[PLAN_FOR_TIER[t]]}
            </button>
          ))}
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <button
          onClick={() => setActiveCat("all")}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
            activeCat === "all"
              ? "bg-[var(--bbdo-blue)] text-white"
              : "bg-[var(--bbdo-surface)] text-muted-foreground"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
              activeCat === c.id
                ? "bg-[var(--bbdo-blue)] text-white"
                : "bg-[var(--bbdo-surface)] text-muted-foreground"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Exercise list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.length === 0 && (
          <div className="col-span-full">
            <EmptyState icon={Dumbbell} title="No exercises here yet" description="Try a different section or check back soon." />
          </div>
        )}
        {filtered.map((ex, i) => {
          const target = parseTargetSets(ex.sets);
          const done = setsByExercise.get(ex.id) ?? 0;
          const pct = Math.min(100, Math.round((done / target) * 100));
          const complete = done >= target;
          const hasVideo = !!ex.youtube_url && !!extractYoutubeId(ex.youtube_url);
          const ytId = extractYoutubeId(ex.youtube_url);
          const thumbSrc =
            ex.image_url ||
            (ytId ? `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg` : null);
          const canWatch = hasVideo;
          return (
            <motion.button
              key={ex.id}
              type="button"
              onClick={() => canWatch && setWatching(ex)}
              disabled={!canWatch}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              whileTap={{ scale: 0.98 }}
              className="no-pill rounded-xl text-left overflow-hidden group bg-white border border-border shadow-card hover:-translate-y-px disabled:opacity-95"
              aria-label={canWatch ? `Play ${ex.name}` : ex.name}
            >
              {/* Thumbnail — matches yoga card */}
              <div className="relative w-full bg-muted" style={{ aspectRatio: "16 / 9" }}>
                {thumbSrc ? (
                  <img
                    src={thumbSrc}
                    alt={ex.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      if (!el.dataset.fallback && ytId) {
                        el.dataset.fallback = "1";
                        el.src = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
                      }
                    }}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: "var(--pillar-exercise-soft)", color: "var(--pillar-exercise)" }}
                  >
                    <Dumbbell className="w-10 h-10" strokeWidth={1.5} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                {/* Top-left icon badge */}
                <div className="absolute top-2 left-2 w-9 h-9 rounded-xl bg-white/90 backdrop-blur flex items-center justify-center shadow-card" style={{ color: "var(--pillar-exercise)" }}>
                  <Dumbbell className="w-5 h-5" strokeWidth={1.8} />
                </div>

                {/* Top-right status badge */}
                <div className="absolute top-2 right-2 flex gap-1.5">
                  {complete ? (
                    <span className="px-2 py-0.5 rounded-full bg-success-soft text-success text-[10px] font-bold inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Done
                    </span>
                  ) : !hasVideo ? (
                    <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" /> No video
                    </span>
                  ) : (
                    <span
                      className="px-2 py-0.5 rounded-full text-white text-[10px] font-bold"
                      style={{ background: `${TIER_COLOR[ex.tier as ExerciseTier]}E6` }}
                    >
                      Tier {ex.tier}
                    </span>
                  )}
                </div>

                {/* Center play button */}
                {canWatch && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-white/95 text-foreground flex items-center justify-center shadow-lift">
                      <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
                    </div>
                  </div>
                )}

                {/* Bottom — sets/duration meta */}
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-bold">
                  {ex.reps_duration} · {ex.sets} sets
                </div>

                {/* Progress bar for in-progress */}
                {done > 0 && !complete && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(2, pct)}%`,
                        background: TIER_COLOR[ex.tier as ExerciseTier],
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Body — title + progress + tags */}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-foreground font-bold text-sm leading-tight">{ex.name}</h3>
                  {complete && (
                    <span className="shrink-0 text-[10px] font-bold text-success inline-flex items-center gap-0.5">
                      <Check className="w-3 h-3" /> Watch again
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                    <span className={complete ? "text-success" : "text-muted-foreground"}>
                      {done}/{target} sets today
                    </span>
                    {hasVideo && !complete && (
                      <span className="text-muted-foreground">
                        {done === 0 ? "Watch to log set 1" : `Watch for set ${done + 1}`}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={false}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-full"
                      style={{
                        background: complete ? "#10B981" : TIER_COLOR[ex.tier as ExerciseTier],
                      }}
                    />
                  </div>
                </div>
                {ex.knee_pain_substitute && (
                  <p className="text-[10px] text-muted-foreground italic mt-2">
                    Knee-pain swap: {ex.knee_pain_substitute}
                  </p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="rounded-3xl p-5 liquid-glass">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black uppercase tracking-[0.12em] text-foreground/80 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" /> Badges
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {earnedKeys.size}/{badges.length}
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {badges.map((b) => {
              const earned = earnedKeys.has(b.key);
              const locked = b.tier_required > userTier;
              return (
                <div
                  key={b.id}
                  className={`rounded-2xl p-3 text-center transition-opacity ${
                    earned
                      ? "bg-primary/5 ring-1 ring-primary/20"
                      : locked
                      ? "bg-muted/40 opacity-40"
                      : "bg-muted/40 opacity-70"
                  }`}
                  title={locked ? `Unlocks at Tier ${b.tier_required}` : b.description}
                >
                  <span
                    className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center"
                    style={{
                      background: earned ? "var(--pillar-exercise-soft)" : "hsl(var(--muted))",
                      color: earned ? "var(--pillar-exercise)" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {locked ? <Lock className="w-5 h-5" strokeWidth={1.75} /> : earned ? <Dumbbell className="w-5 h-5" strokeWidth={1.75} /> : <CheckCircle2 className="w-5 h-5" strokeWidth={1.75} />}
                  </span>
                  <p className="text-[11px] font-bold mt-1 text-foreground leading-tight">{b.name}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2">
                    {locked ? `Tier ${b.tier_required}+` : b.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {watching && (
        <WatchModal
          exercise={watching}
          onClose={() => setWatching(null)}
          onCompleted={() => {
            const ex = watching;
            setWatching(null);
            void logSetFromWatch(ex);
          }}
          onProgress={(watchedSec, durationSec, completed, flush) => {
            void saveWatchProgress(watching, watchedSec, durationSec, completed, flush);
          }}
        />
      )}

      <SoleusProtocolDrawer open={soleusOpen} onOpenChange={setSoleusOpen} />
    </div>
  );
}
