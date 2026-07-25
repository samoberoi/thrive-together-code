import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Leaf, Cigarette, Wine, Beer, Ban, Sofa, PersonStanding, Bike, Dumbbell, Salad, Drumstick, Sprout, Egg, Utensils } from "lucide-react";
import { saveUser, getUser } from "@/lib/userStore";
import { calculateHealthScore, calculateBMI, inferClinicalValues } from "@/lib/healthEngine";
import type { BodyMetrics, ClinicalData, LifestyleData } from "@/lib/healthEngine";
import { useDietTypes } from "@/hooks/useDietTypes";

type AlcoholLevel = "none" | "moderate" | "high";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active";

// Icon per diet slug — falls back to a generic utensils icon for anything the
// backend adds later that we haven't mapped yet.
const DIET_ICONS: Record<string, React.ReactNode> = {
  veg: <Salad className="w-4 h-4" strokeWidth={1.8} />,
  vegetarian: <Salad className="w-4 h-4" strokeWidth={1.8} />,
  vegan: <Sprout className="w-4 h-4" strokeWidth={1.8} />,
  jain: <Leaf className="w-4 h-4" strokeWidth={1.8} />,
  eggitarian: <Egg className="w-4 h-4" strokeWidth={1.8} />,
  non_veg: <Drumstick className="w-4 h-4" strokeWidth={1.8} />,
  non_vegetarian: <Drumstick className="w-4 h-4" strokeWidth={1.8} />,
};

export default function LifestyleQuestions() {
  const navigate = useNavigate();
  const { types: dietTypes } = useDietTypes();
  const [smoking, setSmoking] = useState<boolean | null>(null);
  const [alcohol, setAlcohol] = useState<AlcoholLevel | null>(null);
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [sleepHours, setSleepHours] = useState(7);
  const [diet, setDiet] = useState<string | null>(null);
  const canProceed = smoking !== null && alcohol !== null && activity !== null && diet !== null;

  const handleSubmit = () => {
    const lifestyle: LifestyleData & { diet: string } = { smoking: smoking!, alcohol: alcohol!, activity: activity!, sleepHours, diet: diet! };
    saveUser({ lifestyle: lifestyle as any });
    const u = getUser();
    const h = u.bodyMetrics.height ?? 170; const w = u.bodyMetrics.weight ?? 70;
    const { bmi, bmiCategory } = calculateBMI(h, w);
    const body: BodyMetrics = { height: h, weight: w, bmi, bmiCategory, waist: (u.bodyMetrics as any).waist ?? 80 };
    const clinical = inferClinicalValues(u.clinical as ClinicalData);
    const gender = u.profile.gender ?? "male";
    const assessment = calculateHealthScore(body, clinical, lifestyle, {}, gender);
    saveUser({ bodyMetrics: body, assessment });
    navigate("/insight");
  };


  const OptionRow = ({ label, selected, options, onSelect, cols = 2 }: {
    label: string; selected: string | null; options: { id: string; label: string; icon: React.ReactNode }[];
    onSelect: (id: string) => void; cols?: number;
  }) => (
    <div>
      <p className="text-foreground font-semibold text-sm mb-3">{label}</p>
      <div className={`grid gap-2 ${cols === 4 ? "grid-cols-4" : cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((opt) => (
          <motion.button key={opt.id} onClick={() => onSelect(opt.id)} whileTap={{ scale: 0.98 }}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-colors ${selected === opt.id ? "border-primary bg-primary/5 shadow-sm" : "bg-card border-border"}`}>
            <span className={`shrink-0 ${selected === opt.id ? "text-primary" : "text-muted-foreground"}`}>{opt.icon}</span>
            <span className={`text-xs font-medium leading-tight ${selected === opt.id ? "text-primary" : "text-foreground"}`}>{opt.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );

  const sleepPct = ((sleepHours - 3) / 9) * 100;
  const sleepBg = `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${sleepPct}%, hsl(var(--border)) ${sleepPct}%, hsl(var(--border)) 100%)`;

  return (
    <div className="phone-container min-h-dvh flex flex-col px-5 pt-14 mobile-bottom-safe overflow-y-auto bg-background">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground text-xs font-medium">Step 5 of 5</span>
          <span className="text-primary text-xs font-medium">100%</span>
        </div>
        <Progress value={100} className="h-1.5" />
      </div>

      <div className="flex flex-col flex-1">
        <div className="mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Leaf className="w-6 h-6 text-primary" strokeWidth={1.8} />
          </div>
          <h1 className="text-3xl font-black text-foreground mb-2">Your Lifestyle</h1>
          <p className="text-muted-foreground text-sm">Your habits shape your metabolic health.</p>
        </div>

        <div className="flex flex-col gap-6 flex-1">
          <OptionRow label="Do you smoke?" selected={smoking === null ? null : smoking ? "yes" : "no"} options={[
            { id: "yes", label: "Yes, I smoke", icon: <Cigarette className="w-4 h-4" strokeWidth={1.8} /> },
            { id: "no", label: "No, I don't", icon: <Ban className="w-4 h-4" strokeWidth={1.8} /> },
          ]} onSelect={(id) => setSmoking(id === "yes")} />
          <OptionRow label="Alcohol consumption" selected={alcohol} options={[
            { id: "none", label: "None", icon: <Ban className="w-4 h-4" strokeWidth={1.8} /> },
            { id: "moderate", label: "Moderate", icon: <Wine className="w-4 h-4" strokeWidth={1.8} /> },
            { id: "high", label: "High", icon: <Beer className="w-4 h-4" strokeWidth={1.8} /> },
          ]} onSelect={(id) => setAlcohol(id as AlcoholLevel)} cols={3} />
          <OptionRow label="Physical activity level" selected={activity} options={[
            { id: "sedentary", label: "Sedentary", icon: <Sofa className="w-4 h-4" strokeWidth={1.8} /> },
            { id: "light", label: "Light", icon: <PersonStanding className="w-4 h-4" strokeWidth={1.8} /> },
            { id: "moderate", label: "Moderate", icon: <Bike className="w-4 h-4" strokeWidth={1.8} /> },
            { id: "active", label: "Very Active", icon: <Dumbbell className="w-4 h-4" strokeWidth={1.8} /> },
          ]} onSelect={(id) => setActivity(id as ActivityLevel)} cols={4} />
          <OptionRow label="What do you prefer to eat?" selected={diet} options={[
            { id: "vegetarian", label: "Vegetarian", icon: <Salad className="w-4 h-4" strokeWidth={1.8} /> },
            { id: "non_vegetarian", label: "Non-Veg", icon: <Drumstick className="w-4 h-4" strokeWidth={1.8} /> },
            { id: "vegan", label: "Vegan", icon: <Sprout className="w-4 h-4" strokeWidth={1.8} /> },
          ]} onSelect={(id) => setDiet(id as DietType)} cols={3} />
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-foreground font-semibold text-sm">Average sleep hours</p>
              <span className="text-primary text-sm font-bold">{sleepHours} hrs</span>
            </div>
            <input type="range" min={3} max={12} step={0.5} value={sleepHours} onChange={(e) => setSleepHours(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ background: sleepBg }} />
            <div className="flex justify-between text-muted-foreground text-xs mt-1"><span>3 hrs</span><span>12 hrs</span></div>
          </div>
        </div>

        <div className="ob-bottom flex gap-3 shrink-0">
          <button onClick={() => navigate("/setup/clinical")} className="w-14 h-14 rounded-xl flex items-center justify-center text-muted-foreground bg-card">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <motion.button onClick={handleSubmit} disabled={!canProceed} className="ob-cta flex-1 gradient-blue glow-blue disabled:opacity-40" whileTap={{ scale: 0.98 }}>
            Calculate My Score <ArrowRight className="w-5 h-5" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
