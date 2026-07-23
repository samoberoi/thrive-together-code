import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * AppScreen — the single responsive screen shell for the entire app.
 *
 * One layout system, no device-specific rules. Works identically on iOS,
 * Android, and web at any viewport width (320dp → tablet, portrait/landscape).
 *
 * Layout contract:
 *  - Column flex, max-width 430px, centered.
 *  - `min-height: 100svh` on web; on native the WebView is height-locked so
 *    the screen fills it exactly (see .phone-container in index.css).
 *  - The screen itself is the scroll container — the footer slot is a
 *    normal-flow sibling that sits after content via `mt-auto`. Overlap is
 *    architecturally impossible.
 *  - Safe-area insets are honored via `env(safe-area-inset-*)` — no JS
 *    viewport measurement, nothing to go stale when Android bars toggle.
 *
 * Prefer this over hand-rolled `<div className="phone-container ...">` on
 * every new screen. Existing screens keep working because .phone-container /
 * .ob-bottom now render identically to what this component composes.
 */
export interface AppScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Sticky-at-bottom footer (CTA row, bottom nav, etc.). Rendered after content. */
  footer?: React.ReactNode;
  /** Apply the standard horizontal page gutter (default true). */
  padded?: boolean;
  /** Reserve safe-area padding at the bottom of the content region (default true when no footer). */
  bottomSafe?: boolean;
  /** Reserve safe-area padding at the top of the content region (default true). */
  topSafe?: boolean;
  /** Screen background token (default cream). */
  background?: "cream" | "background" | "transparent";
  /** Extra classes on the outer shell. */
  className?: string;
  /** Extra classes on the inner content wrapper. */
  contentClassName?: string;
  /** Extra classes on the footer wrapper. */
  footerClassName?: string;
}

const bgClass = {
  cream: "bg-[color:var(--bbdo-cream)]",
  background: "bg-background",
  transparent: "bg-transparent",
} as const;

export const AppScreen = React.forwardRef<HTMLDivElement, AppScreenProps>(
  (
    {
      footer,
      padded = true,
      bottomSafe,
      topSafe = true,
      background = "cream",
      className,
      contentClassName,
      footerClassName,
      children,
      ...rest
    },
    ref,
  ) => {
    // If a footer is provided, the footer owns the safe-area padding.
    const shouldPadBottom = bottomSafe ?? !footer;

    return (
      <div
        ref={ref}
        className={cn("phone-container", bgClass[background], className)}
        {...rest}
      >
        <div
          className={cn(
            "flex-1 flex flex-col w-full",
            padded && "px-5",
            topSafe && "pt-[calc(env(safe-area-inset-top)+1rem)]",
            shouldPadBottom && "pb-[calc(env(safe-area-inset-bottom)+1rem)]",
            contentClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              "shrink-0 w-full pt-3",
              padded && "px-5",
              "pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
              footerClassName,
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    );
  },
);
AppScreen.displayName = "AppScreen";

export default AppScreen;
