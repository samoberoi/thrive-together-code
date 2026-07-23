import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Timer, Footprints, Pill, Wind, Sparkles } from "lucide-react";
import Avocado from "@/components/icons/Avocado";
import BbdoWordmark from "@/components/BbdoWordmark";
import { useAuth } from "@/contexts/AuthContext";
import bbdoLogo from "@/assets/logo.png";

type Pillar = {
  key: string;
  index: string;
  name: string;
  Icon: React.ElementType;
  tagline: string;
  headline: string;
  stats: { value: string; label: string }[];
  bullets: string[];
  detail: string;
  quote?: string;
  gradient: string; // css linear-gradient value
};

const PILLARS: Pillar[] = [
  {
    key: "food",
    index: "01",
    name: "Food",
    Icon: Avocado,
    tagline: "Your plate is the dose. Get it right and the medicine cabinet shrinks.",
    headline: "Every meal is built around five essentials.",
    stats: [
      { value: "−35%", label: "avg post-meal glucose drop" },
      { value: "12 kg", label: "avg fat loss in 6 months" },
      { value: "80k+", label: "plates rebuilt with BBDO" },
    ],
    bullets: [
      "Protein — to build muscle and improve satiety",
      "Fibre — colourful, non-starchy vegetables for gut and glucose health",
      "Smart Carbs — only if needed, from minimally processed whole foods",
      "Healthy Fats — ghee, cold-pressed oils, nuts and seeds",
      "Hydration & Micronutrients — water, electrolytes and mineral-rich foods",
    ],
    detail:
      "Eat in order — salad first, protein second, carb last. The fibre slows glucose absorption, protein triggers GLP-1, and the curve is buffered before the carb hits your bloodstream.",
    quote:
      "The Indian plate was never the problem. We simply drifted away from the way our grandmothers combined, cooked, and ate their food. — Col. Gautam Guha",
    gradient: "linear-gradient(135deg, #10B981 0%, #248CCB 100%)",
  },
  {
    key: "fasting",
    index: "02",
    name: "Fasting",
    Icon: Timer,
    tagline: "Eat in a window, heal in the gap. Fasting is medicine that costs nothing.",
    headline: "Give your pancreas eight hours off. Watch what your body does with the silence.",
    stats: [
      { value: "16:8", label: "most popular BBDO window" },
      { value: "−30%", label: "fasting insulin in first 8 weeks" },
      { value: "3.5 kg", label: "avg weight loss in first 30 days" },
    ],
    bullets: [
      "Week 1–2: 12:12 — dinner by 8 pm, breakfast at 8 am. No snacks.",
      "Week 3–4: 14:10 — push breakfast to 10 am.",
      "Week 5+: 16:8 — eat between 12 pm and 8 pm.",
      "Water, black coffee and plain tea are allowed during the fasting window.",
    ],
    detail:
      "The problem isn't what we eat — it's how often. When insulin never gets a chance to fall, the body can't burn stored fat. Fasting rests the pancreas, improves insulin sensitivity and flips the body from sugar-burning to fat-burning.",
    gradient: "linear-gradient(135deg, #248CCB 0%, #0F1A3D 100%)",
  },
  {
    key: "movement",
    index: "03",
    name: "Movement",
    Icon: Footprints,
    tagline: "You don't need a gym. You need to move — daily, joyfully, without excuse.",
    headline: "Skeletal muscle is the largest glucose sink in your body. Use it.",
    stats: [
      { value: "−22%", label: "post-meal glucose after a 10-min walk" },
      { value: "2×/wk", label: "strength sessions to reverse sarcopenia" },
      { value: "+15%", label: "insulin sensitivity in 12 weeks" },
    ],
    bullets: [
      "5 minutes of seated soleus push-ups right after eating",
      "A 10-minute walk within 30 minutes of every main meal",
      "Two 20-30 min strength sessions a week — push-ups, squats",
      "20 minutes of yoga & mobility, three times a week",
    ],
    detail:
      "Three short walks outperform one long workout. Cardio manages glucose today; strength training preserves muscle and improves control 24/7 — even while you sleep.",
    quote:
      "You can't out-walk a poor diet. And you can't out-diet a sedentary life. — Col. Gautam Guha",
    gradient: "linear-gradient(135deg, #F59E0B 0%, #E00101 100%)",
  },
  {
    key: "supplements",
    index: "04",
    name: "Supplements",
    Icon: Pill,
    tagline: "Supplements support, they don't substitute. Fix the food first, then fine-tune.",
    headline: "Science-backed. Purpose-driven. Only what closes a real gap.",
    stats: [
      { value: "5", label: "core supplements — nothing more" },
      { value: "70–80%", label: "urban Indians are Vitamin D deficient" },
      { value: "Quarterly", label: "test. adjust. repeat." },
    ],
    bullets: [
      "Vitamin D3 + K2 — insulin sensitivity, immunity, bone health",
      "Magnesium (glycinate) — 300+ enzymes, sleep, glucose control",
      "Omega-3 — inflammation and cardiovascular protection",
      "Vitamin B12 — energy, nerve health, mood",
      "Prebiotic + Probiotic — gut microbiome and metabolic health",
    ],
    detail:
      "If your plate is broken, no capsule will save you. Fix Food, Fasting and Movement first — then add the BBDO core five to push the last 20%. Every dose is calibrated quarterly against your blood work.",
    gradient: "linear-gradient(135deg, #248CCB 0%, #10B981 100%)",
  },
  {
    key: "stress",
    index: "05",
    name: "Stress & Yoga",
    Icon: Wind,
    tagline: "Stress raises sugar without a single bite. Lower stress. Lower sugar.",
    headline: "Cortisol is half the loop. Sleep, breath and calm are the missing prescription.",
    stats: [
      { value: "76 sec", label: "one round of the 4·7·8 breath" },
      { value: "7–9 hr", label: "sleep target for reversal" },
      { value: "−18%", label: "fasting glucose with sleep > 7h" },
    ],
    bullets: [
      "Inhale 4 · Hold 7 · Exhale 8 — repeat 4 cycles, twice daily",
      "A hard sleep window: 10:30 pm to 6:30 am, screens off after 9",
      "Vagal-tone anchors — sunlight, cold splash, humming, singing",
      "One walk without your phone. Every single day.",
    ],
    detail:
      "Chronic stress tells the liver to release glucose. Insulin rises, resistance builds, and the loop repeats. Slow the exhale, activate the vagus nerve, and the whole system settles — including your glucose.",
    gradient: "linear-gradient(135deg, #0F1A3D 0%, #E00101 100%)",
  },
];

export default function Tour() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [params] = useSearchParams();
  const [i, setI] = useState(0);

  useEffect(() => {
    const scroller = document.getElementById("bbdo-tour-scroll");
    if (scroller) {
      scroller.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [i]);

  const isLast = i === PILLARS.length;
  const p = !isLast ? PILLARS[i] : null;

  const finish = () => {
    try {
      const uid = authUser?.id ?? "anon";
      localStorage.setItem(`bbdo:tourCompleted:${uid}`, "1");
    } catch {}
    navigate("/home", { replace: true });
  };

  const skip = () => finish();

  const next = () => {
    if (i < PILLARS.length) setI(i + 1);
    else finish();
  };
  const back = () => {
    if (i > 0) setI(i - 1);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="relative z-20 shrink-0 bg-background/95 backdrop-blur-xl"
        style={{
          borderBottom: "1px solid hsl(var(--border))",
          paddingTop: "max(env(safe-area-inset-top), 12px)",
        }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <img src={bbdoLogo} alt="BBDO" className="w-8 h-8 rounded-full object-contain" />
            <BbdoWordmark className="text-base" />
          </div>
          <button
            onClick={skip}
            type="button"
            className="no-pill shrink-0 rounded-full bg-[var(--bbdo-ink)] px-4 py-2.5 text-xs font-semibold text-white shadow-card active:scale-[0.98] transition-transform"
          >
            Skip
          </button>
        </div>
        {/* Progress dots */}
        <div className="max-w-3xl mx-auto px-5 pb-3 flex items-center gap-1.5">
          {PILLARS.map((_, idx) => (
            <div
              key={idx}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                idx < i ? "bg-[var(--bbdo-blue)]" : idx === i ? "bg-[var(--bbdo-red)]" : "bg-muted"
              }`}
            />
          ))}
          <div
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              isLast ? "bg-[var(--bbdo-red)]" : "bg-muted"
            }`}
          />
        </div>
      </div>

      <div
        id="bbdo-tour-scroll"
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
      <div className="max-w-3xl mx-auto px-5 pt-5" style={{ paddingBottom: "calc(7rem + max(env(safe-area-inset-bottom), 64px))" }}>
        <AnimatePresence mode="wait">
          {p ? (
            <motion.div
              key={p.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Hero */}
              <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 text-white shadow-lift" style={{ backgroundImage: p.gradient }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-white/70 text-[11px] font-semibold tracking-[0.18em] uppercase">
                      <span>Pillar {p.index} of 05</span>
                    </div>
                    <h1 className="mt-3 font-display font-black text-[clamp(1.75rem,8vw,3rem)] md:text-5xl leading-[0.95] tracking-tight break-words">
                      {p.name}.
                    </h1>
                    <p className="mt-3 text-white/85 text-sm md:text-base leading-relaxed max-w-[36ch]">
                      {p.tagline}
                    </p>
                  </div>
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0 overflow-hidden">
                    <p.Icon className="w-6 h-6 md:w-8 md:h-8" strokeWidth={1.75} />
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-2">
                  {p.stats.map((s) => (
                    <div key={s.label} className="min-w-0 rounded-2xl bg-white/10 backdrop-blur px-2.5 py-3 border border-white/10">
                      <div className="no-break font-display font-black text-[clamp(0.85rem,3.6vw,1.25rem)] md:text-xl leading-tight">{s.value}</div>
                      <div className="no-break mt-1.5 text-[10px] md:text-[11px] uppercase tracking-wide text-white/70 leading-tight">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Headline */}
              <div className="mt-6">
                <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                  What you'll do
                </div>
                <p className="mt-2 font-display text-xl md:text-2xl leading-snug tracking-tight">
                  {p.headline}
                </p>
              </div>

              {/* Bullets */}
              <div className="mt-5 rounded-2xl bg-card border border-border p-5 shadow-card">
                <ul className="space-y-3">
                  {p.bullets.map((b, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + idx * 0.04, duration: 0.22 }}
                      className="flex items-start gap-3"
                    >
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-[var(--bbdo-blue-soft)] text-[var(--bbdo-blue)] flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" strokeWidth={3} />
                      </span>
                      <span className="text-sm text-foreground/90 leading-relaxed">{b}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>

              {/* Detail */}
              <div className="mt-5 rounded-2xl bg-[var(--bbdo-surface)] p-5">
                <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground mb-2">
                  Why it works
                </div>
                <p className="text-sm text-foreground/85 leading-relaxed">{p.detail}</p>
              </div>

              {/* Quote */}
              {p.quote && (
                <p className="mt-5 text-sm italic text-muted-foreground leading-relaxed border-l-2 border-[var(--bbdo-red)] pl-4">
                  "{p.quote}"
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="finale"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="text-center pt-6"
            >
              <div className="mx-auto w-16 h-16 rounded-2xl text-white flex items-center justify-center shadow-lift" style={{ backgroundImage: "linear-gradient(135deg, #248CCB 0%, #E00101 100%)" }}>
                <Sparkles className="w-8 h-8" strokeWidth={1.75} />
              </div>
              <h2 className="mt-6 font-display font-black text-3xl md:text-4xl leading-tight tracking-tight">
                One fist. Five disciplines.
              </h2>
              <p className="mt-3 text-muted-foreground text-sm md:text-base max-w-md mx-auto leading-relaxed">
                Alone they help. Together, they transform. Your dashboard is set up around these five — one tab per pillar!
              </p>

              <div className="mt-8 grid grid-cols-5 gap-1.5 max-w-md mx-auto px-1">
                {PILLARS.map((pl) => (
                  <div key={pl.key} className="flex flex-col items-center gap-1.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl text-white flex items-center justify-center overflow-hidden shrink-0" style={{ backgroundImage: pl.gradient }}>
                      <pl.Icon className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <span className="no-break w-full text-center text-[9px] leading-tight font-semibold tracking-tight text-foreground/80">{pl.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>

      {/* Footer nav */}
      <div
        className="relative z-30 shrink-0 bg-background/98 backdrop-blur-xl shadow-[0_-10px_30px_rgba(15,26,61,0.08)]"
        style={{
          borderTop: "1px solid hsl(var(--border))",
          paddingBottom: "calc(max(env(safe-area-inset-bottom), 12px) + var(--bbdo-native-bottom-guard, 0px))",
        }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 px-5 pt-3">
          <button
            onClick={back}
            disabled={i === 0}
            type="button"
            className="no-pill flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-muted-foreground disabled:opacity-30 active:scale-[0.98] transition-transform"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="text-[11px] font-semibold text-muted-foreground">
            {isLast ? "" : `${i + 1} of ${PILLARS.length}`}
          </div>
          <button
            onClick={next}
            type="button"
            className="no-pill flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--bbdo-red)] px-5 py-2.5 text-sm font-bold text-white shadow-card active:scale-[0.98] transition-transform"
          >
            {isLast ? "Enter dashboard" : "Next"} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
