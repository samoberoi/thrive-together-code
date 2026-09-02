import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchUnreadCount, subscribeToNotifications, adjustUnreadCount } from "@/lib/notificationService";
import { playNotificationSound } from "@/lib/soundEngine";
import { getNotificationSoundSettings } from "@/lib/notificationSoundService";
import { fireRealtimeHealthNotificationAlert } from "@/lib/healthAlerts";
import { claimNotification, notificationKey } from "@/lib/notificationDedupe";
import { isNativePushSupported } from "@/lib/nativePush";
import AttentionBadge from "@/components/attention/AttentionBadge";

/**
 * Bell button in the header. Dispatches an event the Dashboard listens to,
 * opening the notifications panel inside the center frame (keeping the sidebar).
 */
export default function NotificationCenter({ unreadCount: controlledCount }: { unreadCount?: number } = {}) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const count = controlledCount ?? unreadCount;

  useEffect(() => {
    if (!user) return;
    if (controlledCount == null) fetchUnreadCount(user.id).then(setUnreadCount);
    // Reading/clearing notifications anywhere must drop this badge instantly.
    const onLocalChange = () => {
      if (controlledCount == null) {
        void fetchUnreadCount(user.id, { force: true }).then(setUnreadCount);
      }
    };
    window.addEventListener("notifications:changed", onLocalChange);
    const unsub = subscribeToNotifications(user.id, (notification) => {
      if (controlledCount == null) {
        // Realtime insert → bump the cached count locally instead of running
        // another COUNT query for every incoming notification.
        const next = adjustUnreadCount(user.id, 1);
        if (next != null) setUnreadCount(next);
        else void fetchUnreadCount(user.id, { force: true }).then(setUnreadCount);
      }
      if (isNativePushSupported()) return;

      // Play the BBDO signature sound on any new notification, regardless of
      // whether the notifications panel is currently mounted.
      void getNotificationSoundSettings().then((s) => {
        if (!s.enabled) return;
        if (notification.type === "health_alert") {
          fireRealtimeHealthNotificationAlert(notification);
        } else if (claimNotification(notificationKey(notification))) {
          playNotificationSound(s.variant);
        }
      });
    });
    return unsub;
  }, [controlledCount, user]);

  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("nav:open-notifications"))}
      className="relative w-9 h-9 rounded-full liquid-glass flex items-center justify-center"
      aria-label="Notifications"
    >
      <Bell className="w-[18px] h-[18px] text-foreground" strokeWidth={1.8} />
      <AttentionBadge count={count} className="absolute -top-1 -right-1" />
    </button>
  );
}
