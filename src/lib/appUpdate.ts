import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION, APP_BUILD } from "@/lib/appVersion";

export type UpdateInfo = {
  version: string;
  build: number | null;
  force: boolean;
  notes: string;
  storeUrl: string;
};

const ANDROID_STORE = "https://play.google.com/store/apps/details?id=com.hyperrevamp.bbdo";
const IOS_BUNDLE_ID = "com.hyperrevamp.bbdo";

/** "1.2.10" > "1.2.9" style comparison. */
function isNewer(remote: string, local: string): boolean {
  const a = String(remote).split(".").map((n) => parseInt(n, 10) || 0);
  const b = String(local).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function iosStoreUrl(): Promise<string> {
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${IOS_BUNDLE_ID}`);
    const json = await res.json();
    const trackId = json?.results?.[0]?.trackId;
    if (trackId) return `https://apps.apple.com/app/id${trackId}`;
    if (json?.results?.[0]?.trackViewUrl) return json.results[0].trackViewUrl;
  } catch {}
  return "https://apps.apple.com/app/apple-store";
}

/**
 * Checks the backend `latest_app_version` setting against the version bundled
 * in this build. Returns null when up to date, or when running on the web
 * (browsers always serve the newest build).
 */
export async function checkForAppUpdate(): Promise<UpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
  try {
    const { data } = await (supabase as any)
      .from("app_settings")
      .select("value")
      .eq("key", "latest_app_version")
      .maybeSingle();
    const cfg = data?.value?.[platform];
    if (!cfg?.version) return null;

    const remoteBuild = Number(cfg.build);
    const localBuild = Number(APP_BUILD);
    const newer =
      isNewer(String(cfg.version), APP_VERSION) ||
      (String(cfg.version) === APP_VERSION &&
        Number.isFinite(remoteBuild) &&
        Number.isFinite(localBuild) &&
        remoteBuild > localBuild);
    if (!newer) return null;

    return {
      version: String(cfg.version),
      build: Number.isFinite(remoteBuild) ? remoteBuild : null,
      force: Boolean(cfg.force),
      notes: String(data?.value?.notes ?? ""),
      storeUrl: platform === "ios" ? await iosStoreUrl() : ANDROID_STORE,
    };
  } catch {
    return null;
  }
}

export function openStore(url: string) {
  const opened = window.open(url, "_system") || window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}
