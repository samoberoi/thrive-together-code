import { lazy, Suspense, useEffect, useState } from "react";
import { Smile, X } from "lucide-react";
import { createPortal } from "react-dom";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

interface Props {
  onSelect: (emoji: string) => void;
  className?: string;
  iconClassName?: string;
  ariaLabel?: string;
}

/**
 * WhatsApp-style emoji button. Opens a clean bottom sheet (never a floating
 * full-bleed panel) constrained to the app column, lifted above the keyboard.
 */
export default function EmojiPickerButton({
  onSelect,
  className = "",
  iconClassName = "w-5 h-5",
  ariaLabel = "Insert emoji",
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        className={
          className ||
          "shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-muted/70 text-muted-foreground hover:bg-muted transition"
        }
      >
        <Smile className={iconClassName} strokeWidth={2.2} />
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/40"
            onMouseDown={() => setOpen(false)}
          >
            <div
              id="bbdo-emoji-panel"
              onMouseDown={(e) => e.stopPropagation()}
              className="bbdo-emoji-sheet w-full max-w-[430px] bg-background border-t border-border rounded-t-2xl overflow-hidden shadow-2xl"
              style={{ marginBottom: "var(--kb-h, 0px)" }}
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Emoji
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close emoji keyboard"
                  className="w-8 h-8 rounded-full bg-muted/70 flex items-center justify-center text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <Suspense
                fallback={
                  <div className="h-[320px] flex items-center justify-center text-xs text-muted-foreground">
                    Loading emoji…
                  </div>
                }
              >
                <EmojiPicker
                  width="100%"
                  height={340}
                  lazyLoadEmojis
                  skinTonesDisabled={false}
                  previewConfig={{ showPreview: false }}
                  searchPlaceholder="Search emoji"
                  onEmojiClick={(e: { emoji: string }) => onSelect(e.emoji)}
                />
              </Suspense>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
