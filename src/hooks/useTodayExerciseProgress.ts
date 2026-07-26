import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDailyExerciseGoal } from "@/hooks/useAppSettings";
import { getTodayExerciseMinutes } from "@/lib/yogaProgressService";
import { getVideoProgressTodayKey, loadWatched } from "@/lib/videoProgressStore";

function localExerciseMinutesToday() {
  if (typeof window === "undefined") return 0;
  const today = getVideoProgressTodayKey();
  let seconds = 0;
  for (const [videoId, record] of Object.entries(loadWatched())) {
    if (!videoId.startsWith("exercise:")) continue;
    if (record.sessionDate === today) {
      seconds += Math.max(0, record.todayWatchedSec ?? record.progressSec ?? 0);
    }
  }
  return Math.round((seconds / 60) * 10) / 10;
}

export function useTodayExerciseProgress(fallbackGoal = 30) {
  const { user } = useAuth();
  const goal = useDailyExerciseGoal(fallbackGoal);
  const [minutes, setMinutes] = useState(0);

  const refresh = useCallback(async () => {
    const localMinutes = localExerciseMinutesToday();
    if (!user?.id) {
      setMinutes(localMinutes);
      return;
    }
    setMinutes(localMinutes);
    const backendMinutes = await getTodayExerciseMinutes(user.id);
    setMinutes(Math.max(localMinutes, backendMinutes));
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const localMinutes = localExerciseMinutesToday();
      if (!user?.id) {
        if (!cancelled) setMinutes(localMinutes);
        return;
      }
      if (!cancelled) setMinutes(localMinutes);
      const next = await getTodayExerciseMinutes(user.id);
      if (!cancelled) setMinutes(Math.max(localMinutes, next));
    };

    void load();
    const onProgress = () => void load();
    window.addEventListener("exercise-log-saved", onProgress);
    window.addEventListener("bbdo:video-progress-changed", onProgress);
    window.addEventListener("bbdo:video-progress-synced", onProgress);
    window.addEventListener("storage", onProgress);
    // No polling: progress events cover live updates, focus covers the rest.
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("exercise-log-saved", onProgress);
      window.removeEventListener("bbdo:video-progress-changed", onProgress);
      window.removeEventListener("bbdo:video-progress-synced", onProgress);
      window.removeEventListener("storage", onProgress);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id]);

  return {
    minutes,
    goal,
    done: goal > 0 && minutes >= goal,
    refresh,
    setMinutes,
  };
}