import { useEffect, useState, useCallback } from "react";
import {
  fetchThumbnailOverrides,
  getCachedThumbnailOverrides,
  type ThumbnailMap,
} from "@/lib/videoThumbnailService";

const THUMBNAILS_CHANGED_EVENT = "bbdo:video-thumbnails-changed";

export function notifyVideoThumbnailsChanged() {
  window.dispatchEvent(new CustomEvent(THUMBNAILS_CHANGED_EVENT));
}

export function useVideoThumbnails() {
  const cached = getCachedThumbnailOverrides();
  const [overrides, setOverrides] = useState<ThumbnailMap>(cached ?? {});
  const [loading, setLoading] = useState(!cached);

  const reload = useCallback(async (force = false) => {
    if (!getCachedThumbnailOverrides()) setLoading(true);
    const map = await fetchThumbnailOverrides({ force });
    setOverrides(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const onChanged = () => void reload(true);
    window.addEventListener(THUMBNAILS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(THUMBNAILS_CHANGED_EVENT, onChanged);
  }, [reload]);

  const resolve = useCallback(
    (videoId: string, fallback: string) => overrides[videoId] || fallback,
    [overrides],
  );

  return { overrides, loading, reload, resolve };
}
