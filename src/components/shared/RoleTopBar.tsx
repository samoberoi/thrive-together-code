import { cn } from "@/lib/utils";
import NotificationCenter from "@/components/NotificationCenter";
import logoImg from "@/assets/logo.png";

interface Props {
  /** Short role label shown next to the mark, e.g. "Coach", "Admin", "Partner". */
  roleLabel: string;
  /** Optional avatar image URL for the profile button. */
  avatarUrl?: string | null;
  /** Fallback initial rendered when no avatar is set. */
  avatarInitial?: string;
  /** Whether the profile button appears in an "active" state (user is on their profile tab). */
  profileActive?: boolean;
  /** Callback when the profile button is pressed. */
  onProfileClick?: () => void;
  /** Number of unread notifications to badge on the bell. */
  notificationCount?: number;
  /** Optional extra content in the top-right cluster (e.g. sound toggle). */
  right?: React.ReactNode;
  className?: string;
}

/**
 * Shared mobile top bar for Coach / Admin / Partner roles.
 * Consistent brand lockup on the left, notifications + profile on the right.
 * Sticky at top of the scroll container so it never blocks scroll.
 */
export default function RoleTopBar({
  roleLabel,
  avatarUrl,
  avatarInitial = "U",
  profileActive = false,
  onProfileClick,
  notificationCount = 0,
  right,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "md:hidden sticky top-0 z-30 bg-background/85 backdrop-blur-xl flex items-center justify-between px-5 pb-3",
        className,
      )}
      style={{
        borderBottom: "1px solid hsl(var(--border))",
        paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
          <img src={logoImg} alt="BBDO" className="w-6 h-6 object-contain" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-foreground font-black text-[15px] leading-none tracking-tight truncate">
            bye bye
          </span>
          <span className="text-muted-foreground text-[10px] leading-tight mt-0.5 truncate">
            {roleLabel}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {right}
        <NotificationCenter unreadCount={notificationCount} />
        <button
          onClick={onProfileClick}
          aria-label="Profile"
          className={cn(
            "w-9 h-9 rounded-full overflow-hidden border flex items-center justify-center shrink-0 transition-colors",
            profileActive ? "border-primary bg-primary/15" : "border-border bg-muted",
          )}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-primary font-black text-xs">
              {(avatarInitial?.[0] ?? "U").toUpperCase()}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
