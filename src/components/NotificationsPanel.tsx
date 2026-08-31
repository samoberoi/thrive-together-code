import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell, ArrowLeft, CheckCheck, Trash2, Pill, Timer, Droplets,
  Footprints, Activity, AlertTriangle, MessageCircle, Megaphone, Sparkles, Heart, FlaskConical,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchNotifications, markRead, markAllRead, clearAllNotifications,
  subscribeToNotifications, requestNotificationPermission, canUseBrowserNotifications,
  type AppNotification,
} from "@/lib/notificationService";
import { getNotificationSoundSettings } from "@/lib/notificationSoundService";
import { playNotificationSound, setMasterVolume } from "@/lib/soundEngine";
import { fireRealtimeHealthNotificationAlert } from "@/lib/healthAlerts";
import { claimNotification, notificationKey } from "@/lib/notificationDedupe";
import { isNativePushSupported } from "@/lib/nativePush";

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  supplement_reminder: { icon: Pill, color: "text-purple-500", bg: "bg-purple-500/10" },
  fasting_reminder:    { icon: Timer, color: "text-primary", bg: "bg-primary/10" },
  water_reminder:      { icon: Droplets, color: "text-secondary", bg: "bg-secondary/10" },
  habit_reminder:      { icon: Footprints, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  score_alert:         { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  coach_alert:         { icon: Activity, color: "text-amber-500", bg: "bg-amber-500/10" },
  chat_message:        { icon: MessageCircle, color: "text-primary", bg: "bg-primary/10" },
  community_comment:   { icon: MessageCircle, color: "text-primary", bg: "bg-primary/10" },
  community_like:      { icon: Heart, color: "text-destructive", bg: "bg-destructive/10" },
  lab_test:            { icon: FlaskConical, color: "text-primary", bg: "bg-primary/10" },
  compliment:          { icon: Sparkles, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  achievement_share:   { icon: Megaphone, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  health_alert:        { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  system:              { icon: Bell, color: "text-muted-foreground", bg: "bg-muted" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type Filter = "all" | "unread";

interface NotificationsPanelProps {
  onClose?: () => void;
  embedded?: boolean;
}

export default function NotificationsPanel({ onClose, embedded = false }: NotificationsPanelProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    if (canUseBrowserNotifications()) {
      setPushEnabled(Notification.permission === "granted");
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchNotifications(user.id, 200)
      .then((data) => setItems(data))
      .catch((e) => console.error("fetchNotifications failed", e))
      .finally(() => setLoading(false));
    const unsub = subscribeToNotifications(user.id, (n) => {
      setItems((prev) => [n, ...prev]);
      if (isNativePushSupported()) return;
      // Play the admin-configured BBDO sound for every incoming notification.
      getNotificationSoundSettings().then((s) => {
        if (!s.enabled) return;
        if (n.type === "health_alert") {
          fireRealtimeHealthNotificationAlert(n);
        } else if (claimNotification(notificationKey(n))) {
          setMasterVolume(s.volume);
          playNotificationSound(s.variant);
        }
      }).catch(() => {});
    });
    return unsub;
  }, [user]);

  const unread = items.filter((n) => !n.is_read).length;
  const visible = filter === "unread" ? items.filter((n) => !n.is_read) : items;

  const notifyBadgeSync = () =>
    window.dispatchEvent(new CustomEvent("notifications:changed"));

  const onItemClick = async (n: AppNotification) => {
    // Notifications in the panel are read-only: tapping only marks them read,
    // it does NOT navigate anywhere. (Previously action_url could route users
    // to unintended pages like the profile.)
    // Exception: "share your win" notifications open the community composer
    // pre-filled with the win, ready to send.
    if (!n.is_read) {
      await markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      notifyBadgeSync();
    }

    const url = n.action_url || "";
    if (n.type === "achievement_share" || url.includes("share=")) {
      const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
      const params = new URLSearchParams(query);
      params.set("tab", "community");
      if (!params.get("share")) params.set("share", "generic");
      onClose?.();
      navigate(`/home?${params.toString()}`);
    }
  };


  const onMarkAllRead = async () => {
    await markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    notifyBadgeSync();
  };

  const onClearAll = async () => {
    await clearAllNotifications();
    setItems([]);
    notifyBadgeSync();
  };

  const goBack = () => {
    if (onClose) return onClose();
    if (window.history.length > 1) navigate(-1);
    else navigate("/home");
  };

  return (
    <div className={embedded ? "" : "min-h-screen bg-background"}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="no-pill w-9 h-9 rounded-md liquid-glass flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={1.8} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-foreground">Notifications</h1>
            <p className="text-xs text-muted-foreground">
              {items.length} total · {unread} unread
            </p>
          </div>
          {!pushEnabled && canUseBrowserNotifications() && (
            <button
              onClick={async () => setPushEnabled(await requestNotificationPermission())}
              className="no-pill h-9 text-[11px] font-bold text-primary bg-primary/10 px-3 rounded-md"
            >
              Enable Push
            </button>
          )}
        </div>

        {/* Tabs + actions */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="grid grid-cols-2 rounded-lg bg-muted p-1 w-full sm:w-auto">
            {(["all", "unread"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`no-pill h-10 px-4 text-xs font-bold rounded-md transition-colors ${
                  filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {f === "all" ? "All" : `Unread (${unread})`}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
            <button
              onClick={onMarkAllRead}
              disabled={unread === 0}
              className="no-pill h-11 inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 rounded-md bg-muted disabled:opacity-40"
            >
              <CheckCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
              Mark all read
            </button>
            <button
              onClick={onClearAll}
              disabled={items.length === 0}
              className="no-pill h-11 inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 rounded-md bg-muted text-destructive disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              Clear all
            </button>
          </div>
        </div>

        {/* List */}
        <div className="rounded-2xl">
          {loading ? (
            <div className="liquid-glass rounded-2xl flex items-center justify-center py-20">
              <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div className="liquid-glass rounded-2xl flex flex-col items-center justify-center py-20 gap-2">
              <Bell className="w-9 h-9 text-muted-foreground/30" strokeWidth={1.5} />
              <p className="text-muted-foreground text-sm">
                {filter === "unread" ? "All caught up — no unread notifications" : "No notifications yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((n, i) => {
                const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
                const Icon = cfg.icon;
                return (
                  <motion.button
                    key={n.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 6) * 0.02, duration: 0.18 }}
                    onClick={() => onItemClick(n)}
                    className={`no-pill w-full max-w-full overflow-hidden whitespace-normal rounded-2xl text-left flex items-start gap-3 px-4 py-3.5 border border-border/70 bg-card hover:bg-accent/40 transition-colors ${
                      !n.is_read ? "ring-1 ring-primary/15 bg-primary/5" : ""
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                      <Icon className={`w-5 h-5 ${cfg.color}`} strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`flex-1 min-w-0 text-sm leading-tight whitespace-normal break-words [overflow-wrap:anywhere] ${!n.is_read ? "font-bold text-foreground" : "font-medium text-foreground/80"}`}>
                          {n.title}
                        </p>
                        {!n.is_read && <span className="w-2 h-2 rounded-[3px] bg-primary shrink-0 mt-1.5" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 whitespace-normal break-words [overflow-wrap:anywhere]">{n.body}</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1.5">{timeAgo(n.created_at)}</p>

                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
