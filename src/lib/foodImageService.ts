import { supabase } from "@/integrations/supabase/client";

// Fast food image loader.
// - Signs storage URLs directly with built-in image transforms so the CDN
//   serves an optimized thumbnail, not the full-res original.
// - Persists signed URLs to localStorage so repeat visits are instant.
// - Cache entries are versioned by the row's storage path + updated_at, so a
//   re-uploaded image (same path) invalidates the cached/signed URL instead of
//   serving a stale picture for the rest of the TTL.

const BUCKET = "food-images";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const CACHE_KEY = "food-img-cache-v4";
const SIZE = 240; // px — list thumbs (88px @ 3x) + detail hero
const QUALITY = 70;
const CONCURRENCY = 24;

type Entry = { url: string; expires: number; ver: string };

function versionOf(path?: string | null, updatedAt?: string | null): string {
  return `${path || ""}|${updatedAt ? new Date(updatedAt).getTime() : ""}`;
}

let mem: Record<string, Entry> | null = null;
function loadCache(): Record<string, Entry> {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { mem = {}; }
  return mem!;
}
let saveTimer: number | null = null;
function saveCache() {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(mem || {})); } catch {}
    saveTimer = null;
  }, 250);
}
function getFromCache(id: string, ver?: string): string | null {
  const c = loadCache();
  const e = c[id];
  if (!e || e.expires <= Date.now()) return null;
  if (ver !== undefined && e.ver !== ver) return null;
  return e.url;
}
function setInCache(id: string, url: string, ver: string) {
  const c = loadCache();
  c[id] = { url, expires: Date.now() + (TTL_SECONDS - 60 * 60) * 1000, ver };
  saveCache();
}

/** Synchronous cache read — safe to call during render. */
export function getCachedFoodImageUrl(foodItemId: string): string | null {
  return getFromCache(foodItemId);
}

const inflight = new Map<string, Promise<string | null>>();

async function fetchRow(foodItemId: string): Promise<{ path: string | null; updatedAt: string | null }> {
  const { data } = await supabase
    .from("food_items")
    .select("image_url, updated_at")
    .eq("id", foodItemId)
    .maybeSingle();
  return {
    path: ((data as any)?.image_url as string | null) || null,
    updatedAt: ((data as any)?.updated_at as string | null) || null,
  };
}

function withVersion(url: string, ver: string) {
  if (!ver) return url;
  const tag = encodeURIComponent(ver);
  return `${url}${url.includes("?") ? "&" : "?"}v=${tag}`;
}

async function signPath(path: string, ver: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS, {
    transform: { width: SIZE, height: SIZE, resize: "cover", quality: QUALITY },
  });
  return data?.signedUrl ? withVersion(data.signedUrl, ver) : null;
}

export function getFoodImageUrl(foodItemId: string): Promise<string | null> {
  if (inflight.has(foodItemId)) return inflight.get(foodItemId)!;
  const p = (async () => {
    const { path, updatedAt } = await fetchRow(foodItemId);
    const ver = versionOf(path, updatedAt);
    const cached = getFromCache(foodItemId, ver);
    if (cached) return cached;
    if (path) {
      if (/^https?:\/\//i.test(path)) {
        const abs = withVersion(path, ver);
        setInCache(foodItemId, abs, ver);
        emit();
        return abs;
      }
      const url = await signPath(path, ver);
      if (url) { setInCache(foodItemId, url, ver); emit(); return url; }
    }
    return null;
  })();
  inflight.set(foodItemId, p);
  p.finally(() => inflight.delete(foodItemId));
  return p;
}

/**
 * Batch-prime the cache and return a synchronous id→url map.
 * Notifies subscribers via `subscribeFoodImages` as URLs arrive so parent lists
 * can re-render in chunks rather than waiting for the whole batch.
 */
export async function primeFoodImages(
  items: Array<{ id: string; image_url?: string | null; updated_at?: string | null }>,
) {
  const need: Array<{ id: string; path: string; ver: string; absolute: boolean }> = [];
  for (const it of items) {
    if (!it.image_url) continue;
    const ver = versionOf(it.image_url, it.updated_at ?? null);
    if (getFromCache(it.id, ver)) continue;
    need.push({ id: it.id, path: it.image_url, ver, absolute: /^https?:\/\//i.test(it.image_url) });
  }
  if (!need.length) { emit(); return; }
  const queue = [...need];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()!;
      if (next.absolute) { setInCache(next.id, withVersion(next.path, next.ver), next.ver); emit(); continue; }
      const url = await signPath(next.path, next.ver);
      if (url) { setInCache(next.id, url, next.ver); emit(); }
    }
  });
  await Promise.all(workers);
}

// Pub/sub so list views re-render as URLs stream in.
const listeners = new Set<() => void>();
let emitScheduled = false;
function emit() {
  if (emitScheduled) return;
  emitScheduled = true;
  // Coalesce bursts into a single frame — avoids O(N) re-renders.
  requestAnimationFrame(() => {
    emitScheduled = false;
    listeners.forEach((l) => l());
  });
}
export function subscribeFoodImages(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function primeFoodImageCache(itemId: string, url: string) {
  setInCache(itemId, url, versionOf(url, new Date().toISOString()));
  emit();
}
