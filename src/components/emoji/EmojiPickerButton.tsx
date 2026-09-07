import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { createPortal } from "react-dom";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

interface Props {
  onSelect: (emoji: string) => void;
  className?: string;
  iconClassName?: string;
  ariaLabel?: string;
}

/**
 * WhatsApp-style emoji button. Opens a full industry-standard emoji keyboard
 * (all Unicode groups + search + skin tones) anchored above the composer.
 */
export default function EmojiPickerButton({
  onSelect,
  className = "",
  iconClassName = "w-5 h-5",
  ariaLabel = "Insert emoji",
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      const panel = document.getElementById("bbdo-emoji-panel");
      if (panel?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = Math.min(340, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ left, bottom: Math.max(8, window.innerHeight - r.top + 8) });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        className={
          className ||
          "shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-muted/70 text-muted-foreground hover:bg-muted transition"
        }
      >
        <Smile className={iconClassName} strokeWidth={2.2} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            id="bbdo-emoji-panel"
            style={{ left: pos.left, bottom: pos.bottom, position: "fixed", zIndex: 10000 }}
            className="shadow-2xl rounded-2xl overflow-hidden"
          >
            <Suspense
              fallback={
                <div className="w-[320px] h-[280px] bg-background border border-border rounded-2xl flex items-center justify-center text-xs text-muted-foreground">
                  Loading emoji…
                </div>
              }
            >
              <EmojiPicker
                width={Math.min(340, window.innerWidth - 16)}
                height={340}
                lazyLoadEmojis
                skinTonesDisabled={false}
                previewConfig={{ showPreview: false }}
                searchPlaceholder="Search emoji"
                onEmojiClick={(e: { emoji: string }) => {
                  onSelect(e.emoji);
                  setOpen(false);
                }}
              />
            </Suspense>
          </div>,
          document.body,
        )}
    </>
  );
}
