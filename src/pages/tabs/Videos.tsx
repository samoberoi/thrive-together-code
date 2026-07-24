import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Play, CheckCircle2, RotateCcw, Clock, Sparkles, Target,
  Activity, Brain, CircleDot, Dumbbell, Flower2, Lock, Moon, Move3D, Sun, Triangle, Wind,
  type LucideIcon,
} from "lucide-react";
import { videos, videoGroups, videoTagFilters, type VideoEntry } from "@/lib/exerciseData";
import VideoPlayer from "@/components/exercises/VideoPlayer";
import { useVideoThumbnails } from "@/hooks/useVideoThumbnails";
import { useVideoMetadata } from "@/hooks/useVideoMetadata";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useYouTubeDurationPrefetch } from "@/hooks/useYouTubeDurationPrefetch";
import { formatDuration } from "@/lib/videoProgressStore";
import YogaUpsell from "@/components/YogaUpsell";
import { useDailyYogaMinutes } from "@/hooks/useAppSettings";

import BreathProtocolDrawer from "@/components/BreathProtocolDrawer";
import { useBreathSessionsToday } from "@/hooks/useBreathSessionsToday";
import { BREATH_PROTOCOL_VIDEO } from "@/lib/breathProtocol";
import { useCoachAssignedItems } from "@/hooks/useCoachAssignedItems";
import { EmptyState } from "@/components/shared";

const VIDEO_ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  Brain,
  CircleDot,
  Dumbbell,
  Flower2,
  Lock,
  Moon,
  Move3D,
  Sparkles,
  Sun,
  Target,
  Triangle,
  Wind,
};

function VideoFlatIcon({ name, className = "w-4 h-4" }: { name?: string | null; className?: string }) {
  const Icon = VIDEO_ICON_MAP[name || ""] ?? Sparkles;
  return <Icon className={className} strokeWidth={1.75} />;
}

interface VideosProps {
  packageKey?: string | null;
}

export default function Videos({ packageKey }: VideosProps = {}) {
  const isCoachManaged = packageKey === "active" || packageKey === "intensive";
  const { items: assignedItems, loading: assignmentsLoading } = useCoachAssignedItems("yoga", isCoachManaged);
  const [group, setGroup] = useState<(typeof videoGroups)[number]["id"]>("all");
  const [tag, setTag] = useState<(typeof videoTagFilters)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<VideoEntry | null>(null);
  const [breathOpen, setBreathOpen] = useState(false);
  const { count: breathCount, goal: breathGoal, completed: breathDone } = useBreathSessionsToday();
  const { resolve, loading: thumbnailsLoading } = useVideoThumbnails();
  const { resolveVideo, customVideos, disabledIds, loading: metadataLoading } = useVideoMetadata();
  const { getStatus, watched } = useVideoProgress();

  const allResolved = useMemo(
    () => {
      const assignedSet = isCoachManaged && assignedItems ? new Set(assignedItems) : null;
      return [...videos.map(resolveVideo), ...customVideos].filter(
        (v) =>
          !disabledIds.has(v.id) &&
          v.youtubeId &&
          v.youtubeId !== BREATH_PROTOCOL_VIDEO.youtubeId &&
          (assignedSet ? assignedSet.has(v.id) : true),
      );
    },
    [resolveVideo, customVideos, disabledIds, isCoachManaged, assignedItems],
  );

  // Prefetch durations for everything once
  useYouTubeDurationPrefetch(useMemo(() => allResolved.map((v) => v.youtubeId), [allResolved]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allResolved.filter((v) => {
      if (group !== "all" && v.group !== group) return false;
      if (tag !== "all" && !v.tags.includes(tag as any)) return false;
      if (q && !`${v.name} ${v.category} ${v.benefits}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [group, tag, query, allResolved]);

  const continueWatching = useMemo(() => {
    return allResolved
      .map((v) => ({ v, s: getStatus(v.id, v.youtubeId) }))
      .filter(({ s }) => s.started && !s.completed && s.ratio < 0.9)
      .sort((a, b) => (watched[b.v.id]?.watchedAt || 0) - (watched[a.v.id]?.watchedAt || 0))
      .slice(0, 6)
      .map(({ v }) => v);
  }, [allResolved, watched, getStatus]);

  const totalWatched = Object.values(watched).filter((w) => w.completed).length;

  // Daily yoga goal — sum today's watched minutes across yoga-group videos
  const yogaGoalMin = useDailyYogaMinutes(20);
  const yogaMinutesToday = useMemo(() => {
    const yogaIds = new Set(
      allResolved
        .filter((v) => v.group === "Pranayama" || v.group === "Yoga Asana" || v.group === "Bandha")
        .map((v) => v.id),
    );
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    let sec = 0;
    for (const [vid, w] of Object.entries(watched)) {
      if (!yogaIds.has(vid)) continue;
      // Prefer today-accumulated real playback (accrues on every replay, resets daily)
      if ((w as any).sessionDate === todayKey && typeof (w as any).todayWatchedSec === "number") {
        sec += Math.max(0, (w as any).todayWatchedSec);
        continue;
      }
      // Legacy fallback: fall back to progressSec if the video was opened today
      const start = new Date(); start.setHours(0, 0, 0, 0);
      if (w.watchedAt && w.watchedAt >= start.getTime()) {
        const p = Math.max(0, w.progressSec || 0);
        const d = Math.max(0, w.durationSec || 0);
        sec += d > 0 ? Math.min(p, d) : p;
      }
    }
    // Round to 0.1 min so short first sessions show progress (e.g. "0.9/2m")
    // instead of flooring to 0 while Home shows a decimal.
    return sec > 0 ? Math.round((sec / 60) * 10) / 10 : 0;
  }, [watched, allResolved]);
  const yogaPct = Math.min(100, Math.round((yogaMinutesToday / Math.max(1, yogaGoalMin)) * 100));
  const yogaGoalMet = yogaMinutesToday >= yogaGoalMin;
  const yogaRemaining = Math.max(0, Math.round((yogaGoalMin - yogaMinutesToday) * 10) / 10);
  const thumbnailsReady = !(thumbnailsLoading || metadataLoading);

  return (
    <div className="flex flex-col gap-4 pt-4 md:pt-6 pb-6">
      {/* HERO — BBDO Daily Breath Protocol (big, prominent) */}
      <div className="mx-5">
        <motion.button
          onClick={() => setBreathOpen(true)}
          whileTap={{ scale: 0.99 }}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="no-pill w-full text-left rounded-2xl overflow-hidden shadow-card relative"
          style={{ background: "linear-gradient(135deg, #0F1A3D 0%, #1E3A8A 55%, #2563EB 100%)" }}
        >
          <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full bg-white/10 blur-2xl pointer-events-none" />

          {/* Big thumbnail */}
          <div className="relative w-full bg-black/40" style={{ aspectRatio: "16 / 9" }}>
            <img
              src={`https://i.ytimg.com/vi/${BREATH_PROTOCOL_VIDEO.youtubeId}/maxresdefault.jpg`}
              alt="BBDO Daily Breath Protocol"
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement;
                if (!el.dataset.fallback) {
                  el.dataset.fallback = "1";
                  el.src = `https://i.ytimg.com/vi/${BREATH_PROTOCOL_VIDEO.youtubeId}/hqdefault.jpg`;
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
                <Wind className="w-3 h-3" /> BBDO Hero Ritual
              </span>
              {breathDone && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black text-white" style={{ background: "#10B981" }}>
                  <CheckCircle2 className="w-3 h-3" /> Done today
                </span>
              )}
            </div>
            <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-black/70 text-white text-[11px] font-black">76s</div>
          </div>

          {/* Info + rounds */}
          <div className="relative p-4 md:p-5 text-white">
            <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/80">Exercise Library · Hero</p>
            <h1 className="text-[20px] md:text-2xl font-black leading-tight mt-1">
              The 4-7-8 Breathing Protocol
            </h1>
            <p className="text-[12px] md:text-[13px] text-white/85 mt-1 leading-snug">
              BBDO 76 seconds daily breath protocol · complete 4 rounds every day.
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/80">Today</span>
                  <span className="text-[11px] font-black tabular-nums">{breathCount}/{breathGoal} rounds</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{ width: `${Math.min(100, (breathCount / breathGoal) * 100)}%` }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ background: breathDone ? "#10B981" : "#FFFFFF" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.button>
      </div>

      {/* Compact daily-goal marker — small, informational */}
      <div className="mx-5">
        <div
          className="rounded-xl px-3.5 py-2.5 flex items-center gap-3 shadow-card"
          style={{ background: "var(--bbdo-gradient)" }}
        >
          <div className="flex items-center gap-1.5 shrink-0 text-white">
            <Target className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-[0.14em]">Daily goal</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-1.5 rounded-full bg-white/25 overflow-hidden">
              <motion.div
                initial={false}
                animate={{ width: `${yogaPct}%` }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full"
                style={{ background: yogaGoalMet ? "#10B981" : "#FFFFFF" }}
              />
            </div>
          </div>
          <span className="text-[11px] font-black tabular-nums text-white shrink-0">
            {yogaMinutesToday}/{yogaGoalMin}m
          </span>
          {yogaGoalMet && (
            <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
          )}
        </div>
      </div>






      {/* Search */}
      <div className="px-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, benefit, category…"
            className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Yoga upsell + booking status */}
      <YogaUpsell />



      {/* Group pills */}
      <div className="flex gap-2 px-5 pr-8 overflow-x-auto no-scrollbar snap-x pb-1">
        {videoGroups.map((g) => (
          <button
            key={g.id}
            onClick={() => setGroup(g.id)}
            className={`shrink-0 snap-start px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 border transition-colors ${
              group === g.id
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-white text-foreground/80 border-border hover:bg-accent"
            }`}
          >
            <VideoFlatIcon name={g.icon} className="w-4 h-4" />
            <span className="whitespace-nowrap">{g.label}</span>
          </button>
        ))}
      </div>

      {/* Tag pills */}
      <div className="flex gap-2 px-5 pr-8 overflow-x-auto no-scrollbar snap-x pb-1">
        {videoTagFilters.map((t) => (
          <button
            key={t.id}
            onClick={() => setTag(t.id)}
            className={`shrink-0 snap-start px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
              tag === t.id
                ? "bg-foreground text-background border-foreground"
                : "bg-white text-foreground/70 border-border hover:bg-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>



      {/* Continue watching row — Netflix-style */}
      {thumbnailsReady && continueWatching.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-5 text-sm font-black uppercase tracking-[0.12em] text-foreground/80">
            Continue Watching
          </h2>
          <div className="flex gap-3 px-5 overflow-x-auto pb-2 snap-x" style={{ scrollbarWidth: "none" }}>
            {continueWatching.map((v) => {
              const s = getStatus(v.id, v.youtubeId);
              return (
                <button
                  key={v.id}
                  onClick={() => setActive({ ...v, thumbnail: resolve(v.id, v.thumbnail) })}
                  className="no-pill snap-start shrink-0 w-56 rounded-xl overflow-hidden bg-white border border-border shadow-card text-left hover:-translate-y-px"
                >
                  <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
                    <img src={resolve(v.id, v.thumbnail)} alt={v.name} loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/95 text-foreground flex items-center justify-center">
                        <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                      <div className="h-full bg-[var(--bbdo-red)]" style={{ width: `${Math.max(2, s.ratio * 100)}%` }} />
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-foreground font-bold text-sm truncate">{v.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDuration(s.progressSec)} of {s.durationSec > 0 ? formatDuration(s.durationSec) : "—"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Cards */}
      <div className="grid gap-3 px-5 md:grid-cols-2">
        {!thumbnailsReady && Array.from({ length: 6 }).map((_, index) => (
          <div key={`video-card-skeleton-${index}`} className="rounded-xl overflow-hidden bg-white border border-border shadow-card">
            <div className="w-full bg-muted animate-pulse" style={{ aspectRatio: "16 / 9" }} />
            <div className="p-3 space-y-2">
              <div className="h-4 w-2/3 rounded-full bg-muted animate-pulse" />
              <div className="h-3 w-full rounded-full bg-muted animate-pulse" />
              <div className="h-3 w-1/2 rounded-full bg-muted animate-pulse" />
            </div>
          </div>
        ))}
        {thumbnailsReady && filtered.map((v, i) => {
          const s = getStatus(v.id, v.youtubeId);
          return (
            <motion.button
              key={v.id}
              onClick={() => setActive({ ...v, thumbnail: resolve(v.id, v.thumbnail) })}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              whileTap={{ scale: 0.98 }}
              className="no-pill rounded-xl text-left overflow-hidden group bg-white border border-border shadow-card hover:-translate-y-px"
            >
              <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
                <img
                  src={resolve(v.id, v.thumbnail)}
                  alt={v.name}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                {/* Top-left icon */}
                <div className="absolute top-2 left-2 w-9 h-9 rounded-xl bg-white/90 backdrop-blur flex items-center justify-center text-primary shadow-card">
                  <VideoFlatIcon name={v.icon} className="w-5 h-5" />
                </div>

                {/* Top-right status badge */}
                <div className="absolute top-2 right-2 flex gap-1.5">
                  {s.completed ? (
                    <span className="px-2 py-0.5 rounded-full bg-success-soft text-success text-[10px] font-bold inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Watched
                    </span>
                  ) : s.started ? (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--bbdo-red)] text-white text-[10px] font-bold">
                      In Progress
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-white/85 backdrop-blur text-foreground text-[10px] font-semibold">
                      {v.group}
                    </span>
                  )}
                </div>

                {/* Center play button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white/95 text-foreground flex items-center justify-center shadow-lift">
                    {s.completed ? (
                      <RotateCcw className="w-5 h-5" />
                    ) : (
                      <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
                    )}
                  </div>
                </div>

                {/* Bottom — duration */}
                {s.durationSec > 0 && (
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-bold inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatDuration(s.durationSec)}
                  </div>
                )}

                {/* Progress bar for in-progress */}
                {s.started && !s.completed && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div className="h-full bg-[var(--bbdo-red)]" style={{ width: `${Math.max(2, s.ratio * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-foreground font-bold text-sm leading-tight">{v.name}</h3>
                  {s.completed && (
                    <span className="shrink-0 text-[10px] font-bold text-success inline-flex items-center gap-0.5">
                      <RotateCcw className="w-3 h-3" /> Watch again
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{v.benefits}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {v.tags.slice(0, 3).map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-accent text-foreground text-[10px]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {thumbnailsReady && filtered.length === 0 && (
        <div className="text-center py-12 px-5">
          <p className="text-muted-foreground text-sm">No videos match these filters.</p>
        </div>
      )}

      <AnimatePresence>
        {active && <VideoPlayer video={active} onClose={() => setActive(null)} />}
      </AnimatePresence>

      <BreathProtocolDrawer open={breathOpen} onOpenChange={setBreathOpen} />
    </div>
  );
}
