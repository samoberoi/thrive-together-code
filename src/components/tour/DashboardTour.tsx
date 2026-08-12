import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, X, Sparkles } from "lucide-react";

export type TourStep = {
  key: string;
  /** CSS selector for the element to highlight. Omit for a centred intro/outro card. */
  selector?: string;
  title: string;
  body: string;
  /** Hide this step for Package 1 (foundation/starter) users. */
  paidOnly?: boolean;
  /** Extra padding around the spotlight cut-out. */
  pad?: number;
  radius?: number;
};

const FOUNDATION = ["foundation", "starter"];

export function buildUserTourSteps(packageKey: string | null | undefined): TourStep[] {
  const key = packageKey ?? "foundation";
  const isFoundation = FOUNDATION.includes(key);

  const all: TourStep[] = [
    {
      key: "intro",
      title: "Welcome to your dashboard 👋",
      body: "A 60-second tour of everything on this screen — your rings, your pillars, your logs and your support. You can replay this any time from Profile.",
    },
    {
      key: "greeting",
      selector: '[data-tour="greeting"]',
      title: "Your daily home base",
      body: "Everything you need for today lives here — a fresh greeting, today's status, and your live progress.",
    },
    {
      key: "coach-chip",
      selector: '[data-tour="coach-chip"]',
      title: "This is your coach",
      body: "Your assigned BBDO coach sits right under your name. Tap the chip any time to open a direct chat — questions, check-ins, or a quick nudge.",
      paidOnly: true,
    },
    {
      key: "rings",
      selector: '[data-tour="rings"]',
      title: "Close your rings",
      body: "Nine pillars, one dial: Fasting, Supplements, Movement, Exercise, Yoga, Water, Breath, Soleus and Blood sugar. Every log you make fills a ring. Pillars not on your plan yet stay dimmed and say “Not unlocked”.",
      pad: 10,
      radius: 28,
    },
    {
      key: "metrics",
      selector: '[data-tour="metrics"]',
      title: "Your four headline numbers",
      body: "Health score, weight, blood glucose and BMI — each with the change since you joined, so you always know the direction of travel.",
      pad: 8,
      radius: 22,
    },
    {
      key: "trends",
      selector: '[data-tour="trends"]',
      title: "Trends since day one",
      body: "Tap any row to slide open the graph. Toggle week, fortnight, month or quarter to see how far you've come.",
      pad: 8,
      radius: 22,
    },
    {
      key: "quick-log",
      selector: '[data-tour="quick-log"]',
      title: "The + button logs everything",
      body: "Water, meals (FMOD / LMOD), weight, blood sugar, BP and supplements — one tap from anywhere. This is how most of your rings get closed.",
      pad: 12,
      radius: 999,
    },
    {
      key: "tab-fasting",
      selector: '[data-tour="tab-fasting"]',
      title: "Fasting lives here",
      body: "Start and track your fasting window, see your protocol, and log your first and last meal of the day.",
      pad: 6,
      radius: 999,
    },
    {
      key: "tab-supplements",
      selector: '[data-tour="tab-supplements"]',
      title: "Your supplements",
      body: "Your prescribed stack with daily check-ins. Tick each one off as you take it and the supplement ring closes.",
      pad: 6,
      radius: 999,
    },
    {
      key: "tab-exercise",
      selector: '[data-tour="tab-exercise"]',
      title: "Move, breathe, stretch",
      body: "Exercise, Yoga, Soleus push-ups and the 4·7·8 breath protocol — finish a session and it credits your ring automatically.",
      pad: 6,
      radius: 999,
    },
    {
      key: "tab-diet",
      selector: '[data-tour="tab-diet"]',
      title: "Food & your plate",
      body: "Your diet plan, Build My Plate and the food library — everything you need to get the plate right.",
      pad: 6,
      radius: 999,
    },
    {
      key: "tab-community",
      selector: '[data-tour="tab-community"]',
      title: "The community",
      body: "Share wins, read others' journeys, and stay accountable with people on the same path.",
      pad: 6,
      radius: 999,
    },
    {
      key: "more",
      selector: '[data-tour="more"]',
      title: isFoundation ? "Expert Connect lives in here" : "Everything else lives in here",
      body: isFoundation
        ? "Tap “More” to open all sections — and at the bottom you'll find the green Expert Connect button. That's your direct WhatsApp line to the BBDO expert team whenever you need guidance."
        : "Tap “More” for the rest of your sections — labs, plan details and the tools you use less often.",
      pad: 6,
      radius: 999,
    },
    {
      key: "coach-chat",
      selector: '[data-tour="tab-messages"]',
      title: "Talk to your coach",
      body: "This is your private chat with your coach. Send photos of your plate, ask about a reading, or book your next call — they're with you the whole way.",
      paidOnly: true,
      pad: 6,
      radius: 999,
    },
    {
      key: "profile",
      selector: '[data-tour="profile-btn"]',
      title: "Your profile",
      body: "Edit your details, diet preferences, plan and notifications here — and tap “Take the tour again” at any time to replay this walkthrough.",
      pad: 8,
      radius: 999,
    },
    {
      key: "outro",
      title: "You're all set 🎉",
      body: "Log what you eat, close your rings, and let your coach and the numbers do the rest. Small steps, every single day.",
    },
  ];

  return all.filter((s) => {
    if (s.paidOnly && isFoundation) return false;
    if (s.selector && !findVisible(s.selector)) return false;
    return true;
  });
}

/** First element matching the selector that is actually laid out (handles responsive duplicates). */
function findVisible(selector: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
  return nodes.find((n) => n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0) ?? null;
}

type Rect = { top: number; left: number; width: number; height: number };

export default function DashboardTour({
  packageKey,
  open,
  onClose,
}: {
  packageKey: string | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setI(0);
    // Give the dashboard a beat to render every anchor before we resolve steps.
    const t = window.setTimeout(() => setSteps(buildUserTourSteps(packageKey)), 350);
    return () => window.clearTimeout(t);
  }, [open, packageKey]);

  const step = steps[i];

  const measure = useCallback(() => {
    if (!step?.selector) {
      setRect(null);
      return;
    }
    const el = findVisible(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = step.pad ?? 8;
    setRect({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    });
  }, [step]);

  // Scroll the anchor into view, then measure (and keep measuring while scrolling settles).
  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = step.selector ? findVisible(step.selector) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });

    let frames = 0;
    const tick = () => {
      measure();
      frames += 1;
      if (frames < 45) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    const on = () => measure();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [open, measure]);

  // Lock background scrolling while the tour runs.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const total = steps.length;
  const isLast = i >= total - 1;

  const next = () => (isLast ? onClose() : setI((v) => v + 1));
  const back = () => setI((v) => Math.max(0, v - 1));

  // Measure the real card so it never runs off the top/bottom on small screens.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(220);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardH(el.getBoundingClientRect().height));
    ro.observe(el);
    setCardH(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [step?.key, open]);

  // Track the *visual* viewport so keyboards / browser chrome never push the card off-screen.
  const [vh, setVh] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    if (!open) return;
    const read = () => setVh(window.visualViewport?.height ?? window.innerHeight);
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    window.visualViewport?.addEventListener("resize", read);
    window.visualViewport?.addEventListener("scroll", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
      window.visualViewport?.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("scroll", read);
    };
  }, [open]);

  const insets = useMemo(() => {
    if (typeof window === "undefined") return { top: 14, bottom: 14 };
    const cs = getComputedStyle(document.documentElement);
    const num = (v: string) => parseFloat(v || "0") || 0;
    return {
      top: 14 + num(cs.getPropertyValue("--sat")),
      bottom: 14 + num(cs.getPropertyValue("--sab")),
    };
  }, []);

  const card = useMemo(() => {
    const top = insets.top;
    const bottom = insets.bottom;
    const avail = Math.max(140, vh - top - bottom);
    const h = Math.min(cardH, avail);
    const maxTop = Math.max(top, vh - bottom - h);
    const clamp = (v: number) => Math.min(Math.max(top, v), maxTop);
    const maxHeight = avail;
    if (!rect) return { top: clamp(vh / 2 - h / 2), maxHeight };
    const below = rect.top + rect.height + 12;
    if (below + h <= vh - bottom) return { top: below, maxHeight };
    const above = rect.top - h - 12;
    if (above >= top) return { top: above, maxHeight };
    // Anchor fills the screen — park the card at whichever edge has more room.
    const spaceBelow = vh - (rect.top + rect.height);
    return { top: spaceBelow > rect.top ? maxTop : clamp(top), maxHeight };
  }, [rect, cardH, vh, insets]);


  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bbdo-tour"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9999]"
        style={{ touchAction: "none" }}
        aria-live="polite"
      >
        {/* Dim layer with spotlight cut-out */}
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()}>
          <defs>
            <mask id="bbdo-tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {rect && (
                <motion.rect
                  initial={false}
                  animate={{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }}
                  transition={{ type: "spring", stiffness: 320, damping: 34 }}
                  rx={step?.radius ?? 20}
                  ry={step?.radius ?? 20}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(9,14,30,0.78)" mask="url(#bbdo-tour-mask)" />
        </svg>

        {/* Glow ring around the spotlight */}
        {rect && (
          <motion.div
            initial={false}
            animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="absolute pointer-events-none"
            style={{
              borderRadius: step?.radius ?? 20,
              boxShadow: "0 0 0 2px rgba(255,255,255,0.9), 0 0 34px 6px rgba(36,140,203,0.55)",
            }}
          />
        )}

        {/* Skip */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Skip tour"
          className="no-pill absolute right-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3.5 py-2 text-[12px] font-semibold text-white active:scale-[0.98]"
          style={{ top: "max(env(safe-area-inset-top), 14px)" }}
        >
          <X className="w-3.5 h-3.5" /> Skip
        </button>

        {/* Step card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step?.key ?? "loading"}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            ref={cardRef}
            className="absolute left-0 right-0 mx-auto w-[calc(100vw-1.75rem)] max-w-[26rem] px-0"
            style={{ top: card.top, maxHeight: card.maxHeight }}
          >
            <div className="rounded-3xl bg-background text-foreground shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55)] border border-border overflow-hidden flex flex-col" style={{ maxHeight: card.maxHeight }}>
              <div className="h-1 w-full bg-muted">
                <motion.div
                  className="h-full"
                  style={{ background: "var(--bbdo-red)" }}
                  animate={{ width: total ? `${((i + 1) / total) * 100}%` : "0%" }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--bbdo-blue)" }} />
                  {total ? `Step ${i + 1} of ${total}` : "Loading tour"}
                </div>
                <h3 className="mt-2 font-display text-[17px] sm:text-[19px] leading-tight font-black tracking-tight">
                  {step?.title ?? ""}
                </h3>
                <p className="mt-2 text-[13px] sm:text-[13.5px] leading-relaxed text-muted-foreground">{step?.body ?? ""}</p>

                <div className="mt-4 sm:mt-5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={back}
                    disabled={i === 0}
                    className="no-pill inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-muted-foreground disabled:opacity-30 active:scale-[0.98]"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    className="no-pill inline-flex min-h-10 items-center gap-1.5 rounded-full px-5 text-[13.5px] font-bold text-white active:scale-[0.98]"
                    style={{ background: "var(--bbdo-red)" }}
                  >
                    {isLast ? "Start my day" : "Next"} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
