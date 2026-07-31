import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Scale, Leaf, FlaskConical, Pill, ChevronRight, AlertTriangle, Stethoscope } from "lucide-react";
import { getUser } from "@/lib/userStore";
import SoundToggle from "@/components/SoundToggle";
import { setPhase, setIntensity, playScoreRevealImpact } from "@/lib/musicEngine";
import { useAuth } from "@/contexts/AuthContext";
import { updateProfile } from "@/lib/profileService";
import HealthScoreRing from "@/components/HealthScoreRing";


function getRiskBadgeStyle(category: string): string {
  if (category === "Good") return "bg-primary/10 text-primary border-primary/20";
  if (category === "Wake-up Call") return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
  if (category === "Attention Required") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  if (category === "Moderate Risk") return "bg-orange-500/10 text-orange-600 border-orange-500/20";
  return "bg-destructive/10 text-destructive border-destructive/20";
}

const breakdownConfig = [
  { key: "diseaseSeverity", label: "Disease Severity", max: 25, icon: FlaskConical, color: "hsl(var(--critical))" },
  { key: "obesityFat", label: "Obesity & Fat", max: 20, icon: Scale, color: "hsl(var(--primary))" },
  { key: "treatmentLoad", label: "Treatment Load", max: 20, icon: Pill, color: "hsl(270 60% 55%)" },
  { key: "lifestyle", label: "Lifestyle", max: 20, icon: Leaf, color: "hsl(var(--primary))" },
  { key: "metabolicBlockers", label: "Metabolic Blockers", max: 15, icon: Stethoscope, color: "hsl(var(--warning))" },
];

function dietLabel(diet?: string) {
  if (!diet) return null;
  const map: Record<string, string> = {
    vegetarian: "Vegetarian",
    veg: "Vegetarian",
    non_vegetarian: "Non-Vegetarian",
    non_veg: "Non-Vegetarian",
    vegan: "Vegan",
    jain: "Jain",
    eggitarian: "Eggetarian",
    eggetarian: "Eggetarian",
  };
  return map[diet] ?? diet;
}

export default function HealthScore() {
  const navigate = useNavigate();
  const user = getUser();
  const assessment = user.assessment;
  const profile = user.profile;
  const body = user.bodyMetrics;
  const lifestyle = user.lifestyle as any;
  const score = assessment?.healthScore ?? 72;
  const riskCategory = assessment?.riskCategory ?? "Good";
  const overrideTriggered = assessment?.overrideTriggered ?? false;
  const breakdown = assessment?.breakdown ?? { diseaseSeverity: 5, obesityFat: 5, treatmentLoad: 0, lifestyle: 8, metabolicBlockers: 0 };

  const bmi = body.bmi ?? assessment?.bmi ?? 24;
  const bmiCategory = body.bmiCategory ?? assessment?.bmiCategory ?? "Normal";
  const name = profile.name ?? "Friend";
  const diet = dietLabel(lifestyle?.diet);
  const activityMap: Record<string, string> = { sedentary: "Sedentary", light: "Light Activity", moderate: "Moderate Activity", active: "Very Active" };

  const { user: authUser } = useAuth();

  useEffect(() => {
    setPhase("power"); setIntensity("high");
    const timer = setTimeout(() => playScoreRevealImpact(), 400);
    // Persist all onboarding answers to the profile so users can review/edit them later
    if (authUser) {
      const dp = (user as any).deepProfiling ?? {};
      const clinical = (user as any).clinical ?? {};
      updateProfile(authUser.id, {
        name: profile.name ?? null,
        age: profile.age ?? null,
        gender: profile.gender || undefined,
        goals: (profile as any).goals ?? [],
        height: body.height ?? null,
        weight: body.weight ?? null,
        waist: (body as any).waist ?? null,
        bmi: body.bmi ?? null,
        bmi_category: body.bmiCategory ?? null,
        lifestyle: lifestyle ?? {},
        clinical: clinical,
        deep_profiling: dp,
        assessment: assessment as any,
        initial_health_score: score,
        initial_assessment_date: new Date().toISOString(),
      } as any);
    }
    return () => clearTimeout(timer);
  }, []);

  // Emotional background based on score
  const emotionalBg = score < 50
    ? "bg-gradient-to-b from-red-950/20 to-background"
    : score < 70
    ? "bg-gradient-to-b from-amber-950/15 to-background"
    : "bg-background";

  return (
    <div className={`phone-container min-h-dvh flex flex-col px-5 pt-14 mobile-bottom-safe overflow-y-auto ${emotionalBg}`}>
      <SoundToggle />

      <div className="flex flex-col flex-1">
        <div className="mb-6">
          <span className="text-xs font-medium text-primary uppercase tracking-widest">Health Report</span>
          <h1 className="text-3xl font-black text-foreground mt-1">Hi {name}, here's your<br /><span className="text-primary">health analysis</span></h1>
        </div>

        <AnimatePresence>
          {overrideTriggered && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mood-danger border border-destructive/30 rounded-2xl p-4 mb-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <div>
                <p className="text-destructive font-bold text-sm">Immediate medical attention recommended</p>
                <p className="text-destructive/70 text-xs mt-0.5">Your readings indicate high clinical risk. Please consult a doctor before starting any program.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col items-center mb-6">
          <HealthScoreRing score={score} />
          <div className={`mt-3 px-4 py-1.5 rounded-full border text-sm font-bold ${getRiskBadgeStyle(riskCategory)}`}>{riskCategory}</div>
        </div>

        <motion.div className="liquid-glass rounded-2xl p-4 mb-4" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Your Profile</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center liquid-glass rounded-xl p-3">
              <Scale className="w-4 h-4 text-primary mb-1" strokeWidth={1.5} />
              <p className="text-foreground font-black text-base">{bmi}</p>
              <p className="text-muted-foreground text-xs text-center leading-tight">BMI · {bmiCategory}</p>
            </div>
            {diet && (
              <div className="flex flex-col items-center liquid-glass rounded-xl p-3">
                <Leaf className="w-4 h-4 text-primary mb-1" strokeWidth={1.5} />
                <p className="text-foreground font-bold text-xs text-center leading-tight">{diet}</p>
                <p className="text-muted-foreground text-xs">Diet</p>
              </div>
            )}
            {lifestyle?.activity && (
              <div className="flex flex-col items-center liquid-glass rounded-xl p-3">
                <Activity className="w-4 h-4 text-primary mb-1" strokeWidth={1.5} />
                <p className="text-foreground font-bold text-xs text-center leading-tight">{activityMap[lifestyle.activity] ?? lifestyle.activity}</p>
                <p className="text-muted-foreground text-xs">Activity</p>
              </div>
            )}
          </div>
        </motion.div>

        <div className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Risk Breakdown</p>
          <div className="grid grid-cols-2 gap-3">
            {breakdownConfig.map((item, i) => {
              const Icon = item.icon;
              const pts = (breakdown as any)[item.key] as number ?? 0;
              const pct = Math.min((pts / item.max) * 100, 100);
              return (
                <motion.div key={item.key} className="liquid-glass rounded-2xl p-4" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.08 }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-lg liquid-glass flex items-center justify-center">
                      <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <span className="text-xs font-bold" style={{ color: pts > 0 ? item.color : "hsl(var(--primary))" }}>
                      {pts > 0 ? `+${pts}/${item.max}` : "✓ 0"}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs font-medium">{item.label}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-border">
                    <motion.div className="h-full rounded-full" style={{ backgroundColor: pts > 0 ? item.color : "hsl(var(--primary))" }}
                      initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.6 + i * 0.08, duration: 0.8 }} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="ob-bottom">
          <motion.button onClick={() => navigate("/score-interpretation")} className="ob-cta gradient-blue glow-blue"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }} whileTap={{ scale: 0.98 }}>
            Continue <ChevronRight className="w-5 h-5" strokeWidth={1.5} />
          </motion.button>
        </div>

      </div>

    </div>
  );
}
