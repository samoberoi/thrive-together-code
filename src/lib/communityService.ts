import { supabase } from "@/integrations/supabase/client";

export interface CommunityPost {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  post_type: string;
  achievement_data: any;
  like_count: number;
  comment_count: number;
  created_at: string;
  category_slug?: string | null;
  // joined from profiles
  user_name?: string;
  user_avatar?: string;
}

export interface PostCategory {
  id: string;
  slug: string;
  label: string;
  emoji: string | null;
  accent_color: string;
  sort_order: number;
  is_active: boolean;
}

export async function fetchPostCategories(includeInactive = false): Promise<PostCategory[]> {
  let q: any = (supabase as any)
    .from("community_post_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []) as PostCategory[];
}

export interface CommunityComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
}

/**
 * Look up display names/avatars for a set of authors.
 * Uses a security-definer RPC so every member sees real names in the feed
 * (profiles RLS only exposes your own row), with a direct-table fallback.
 */
async function fetchAuthorProfiles(
  userIds: string[],
): Promise<Map<string, { name: string | null; avatar_url: string | null }>> {
  const map = new Map<string, { name: string | null; avatar_url: string | null }>();
  if (userIds.length === 0) return map;

  const { data: rpcData } = await (supabase as any).rpc("community_author_profiles", {
    _user_ids: userIds,
  });
  if (Array.isArray(rpcData) && rpcData.length > 0) {
    for (const p of rpcData) map.set(p.user_id, { name: p.name, avatar_url: p.avatar_url });
    return map;
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, name, avatar_url")
    .in("user_id", userIds);
  for (const p of profiles || []) map.set(p.user_id, { name: p.name, avatar_url: p.avatar_url });
  return map;
}

/** Fetch feed posts with user profile info */
export async function fetchPosts(limit = 50, categorySlug: string | null = null): Promise<CommunityPost[]> {
  let q: any = (supabase as any)
    .from("community_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (categorySlug) q = q.eq("category_slug", categorySlug);
  const { data: posts, error } = await q;
  if (error || !posts) return [];

  const userIds = [...new Set(posts.map((p: any) => p.user_id))] as string[];
  const profileMap = await fetchAuthorProfiles(userIds);

  return posts.map((p: any) => {
    const profile = profileMap.get(p.user_id);
    return {
      ...p,
      user_name: profile?.name || "Community Member",
      user_avatar: profile?.avatar_url || null,
    };
  });
}

/** Create a new post */
export async function createPost(
  userId: string,
  content: string,
  postType: string = "manual",
  achievementData?: any,
  imageUrl?: string,
  categorySlug?: string | null,
): Promise<boolean> {
  const { error } = await (supabase as any).from("community_posts").insert({
    user_id: userId,
    content,
    post_type: postType,
    achievement_data: achievementData || null,
    image_url: imageUrl || null,
    category_slug: categorySlug || null,
  });
  return !error;
}

/**
 * Upload an image to the community-images bucket and return a long-lived
 * signed URL usable as <img src>. Files are namespaced under the user's id
 * so per-user RLS policies apply.
 */
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.72;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to read image")); };
    img.src = url;
  });
}

function formatStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Preload BBDO logo once for watermarking
import bbdoLogoAsset from "@/assets/bbdo-logo.png.asset.json";
let _bbdoLogoImg: HTMLImageElement | null = null;
let _bbdoLogoPromise: Promise<HTMLImageElement | null> | null = null;
function loadBbdoLogo(): Promise<HTMLImageElement | null> {
  if (_bbdoLogoImg) return Promise.resolve(_bbdoLogoImg);
  if (_bbdoLogoPromise) return _bbdoLogoPromise;
  _bbdoLogoPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { _bbdoLogoImg = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = (bbdoLogoAsset as any).url;
  });
  return _bbdoLogoPromise;
}

/** Draw BBDO logo + timestamp watermark in the bottom-right corner. */
function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, logo: HTMLImageElement | null) {
  const base = Math.max(12, Math.min(28, Math.round(Math.min(w, h) * 0.028)));
  const pad = Math.round(base * 0.6);
  const gap = Math.round(base * 0.45);
  const stamp = formatStamp(new Date());

  const stampFont = `600 ${Math.round(base * 0.78)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  // Logo box size (scaled to base)
  const logoH = Math.round(base * 1.6);
  const logoW = logo ? Math.round(logoH * (logo.naturalWidth / logo.naturalHeight)) : Math.round(logoH * 1.2);

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  ctx.font = stampFont;
  const stampW = ctx.measureText(stamp).width;

  const boxW = Math.max(logoW, stampW) + pad * 2;
  const boxH = logoH + gap + Math.round(base * 0.78) + pad * 1.4;
  const x = w - boxW - Math.round(base * 0.5);
  const y = h - boxH - Math.round(base * 0.5);

  // Pill background
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = Math.round(base * 0.25);
  ctx.shadowOffsetY = Math.max(1, Math.round(base * 0.08));
  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  const r = Math.round(base * 0.4);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r);
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r);
  ctx.arcTo(x, y + boxH, x, y, r);
  ctx.arcTo(x, y, x + boxW, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = Math.max(1, Math.round(base * 0.07));
  ctx.stroke();

  // Logo (centered horizontally in the pill)
  if (logo) {
    const lx = x + (boxW - logoW) / 2;
    const ly = y + pad * 0.7;
    ctx.drawImage(logo, lx, ly, logoW, logoH);
  }

  // Timestamp
  ctx.font = stampFont;
  ctx.fillStyle = "rgba(255, 255, 255, 1)";
  const tsY = y + pad * 0.7 + logoH + gap + Math.round(base * 0.78);
  ctx.fillText(stamp, x + (boxW - stampW) / 2, tsY);

  ctx.restore();
}

async function compressImage(file: File): Promise<Blob> {
  // GIFs (animation) — can't stamp without losing animation; leave untouched
  if (file.type === "image/gif") return file;
  try {
    const img = await loadImage(file);
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const logo = await loadBbdoLogo();
    drawWatermark(ctx, w, h, logo);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    return blob;
  } catch {
    return file;
  }
}

export async function uploadCommunityImage(userId: string, file: File): Promise<string | null> {
  const compressed = await compressImage(file);
  const contentType = compressed.type || "image/jpeg";
  const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("community-images")
    .upload(path, compressed, { cacheControl: "31536000", upsert: false, contentType });
  if (upErr) return null;
  // 10-year signed URL (private bucket, but readable by any authenticated user via RLS).
  const { data, error } = await supabase.storage
    .from("community-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}



/** Delete a post */
export async function deletePost(postId: string): Promise<boolean> {
  const { error } = await supabase.from("community_posts").delete().eq("id", postId);
  return !error;
}

/** Fetch comments for a post */
export async function fetchComments(postId: string): Promise<CommunityComment[]> {
  const { data: comments, error } = await supabase
    .from("community_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error || !comments) return [];

  const userIds = [...new Set(comments.map((c: any) => c.user_id))];
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, name, avatar_url")
    .in("user_id", userIds);

  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

  return comments.map((c: any) => {
    const profile = profileMap.get(c.user_id);
    return {
      ...c,
      user_name: profile?.name || "Member",
      user_avatar: profile?.avatar_url || null,
    };
  });
}

/** Add a comment */
export async function addComment(postId: string, userId: string, content: string): Promise<boolean> {
  const { error } = await supabase.from("community_comments").insert({
    post_id: postId,
    user_id: userId,
    content,
  });
  return !error;
}

/** Toggle like on a post. Returns whether the post is now liked. */
export async function toggleLike(postId: string, userId: string): Promise<boolean> {
  // Check if already liked
  const { data: existing } = await supabase
    .from("community_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await supabase.from("community_likes").delete().eq("id", existing.id);
    return false; // unliked
  } else {
    // Upsert-style: swallow duplicate-key errors so double-taps don't error out
    await supabase
      .from("community_likes")
      .insert({ post_id: postId, user_id: userId }, { count: "exact" } as any);
    return true; // liked
  }
}

/** Check which posts the user has liked */
export async function fetchUserLikes(userId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data } = await supabase
    .from("community_likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);

  return new Set((data || []).map((d: any) => d.post_id));
}

export interface PostLiker {
  user_id: string;
  name: string;
  avatar_url: string | null;
}

/** Fetch the actual list of users who liked a post (most recent first). */
export async function fetchPostLikers(postId: string, limit = 100): Promise<PostLiker[]> {
  const { data, error } = await (supabase as any).rpc("get_community_post_likers", {
    _post_id: postId,
    _limit: limit,
  });

  if (error || !data) return [];

  return data.map((l: any) => ({
    user_id: l.user_id,
    name: l.name || "Member",
    avatar_url: l.avatar_url || null,
  }));
}

/** Generate achievement post content */
export function generateAchievementContent(
  type: "weight" | "sugar" | "health_score" | "streak",
  data: { before?: number; after?: number; delta?: number; days?: number }
): string {
  switch (type) {
    case "weight":
      return `🎉 Just hit a weight milestone! Down ${Math.abs(data.delta || 0).toFixed(1)} kg from ${data.before?.toFixed(1)} to ${data.after?.toFixed(1)} kg. Every kilo counts in this journey! 💪`;
    case "sugar":
      return `📉 Blood glucose improving! From ${data.before} to ${data.after} mg/dL. Consistency is paying off! 🩸`;
    case "health_score":
      return `🏆 Health score jumped from ${data.before} to ${data.after}! That's a +${data.delta} improvement. Feeling stronger every day! ✨`;
    case "streak":
      return `🔥 ${data.days}-day streak achieved! Showing up daily is the real transformation. Who else is on a streak? 💪`;
    default:
      return "Making progress on my health journey! 🌟";
  }
}


// ─── Member count ────────────────────────────────────────────────────────
// Counting profiles under row-level security meant a full scan on every feed
// mount (seconds on a large member list). Use the cheap RPC and cache it.
const MEMBER_COUNT_TTL_MS = 5 * 60_000;
let memberCountCache: { at: number; value: number } | null = null;

export async function fetchCommunityMemberCount(): Promise<number> {
  if (memberCountCache && Date.now() - memberCountCache.at < MEMBER_COUNT_TTL_MS) {
    return memberCountCache.value;
  }
  const { data, error } = await (supabase as any).rpc("community_member_count");
  if (error) {
    console.warn("fetchCommunityMemberCount failed", error);
    return memberCountCache?.value ?? 0;
  }
  const value = Number(data ?? 0);
  memberCountCache = { at: Date.now(), value };
  return value;
}
