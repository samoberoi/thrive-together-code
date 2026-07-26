import { supabase } from "@/integrations/supabase/client";

export type ThumbnailMap = Record<string, string>;

const THUMBNAIL_BUCKET = "avatars";
const THUMBNAIL_FOLDER = "video-thumbnails";
const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;

function withVersion(url: string, updatedAt?: string | null) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  const version = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${version}`;
}

function extensionFor(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ["jpg", "jpeg", "png", "webp"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  return "jpg";
}

function dataUrlToFile(dataUrl: string, videoId: string) {
  const [header, payload] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] || "image/png";
  const binary = atob(payload || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], `${videoId}.png`, { type: mime });
}

function loadBitmap(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read thumbnail image"));
    };
    img.src = url;
  });
}

async function compressThumbnail(file: File): Promise<Blob> {
  const img = await loadBitmap(file);
  const sourceWidth = img.naturalWidth || THUMBNAIL_WIDTH;
  const sourceHeight = img.naturalHeight || THUMBNAIL_HEIGHT;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = THUMBNAIL_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare thumbnail image");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress thumbnail image"))),
      "image/jpeg",
      0.86,
    );
  });
}

async function uploadThumbnail(videoId: string, file: File) {
  const safeVideoId = videoId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const now = Date.now();
  const ext = extensionFor(file);
  const blob = file.type === "image/gif" ? file : await compressThumbnail(file);
  const contentType = blob.type || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  const path = `${THUMBNAIL_FOLDER}/${safeVideoId}/${now}-${crypto.randomUUID()}.${contentType.includes("jpeg") ? "jpg" : ext}`;
  const { error } = await supabase.storage.from(THUMBNAIL_BUCKET).upload(path, blob, {
    upsert: false,
    contentType,
    cacheControl: "31536000",
  });
  if (error) throw error;
  const { data } = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─── Thumbnail override cache ────────────────────────────────────────────
// Every video grid (Yoga, Exercise, Videos, admin) pulls the whole overrides
// table on mount. Cache the map for 5 minutes in memory AND in localStorage so
// a cold app launch paints from disk instead of waiting on a full-table scan.
const THUMBNAIL_TTL_MS = 5 * 60_000;
const THUMBNAIL_STORAGE_KEY = "bbdo_video_thumbnail_overrides";
let thumbnailCache: { at: number; map: ThumbnailMap } | null = null;
let thumbnailInFlight: Promise<ThumbnailMap> | null = null;

function readPersistedCache(): { at: number; map: ThumbnailMap } | null {
  try {
    const raw = localStorage.getItem(THUMBNAIL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; map: ThumbnailMap };
    if (!parsed?.map || typeof parsed.at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistCache(entry: { at: number; map: ThumbnailMap } | null) {
  try {
    if (!entry) localStorage.removeItem(THUMBNAIL_STORAGE_KEY);
    else localStorage.setItem(THUMBNAIL_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* storage full / unavailable — memory cache still works */
  }
}

export function invalidateThumbnailOverrides() {
  thumbnailCache = null;
  thumbnailInFlight = null;
  persistCache(null);
}

/** Last known overrides (no network) — lets grids paint instantly. */
export function getCachedThumbnailOverrides(): ThumbnailMap | null {
  if (!thumbnailCache) thumbnailCache = readPersistedCache();
  return thumbnailCache?.map ?? null;
}


export async function fetchThumbnailOverrides(
  opts: { force?: boolean } = {},
): Promise<ThumbnailMap> {
  if (!opts.force) {
    if (thumbnailCache && Date.now() - thumbnailCache.at < THUMBNAIL_TTL_MS) return thumbnailCache.map;
    if (thumbnailInFlight) return thumbnailInFlight;
  }

  const request = (async () => {
    const { data, error } = await supabase
      .from("video_thumbnails")
      .select("video_id, thumbnail_url, updated_at");
    if (error || !data) return thumbnailCache?.map ?? {};
    const map: ThumbnailMap = {};
    for (const row of data) map[row.video_id] = withVersion(row.thumbnail_url, row.updated_at);
    thumbnailCache = { at: Date.now(), map };
    return map;
  })();

  thumbnailInFlight = request;
  try {
    return await request;
  } finally {
    thumbnailInFlight = null;
  }
}

export async function setVideoThumbnail(videoId: string, thumbnail: string | File) {
  const { data: auth } = await supabase.auth.getUser();
  const updatedAt = new Date().toISOString();
  const thumbnailUrl = typeof thumbnail === "string"
    ? thumbnail.startsWith("data:image/")
      ? await uploadThumbnail(videoId, dataUrlToFile(thumbnail, videoId))
      : thumbnail
    : await uploadThumbnail(videoId, thumbnail);

  const { error } = await supabase
    .from("video_thumbnails")
    .upsert({
      video_id: videoId,
      thumbnail_url: thumbnailUrl,
      updated_by: auth.user?.id ?? null,
      updated_at: updatedAt,
    }, { onConflict: "video_id" });
  if (error) throw error;

  const { error: metadataError } = await supabase.from("video_metadata").upsert(
    {
      video_id: videoId,
      thumbnail_url: thumbnailUrl,
      updated_by: auth.user?.id ?? null,
      updated_at: updatedAt,
    },
    { onConflict: "video_id" },
  );
  if (metadataError) throw metadataError;
  invalidateThumbnailOverrides();
}

export async function clearVideoThumbnail(videoId: string) {
  const { error } = await supabase.from("video_thumbnails").delete().eq("video_id", videoId);
  if (error) throw error;
  const { error: metadataError } = await supabase
    .from("video_metadata")
    .update({ thumbnail_url: null, updated_at: new Date().toISOString() })
    .eq("video_id", videoId);
  if (metadataError) throw metadataError;
  invalidateThumbnailOverrides();
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
