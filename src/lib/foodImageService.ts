import { supabase } from "@/integrations/supabase/client";

// Fast food image loader.
// - Signs storage URLs directly with built-in image transforms so the CDN
//   serves an optimized thumbnail, not the full-res original.
// - Persists signed URLs to localStorage so repeat visits are instant.
// - Images are uploaded manually; rows without an image_url simply render
//   the placeholder.

const BUCKET = "food-images";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const CACHE_KEY = "food-img-cache-v3";
const SIZE = 240; // px — list thumbs (88px @ 3x) + detail hero
const QUALITY = 70;
const CONCURRENCY = 24;

type Entry = { url: string; expires: number };

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
function getFromCache(id: string): string | null {
  const c = loadCache();
  const e = c[id];
  if (e && e.expires > Date.now()) return e.url;
  return null;
}
function setInCache(id: string, url: string) {
  const c = loadCache();
  c[id] = { url, expires: Date.now() + (TTL_SECONDS - 60 * 60) * 1000 };
  saveCache();
}

/** Synchronous cache read — safe to call during render. */
export function getCachedFoodImageUrl(foodItemId: string): string | null {
  return getFromCache(foodItemId);
}

const inflight = new Map<string, Promise<string | null>>();
const pathInflight = new Map<string, Promise<string | null>>();

async function fetchPath(foodItemId: string): Promise<string | null> {
  if (pathInflight.has(foodItemId)) return pathInflight.get(foodItemId)!;
  const p = (async () => {
    const { data } = await supabase
      .from("food_items")
      .select("image_url")
      .eq("id", foodItemId)
      .maybeSingle();
    return (data?.image_url as string | null) || null;
  })();
  pathInflight.set(foodItemId, p);
  return p;
}

async function signPath(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS, {
    transform: { width: SIZE, height: SIZE, resize: "cover", quality: QUALITY },
  });
  return data?.signedUrl || null;
}

export function getFoodImageUrl(foodItemId: string): Promise<string | null> {
  const cached = getFromCache(foodItemId);
  if (cached) return Promise.resolve(cached);
  if (inflight.has(foodItemId)) return inflight.get(foodItemId)!;
  const p = (async () => {
    const path = await fetchPath(foodItemId);
    if (path) {
      if (/^https?:\/\//i.test(path)) { setInCache(foodItemId, path); return path; }
      const url = await signPath(path);
      if (url) { setInCache(foodItemId, url); return url; }
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
export async function primeFoodImages(items: Array<{ id: string; image_url?: string | null }>) {
  const need: Array<{ id: string; path: string; absolute: boolean }> = [];
  for (const it of items) {
    if (getFromCache(it.id)) continue;
    if (it.image_url) need.push({ id: it.id, path: it.image_url, absolute: /^https?:\/\//i.test(it.image_url) });
  }
  if (!need.length) { emit(); return; }
  const queue = [...need];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()!;
      if (next.absolute) { setInCache(next.id, next.path); emit(); continue; }
      const url = await signPath(next.path);
      if (url) { setInCache(next.id, url); emit(); }
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
  setInCache(itemId, url);
  emit();
}
