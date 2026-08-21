import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Heart, Target, ShieldCheck,
  Sparkles, Rocket, Check, PenLine, X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import philosophyImg from "@/assets/coach-tour/philosophy.jpg";
import punchImg from "@/assets/coach-tour/punch.jpg";
import roleImg from "@/assets/coach-tour/role.jpg";
import traitsImg from "@/assets/coach-tour/traits.jpg";
import visionImg from "@/assets/coach-tour/vision.jpg";

interface Props {
  coachId: string;
  coachName: string;
  onComplete: () => void;
  onClose?: () => void;
  isReplay?: boolean;
}

const SLIDES = [
  {
    id: 1,
    icon: Heart,
    image: philosophyImg,
    accent: "from-rose-500 to-pink-600",
    glow: "shadow-rose-500/20",
    title: "Philosophy Reset",
    subtitle: "Objective 1",
    points: [
      "We don't manage diabetes — we aim for reversal & remission.",
      "We don't treat numbers — we fix metabolism.",
      "This is NOT about diet charts — it's about behaviour change + system change.",
      "Get over calorie obsession. Change medication-first thinking. No symptom-based approach.",
    ],
  },
  {
    id: 2,
    icon: Target,
    image: punchImg,
    accent: "from-secondary to-primary",
    glow: "shadow-secondary/20",
    title: "Core System — PUNCH",
    subtitle: "Objective 2",
    points: [
      "Structured 5-pillar framework: Diet · Fasting · Movement · Supplements · Stress Management.",
      "Cohesive application of the lifestyle framework is binding.",
      "Ensures consistency, brand integrity, and predictable outcomes.",
      "The framework is your north-star — every client interaction maps to PUNCH.",
    ],
  },
  {
    id: 3,
    icon: ShieldCheck,
    image: roleImg,
    accent: "from-emerald-500 to-teal-600",
    glow: "shadow-emerald-500/20",
    title: "Role Clarity",
    subtitle: "Objective 3",
    points: [
      "You are NOT doctors, diagnosticians, or supplement pushers.",
      "You ARE accountability partners & behaviour change coaches.",
      "You translate the 5 Pillars to fix metabolism.",
      "You don't fix diabetes — you help people fix their habits.",
    ],
  },
  {
    id: 4,
    icon: Sparkles,
    image: traitsImg,
    accent: "from-amber-500 to-orange-600",
    glow: "shadow-amber-500/20",
    title: "Top 5 Traits Needed",
    subtitle: "Objective 4",
    points: [
      "Empathy > Knowledge · Listening > Advising",
      "Consistency > Intensity · Simplicity > Complexity",
      "Discipline > Motivation",
      "Your success is how many people stay consistent because of you.",
    ],
  },
  {
    id: 5,
    icon: Rocket,
    image: visionImg,
    accent: "from-violet-500 to-purple-600",
    glow: "shadow-violet-500/20",
    title: "Vision & Opportunity",
    subtitle: "Objective 5",
    points: [
      "This is a metabolic health movement — India faces a metabolic crisis.",
      "You are members of a scalable system — the founding batch of coaches.",
      "Ownership · Pride · Communication · Empathy · Discipline · Accountability.",
      "Learning-based, emotionally stable, attention to details, respect boundaries.",
    ],
  },
];

export default function CoachGuidedTour({ coachId, coachName, onComplete, onClose, isReplay }: Props) {
  const { user } = useAuth();
  const [current, setCurrent] = useState(0);
  const [showConsent, setShowConsent] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;

  const next = () => {
    if (isLast) {
      if (isReplay) {
        onComplete();
      } else {
        setShowConsent(true);
      }
    } else {
      setCurrent((p) => p + 1);
    }
  };

  const prev = () => {
    if (current > 0) setCurrent((p) => p - 1);
  };

  // Canvas drawing for signature
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawing.current = true;
    lastPos.current = getCanvasPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "hsl(var(--foreground))";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = () => {
    isDrawing.current = false;
  };

  const clearSig = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
  };

  const hasSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  };

  const handleConfirm = async () => {
    if (!hasSignature()) return;
    setSigning(true);
    const sigData = canvasRef.current?.toDataURL("image/png") ?? "";
    const now = new Date().toISOString();

    await supabase
      .from("coaches" as any)
      .update({ tour_completed_at: now, tour_signature: sigData } as any)
      .eq("id", coachId);

    setSigned(true);
    setTimeout(() => onComplete(), 1500);
  };

  // Consent screen
  if (showConsent) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            className="w-full max-w-lg"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {signed ? (
              <div className="text-center py-16">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1]}}
                  className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-5"
                >
                  <Check className="w-10 h-10 text-primary" strokeWidth={2.5} />
                </motion.div>
                <h2 className="text-xl sm:text-2xl font-black text-foreground">Welcome aboard!</h2>
                <p className="text-muted-foreground mt-2">Your journey as a BBDO coach begins now.</p>
              </div>
            ) : (
              <div className="liquid-glass rounded-3xl p-6 md:p-8">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                    <PenLine className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-foreground">Acknowledgement</h2>
                    <p className="text-xs text-muted-foreground">Consent & Digital Signature</p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-2xl p-4 mb-5 text-sm text-muted-foreground leading-relaxed">
                  I, <span className="text-foreground font-bold">{coachName}</span>, confirm that I have reviewed and understand the 5 Core Objectives of the BBDO coaching philosophy. I commit to upholding these principles in all patient interactions.
                </div>

                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium">Date</p>
                  <p className="text-xs text-foreground font-bold">
                    {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground font-medium mb-1.5">Sign below</p>
                <div className="relative rounded-2xl border-2 border-dashed border-border bg-background overflow-hidden mb-4">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={160}
                    className="w-full h-28 touch-none cursor-crosshair"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={stopDraw}
                  />
                  <button
                    onClick={clearSig}
                    className="absolute top-2 right-2 text-[10px] text-muted-foreground hover:text-foreground bg-muted/80 px-2 py-0.5 rounded-full"
                  >
                    Clear
                  </button>
                </div>

                <button
                  onClick={handleConfirm}
                  disabled={signing}
                  className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50"
                >
                  {signing ? "Saving…" : "I Understand & Confirm"}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  // Slide view
  const Icon = slide.icon;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <p className="text-xs text-muted-foreground font-medium">
          {current + 1} / {SLIDES.length}
        </p>
        {(isReplay || onClose) && (
          <button onClick={onClose ?? onComplete} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5 px-5 mb-6">
        {SLIDES.map((_, i) => (
          <div key={i} className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: i <= current ? "100%" : "0%" }}
              transition={{ duration: 0.3 }}
            />
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-32">
        <AnimatePresence initial={false}>
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-6"
          >
            {/* Hero image */}
            <div className="relative w-full max-w-lg mx-auto aspect-[16/9] rounded-3xl overflow-hidden shadow-xl">
              <img
                src={slide.image}
                alt={slide.title}
                width={1200}
                height={640}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
            </div>

            {/* Icon + title */}
            <div className="flex flex-col items-center text-center gap-3">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1]}}
                className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${slide.accent} flex items-center justify-center shadow-xl ${slide.glow}`}
              >
                <Icon className="w-8 h-8 text-white" strokeWidth={1.8} />
              </motion.div>
              <p className="text-xs font-bold text-primary tracking-widest uppercase">{slide.subtitle}</p>
              <h1 className="text-2xl md:text-3xl font-black text-foreground leading-tight">{slide.title}</h1>
            </div>

            {/* Points */}
            <div className="flex flex-col gap-3 max-w-lg mx-auto w-full">
              {slide.points.map((point, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  className="liquid-glass rounded-2xl p-4 flex items-start gap-3"
                >
                  <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${slide.accent} flex items-center justify-center shrink-0 mt-0.5`}>
                    <span className="text-white text-xs font-black">{i + 1}</span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{point}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border/30 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          {current > 0 && (
            <button
              onClick={prev}
              className="flex items-center gap-1 px-4 py-3 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back</span>
            </button>
          )}
          <button
            onClick={next}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm"
          >
            {isLast ? (isReplay ? "Done" : "I'm Ready — Sign & Confirm") : "Continue"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
