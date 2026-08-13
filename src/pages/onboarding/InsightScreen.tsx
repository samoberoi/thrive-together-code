import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Heart, Sparkles, Activity, HeartPulse, Scale, Droplet, Flame, Brain, Moon, Apple, Dumbbell, ShieldCheck, TrendingUp, TrendingDown, AlertTriangle, Gauge } from "lucide-react";

// Curated icon map — importing the whole lucide-react namespace pulled ~700KB
// into this onboarding chunk.
const GRADE_ICONS: Record<string, React.ElementType> = {
  Sparkles, Activity, HeartPulse, Heart, Scale, Droplet, Flame, Brain, Moon,
  Apple, Dumbbell, ShieldCheck, TrendingUp, TrendingDown, AlertTriangle, Gauge,
};
import SoundToggle from "@/components/SoundToggle";
import { setPhase } from "@/lib/musicEngine";
import { fetchOnboardingGrade, getCachedOnboardingGrade, type OnboardingGrade } from "@/lib/onboardingGrade";

const ACCENTS: Record<string, { color: string; tile: string; cta: string }> = {
  red: { color: "var(--bbdo-red)", tile: "tile-icon-red", cta: "gradient-blue glow-blue" },
  amber: { color: "var(--bbdo-amber, #F59E0B)", tile: "tile-icon-amber", cta: "gradient-blue glow-blue" },
  green: { color: "var(--bbdo-green, #10B981)", tile: "tile-icon-green", cta: "gradient-blue glow-blue" },
};

const WaistArrowsIcon = ({ className, strokeWidth, style }: { className?: string; strokeWidth?: number; style?: CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4c1.05 1.4 1.58 3.1 1.58 5.1 0 1.95-.48 3.3-1.44 4.04C8.18 13.88 7.7 15.5 7.7 18" />
    <path d="M15 4c-1.05 1.4-1.58 3.1-1.58 5.1 0 1.95.48 3.3 1.44 4.04.96.74 1.44 2.36 1.44 4.86" />
    <path d="M4 12h4" />
    <path d="m6 10 2 2-2 2" />
    <path d="M20 12h-4" />
    <path d="m18 10-2 2 2 2" />
  </svg>
);

const getGradeIcon = (icon: string) => {
  if (icon === "WaistArrows") return WaistArrowsIcon;
  return (GRADE_ICONS[icon] ?? Sparkles) as React.ElementType;
};

export default function InsightScreen() {
  const navigate = useNavigate();
  const [grade, setGrade] = useState<OnboardingGrade | null>(() => getCachedOnboardingGrade());

  useEffect(() => { setPhase("hope"); }, []);
  useEffect(() => {
    if (grade) return;
    let cancelled = false;
    fetchOnboardingGrade().then((g) => { if (!cancelled) setGrade(g); });
    return () => { cancelled = true; };
  }, [grade]);

  // Render an empty canvas until the real grade resolves — never flash the
  // fallback (severe) content and then swap it out.
  if (!grade) {
    return <div className="ob-screen phone-container ob-lock min-h-dvh overflow-x-hidden" />;
  }

  const g = grade;
  const accent = ACCENTS[g.accent] ?? ACCENTS.red;

  return (
    <div className="ob-screen phone-container ob-lock min-h-dvh overflow-x-hidden">

      <SoundToggle />
      <div className="ob-content">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <span className="ob-kicker mb-2 flex items-center gap-1.5" style={{ color: accent.color }}>
            <Heart className="h-3.5 w-3.5 fill-current" /> {g.kicker}
          </span>
          <h1 className="ob-title mt-2">
            {g.headline}{" "}
            {g.headline_highlight && <span className="text-primary">{g.headline_highlight}</span>}
          </h1>
        </motion.div>

        <div className="ob-stack flex-1">
          {g.cards.map((item, i) => {
            const Icon = getGradeIcon(item.icon);
            return (
              <motion.div key={`${g.slug}-${i}`} className="liquid-glass p-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.12 }}>
                <div className="flex items-start gap-3">
                  <div className={`ob-icon mt-0.5 liquid-glass-icon ${accent.tile}`}>
                    <Icon className="h-5 w-5" strokeWidth={1.5} style={{ color: accent.color }} />
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-bold text-foreground">{item.title}</p>
                    <p className="text-xs leading-5 text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {g.closing_line && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} className="px-1 text-xs leading-5 text-muted-foreground">
              {g.closing_line}
            </motion.p>
          )}
        </div>

        <motion.div className="ob-bottom" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          <motion.button onClick={() => navigate("/hope")} className={`ob-cta ${accent.cta}`} whileTap={{ scale: 0.98 }}>
            {g.cta_label} <ChevronRight className="h-5 w-5" />
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
