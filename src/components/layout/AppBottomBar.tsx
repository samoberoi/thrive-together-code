import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * AppBottomBar — the fixed bottom bar that publishes its own height into
 * `--nav-h` so AppScrollArea can reserve exactly the right clearance on
 * every device. Sits above the home indicator / gesture bar / Android nav.
 *
 * When the on-screen keyboard is open (`html.kb-open`), the bar hides so it
 * never overlaps the composer. Chat composers should render outside this
 * component and lift with --kb-h themselves.
 */
export interface AppBottomBarProps extends React.HTMLAttributes<HTMLElement> {
  /** Hide when the keyboard is open (default true). */
  hideOnKeyboard?: boolean;
}

export const AppBottomBar = React.forwardRef<HTMLElement, AppBottomBarProps>(
  ({ hideOnKeyboard = true, className, children, style, ...rest }, ref) => {
    const localRef = React.useRef<HTMLElement | null>(null);
    const setRef = (el: HTMLElement | null) => {
      localRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = el;
    };

    // Publish live height into --nav-h + derive --nav-clear.
    React.useLayoutEffect(() => {
      const el = localRef.current;
      if (!el || typeof window === "undefined") return;
      const root = document.documentElement;
      const write = () => {
        const h = el.getBoundingClientRect().height;
        root.style.setProperty("--nav-h", `${Math.round(h)}px`);
        // getBoundingClientRect() already includes this bar's safe-area padding,
        // so --nav-clear must be the measured height only. Adding env() again
        // double-counts iOS insets and pushes content/nav chrome upward.
        root.style.setProperty("--nav-clear", `${Math.round(h)}px`);
      };
      write();
      const ro = new ResizeObserver(write);
      ro.observe(el);
      window.addEventListener("orientationchange", write);
      return () => {
        ro.disconnect();
        window.removeEventListener("orientationchange", write);
        // Leave last known height in place so unmount-on-route-change doesn't
        // reflow content underneath.
      };
    }, []);

    return (
      <nav
        ref={setRef}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 w-full",
          hideOnKeyboard && "[html.kb-open_&]:hidden",
          className,
        )}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          ...style,
        }}
        {...rest}
      >
        {children}
      </nav>
    );
  },
);
AppBottomBar.displayName = "AppBottomBar";

export default AppBottomBar;
