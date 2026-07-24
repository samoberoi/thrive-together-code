import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * KeyboardAwareView — layout helper for chat/composer screens.
 *
 * Structure:
 *   <KeyboardAwareView>
 *     <KeyboardAwareView.Body>...messages...</KeyboardAwareView.Body>
 *     <KeyboardAwareView.Composer>...input row...</KeyboardAwareView.Composer>
 *   </KeyboardAwareView>
 *
 * Composer sticks to the bottom, lifts above the keyboard using --kb-h, and
 * respects bottom safe area. Body scrolls independently and auto-scrolls to
 * bottom on mount / when children change (opt-out via autoScroll={false}).
 */
type KAVProps = React.HTMLAttributes<HTMLDivElement>;

function Root({ className, children, ...rest }: KAVProps) {
  return (
    <div className={cn("relative flex-1 min-h-0 flex flex-col w-full", className)} {...rest}>
      {children}
    </div>
  );
}

interface BodyProps extends KAVProps {
  autoScroll?: boolean;
}
function Body({ className, autoScroll = true, children, ...rest }: BodyProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!autoScroll || !ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [autoScroll, children]);

  return (
    <div
      ref={ref}
      className={cn("flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3", className)}
      style={{
        WebkitOverflowScrolling: "touch",
        // Reserve room so the last message clears the composer.
        paddingBottom: "calc(var(--kb-composer-h, 64px) + 8px)",
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function Composer({ className, children, ...rest }: KAVProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = () =>
      document.documentElement.style.setProperty(
        "--kb-composer-h",
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cn(
        "sticky bottom-0 z-20 w-full border-t border-border/60 bg-background/95",
        "supports-[backdrop-filter]:backdrop-blur-md px-4 pt-2",
        className,
      )}
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom) + 8px + var(--kb-h, 0px))",
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export const KeyboardAwareView = Object.assign(Root, { Body, Composer });
export default KeyboardAwareView;
