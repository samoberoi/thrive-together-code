import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Shield, TrendingUp } from "lucide-react";
import { getUser } from "@/lib/userStore";
import SoundToggle from "@/components/SoundToggle";
import { setPhase } from "@/lib/musicEngine";

function getInterpretation(score: number) {
  if (score >= 70) return { title: "Good, we can do better", message: "Your metabolic health is solid — but a few targeted shifts can take you further.", tone: "text-primary", bg: "bg-primary/10", hope: "Small, consistent optimizations can push your score well above 95." };
  if (score >= 60) return { title: "Wake-up Call", message: "Your body is signaling early metabolic stress. Now's the time to act.", tone: "text-warning", bg: "bg-warning/10", hope: "Most people in this range see meaningful improvement within 90 days of structured support." };
  if (score >= 50) return { title: "Attention Required", message: "Your markers show your metabolism is under real strain and needs care.", tone: "text-warning", bg: "bg-warning/10", hope: "With the right plan, this range typically improves significantly in 3–6 months." };
  if (score >= 40) return { title: "Moderate Risk", message: "You're heading toward metabolic dysfunction — reversible with focused intervention.", tone: "text-destructive", bg: "bg-destructive/10", hope: "People at this level routinely recover with a structured 6-month program." };
  return { title: "High Risk", message: "Your markers indicate significant metabolic dysfunction that needs urgent attention.", tone: "text-destructive", bg: "bg-destructive/10", hope: "With our intensive program, people in your range have reversed their condition in 6-18 months." };
}


export default function ScoreInterpretation() {
  const navigate = useNavigate();
  const user = getUser();
  const score = user.assessment?.healthScore ?? 72;
  const interp = getInterpretation(score);
  useEffect(() => { setPhase("power"); }, []);

  const ambientGlow = score < 50 ? "rgba(239,68,68,0.06)" : score < 70 ? "rgba(245,158,11,0.06)" : "rgba(59,130,246,0.06)";

  return (
    <div className="phone-container ob-lock min-h-dvh flex flex-col px-6 pt-14 mobile-bottom-safe bg-background relative">
      <SoundToggle />
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${ambientGlow}, transparent 60%)` }} />
      <div className="relative z-10 flex flex-col flex-1">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-3 leading-none">
            <Shield className="w-4 h-4 text-primary shrink-0" strokeWidth={2} />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.2em]">Score Analysis</span>
          </div>
          <h1 className="text-3xl font-black text-foreground leading-tight">Your score is <span className={interp.tone}>{score}</span></h1>
        </motion.div>

        <div className="flex flex-col gap-5 flex-1 mt-8">
          <motion.div className={`liquid-glass rounded-2xl p-5 ${interp.bg}`} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <h2 className={`font-bold text-lg mb-2 ${interp.tone}`}>{interp.title}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{interp.message}</p>
          </motion.div>

          <motion.div className="liquid-glass bg-primary/5 rounded-2xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-primary" strokeWidth={1.5} />
              <span className="text-primary text-xs font-semibold uppercase tracking-widest">The Good News</span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{interp.hope}</p>
          </motion.div>

          <motion.div className="liquid-glass rounded-2xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <p className="text-muted-foreground text-xs uppercase tracking-widest mb-2 font-semibold">What happens next</p>
            <p className="text-muted-foreground text-sm leading-relaxed">We'll show you exactly how your health trajectory could change — and recommend the perfect plan for your profile.</p>
          </motion.div>
        </div>
      </div>

      <div className="ob-bottom">
        <motion.button onClick={() => navigate("/trajectory")} className="ob-cta gradient-blue glow-blue" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} whileTap={{ scale: 0.98 }}>
          See my trajectory <ChevronRight className="w-5 h-5" />
        </motion.button>
      </div>
    </div>
  );
}