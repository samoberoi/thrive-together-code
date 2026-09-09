import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRbac } from "@/hooks/useRbac";
import { useAuth } from "@/contexts/AuthContext";
import {
  resolveNotificationRoute,
  takePendingNotificationTap,
  type NotificationRole,
  type RoutableNotification,
} from "@/lib/notificationRouting";

/**
 * Navigates when a native push / local notification is tapped. The tap can
 * arrive before the app is signed in and rendered, so it is stashed and
 * replayed once the user's role is known.
 */
export default function NotificationRouteHandler() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isCoach, isChannelPartner, loading } = useRbac();

  const role: NotificationRole = isAdmin ? "admin" : isCoach ? "coach" : isChannelPartner ? "partner" : "user";

  useEffect(() => {
    const go = (n: RoutableNotification) => {
      if (!user) return;
      navigate(resolveNotificationRoute(n, role));
    };

    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === "object") {
        // Clear the stashed copy so it is not replayed twice.
        takePendingNotificationTap();
        go(detail as RoutableNotification);
      }
    };

    window.addEventListener("notification:navigate", onEvent as EventListener);

    if (user && !loading) {
      const pending = takePendingNotificationTap();
      if (pending) go(pending);
    }

    return () => window.removeEventListener("notification:navigate", onEvent as EventListener);
  }, [user, loading, role, navigate]);

  return null;
}
