import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import SoundToggle from "@/components/SoundToggle";
import { setPhase } from "@/lib/musicEngine";
import { getCachedOnboardingGrade, prefetchOnboardingGrade, type OnboardingGrade } from "@/lib/onboardingGrade";

type HopeCopy = {
  titleLine1: string;
  titleLine2: string;
  sub: string;
  quote: React.ReactNode;
  source: string;
  secondary?: { quote: React.ReactNode; source: string };
};

function copyFor(slug: string | undefined): HopeCopy {
  if (slug === "normal") {
    return {
      titleLine1: "Stay healthy.",
      titleLine2: "Stay ahead.",
      sub: "Your current habits are helping. Keep building on them to protect your long-term metabolic health.",
      quote: (
        <>"Healthy lifestyle behaviours are associated with substantially lower risk of developing <span className="text-primary font-bold">Type 2 diabetes</span> and cardiovascular disease."</>
      ),
      source: "— Harvard T.H. Chan School of Public Health, 2024",
    };
  }
  if (slug === "moderate") {
    return {
      titleLine1: "You're on the",
      titleLine2: "right path.",
      sub: "Small, consistent changes today can prevent bigger health problems tomorrow.",
      quote: (
        <>"Lifestyle intervention improves <span className="text-primary font-bold">insulin sensitivity</span> and reduces the progression to Type 2 diabetes in people at increased metabolic risk."</>
      ),
      source: "— Diabetes Prevention Program (DPP), National Institutes of Health, 2023",
    };
  }
  // severe (default)
  return {
    titleLine1: "This is",
    titleLine2: "reversible.",
    sub: "With the right system, your body can heal.",
    quote: (
      <>"Up to <span className="text-primary font-bold">86%</span> of patients achieve normal glucose through sustained lifestyle changes."</>
    ),
    source: "— The Lancet, 2024",
    secondary: {
      quote: (
        <>"<span className="text-primary font-bold">Metabolic health</span> improves when lifestyle changes are sustained — not only blood glucose, but blood pressure, liver fat, cholesterol, PCOS and insulin sensitivity."</>
      ),
      source: "— Diabetologia, 2024",
    },
  };
}

export default function HopeScreen() {
  const navigate = useNavigate();
  const [grade, setGrade] = useState<OnboardingGrade | null>(() => getCachedOnboardingGrade());

  useEffect(() => {
    setPhase("hope");
    if (!grade) {
      prefetchOnboardingGrade().then(setGrade).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Never flash the severe copy before the real grade resolves.
  if (!grade) {
    return <div className="ob-screen phone-container ob-lock min-h-dvh overflow-x-hidden" />;
  }

  const copy = copyFor(grade.slug);

  return (
    <div className="ob-screen phone-container ob-lock min-h-dvh overflow-x-hidden">
      <SoundToggle />
      <div className="ob-content">
        <motion.h1 className="ob-title mb-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          {copy.titleLine1}<br /><span className="text-primary">{copy.titleLine2}</span>
        </motion.h1>
        <motion.p className="ob-sub mb-5 max-w-[280px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>{copy.sub}</motion.p>

        <motion.div className="liquid-glass-strong mb-3 w-full p-4 text-left" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-muted-foreground">What the science says</p>
          <p className="text-sm font-medium leading-6 text-foreground">{copy.quote}</p>
          <p className="mt-2 text-[0.65rem] text-muted-foreground">{copy.source}</p>
        </motion.div>

        {copy.secondary && (
          <motion.div className="liquid-glass-strong mb-4 w-full p-4 text-left" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 }}>
            <p className="text-sm font-medium leading-6 text-foreground">{copy.secondary.quote}</p>
            <p className="mt-2 text-[0.65rem] text-muted-foreground">{copy.secondary.source}</p>
          </motion.div>
        )}

        <motion.div className="ob-bottom" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
          <motion.button onClick={() => navigate("/projection-preview")} className="ob-cta gradient-blue glow-blue" whileTap={{ scale: 0.98 }}>See my projection <ChevronRight className="h-5 w-5" /></motion.button>
        </motion.div>
      </div>
    </div>
  );
}
