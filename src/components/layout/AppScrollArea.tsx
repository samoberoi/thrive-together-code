import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * AppScrollArea — the scroll container that reserves bottom clearance for the
 * fixed bottom nav and the device home-indicator, in one place.
 *
 * Content that scrolls should be wrapped in this so it never disappears
 * behind BottomNav / gesture bar / home indicator on any device.
 *
 * Bottom padding = --nav-clear (nav height + safe-area bottom), set by
 * AppBottomBar at runtime. Falls back to a sensible default if no bottom bar
 * is mounted on the current route.
 */
export interface AppScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Reserve bottom padding for the nav bar (default true). */
  navClear?: boolean;
  /** Add standard horizontal page gutter (default true). */
  padded?: boolean;
  /** Reserve keyboard height (default true) — useful for chat, forms. */
  keyboardAware?: boolean;
}

export const AppScrollArea = React.forwardRef<HTMLDivElement, AppScrollAreaProps>(
  ({ navClear = true, padded = true, keyboardAware = true, className, style, children, ...rest }, ref) => {
    const bottomPad = [
      keyboardAware ? "var(--kb-h, 0px)" : "0px",
      navClear ? "var(--nav-clear, calc(env(safe-area-inset-bottom) + 5.25rem))" : "env(safe-area-inset-bottom)",
    ].join(" + ");

    return (
      <div
        ref={ref}
        className={cn("flex-1 min-h-0 w-full overflow-y-auto overscroll-contain", padded && "px-5", className)}
        style={{
          WebkitOverflowScrolling: "touch",
          paddingBottom: `calc(${bottomPad})`,
          ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
AppScrollArea.displayName = "AppScrollArea";

export default AppScrollArea;
