import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/**
 * AppSheet — bottom sheet on mobile, centered modal on ≥sm.
 * - Pinned header + footer (never scrolled away).
 * - Body is the only scroll region.
 * - Keyboard-aware: lifts above --kb-h so composers stay visible.
 * - Respects bottom safe area.
 */
export interface AppSheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Max height on mobile as a viewport unit fraction (default 92svh). */
  mobileHeight?: string;
  /** Show default close button in header (default true). */
  showClose?: boolean;
}

export function AppSheet({
  open,
  onClose,
  title,
  subtitle,
  header,
  footer,
  children,
  className,
  mobileHeight = "92svh",
  showClose = true,
}: AppSheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "relative w-full sm:max-w-md liquid-glass bg-background",
          "rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col",
          "sm:max-h-[85svh]",
          className,
        )}
        style={{ height: undefined, maxHeight: mobileHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border/60">
          <div className="px-5 pt-4 pb-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {title ? (
                <p className="text-[15px] font-semibold text-foreground truncate">{title}</p>
              ) : null}
              {subtitle ? (
                <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
              ) : null}
              {header}
            </div>
            {showClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 -mr-1 -mt-1 w-9 h-9 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-5 py-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>

        {/* Footer — lifts above keyboard + safe area */}
        {footer ? (
          <div
            className="shrink-0 border-t border-border/60 bg-background/95 px-5 pt-3"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom) + 12px + var(--kb-h, 0px))",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AppSheet;
