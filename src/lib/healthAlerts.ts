import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createNotification } from "@/lib/notificationService";
import { getNotificationSoundSettings } from "@/lib/notificationSoundService";
import { BBDO_PUSH_CHANNEL_ID } from "@/lib/nativePush";
import {
  playCriticalHealthAlert,
  playNotificationSound,
  playSuccess,
  getMasterVolume,
  setMasterVolume,
} from "@/lib/soundEngine";

export type HealthAlertLog = {
  user_id?: string;
  log_type: "diabetes" | "bp" | "weight" | "water";
  glucose_morning?: number | null;
  glucose_evening?: number | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  weight_kg?: number | null;
};

export type RealtimeHealthNotification = {
  id?: string;
  title: string;
  body: string;
};

type HealthAlertResult = {
  level: "critical" | "alert" | "ok";
  title: string;
  message: string;
};

export type RemoteHealthPushResult = {
  ok: boolean;
  sent?: number;
  attempted?: number;
  environment?: string;
  note?: string;
  error?: string;
};

let localChannelReady = false;
const playedRealtimeAlertIds = new Set<string>();

export function evaluateHealthAlert(log: Partial<HealthAlertLog>, prevWeight?: number | null): HealthAlertResult | null {
  if (log.log_type === "weight" && log.weight_kg != null) {
    const weight = Number(log.weight_kg);
    if (!Number.isFinite(weight)) return null;

    if (prevWeight != null && Number.isFinite(Number(prevWeight))) {
      const delta = weight - Number(prevWeight);
      const absDelta = Math.abs(delta);
      if (absDelta >= 10) {
        return {
          level: "critical",
          title: "Critical weight change",
          message: `Weight ${delta > 0 ? "up" : "down"} ${absDelta.toFixed(1)} kg (${prevWeight} → ${weight})`,
        };
      }
      if (absDelta >= 2) {
        return {
          level: "alert",
          title: "Weight change alert",
          message: `Weight ${delta > 0 ? "up" : "down"} ${absDelta.toFixed(1)} kg (${prevWeight} → ${weight})`,
        };
      }
    }

    if (weight >= 150 || weight <= 35) {
      return { level: "alert", title: "Weight alert", message: `Weight logged: ${weight} kg` };
    }
    return { level: "ok", title: "Weight logged", message: `Weight logged: ${weight} kg` };
  }

  if (log.log_type === "diabetes") {
    const glucose = log.glucose_morning ?? log.glucose_evening;
    if (glucose == null) return null;
    const g = Number(glucose);
    if (!Number.isFinite(g)) return null;
    if (g >= 250) return { level: "critical", title: "Critical glucose alert", message: `Very high glucose: ${g} mg/dL` };
    if (g <= 54) return { level: "critical", title: "Critical glucose alert", message: `Very low glucose: ${g} mg/dL` };
    if (g >= 180) return { level: "alert", title: "High glucose alert", message: `High glucose: ${g} mg/dL` };
    if (g <= 70) return { level: "alert", title: "Low glucose alert", message: `Low glucose: ${g} mg/dL` };
    if (g >= 140) return { level: "alert", title: "Elevated glucose alert", message: `Elevated glucose: ${g} mg/dL` };
    return { level: "ok", title: "Glucose logged", message: `Glucose logged: ${g} mg/dL` };
  }

  if (log.log_type === "bp" && log.bp_systolic != null && log.bp_diastolic != null) {
    const s = Number(log.bp_systolic);
    const d = Number(log.bp_diastolic);
    if (!Number.isFinite(s) || !Number.isFinite(d)) return null;
    if (s >= 180 || d >= 120) return { level: "critical", title: "Critical BP alert", message: `Very high BP: ${s}/${d} mmHg` };
    if (s >= 140 || d >= 90) return { level: "alert", title: "High BP alert", message: `High BP: ${s}/${d} mmHg` };
    if (s <= 90 || d <= 60) return { level: "alert", title: "Low BP alert", message: `Low BP: ${s}/${d} mmHg` };
    return { level: "ok", title: "BP logged", message: `BP logged: ${s}/${d} mmHg` };
  }

  return null;
}

async function ensureLocalAlertPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const perm = await LocalNotifications.checkPermissions();
    // Never prompt from here — a background alert opening the OS permission
    // sheet caused a prompt/resume flicker loop on Android. The prompt is owned
    // by the push registration flow (and the Profile "enable" button).
    return perm.display === "granted";
  } catch (err) {
    console.warn("local alert permission failed", err);
    return false;
  }
}


async function ensureAndroidAlertChannel() {
  if (Capacitor.getPlatform() !== "android" || localChannelReady) return;
  localChannelReady = true;
  try {
    await LocalNotifications.createChannel({
      id: BBDO_PUSH_CHANNEL_ID,
      name: "BBDO notifications",
      description: "Reminders, coach messages, and health nudges",
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    });
  } catch (err) {
    console.warn("local alert channel failed", err);
  }
}

export async function sendLocalHealthAlert(title: string, body: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const granted = await ensureLocalAlertPermission();
  if (!granted) return false;
  await ensureAndroidAlertChannel();
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2_147_000_000),
          title,
          body,
          sound: "default",
          schedule: { at: new Date(Date.now() + 350) },
          channelId: BBDO_PUSH_CHANNEL_ID,
          interruptionLevel: "timeSensitive",
          relevanceScore: 1,
          autoCancel: true,
          extra: { kind: "health_alert" },
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn("local health alert failed", err);
    return false;
  }
}

export function fireRealtimeHealthNotificationAlert(notification: RealtimeHealthNotification) {
  const key = notification.id ?? `${notification.title}:${notification.body}`;
  if (playedRealtimeAlertIds.has(key)) return;
  playedRealtimeAlertIds.add(key);
  window.setTimeout(() => playedRealtimeAlertIds.delete(key), 30_000);

  setMasterVolume(1);
  playCriticalHealthAlert();
  void sendLocalHealthAlert(notification.title, notification.body);
}

export async function sendRemoteHealthPushResult(title: string, body: string, opts: { delaySeconds?: number } = {}): Promise<RemoteHealthPushResult> {
  if (!Capacitor.isNativePlatform()) return { ok: false, note: "not_native" };
  try {
    const { data, error } = await supabase.functions.invoke("send-health-push", {
      body: { title, body, actionUrl: "/home?tab=profile", delaySeconds: opts.delaySeconds ?? 0 },
    });
    if (error) {
      console.warn("remote health push failed", error);
      return { ok: false, error: error.message };
    }
    const result = (data ?? {}) as RemoteHealthPushResult;
    return { ...result, ok: Boolean(result.ok) };
  } catch (err) {
    console.warn("remote health push failed", err);
    return { ok: false, error: (err as Error)?.message ?? "remote_push_failed" };
  }
}

export async function sendRemoteHealthPush(title: string, body: string): Promise<boolean> {
  const result = await sendRemoteHealthPushResult(title, body);
  return result.ok;
}

export async function fireHealthMetricFeedback(
  log: Partial<HealthAlertLog>,
  prevWeight?: number | null,
  opts: { createInboxNotification?: boolean } = {},
) {
  try {
    const result = evaluateHealthAlert(log, prevWeight);
    if (!result) return;

    const settings = await getNotificationSoundSettings().catch(() => ({
      enabled: true,
      variant: "bbdo_signature" as const,
      volume: 1,
    }));
    const isAlert = result.level === "alert" || result.level === "critical";

    if (isAlert) {
      if (opts.createInboxNotification !== false && log.user_id) {
        void createNotification({
          user_id: log.user_id,
          title: result.title,
          body: result.message,
          type: "health_alert",
          icon: result.level === "critical" ? "🚨" : "⚠️",
          action_url: "/home?tab=profile",
        }).catch((err) => console.warn("health alert notification failed", err));
      } else {
        // Direct remote push is only used when no database notification is being
        // created. Otherwise the backend trigger dispatches the native push once.
        void sendRemoteHealthPush(result.title, result.message).then((ok) => {
          if (!ok) console.warn("remote health push was not accepted", result.title);
        });
      }

      if (!Capacitor.isNativePlatform()) {
        try {
          const previousVolume = getMasterVolume();
          setMasterVolume(Math.max(settings.volume ?? 0.8, result.level === "critical" ? 1 : 0.9));
          // One sound only — the Hummingbird chirp.
          playNotificationSound(settings.variant);
          setTimeout(() => setMasterVolume(previousVolume), 1_800);
        } catch (soundErr) {
          console.warn("health alert sound failed", soundErr);
        }
      }

      const notify = result.level === "critical" ? toast.error : toast.warning;
      notify(result.message);
    } else if (settings.enabled) {
      setMasterVolume(settings.volume ?? 0.8);
      playNotificationSound(settings.variant);
    }
  } catch (err) {
    console.warn("health metric feedback failed", err);
  }
}
