// BBDO Soleus Push-Ups Protocol — post-meal calf pump, done 3x/day.
// Users tap "Complete this round" after each session; each tap records
// one row in user_soleus_sessions.

import { supabase } from "@/integrations/supabase/client";

export const SOLEUS_DAILY_GOAL = 3;

// Reuses the admin-uploaded "Soleus Push-Ups" exercise video / thumbnail.
// Overridable via app_settings("bbdo_soleus_protocol_youtube_id").
export const SOLEUS_DEFAULT_YOUTUBE_ID = "sggnIlX0KH0";
export const SOLEUS_DEFAULT_THUMBNAIL = supabase.storage
  .from("avatars")
  .getPublicUrl(
    "exercise-thumbnails/new/1784658435645-00994c63-49eb-4fc2-9a29-ffe68595b8f7.jpg",
  ).data.publicUrl;

export const SOLEUS_PROTOCOL_VIDEO = {
  id: "soleus-push-ups",
  name: "Soleus Push-Ups",
  description:
    "BBDO post-meal calf pump — soleus push-ups blunt post-meal glucose spikes. Complete 3 rounds every day (morning, afternoon, evening) to close the loop.",
  category: "BBDO Ritual · Movement",
  youtubeId: SOLEUS_DEFAULT_YOUTUBE_ID,
  thumbnailUrl: SOLEUS_DEFAULT_THUMBNAIL,
};

function startOfLocalDayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function fetchSoleusSessionsToday(userId: string): Promise<number> {
  const { count, error } = await (supabase as any)
    .from("user_soleus_sessions")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .gte("session_at", startOfLocalDayISO());
  if (error) {
    console.warn("[soleus] fetch failed", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function recordSoleusSession(
  userId: string,
  source: "manual" | "video" = "manual",
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("user_soleus_sessions")
    .insert({ user_id: userId, source });
  if (error) {
    console.warn("[soleus] insert failed", error.message);
    return false;
  }
  window.dispatchEvent(new CustomEvent("soleus-session-saved"));
  return true;
}

export async function getSoleusVideoConfig(): Promise<{ youtubeId: string; thumbnailUrl: string }> {
  let youtubeId = SOLEUS_DEFAULT_YOUTUBE_ID;
  let thumbnailUrl = SOLEUS_DEFAULT_THUMBNAIL;
  try {
    // Prefer the current admin-managed exercise row so any thumbnail/video swap
    // by the admin flows into the hero automatically.
    const { data } = await (supabase as any)
      .from("exercises")
      .select("youtube_url, image_url")
      .ilike("name", "%soleus%")
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();
    if (data) {
      const url: string = data.youtube_url || "";
      const m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
        url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
        url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
      if (m) youtubeId = m[1];
      if (typeof data.image_url === "string" && data.image_url.length > 0) {
        thumbnailUrl = data.image_url;
      }
    }
  } catch {}
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "bbdo_soleus_protocol_youtube_id")
      .maybeSingle();
    const v = (data as any)?.value;
    if (typeof v === "string" && v.length >= 6) youtubeId = v;
    else if (v && typeof v === "object" && typeof v.id === "string") youtubeId = v.id;
  } catch {}
  return { youtubeId, thumbnailUrl };
}
