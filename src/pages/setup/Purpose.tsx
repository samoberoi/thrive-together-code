import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Activity, Flame, Zap, Leaf, ArrowRight } from "lucide-react";
import { saveUser, getUser } from "@/lib/userStore";

const goals = [
  { id: "diabetes", icon: Activity, title: "Control Diabetes", subtitle: "Balance & reverse blood sugar", color: "text-primary", bg: "bg-primary/10", border: "border-primary/30" },
  { id: "weight", icon: Flame, title: "Lose Weight", subtitle: "Sustainable fat loss", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" },
  { id: "lifestyle", icon: Leaf, title: "Change Lifestyle", subtitle: "Build lasting healthy habits", color: "text-secondary", bg: "bg-secondary/10", border: "border-secondary/30" },
  { id: "energy", icon: Zap, title: "Boost Energy", subtitle: "Feel alive & vibrant again", color: "text-warning", bg: "bg-warning/10", border: "border-warning/30" },
];

export default function Purpose() {
  const [selected, setSelected] = useState<string[]>(() => {
    const stored = getUser();
    return (stored.profile as any).goals ?? [];
  });
  const navigate = useNavigate();

  const toggle = (id: string) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleContinue = () => {
    saveUser({ profile: { ...(getUser().profile), goals: selected } as any });
    navigate("/setup/basic-details");
  };

  return (
    <div className="phone-container min-h-dvh flex flex-col px-5 pt-14 mobile-bottom-safe bg-background">
      <SetupEscapeBar />
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground text-xs font-medium">Step 1 of 5</span>
          <span className="text-primary text-xs font-medium">20%</span>
        </div>
        <Progress value={20} className="h-1.5" />
      </div>


      <div className="flex flex-col flex-1">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-foreground mb-2">Why are you<br />here?</h1>
          <p className="text-muted-foreground text-sm">Pick all that apply — your plan adapts to your goals.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8 flex-1">
          {goals.map((goal, i) => {
            const isSelected = selected.includes(goal.id);
            const Icon = goal.icon;
            return (
              <motion.button key={goal.id} onClick={() => toggle(goal.id)} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileTap={{ scale: 0.98 }}
                className={`relative flex flex-col gap-3 p-5 rounded-2xl border-2 transition-colors duration-200 ${isSelected ? `bg-card ${goal.border} shadow-md` : "bg-card border-border"}`}>
                {isSelected && (
                  <motion.div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1]}}>
                    <span className="text-primary-foreground text-xs font-bold">✓</span>
                  </motion.div>
                )}
                <div className={`w-10 h-10 rounded-xl ${goal.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${goal.color}`} strokeWidth={1.8} />
                </div>
                <div className="text-left">
                  <p className="text-foreground font-bold text-sm">{goal.title}</p>
                  <p className="text-muted-foreground text-xs mt-0.5 leading-relaxed">{goal.subtitle}</p>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="ob-bottom">
          <motion.button onClick={handleContinue} disabled={selected.length === 0}
            className="ob-cta gradient-blue glow-blue disabled:opacity-40"
            whileTap={{ scale: 0.98 }}>
            Continue <ArrowRight className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

    </div>
  );
}
