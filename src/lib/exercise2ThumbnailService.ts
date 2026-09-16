import { supabase } from "@/integrations/supabase/client";

// Exercise 2.0 keeps its own bucket so changing or deleting a thumbnail here
// can never affect the original Exercise library.
const THUMBNAIL_BUCKET = "exercise2-thumbnails";
const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;

function extensionFor(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ["jpg", "jpeg", "png", "webp"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  return "jpg";
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
  const sw0 = img.naturalWidth || THUMBNAIL_WIDTH;
  const sh0 = img.naturalHeight || THUMBNAIL_HEIGHT;
  const sr = sw0 / sh0;
  const tr = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT;
  let sx = 0,
    sy = 0,
    sw = sw0,
    sh = sh0;
  if (sr > tr) {
    sw = sh0 * tr;
    sx = (sw0 - sw) / 2;
  } else if (sr < tr) {
    sh = sw0 / tr;
    sy = (sh0 - sh) / 2;
  }
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = THUMBNAIL_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare thumbnail image");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not compress thumbnail image"))),
      "image/jpeg",
      0.86
    );
  });
}

export async function uploadExercise2Thumbnail(exerciseId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please upload an image file.");
  const safeId = (exerciseId || "new").replace(/[^a-zA-Z0-9_-]/g, "-");
  const ext = extensionFor(file);
  const blob = file.type === "image/gif" ? file : await compressThumbnail(file);
  const contentType =
    blob.type || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  const finalExt = contentType.includes("jpeg") ? "jpg" : ext;
  const path = `${safeId}/${Date.now()}-${crypto.randomUUID()}.${finalExt}`;
  const { error } = await supabase.storage.from(THUMBNAIL_BUCKET).upload(path, blob, {
    upsert: false,
    contentType,
    cacheControl: "31536000",
  });
  if (error) throw error;
  const { data } = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return m ? m[1] : null;
}

export function youtubeThumbnail(url: string): string | null {
  const id = extractYoutubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
