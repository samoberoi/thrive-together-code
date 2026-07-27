import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { ChevronRight, Heart } from "lucide-react";
import SoundToggle from "@/components/SoundToggle";
import { setPhase } from "@/lib/musicEngine";
import { fetchOnboardingGrade, FALLBACK_GRADE, type OnboardingGrade } from "@/lib/onboardingGrade";

const ACCENTS: Record<string, { color: string; tile: string; cta: string }> = {
  red: { color: "var(--bbdo-red)", tile: "tile-icon-red", cta: "gradient-blue glow-blue" },
  amber: { color: "var(--bbdo-amber, #F59E0B)", tile: "tile-icon-amber", cta: "gradient-blue glow-blue" },
  green: { color: "var(--bbdo-green, #10B981)", tile: "tile-icon-green", cta: "gradient-blue glow-blue" },
};

export default function InsightScreen() {
  const navigate = useNavigate();
  const [grade, setGrade] = useState<OnboardingGrade | null>(null);

  useEffect(() => { setPhase("hope"); }, []);
  useEffect(() => { fetchOnboardingGrade().then(setGrade); }, []);

  const g = grade ?? FALLBACK_GRADE;
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
            const Icon = ((Icons as any)[item.icon] ?? Icons.Sparkles) as React.ElementType;
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
