export type YouTubePlayerMessage = {
  source: "bbdo-youtube-player";
  type: "ready" | "state" | "progress" | "error";
  videoId: string;
  state?: number;
  currentTime?: number;
  duration?: number;
  code?: number;
};

export type YouTubePlayerCommand =
  | { source: "bbdo-workout"; type: "play" | "pause" | "mute" | "unmute" }
  | { source: "bbdo-workout"; type: "seek"; seconds: number };

export function youtubePlayerProxyUrl(
  videoId: string,
  options: { autoplay?: boolean; start?: number; controls?: boolean; simple?: boolean } = {},
) {
  const params = new URLSearchParams({
    v: videoId,
    autoplay: options.autoplay === false ? "0" : "1",
    controls: options.controls === false ? "0" : "1",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    fs: "1",
  });

  if (options.simple) params.set("mode", "simple");

  const start = Math.max(0, Math.floor(options.start || 0));
  if (start > 0) params.set("start", String(start));

  return `/youtube-player.html?${params.toString()}`;
}

export function isYoutubePlayerMessage(data: unknown, videoId?: string): data is YouTubePlayerMessage {
  if (!data || typeof data !== "object") return false;
  const message = data as Partial<YouTubePlayerMessage>;
  if (message.source !== "bbdo-youtube-player") return false;
  if (!message.videoId || (videoId && message.videoId !== videoId)) return false;
  return ["ready", "state", "progress", "error"].includes(message.type || "");
}

export function isNativeMobileApp() {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return Boolean(cap?.getPlatform && cap.getPlatform() !== "web");
  }
}

export function isNativeIOSApp() {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.() && cap?.getPlatform?.() === "ios");
  } catch {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && isNativeMobileApp();
  }
}

export function isNativeAndroidApp() {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.() && cap?.getPlatform?.() === "android");
  } catch {
    return /android/i.test(window.navigator.userAgent) && isNativeMobileApp();
  }
}