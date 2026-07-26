import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, ArrowLeft, UserCircle, Users, User } from "lucide-react";
import { saveUser, getUser } from "@/lib/userStore";

const genderOptions = [
  { id: "male", label: "Male", Icon: User },
  { id: "female", label: "Female", Icon: UserCircle },
  { id: "other", label: "Other", Icon: Users },
];

export default function BasicDetails() {
  const navigate = useNavigate();
  const stored = getUser();
  const [age, setAge] = useState(stored.profile.age ?? 35);
  const [gender, setGender] = useState((stored.profile.gender ?? "").toLowerCase());
  const canProceed = gender !== "";

  const handleContinue = () => {
    saveUser({ profile: { ...stored.profile, age, gender } });
    navigate("/setup/stats");
  };

  const sliderBg = `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${((age - 18) / 82) * 100}%, hsl(var(--border)) ${((age - 18) / 82) * 100}%, hsl(var(--border)) 100%)`;

  return (
    <div className="phone-container min-h-dvh flex flex-col px-5 pt-14 mobile-bottom-safe bg-background">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground text-xs font-medium">Step 2 of 5</span>
          <span className="text-primary text-xs font-medium">40%</span>
        </div>
        <Progress value={40} className="h-1.5" />
      </div>

      <div className="flex flex-col flex-1">
        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <User className="w-6 h-6 text-primary" strokeWidth={1.8} />
          </div>
          <h1 className="text-3xl font-black text-foreground mb-2">About You</h1>
          <p className="text-muted-foreground text-sm">A few basics to personalise your health plan.</p>
        </div>

        <div className="flex flex-col gap-8 flex-1">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 block">Your Age</label>
            <div className="flex flex-col items-center gap-4 py-6 px-4 liquid-glass rounded-2xl">
              {/* Fixed-height, non-remounting value — animating a keyed span made
                  the old and new numbers stack while dragging, jumping the card. */}
              <span className="text-7xl font-black text-primary leading-none tabular-nums h-[4.5rem] flex items-center">
                {age}
              </span>
              <span className="text-muted-foreground text-sm font-medium -mt-2">years old</span>
              <input type="range" min={18} max={100} value={age} onChange={(e) => setAge(parseInt(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer touch-pan-y" style={{ background: sliderBg }} />

              <div className="flex justify-between w-full text-muted-foreground text-xs">
                <span>18 yrs</span><span>100 yrs</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 block">Gender <span className="text-destructive">*</span></label>
            <div className="grid grid-cols-3 gap-3">
              {genderOptions.map((g) => {
                const isSelected = gender === g.id;
                const Icon = g.Icon;
                return (
                  <motion.button key={g.id} onClick={() => setGender(g.id)} whileTap={{ scale: 0.98 }}
                    className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 transition-colors ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "bg-card border-border"}`}>
                    <Icon className={`w-7 h-7 ${isSelected ? "text-primary" : "text-muted-foreground"}`} strokeWidth={1.5} />
                    <span className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>{g.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ob-bottom flex gap-3 shrink-0">
          <button onClick={() => navigate("/setup/purpose")} className="w-14 h-14 rounded-xl flex items-center justify-center text-muted-foreground bg-card">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <motion.button onClick={handleContinue} disabled={!canProceed}
            className="ob-cta flex-1 gradient-blue glow-blue disabled:opacity-40"
            whileTap={{ scale: 0.98 }}>
            Continue <ArrowRight className="w-5 h-5" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
