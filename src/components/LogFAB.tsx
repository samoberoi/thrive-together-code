import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, Heart, Scale, Droplets, Camera, Loader2, Clock, Dumbbell, Sunrise, Sun, Moon, Wind, Timer, Pill } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useAuth } from "@/contexts/AuthContext";
import { insertHealthLog, fetchHealthLogs, formatLogDate } from "@/lib/healthLogsService";
import { toast } from "sonner";
import { useUserStore } from "@/hooks/useUserStore";
import { useBreathSessionsToday } from "@/hooks/useBreathSessionsToday";
import BreathProtocolDrawer from "@/components/BreathProtocolDrawer";
import { useSoleusSessionsToday } from "@/hooks/useSoleusSessionsToday";
import SoleusProtocolDrawer from "@/components/SoleusProtocolDrawer";
import { useTodayExerciseProgress } from "@/hooks/useTodayExerciseProgress";
import { useRbac } from "@/hooks/useRbac";

type LogType = "diabetes" | "bp" | "weight" | "water" | null;
type TimeOfDay = "morning" | "afternoon" | "evening";

const actions = [
  { id: "diabetes" as const, icon: Activity, label: "Diabetes", color: "bg-primary", textColor: "text-primary" },
  { id: "bp" as const, icon: Heart, label: "Blood Pressure", color: "bg-secondary", textColor: "text-secondary" },
  { id: "weight" as const, icon: Scale, label: "Weight", color: "bg-primary", textColor: "text-primary" },
  { id: "water" as const, icon: Droplets, label: "Water", color: "bg-secondary", textColor: "text-secondary" },
];

function detectTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function formatCurrentDateTime(): string {
  return new Date().toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export default function LogFAB(props: { packageKey?: string | null; exercisePath?: string; showAllLogs?: boolean }) {
  const exercisePath = props.exercisePath ?? "/dashboard?tab=exercise";
  const { user } = useAuth();
  const navigate = useNavigate();
  const storedUser = useUserStore();
  const hasDiabetesFlag = !!(storedUser.clinical?.hasDiabetes || (storedUser.deepProfiling as any)?.hba1cInput != null || (storedUser.deepProfiling as any)?.fastingGlucose != null);
  const hasHypertensionFlag = !!(storedUser.clinical?.hasHypertension || (storedUser.clinical as any)?.bpMedication);
  const { minutes: exerciseMinutesToday, goal: EXERCISE_GOAL, done: exerciseDone } = useTodayExerciseProgress(5);
  const exerciseBadgeValue = `${Math.min(exerciseMinutesToday, EXERCISE_GOAL).toLocaleString("en-IN", { maximumFractionDigits: 1 })}/${EXERCISE_GOAL}`;
  const visibleActions = actions.filter((a) => {
    // Coaches/admins have no patient clinical profile — never hide their own log tiles.
    if (a.id === "diabetes") return props.showAllLogs || hasDiabetesFlag;
    // Blood pressure is always shown per clinical guidance — everyone should be able to log BP.
    return true;
  });
  const [open, setOpen] = useState(false);
  const [activeLog, setActiveLog] = useState<LogType>(null);
  const [breathOpen, setBreathOpen] = useState(false);
  const { count: breathCount, goal: breathGoal, completed: breathDone } = useBreathSessionsToday();
  const [soleusOpen, setSoleusOpen] = useState(false);
  const { count: soleusCount, goal: soleusGoal, completed: soleusDone } = useSoleusSessionsToday();
  const [saving, setSaving] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(formatCurrentDateTime());
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [keyboardViewportHeight, setKeyboardViewportHeight] = useState(0);

  // Shift open drawers up when the mobile keyboard covers them (iOS / Android).
  useEffect(() => {
    const vv = (typeof window !== "undefined" ? window.visualViewport : null);
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(Math.round(inset));
      setKeyboardViewportHeight(Math.round(vv.height));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const logDrawerStyle =
    keyboardInset > 0 && activeLog
      ? {
          bottom: `${keyboardInset}px`,
          maxHeight: `${Math.max(320, keyboardViewportHeight - 12)}px`,
        }
      : undefined;

  const keepInputVisible = (event: { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;
    window.setTimeout(() => {
      input.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
  };

  // Diabetes state — single value + time-of-day selector
  const [glucoseValue, setGlucoseValue] = useState("");
  const [glucoseTimeOfDay, setGlucoseTimeOfDay] = useState<TimeOfDay>(detectTimeOfDay());
  // BP state
  const [bpSys, setBpSys] = useState("");
  const [bpDia, setBpDia] = useState("");
  // Weight state
  const [weight, setWeight] = useState("");
  const [lastWeight, setLastWeight] = useState<{ value: number; date: string } | null>(null);
  // Water state
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [waterBaseline, setWaterBaseline] = useState(0);
  const WATER_GOAL = 8;

  // Update clock every minute while a drawer is open
  useEffect(() => {
    if (!activeLog) return;
    setCurrentDateTime(formatCurrentDateTime());
    const timer = setInterval(() => setCurrentDateTime(formatCurrentDateTime()), 60_000);
    return () => clearInterval(timer);
  }, [activeLog]);

  // Auto-detect time of day when diabetes drawer opens
  useEffect(() => {
    if (activeLog === "diabetes") {
      setGlucoseTimeOfDay(detectTimeOfDay());
    }
  }, [activeLog]);

  // Fetch last weight entry when weight drawer opens
  useEffect(() => {
    if (activeLog === "weight" && user) {
      fetchHealthLogs("weight", user.id).then((logs) => {
        if (logs.length > 0) {
          setLastWeight({
            value: logs[0].weight_kg ?? 0,
            date: formatLogDate(logs[0].logged_at),
          });
        }
      });
    }
  }, [activeLog, user]);

  // Seed water count from today's existing logs when drawer opens
  useEffect(() => {
    if (activeLog === "water" && user) {
      fetchHealthLogs("water", user.id).then((logs) => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const total = logs
          .filter((l) => l.logged_at?.slice(0, 10) === todayStr)
          .reduce((sum, l) => sum + (l.weight_kg ?? 0), 0);
        const clamped = Math.max(0, Math.round(total));
        setWaterBaseline(clamped);
        setWaterGlasses(clamped);
      });
    }
  }, [activeLog, user]);

  const openLog = (type: LogType) => {
    setOpen(false);
    setTimeout(() => setActiveLog(type), 200);
  };

  const closeLog = () => {
    setActiveLog(null);
    setGlucoseValue("");
    setGlucoseTimeOfDay(detectTimeOfDay());
    setBpSys("");
    setBpDia("");
    setWeight("");
    setWaterGlasses(0);
    setWaterBaseline(0);
  };

  const DateTimeBadge = () => (
    <div className="flex items-center gap-1.5 bg-surface-2 rounded-xl px-3 py-2 mb-1">
      <Clock className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.8} />
      <span className="text-muted-foreground text-xs font-medium">{currentDateTime}</span>
    </div>
  );

  const saveDiabetes = async () => {
    if (!user) return;
    const val = glucoseValue ? parseFloat(glucoseValue) : null;
    if (!val) {
      toast.error("Please enter a glucose reading");
      return;
    }
    setSaving(true);
    const isMorning = glucoseTimeOfDay === "morning";
    const result = await insertHealthLog({
      user_id: user.id,
      log_type: "diabetes",
      logged_at: new Date().toISOString(),
      glucose_morning: isMorning ? val : null,
      glucose_evening: !isMorning ? val : null,
      bp_systolic: null,
      bp_diastolic: null,
      weight_kg: null,
    });
    setSaving(false);
    if (result) {
      toast.success(`${glucoseTimeOfDay.charAt(0).toUpperCase() + glucoseTimeOfDay.slice(1)} glucose saved`);
      window.dispatchEvent(new CustomEvent("health-log-saved"));
      closeLog();
    } else {
      toast.error("Failed to save reading");
    }
  };

  const saveBP = async () => {
    if (!user) return;
    const sys = bpSys ? parseFloat(bpSys) : null;
    const dia = bpDia ? parseFloat(bpDia) : null;
    if (!sys || !dia) {
      toast.error("Please enter both systolic and diastolic values");
      return;
    }
    setSaving(true);
    const result = await insertHealthLog({
      user_id: user.id,
      log_type: "bp",
      logged_at: new Date().toISOString(),
      glucose_morning: null,
      glucose_evening: null,
      bp_systolic: sys,
      bp_diastolic: dia,
      weight_kg: null,
    });
    setSaving(false);
    if (result) {
      toast.success("Blood pressure saved");
      window.dispatchEvent(new CustomEvent("health-log-saved"));
      closeLog();
    } else {
      toast.error("Failed to save reading");
    }
  };

  const saveWeight = async () => {
    if (!user) return;
    const w = weight ? parseFloat(weight) : null;
    if (!w) {
      toast.error("Please enter your weight");
      return;
    }
    setSaving(true);
    const result = await insertHealthLog({
      user_id: user.id,
      log_type: "weight",
      logged_at: new Date().toISOString(),
      glucose_morning: null,
      glucose_evening: null,
      bp_systolic: null,
      bp_diastolic: null,
      weight_kg: w,
    });
    setSaving(false);
    if (result) {
      toast.success("Weight saved");
      // Best-effort write-back to Apple Health (iOS native only).
      void import("@/lib/healthProvider").then((m) => m.writeWeight(w));
      window.dispatchEvent(new CustomEvent("health-log-saved"));
      closeLog();
    } else {
      toast.error("Failed to save weight");
    }
  };

  const saveWater = async () => {
    if (!user) return;
    const delta = waterGlasses - waterBaseline;
    if (delta === 0) {
      closeLog();
      return;
    }
    setSaving(true);
    try {
      const result = await insertHealthLog({
        user_id: user.id,
        log_type: "water",
        weight_kg: delta,
      });
      if (result) {
        toast.success(`${waterGlasses}/${WATER_GOAL} glasses logged`);
        window.dispatchEvent(new CustomEvent("health-log-saved"));
        closeLog();
      } else {
        toast.error("Failed to save water log");
      }
    } catch {
      toast.error("Failed to save water log");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Hidden trigger — BottomNav's inline "+" dispatches a click here */}
      <button
        data-fab-trigger
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setOpen((v) => !v)}
        style={{ position: "fixed", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
      />

      {/* Quick-log bottom sheet — matches the All-sections expanded dock look */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="bg-background border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto overscroll-contain">
          <DrawerHeader className="px-1 pb-2">
            <DrawerTitle className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Quick log
            </DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-3 gap-2">
            {visibleActions.map((action) => {
              const Icon = action.icon;
              return (
                <motion.button
                  key={action.id}
                  onClick={() => openLog(action.id)}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="no-pill relative flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 bg-card border border-border"
                >
                  <span className={`w-11 h-11 rounded-xl ${action.color} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" strokeWidth={1.7} />
                  </span>
                  <span className="no-break text-[11px] font-semibold text-foreground text-center leading-tight">
                    {action.label}
                  </span>
                </motion.button>
              );
            })}
            <motion.button
              key="exercise-shortcut"
              onClick={() => {
                setOpen(false);
                navigate(exercisePath);
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="no-pill relative flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 bg-card border border-border"
            >
              <span
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{
                  background:
                    exerciseDone ? "#10B981" : "var(--bbdo-blue)",
                }}
              >
                <Dumbbell className="w-5 h-5 text-white" strokeWidth={1.7} />
              </span>
              <span className="no-break text-[11px] font-semibold text-foreground text-center leading-tight flex flex-col items-center gap-1">
                Exercise
                <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap"
                  style={{
                    background:
                      exerciseDone
                        ? "#10B98122"
                        : "var(--bbdo-blue-soft)",
                    color:
                      exerciseDone
                        ? "#10B981"
                        : "var(--bbdo-blue)",
                  }}
                >
                  {exerciseBadgeValue}
                </span>
              </span>
            </motion.button>
            <motion.button
              key="breath-shortcut"
              onClick={() => {
                setOpen(false);
                setTimeout(() => setBreathOpen(true), 180);
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="no-pill relative flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 bg-card border border-border"
            >
              <span
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: breathDone ? "#10B981" : "var(--bbdo-red, #EA6A5E)" }}
              >
                <Wind className="w-5 h-5 text-white" strokeWidth={1.7} />
              </span>
              <span className="no-break text-[11px] font-semibold text-foreground text-center leading-tight flex flex-col items-center gap-1">
                Breath Protocol
                <span
                  className="text-[9px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap"
                  style={{
                    background: breathDone ? "#10B98122" : "rgba(234,106,94,0.14)",
                    color: breathDone ? "#10B981" : "var(--bbdo-red, #EA6A5E)",
                  }}
                >
                  {breathCount}/{breathGoal}
                </span>
              </span>
            </motion.button>
            <motion.button
              key="soleus-shortcut"
              onClick={() => {
                setOpen(false);
                setTimeout(() => setSoleusOpen(true), 180);
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="no-pill relative flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 bg-card border border-border"
            >
              <span
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: soleusDone ? "#10B981" : "var(--bbdo-blue)" }}
              >
                <Dumbbell className="w-5 h-5 text-white" strokeWidth={1.7} />
              </span>
              <span className="no-break text-[11px] font-semibold text-foreground text-center leading-tight flex flex-col items-center gap-1">
                Soleus Push‑Ups
                <span
                  className="text-[9px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap"
                  style={{
                    background: soleusDone ? "#10B98122" : "rgba(36,140,203,0.14)",
                    color: soleusDone ? "#10B981" : "var(--bbdo-blue)",
                  }}
                >
                  {soleusCount}/{soleusGoal}
                </span>
              </span>
            </motion.button>
            <motion.button
              key="fasting-shortcut"
              onClick={() => {
                setOpen(false);
                navigate("/dashboard?tab=fasting");
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="no-pill relative flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 bg-card border border-border"
            >
              <span
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: "var(--bbdo-red, #EA6A5E)" }}
              >
                <Timer className="w-5 h-5 text-white" strokeWidth={1.7} />
              </span>
              <span className="no-break text-[11px] font-semibold text-foreground text-center leading-tight">
                Fasting
              </span>
            </motion.button>
            <motion.button
              key="supplements-shortcut"
              onClick={() => {
                setOpen(false);
                navigate("/dashboard?tab=supplements");
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="no-pill relative flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 bg-card border border-border"
            >
              <span
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: "var(--bbdo-blue)" }}
              >
                <Pill className="w-5 h-5 text-white" strokeWidth={1.7} />
              </span>
              <span className="no-break text-[11px] font-semibold text-foreground text-center leading-tight">
                Supplements
              </span>
            </motion.button>
          </div>
        </DrawerContent>
      </Drawer>

      <BreathProtocolDrawer open={breathOpen} onOpenChange={setBreathOpen} />
      <SoleusProtocolDrawer open={soleusOpen} onOpenChange={setSoleusOpen} />





      {/* Diabetes Log Drawer */}
      <Drawer open={activeLog === "diabetes"} onOpenChange={(v) => !v && closeLog()}>
        <DrawerContent className="bg-background border-t border-border px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto overscroll-contain" style={logDrawerStyle}>
          <DrawerHeader className="px-0 pb-3">
            <DrawerTitle className="text-foreground text-lg font-black flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--bbdo-blue)" }}>
                <Activity className="w-[18px] h-[18px] text-white" strokeWidth={1.8} />
              </span>
              Log Blood Glucose
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-4">
            <DateTimeBadge />

            {/* Time-of-day segmented control */}
            <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-muted">
              {([
                { k: "morning" as const, Icon: Sunrise, label: "Morning" },
                { k: "afternoon" as const, Icon: Sun, label: "Afternoon" },
                { k: "evening" as const, Icon: Moon, label: "Evening" },
              ]).map(({ k, Icon, label }) => {
                const active = glucoseTimeOfDay === k;
                return (
                  <button
                    key={k}
                    onClick={() => setGlucoseTimeOfDay(k)}
                    className="no-pill min-h-11 rounded-xl flex items-center justify-center gap-1.5 text-[12px] font-bold transition-colors"
                    style={active ? { background: "#fff", color: "var(--bbdo-ink)", boxShadow: "0 2px 8px -2px rgba(15,26,61,0.12)" } : { color: "var(--bbdo-ink-soft)" }}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.7} />
                    {label}
                  </button>
                );
              })}
            </div>

            <label className="block rounded-2xl bg-card border border-border p-5 cursor-text focus-within:border-[var(--bbdo-blue)]/50 focus-within:ring-2 focus-within:ring-[var(--bbdo-blue)]/15 transition-colors">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground text-center">Glucose</p>
              <div className="mt-3 min-h-[88px] flex flex-col items-center justify-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  onFocus={keepInputVisible}
                  placeholder="112"
                  value={glucoseValue}
                  onChange={(e) => setGlucoseValue(e.target.value)}
                  className="no-number-spinner w-full bg-transparent text-center text-5xl font-black tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30"
                />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">mg/dL</span>
              </div>
            </label>

            <button
              onClick={saveDiabetes}
              disabled={saving}
              className="w-full h-14 rounded-2xl text-white font-bold text-[15px] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ background: "var(--bbdo-blue)" }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save reading
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* BP Log Drawer */}
      <Drawer open={activeLog === "bp"} onOpenChange={(v) => !v && closeLog()}>
        <DrawerContent className="bg-background border-t border-border px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto overscroll-contain" style={logDrawerStyle}>
          <DrawerHeader className="px-0 pb-3">
            <DrawerTitle className="text-foreground text-lg font-black flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--bbdo-red)" }}>
                <Heart className="w-[18px] h-[18px] text-white" strokeWidth={1.8} />
              </span>
              Log Blood Pressure
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-4">
            <DateTimeBadge />

            <div className="grid grid-cols-2 gap-2">
              <label className="block rounded-2xl bg-card border border-border p-4 cursor-text focus-within:border-[var(--bbdo-red)]/50 focus-within:ring-2 focus-within:ring-[var(--bbdo-red)]/15 transition-colors">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground text-center">Systolic</p>
                <div className="mt-3 min-h-[88px] flex flex-col items-center justify-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    onFocus={keepInputVisible}
                    placeholder="125"
                    value={bpSys}
                    onChange={(e) => setBpSys(e.target.value)}
                    className="no-number-spinner w-full bg-transparent text-center text-5xl font-black tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30"
                  />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">mmHg</span>
                </div>
              </label>
              <label className="block rounded-2xl bg-card border border-border p-4 cursor-text focus-within:border-[var(--bbdo-red)]/50 focus-within:ring-2 focus-within:ring-[var(--bbdo-red)]/15 transition-colors">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground text-center">Diastolic</p>
                <div className="mt-3 min-h-[88px] flex flex-col items-center justify-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    onFocus={keepInputVisible}
                    placeholder="82"
                    value={bpDia}
                    onChange={(e) => setBpDia(e.target.value)}
                    className="no-number-spinner w-full bg-transparent text-center text-5xl font-black tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30"
                  />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">mmHg</span>
                </div>
              </label>
            </div>

            <button
              onClick={saveBP}
              disabled={saving}
              className="w-full h-14 rounded-2xl text-white font-bold text-[15px] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ background: "var(--bbdo-red)" }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save reading
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Weight Log Drawer */}
      <Drawer open={activeLog === "weight"} onOpenChange={(v) => !v && closeLog()}>
        <DrawerContent className="bg-background border-t border-border px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto overscroll-contain" style={logDrawerStyle}>
          <DrawerHeader className="px-0 pb-3">
            <DrawerTitle className="text-foreground text-lg font-black flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--bbdo-mint, #10B981)" }}>
                <Scale className="w-[18px] h-[18px] text-white" strokeWidth={1.8} />
              </span>
              Log Weight
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-4">
            <DateTimeBadge />

            {lastWeight && (
              <div className="rounded-xl bg-muted px-4 py-2.5 flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">Last entry</span>
                <span className="text-foreground text-sm font-bold tabular-nums">
                  {lastWeight.value} kg · {lastWeight.date}
                </span>
              </div>
            )}

            <label className="block rounded-2xl bg-card border border-border p-5 cursor-text focus-within:border-[var(--bbdo-mint,#10B981)]/50 focus-within:ring-2 focus-within:ring-[var(--bbdo-mint,#10B981)]/15 transition-colors">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground text-center">Current weight</p>
              <div className="mt-3 min-h-[88px] flex flex-col items-center justify-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  onFocus={keepInputVisible}
                  placeholder="82.5"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="no-number-spinner w-full bg-transparent text-center text-5xl font-black tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30"
                />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">kg</span>
              </div>
            </label>

            <button
              onClick={saveWeight}
              disabled={saving}
              className="w-full h-14 rounded-2xl text-white font-bold text-[15px] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ background: "var(--bbdo-mint, #10B981)" }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save weight
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Water Log Drawer */}
      <Drawer open={activeLog === "water"} onOpenChange={(v) => !v && closeLog()}>
        <DrawerContent className="bg-background border-t border-border px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[92dvh] overflow-y-auto overscroll-contain" style={logDrawerStyle}>
          <DrawerHeader className="px-0 pb-3">
            <DrawerTitle className="text-foreground text-lg font-black flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--bbdo-blue)" }}>
                <Droplets className="w-[18px] h-[18px] text-white" strokeWidth={1.8} />
              </span>
              Log Water
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-4">
            <DateTimeBadge />

            <div className="rounded-2xl bg-card border border-border p-5 flex flex-col items-center gap-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground text-center">Glasses today</p>
              <div className="min-h-[88px] flex items-center justify-center gap-4 w-full">
                <button
                  onClick={() => setWaterGlasses((v) => Math.max(0, v - 1))}
                  className="no-pill w-12 h-12 rounded-2xl bg-muted text-foreground text-2xl font-black flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
                  disabled={waterGlasses === 0}
                  aria-label="Remove one glass"
                >−</button>
                <div className="text-center min-w-[5ch]">
                  <p className="text-5xl font-black tabular-nums text-foreground leading-none">{waterGlasses}</p>
                  <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider mt-1">/ {WATER_GOAL}</p>
                </div>
                <button
                  onClick={() => setWaterGlasses((v) => v + 1)}
                  className="no-pill w-12 h-12 rounded-2xl text-white text-2xl font-black flex items-center justify-center active:scale-95 transition-transform"
                  style={{ background: "var(--bbdo-blue)" }}
                  aria-label="Add one glass"
                >+</button>
              </div>
              <div className="flex gap-1 flex-wrap justify-center">
                {Array.from({ length: WATER_GOAL }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setWaterGlasses(i + 1)}
                    className="w-7 h-9 rounded-md flex items-center justify-center transition-colors"
                    style={{ background: i < waterGlasses ? "var(--bbdo-blue)" : "hsl(var(--muted))" }}
                    aria-label={`Set to ${i + 1} glasses`}
                  >
                    <Droplets className="w-3.5 h-3.5" strokeWidth={1.8} style={{ color: i < waterGlasses ? "#fff" : "hsl(var(--muted-foreground))" }} />
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={saveWater}
              disabled={saving}
              className="w-full h-14 rounded-2xl text-white font-bold text-[15px] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ background: "var(--bbdo-blue)" }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save water
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}