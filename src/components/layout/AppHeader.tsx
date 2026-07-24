import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * AppHeader — sticky/fixed header that always respects the top safe area
 * (notch, Dynamic Island, status bar). Use as the first child of AppScreen.
 */
export interface AppHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Use `sticky` (default) so the header scrolls with content until it pins. */
  sticky?: boolean;
  /** Add subtle background/blur (default true) so content underneath is legible. */
  translucent?: boolean;
  /** Left slot (back button, avatar). */
  leading?: React.ReactNode;
  /** Right slot (actions). */
  trailing?: React.ReactNode;
  /** Optional title. Falls back to children. */
  title?: React.ReactNode;
}

export const AppHeader = React.forwardRef<HTMLElement, AppHeaderProps>(
  ({ sticky = true, translucent = true, leading, trailing, title, className, children, ...rest }, ref) => {
    return (
      <header
        ref={ref}
        className={cn(
          "z-30 w-full",
          sticky && "sticky top-0",
          translucent && "bg-[color:var(--bbdo-cream)]/85 supports-[backdrop-filter]:backdrop-blur-md",
          className,
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
        {...rest}
      >
        <div className="flex items-center gap-2 px-5 min-h-[52px]">
          {leading ? <div className="shrink-0 flex items-center">{leading}</div> : null}
          <div className="flex-1 min-w-0 truncate">
            {title ? (
              <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-[color:var(--bbdo-ink)] truncate">
                {title}
              </h1>
            ) : (
              children
            )}
          </div>
          {trailing ? <div className="shrink-0 flex items-center gap-1">{trailing}</div> : null}
        </div>
      </header>
    );
  },
);
AppHeader.displayName = "AppHeader";

export default AppHeader;
