import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchUnreadCount, subscribeToNotifications } from "@/lib/notificationService";
import { playNotificationSound } from "@/lib/soundEngine";
import { getNotificationSoundSettings } from "@/lib/notificationSoundService";
import { fireRealtimeHealthNotificationAlert } from "@/lib/healthAlerts";
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
    const unsub = subscribeToNotifications(user.id, (notification) => {
      if (controlledCount == null) fetchUnreadCount(user.id, { force: true }).then(setUnreadCount);
      if (isNativePushSupported()) return;
      // Play the BBDO signature sound on any new notification, regardless of
      // whether the notifications panel is currently mounted.
      void getNotificationSoundSettings().then((s) => {
        if (!s.enabled) return;
        if (notification.type === "health_alert") {
          fireRealtimeHealthNotificationAlert(notification);
        } else {
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
