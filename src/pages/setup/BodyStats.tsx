import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { saveUser, getUser } from "@/lib/userStore";
import { calculateBMI } from "@/lib/healthEngine";

type HeightUnit = "cm" | "ft";
function cmToFtIn(cm: number): string { const ti = cm / 2.54; return `${Math.floor(ti / 12)}'${Math.round(ti % 12)}"`; }
function cmToInches(cm: number): number { return Math.round(cm / 2.54); }
function inchesToCm(inches: number): number { return Math.round(inches * 2.54); }

export default function BodyStats() {
  const stored = getUser();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [heightCm, setHeightCm] = useState(stored.bodyMetrics.height ?? 170);
  const [heightUnit, setHeightUnit] = useState<HeightUnit>("cm");
  const [weightKg, setWeightKg] = useState(stored.bodyMetrics.weight ?? 70);
  const [waistCm, setWaistCm] = useState(80);
  const [waistUnit, setWaistUnit] = useState<"cm" | "in">("cm");

  const progress = currentStep === 0 ? 50 : 75;
  const heightDisplay = heightUnit === "cm" ? `${heightCm} cm` : cmToFtIn(heightCm);
  const waistDisplay = waistUnit === "cm" ? `${waistCm} cm` : `${cmToInches(waistCm)} in`;
  const waistSliderVal = waistUnit === "cm" ? waistCm : cmToInches(waistCm);
  const waistMin = waistUnit === "cm" ? 50 : 20;
  const waistMax = waistUnit === "cm" ? 150 : 60;

  const sliderBg = (val: number, min: number, max: number, color = "var(--primary)") => {
    const pct = ((val - min) / (max - min)) * 100;
    return `linear-gradient(to right, hsl(${color}) 0%, hsl(${color}) ${pct}%, hsl(var(--border)) ${pct}%, hsl(var(--border)) 100%)`;
  };

  const next = () => {
    if (currentStep === 0) setCurrentStep(1);
    else {
      const { bmi, bmiCategory } = calculateBMI(heightCm, weightKg);
      saveUser({ bodyStatsConfirmed: true, bodyMetrics: { height: heightCm, weight: weightKg, bmi, bmiCategory, waist: waistCm } as any });
      navigate("/setup/clinical");
    }
  };
  const prev = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); else navigate("/setup/basic-details"); };

  return (
    <div className="phone-container min-h-dvh flex flex-col px-5 pt-14 mobile-bottom-safe bg-background">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground text-xs font-medium">Step 3 of 5</span>
          <span className="text-primary text-xs font-medium">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {currentStep === 0 && (
        <div key="height" className="flex flex-col flex-1">
          <div className="mb-8">
            <h1 className="text-3xl font-black text-foreground mb-2">What's your height?</h1>
            <p className="text-muted-foreground text-sm">We use this to calculate your ideal body metrics.</p>
          </div>
          <div className="flex flex-col items-center gap-6 flex-1">
            <div className="flex liquid-glass rounded-xl p-1 gap-1">
              {(["cm", "ft"] as HeightUnit[]).map((u) => (
                <button key={u} onClick={() => setHeightUnit(u)} className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${heightUnit === u ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}>
                  {u === "cm" ? "Metric (cm)" : "Imperial (ft)"}
                </button>
              ))}
            </div>
            <span className="text-6xl font-black text-primary tabular-nums">
              {heightDisplay}
            </span>

            <div className="w-full">
              <input type="range" min={140} max={210} value={heightCm} onChange={(e) => setHeightCm(parseInt(e.target.value))} className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ background: sliderBg(heightCm, 140, 210) }} />
              <div className="flex justify-between text-muted-foreground text-xs mt-2">
                <span>{heightUnit === "cm" ? "140 cm" : "4'7\""}</span>
                <span>{heightUnit === "cm" ? "210 cm" : "6'11\""}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {currentStep === 1 && (
        <div key="weight" className="flex flex-col flex-1">
          <div className="mb-6">
            <h1 className="text-3xl font-black text-foreground mb-2">Weight & Waist</h1>
            <p className="text-muted-foreground text-sm">We'll track your transformation progress over time.</p>
          </div>
          <div className="flex flex-col gap-8 flex-1">
            <div>
              <p className="text-foreground font-semibold text-sm mb-4">Your Weight</p>
              <div className="flex flex-col items-center gap-4">
                <span className="text-6xl font-black text-primary tabular-nums">
                  {weightKg} <span className="text-2xl">kg</span>
                </span>

                <input type="range" min={40} max={150} value={weightKg} onChange={(e) => setWeightKg(parseInt(e.target.value))} className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ background: sliderBg(weightKg, 40, 150) }} />
                <div className="flex justify-between w-full text-muted-foreground text-xs"><span>40 kg</span><span>150 kg</span></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-foreground font-semibold text-sm">Waist Size</p>
                <div className="flex liquid-glass rounded-lg p-0.5 gap-0.5">
                  {(["cm", "in"] as const).map((u) => (
                    <button key={u} onClick={() => setWaistUnit(u)} className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${waistUnit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{u}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center gap-4">
                <span className="text-5xl font-black text-primary tabular-nums">
                  {waistDisplay}
                </span>

                <input type="range" min={waistMin} max={waistMax} value={waistSliderVal} onChange={(e) => { const v = parseInt(e.target.value); setWaistCm(waistUnit === "cm" ? v : inchesToCm(v)); }} className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ background: sliderBg(waistSliderVal, waistMin, waistMax) }} />
                <div className="flex justify-between w-full text-muted-foreground text-xs">
                  <span>{waistUnit === "cm" ? "50 cm" : "20 in"}</span>
                  <span>{waistUnit === "cm" ? "150 cm" : "60 in"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      <div className="ob-bottom flex gap-3 shrink-0">
        <button onClick={prev} className="w-14 h-14 rounded-xl flex items-center justify-center text-muted-foreground bg-card">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <motion.button onClick={next} className="ob-cta flex-1 gradient-blue glow-blue" whileTap={{ scale: 0.98 }}>
          Continue <ArrowRight className="w-5 h-5" />
        </motion.button>
      </div>
    </div>
  );
}
