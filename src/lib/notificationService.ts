import { supabase } from "@/integrations/supabase/client";

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  icon: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

// ─── Unread count cache ──────────────────────────────────────────────────
// The bell badge, the app-icon badge and the notifications panel all ask for
// the unread count. Cache it briefly and dedupe concurrent calls so a single
// realtime event doesn't trigger several identical count queries.
const UNREAD_TTL_MS = 15_000;
const unreadCache = new Map<string, { at: number; value: number }>();
const unreadInFlight = new Map<string, Promise<number>>();

export function invalidateUnreadCount(userId?: string) {
  if (userId) {
    unreadCache.delete(userId);
    unreadInFlight.delete(userId);
  } else {
    unreadCache.clear();
    unreadInFlight.clear();
  }
}

/** Fetch unread count (cached for 15s; pass { force: true } to bypass) */
export async function fetchUnreadCount(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<number> {
  if (!userId) return 0;

  if (!opts.force) {
    const cached = unreadCache.get(userId);
    if (cached && Date.now() - cached.at < UNREAD_TTL_MS) return cached.value;
    const pending = unreadInFlight.get(userId);
    if (pending) return pending;
  }

  const request = (async () => {
    const { count, error } = await supabase
      .from("notifications" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) return 0;
    const value = count ?? 0;
    unreadCache.set(userId, { at: Date.now(), value });
    return value;
  })();

  unreadInFlight.set(userId, request);
  try {
    return await request;
  } finally {
    unreadInFlight.delete(userId);
  }
}


/** Fetch recent notifications */
export async function fetchNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications" as any)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as AppNotification[];
}

/** Mark single notification as read */
export async function markRead(id: string): Promise<void> {
  await supabase
    .from("notifications" as any)
    .update({ is_read: true } as any)
    .eq("id", id);
  invalidateUnreadCount();
}

/** Mark all notifications as read */
export async function markAllRead(): Promise<void> {
  await supabase
    .from("notifications" as any)
    .update({ is_read: true } as any)
    .eq("is_read", false);
  invalidateUnreadCount();
}

/** Delete a notification */
export async function deleteNotification(id: string): Promise<void> {
  await supabase.from("notifications" as any).delete().eq("id", id);
  invalidateUnreadCount();
}

/** Clear all notifications */
export async function clearAllNotifications(): Promise<void> {
  await supabase.from("notifications" as any).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  invalidateUnreadCount();
}


/** Create a local notification (for instant in-app use) */
export async function createNotification(opts: {
  user_id: string;
  title: string;
  body: string;
  type: string;
  icon?: string;
  action_url?: string;
}): Promise<void> {
  const { error } = await (supabase as any).rpc("create_notification", {
    _user_id: opts.user_id,
    _title: opts.title,
    _body: opts.body,
    _type: opts.type,
    _icon: opts.icon ?? "🔔",
    _action_url: opts.action_url ?? null,
  });
  if (error) throw error;
}

/** Ensure the one-time welcome notification exists for this signed-in user. */
export async function sendWelcomeNotification(userId: string): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc("send_welcome_notification", {
    _user_id: userId,
  });
  if (error) throw error;
  return (data ?? null) as string | null;
}

// ─── Browser Notification Permission ─────────────────────────────────────

export function canUseBrowserNotifications(): boolean {
  return "Notification" in window;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!canUseBrowserNotifications()) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function sendBrowserNotification(title: string, body: string, icon = "🔔") {
  if (!canUseBrowserNotifications()) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/placeholder.svg", badge: "/placeholder.svg", tag: title });
  } catch {
    // SW-only environments
  }
}

// ─── Realtime subscription for live updates ──────────────────────────────

export function subscribeToNotifications(
  userId: string,
  onNew: (n: AppNotification) => void
) {
  const channelName = `notifications-${userId}-${crypto.randomUUID()}`;

  try {
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as unknown as AppNotification;
          onNew(n);
          sendBrowserNotification(n.title, n.body, n.icon);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  } catch (error) {
    console.error("Unable to subscribe to notifications", error);
    return () => undefined;
  }
}
