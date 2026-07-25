import { useState, useEffect, useCallback } from "react";
import { createPost, generateAchievementContent } from "@/lib/communityService";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import {
  Flame, Footprints, Droplets, Timer, Quote, Bell,
  Activity, Zap, AlertTriangle, Dumbbell,
  TrendingDown, TrendingUp, ArrowRight, Heart, ChevronRight, Package, UserCheck, Calendar,
  UtensilsCrossed, Pill, Check, BookOpen, Plus, Coffee, Sun, Moon, CheckCircle2
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import { useUserStore } from "@/hooks/useUserStore";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchActiveSubscription, type Subscription } from "@/lib/subscriptionService";
import { fetchProfile } from "@/lib/profileService";
import { fetchHealthLogs, fetchProgressSummaries, type HealthLog, type ProgressSummary } from "@/lib/healthLogsService";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchUserProtocol, fetchWeeklyPlans, fetchProtocols, fetchTrackingForUser, upsertTracking,
  getCurrentWeek, getPhaseInfo, formatTime24to12, assignProtocolToUser,
  type FastingProtocol, type WeeklyPlan,
} from "@/lib/fastingService";
import { supabase } from "@/integrations/supabase/client";
import BuildMyPlate from "@/components/diet/BuildMyPlate";
import {
  fetchUserPlan, fetchPlanItems, fetchSupplements as fetchAllSupplements,
  fetchTodayTracking, toggleTracking, fetchTrackingHistory,
  CATEGORY_COLORS, CATEGORY_BG,
  type UserSupplementPlan, type PlanItem, type Supplement as SupplementType, type SupplementTracking
} from "@/lib/supplementService";
import { calculateSupplementStreak, checkAndAwardSupplementBadges } from "@/lib/supplementBadgeService";
import TodayStepsCard from "@/components/TodayStepsCard";
import AppleHealthSnapshotCard from "@/components/AppleHealthSnapshotCard";
import AppleHealthEcgCard from "@/components/AppleHealthEcgCard";
import SleepBreakdownCard from "@/components/SleepBreakdownCard";
import HealthTrendsCard from "@/components/HealthTrendsCard";
import { fetchMovementOverview } from "@/lib/movementUserService";
import { fetchUserStats } from "@/lib/userStatsService";
import { useColorGauges } from "@/hooks/useColorGauges";
import HealthScoreRing from "@/components/HealthScoreRing";
import DailyActivityDial, { type DialRingItem as HeartRingItem } from "@/components/DailyActivityDial";
import TodaysYogaClass from "@/components/home/TodaysYogaClass";
import GlobalStreakCard from "@/components/home/GlobalStreakCard";
import { Wind } from "lucide-react";
import { useDailyYogaMinutes } from "@/hooks/useAppSettings";
import { getTodayYogaMinutes } from "@/lib/yogaProgressService";
import { useTodayExerciseProgress } from "@/hooks/useTodayExerciseProgress";
import { useBreathSessionsToday } from "@/hooks/useBreathSessionsToday";
import { useSoleusSessionsToday } from "@/hooks/useSoleusSessionsToday";
import { createNotification } from "@/lib/notificationService";
import { whatsappCallUrl, isMeetingCallable } from "@/lib/coachAvailability";
import { Phone } from "lucide-react";
import CoachSummaryDialog from "@/components/CoachSummaryDialog";
import FoundationLabCard from "@/components/home/FoundationLabCard";
import { fetchAssignedCoach } from "@/lib/coachService";

function getHabitItems(t: (k: string) => string) {
  return [
    { id: "fasting", icon: Timer, label: "Fasting", auto: true },
    { id: "supplements", icon: Pill, label: "Supplements", auto: true },
    { id: "movement", icon: Footprints, label: "Movement", auto: true },
    { id: "exercise", icon: Dumbbell, label: "Exercise", auto: true },
    { id: "yoga", icon: Wind, label: "Yoga & Stress", auto: true },
    { id: "water", icon: Droplets, label: t("glassesWater"), auto: true },
    { id: "diabetes", icon: Activity, label: t("logDiabetes"), auto: true },
  ];
}

function SupplementTimingIcon({ timing }: { timing: string }) {
  const t = timing.toLowerCase();
  const Icon = t.includes("morning") ? Sun : t.includes("evening") || t.includes("night") ? Moon : t.includes("meal") ? Coffee : Timer;
  return <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />;
}


/* Live elapsed timer for fasting */
function HomeLiveTimer({ startTime, className = "" }: { startTime: Date; className?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return <span className={`font-mono font-black tabular-nums ${className}`}>{pad(h)}:{pad(m)}:{pad(s)}</span>;
}

// Legacy fallback used only if gauges haven't loaded yet.
function fallbackRingColor(label: "Health" | "Weight" | "Blood Glucose", value: number, baseline: number | null) {
  if (baseline == null || value == null || Number.isNaN(value)) return "hsl(var(--primary))";
  const diff = value - baseline;
  if (label === "Health") {
    if (diff >= 0) return "var(--bbdo-mint)";
    if (diff >= -5) return "var(--bbdo-amber)";
    if (diff >= -15) return "var(--bbdo-red)";
    return "var(--bbdo-maroon)";
  }
  if (label === "Weight") {
    if (diff <= 0) return "var(--bbdo-mint)";
    if (diff <= baseline * 0.05) return "var(--bbdo-amber)";
    if (diff <= baseline * 0.15) return "var(--bbdo-red)";
    return "var(--bbdo-maroon)";
  }
  if (diff <= 0) return "var(--bbdo-mint)";
  if (diff <= 5) return "var(--bbdo-amber)";
  if (diff <= 20) return "var(--bbdo-red)";
  return "var(--bbdo-maroon)";
}

function MetricRing({
  value, label, delta, unit, ringColor, dangerColor, size = 120, icon: Icon, gradientStops
}: {
  value: number | string; label: string; delta: number | null; unit?: string;
  ringColor: string; dangerColor: string; size?: number; icon?: React.ElementType;
  gradientStops?: { offset: number; color: string }[];
}) {
  const numVal = typeof value === "number" ? value : 0;
  const maxVal = label === "Health" ? 100 : label === "Weight" ? 200 : 300;
  const pct = Math.min(100, Math.max(0, (numVal / maxVal) * 100));
  const [animated, setAnimated] = useState(0);
  const ringRadius = 39;
  const ringCircumference = 2 * Math.PI * ringRadius;
  useEffect(() => { setTimeout(() => setAnimated(pct), 400); }, [pct]);

  const isImprovement = label === "Health" ? (delta !== null && delta > 0) : (delta !== null && delta < 0);
  const isDecline = label === "Health" ? (delta !== null && delta < 0) : (delta !== null && delta > 0);
  const gradId = `ring-${label.replace(/\s+/g, "-")}`;
  const dangerGradId = `${gradId}-d`;
  const hasStops = (gradientStops?.length ?? 0) >= 2;

  return (
    <motion.div
      className="liquid-glass-strong rounded-[20px] p-2.5 w-full min-w-0 flex flex-col items-center justify-between gap-1.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {label === "Health" && typeof value === "number" ? (
        <HealthScoreRing
          score={value}
          size={72}
          thickness={6}
          showSubtitle={false}
          scoreClassName="stat-number text-lg"
          className="mx-auto shrink-0"
        />
      ) : (
        <div className="relative mx-auto w-full aspect-square shrink-0" style={{ maxWidth: 72 }}>
          <svg viewBox="0 0 92 92" className="h-full w-full -rotate-90 block">
            <circle cx={46} cy={46} r={ringRadius} fill="none" stroke="var(--bbdo-line)" strokeWidth={7} />
            <circle
              cx={46} cy={46} r={ringRadius} fill="none"
              stroke={isDecline && !hasStops ? `url(#${dangerGradId})` : `url(#${gradId})`}
              strokeWidth={7} strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringCircumference - (animated / 100) * ringCircumference}
              style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.4,0,0.2,1)" }}
            />
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                {hasStops
                  ? gradientStops!.map((s, i) => (
                      <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
                    ))
                  : (
                    <>
                      <stop offset="0%" stopColor={ringColor} />
                      <stop offset="100%" stopColor={ringColor} stopOpacity={0.7} />
                    </>
                  )}
              </linearGradient>
              <linearGradient id={dangerGradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={dangerColor} />
                <stop offset="100%" stopColor={dangerColor} stopOpacity={0.7} />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="stat-number text-base text-foreground leading-none">{value}</span>
            {unit && value !== "—" && <span className="text-muted-foreground text-[8px] font-medium mt-0.5">{unit}</span>}
          </div>
        </div>
      )}
      <span className="text-muted-foreground text-[9px] font-bold uppercase tracking-[0.12em] text-center leading-tight">{label}</span>
      <div className="min-h-[18px] flex items-center justify-center">

        {delta !== null && value !== "—" ? (
          delta === 0 ? (
            <div className="flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full text-muted-foreground bg-muted">
              <span>No change</span>
            </div>
          ) : (
            <div
              className={`flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isImprovement
                  ? "text-[var(--bbdo-mint)] bg-[var(--bbdo-mint)]/10"
                  : "text-destructive bg-destructive/10"
              }`}
            >
              {isImprovement ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>
                {label === "Health"
                  ? (delta > 0 ? `+${delta}` : String(delta))
                  : (delta < 0 ? `↓ ${Math.abs(delta)}` : `↑ +${delta}`)}
              </span>
            </div>
          )
        ) : null}
      </div>

    </motion.div>
  );
}

function BmiTile({ bmi, status, color }: { bmi: number | null; status: string; color: string }) {
  const pct = bmi == null ? 0 : Math.min(100, Math.max(0, (bmi / 40) * 100));
  const [animated, setAnimated] = useState(0);
  const r = 39;
  const c = 2 * Math.PI * r;
  useEffect(() => { const t = setTimeout(() => setAnimated(pct), 400); return () => clearTimeout(t); }, [pct]);
  const isObese = status === "Obese";
  return (
    <motion.div
      className="liquid-glass-strong rounded-[20px] p-2.5 w-full min-w-0 flex flex-col items-center justify-between gap-1.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative mx-auto w-full aspect-square shrink-0" style={{ maxWidth: 72 }}>
        <svg viewBox="0 0 92 92" className="h-full w-full -rotate-90 block">
          <circle cx={46} cy={46} r={r} fill="none" stroke="var(--bbdo-line)" strokeWidth={7} />
          <circle
            cx={46} cy={46} r={r} fill="none"
            stroke={color}
            strokeWidth={7} strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (animated / 100) * c}
            style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="stat-number text-base text-foreground leading-none">{bmi ?? "—"}</span>
          <span className="text-muted-foreground text-[8px] font-medium mt-0.5">kg/m²</span>
        </div>
      </div>
      <span className="text-muted-foreground text-[9px] font-bold uppercase tracking-[0.12em] text-center leading-tight">BMI</span>
      <div className="min-h-[18px] flex items-center justify-center">
        {bmi != null && (
          <div
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              isObese
                ? "text-destructive bg-destructive/10"
                : "text-[var(--bbdo-mint)] bg-[var(--bbdo-mint)]/10"
            }`}
          >
            {status}
          </div>
        )}
      </div>
    </motion.div>
  );
}



function MetricCard({
  title, value, unit, trend, trendLabel, data, color, gradId, delay, icon: Icon
}: {
  title: string; value: string; unit: string; trend: string; trendLabel: string;
  data: { v: number }[]; color: string; gradId: string; delay: number; icon: React.ElementType;
}) {
  // For weight/sugar/BP: "down" trend means improvement (good)
  const isGood = trend === "down";

  return (
    <motion.div
      className="liquid-glass rounded-[22px] p-4 relative overflow-hidden"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-[12px] flex items-center justify-center liquid-glass-icon" style={{ background: `${color}14` }}>
          <Icon className="w-4 h-4" style={{ color }} strokeWidth={1.75} />
        </div>
        <span className="text-muted-foreground text-xs font-semibold tracking-tight">{title}</span>
      </div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <span className="stat-number text-2xl text-foreground">{value}</span>
          <span className="text-muted-foreground text-xs ml-1">{unit}</span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isGood ? "bg-[var(--bbdo-mint)]/10 text-[var(--bbdo-mint)]" : "bg-destructive/10 text-destructive"}`}>
          {isGood ? "↓" : "↑"} {trendLabel}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={56}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone" dataKey="v" stroke={color} strokeWidth={2}
            fill={`url(#${gradId})`} dot={false}
            baseValue="dataMin"
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export default function Home({ onProfileOpen, packageKey }: { onProfileOpen?: () => void; packageKey?: string | null }) {
  const getLocalDateKey = useCallback(() => {
    const now = new Date();
    const localMidnightSafe = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return localMidnightSafe.toISOString().split("T")[0];
  }, []);

  // Convert an ISO timestamp to the user's LOCAL date key (yyyy-mm-dd)
  const toLocalDateKey = useCallback((iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().split("T")[0];
  }, []);

  // Track current local date so data reloads at local midnight
  const [todayKey, setTodayKey] = useState(() => getLocalDateKey());

  useEffect(() => {
    const check = () => {
      const now = getLocalDateKey();
      if (now !== todayKey) setTodayKey(now);
    };
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [getLocalDateKey, todayKey]);

  const { getColor: getGaugeColor, modules: gaugeModules } = useColorGauges();
  const [userHeightCm, setUserHeightCm] = useState<number | null>(null);
  const getRingColor = useCallback(
    (label: "Health" | "Weight" | "Blood Glucose", value: number, baseline: number | null) => {
      const hasGauges = gaugeModules.length > 0;
      if (hasGauges && value != null && !Number.isNaN(value)) {
        if (label === "Health") return getGaugeColor("health_score", value);
        if (label === "Blood Glucose") return getGaugeColor("blood_sugar_fasting", value);
        if (label === "Weight") {
          // Prefer standalone Weight module (percent change vs baseline).
          const hasWeightModule = gaugeModules.some((m) => m.module_key === "weight");
          if (hasWeightModule && baseline && baseline > 0) {
            const pct = ((value - baseline) / baseline) * 100;
            return getGaugeColor("weight", pct);
          }
          // Fallback: BMI-based coloring if height is known.
          if (userHeightCm && userHeightCm > 0) {
            const bmi = value / Math.pow(userHeightCm / 100, 2);
            return getGaugeColor("weight_bmi", bmi);
          }
        }
      }
      return fallbackRingColor(label, value, baseline);
    },
    [gaugeModules, getGaugeColor, userHeightCm]
  );
  const [checkedHabits, setCheckedHabits] = useState<string[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [upgradeDismissed, setUpgradeDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem("bbdo:hideUpgradeCTA") === "1"; } catch { return false; }
  });
  const [coachName, setCoachName] = useState<string | null>(null);
  const [coachAvatar, setCoachAvatar] = useState<string | null>(null);
  const [coachDialogOpen, setCoachDialogOpen] = useState(false);
  const [coachDialogCoachId, setCoachDialogCoachId] = useState<string | null>(null);
  const openCoachDialog = (coachId?: string | null) => {
    setCoachDialogCoachId(coachId ?? null);
    setCoachDialogOpen(true);
  };
  const openCoachChat = () => {
    try { sessionStorage.setItem("bbdo:openCoachChat", "1"); } catch {}
    window.dispatchEvent(new CustomEvent<string>("nav:set-tab", { detail: "consult" }));
    window.dispatchEvent(new CustomEvent("nav:open-coach-chat"));
  };
  const [nextMeeting, setNextMeeting] = useState<{ scheduled_at: string; duration_min: number | null; meeting_type: string; agenda: string | null; coach_id: string; coach_phone?: string | null; coach_name?: string | null; coach_avatar?: string | null } | null>(null);
  const [hasAnyMeeting, setHasAnyMeeting] = useState<boolean>(false);
  const [hasCompletedMeeting, setHasCompletedMeeting] = useState<boolean>(false);
  const [glucoseData, setGlucoseData] = useState<{ v: number }[]>([]);
   const [hasTodayDiabetesLog, setHasTodayDiabetesLog] = useState(false);
   const [diabetesMorningDone, setDiabetesMorningDone] = useState(false);
   const [diabetesEveningDone, setDiabetesEveningDone] = useState(false);
   const [diabetesMorningValue, setDiabetesMorningValue] = useState<number | null>(null);
   const [diabetesEveningValue, setDiabetesEveningValue] = useState<number | null>(null);
  const [waterDone, setWaterDone] = useState(false);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const { minutes: completedExercisesToday, goal: EXERCISE_DAILY_GOAL } = useTodayExerciseProgress();
  const { count: breathCountToday, goal: breathGoalToday } = useBreathSessionsToday();
  const { count: soleusCountToday, goal: soleusGoalToday } = useSoleusSessionsToday();
  const [yogaMinutesToday, setYogaMinutesToday] = useState(0);
  const YOGA_DAILY_MINUTES = useDailyYogaMinutes();
   const [movementDone, setMovementDone] = useState(false);
   const [movementRatio, setMovementRatio] = useState(0);
   const [movementHint, setMovementHint] = useState<string>("");
   const [weightData, setWeightData] = useState<{ v: number }[]>([]);
   const [bpData, setBpData] = useState<{ v: number }[]>([]);
  const [progressSummaries, setProgressSummaries] = useState<ProgressSummary[]>([]);

  // Supplement state
  const [suppPlan, setSuppPlan] = useState<UserSupplementPlan | null>(null);
  const [suppItems, setSuppItems] = useState<PlanItem[]>([]);
  const [suppList, setSuppList] = useState<SupplementType[]>([]);
  const [suppTracking, setSuppTracking] = useState<SupplementTracking[]>([]);

   // Real fasting state
  const [fastingLabel, setFastingLabel] = useState("No plan");
  const [fastingTarget, setFastingTarget] = useState(0);
  const [fastingPhase, setFastingPhase] = useState("");
  const [fastingState, setFastingState] = useState<"loading" | "none" | "no_plan" | "eating" | "fasting" | "done">("loading");
  const [fastingStartTime, setFastingStartTime] = useState<Date | null>(null);
  const [fastingTrackDate, setFastingTrackDate] = useState<string | null>(null);
  const [fastingElapsedStatic, setFastingElapsedStatic] = useState(0);
  const [availableProtos, setAvailableProtos] = useState<FastingProtocol[]>([]);
  const [weekPlanFmod, setWeekPlanFmod] = useState<string | null>(null);
  const [weekPlanLmod, setWeekPlanLmod] = useState<string | null>(null);
  const [fmodDoneToday, setFmodDoneToday] = useState(false);
  const [lmodDoneToday, setLmodDoneToday] = useState(false);
  const [fmodLoggedAt, setFmodLoggedAt] = useState<string | null>(null);
  const [lmodLoggedAt, setLmodLoggedAt] = useState<string | null>(null);
  const [plateModalFor, setPlateModalFor] = useState<"fmod" | "lmod" | null>(null);
  const [pendingMealISO, setPendingMealISO] = useState<string | null>(null);
  const [timePickerFor, setTimePickerFor] = useState<"fmod" | "lmod" | null>(null);
  const [timePickerValue, setTimePickerValue] = useState<string>("");
  const [startingProtoId, setStartingProtoId] = useState<string | null>(null);

  // Streaks
  const [overallStreak, setOverallStreak] = useState(0);

  // Today's meals (plates logged via FMOD/LMOD)
  const [todayMeals, setTodayMeals] = useState<Array<{ id: string; meal_type: string; logged_at: string; estimated_calories: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fiber_g: number | null; photo_url: string | null; food_items: any[] }>>([]);




  const { user: authUser } = useAuth();
  const user = useUserStore();
  const [dbProfile, setDbProfile] = useState<any | null>(null);
  useEffect(() => {
    const h = user.bodyMetrics?.height;
    if (typeof h === "number" && h !== userHeightCm) setUserHeightCm(h);
  }, [user.bodyMetrics?.height, userHeightCm]);

  // Today's yoga minutes (Pranayama / Yoga Asana / Bandha)
  useEffect(() => {
    if (!authUser?.id) return;
    setYogaMinutesToday(0);
    const load = async () => setYogaMinutesToday(await getTodayYogaMinutes(authUser.id));
    void load();
    const iv = setInterval(load, 60_000);
    const onProgress = () => void load();
    window.addEventListener("bbdo:video-progress-changed", onProgress);
    window.addEventListener("bbdo:video-progress-synced", onProgress);
    return () => {
      clearInterval(iv);
      window.removeEventListener("bbdo:video-progress-changed", onProgress);
      window.removeEventListener("bbdo:video-progress-synced", onProgress);
    };
  }, [authUser?.id, todayKey]);

  // Fire "goal complete — share it" notifications once per day per device.
  useEffect(() => {
    if (!authUser?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const exerciseKey = `bbdo:ex_goal_notified_${today}`;
    const yogaKey = `bbdo:yoga_goal_notified_${today}`;
    if (EXERCISE_DAILY_GOAL > 0 && completedExercisesToday >= EXERCISE_DAILY_GOAL && !sessionStorage.getItem(exerciseKey)) {
      sessionStorage.setItem(exerciseKey, "1");
      createNotification({
        user_id: authUser.id,
        title: "🏋️ Daily exercise goal complete!",
        body: `You crushed ${EXERCISE_DAILY_GOAL} exercise minutes today. Tap to share your win with the community.`,
        type: "achievement_share",
        icon: "🏋️",
        action_url: "/dashboard?tab=community&share=exercise_goal",
      }).catch(() => {});
    }
    if (YOGA_DAILY_MINUTES > 0 && yogaMinutesToday >= YOGA_DAILY_MINUTES && !sessionStorage.getItem(yogaKey)) {
      sessionStorage.setItem(yogaKey, "1");
      createNotification({
        user_id: authUser.id,
        title: "🧘 Yoga & stress goal complete!",
        body: `${YOGA_DAILY_MINUTES} minutes done today. Tap to share your calm with the community.`,
        type: "achievement_share",
        icon: "🧘",
        action_url: "/dashboard?tab=community&share=yoga_goal",
      }).catch(() => {});
    }
  }, [authUser?.id, completedExercisesToday, yogaMinutesToday, EXERCISE_DAILY_GOAL, YOGA_DAILY_MINUTES]);
  const { t, greeting } = useLanguage();
  const rawHabits = getHabitItems(t);
  const profileClinical = dbProfile?.clinical ?? user.clinical;
  const profileDeep = dbProfile?.deep_profiling ?? user.deepProfiling;
  const hasDiabetesFlag = !!(profileClinical?.hasDiabetes || (profileDeep as any)?.hba1cInput != null || (profileDeep as any)?.fastingGlucose != null);
  const hasHypertensionFlag = !!(user.clinical?.hasHypertension || (user.clinical as any)?.bpMedication);
  const activeSuppItems = suppItems.filter((item) => item.is_active !== false);
  const activeSuppItemIds = new Set(activeSuppItems.map((item) => item.id));
  const suppTakenCount = new Set(
    suppTracking
      .filter((track) => track.taken && activeSuppItemIds.has(track.plan_item_id))
      .map((track) => track.plan_item_id)
  ).size;
  const suppTotalCount = activeSuppItems.length;
  const hasActiveSupplements = !!(suppPlan && suppPlan.status === "active" && suppTotalCount > 0);
  const habits = rawHabits.filter((h) => {
    if (h.id === "fasting") return fastingState !== "no_plan" && fastingState !== "loading";
    if (h.id === "supplements") return hasActiveSupplements;
    if (h.id === "diabetes") return hasDiabetesFlag;
    return true;
  });
  const firstName = (user.profile.name ?? "Friend").split(" ")[0];
  const healthScore = user.assessment?.healthScore ?? 72;
  const overrideTriggered = user.assessment?.overrideTriggered ?? false;
  const recommendedProgram = user.assessment?.recommendedProgram ?? "";
  const [initialScore, setInitialScore] = useState<number | null>(null);
  const [initialWeight, setInitialWeight] = useState<number | null>(null);
  const [initialGlucose, setInitialGlucose] = useState<number | null>(null);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [latestGlucose, setLatestGlucose] = useState<number | null>(null);
  const [sharePrompt, setSharePrompt] = useState<{ type: "weight" | "sugar" | "health_score"; before: number; after: number; delta: number } | null>(null);
  

  useEffect(() => {
    // Reset manual habits on date change
    setCheckedHabits([]);
    setDbProfile(null);
    setSuppPlan(null);
    setSuppItems([]);
    setSuppTracking([]);
    setHasTodayDiabetesLog(false);
    setDiabetesMorningDone(false);
    setDiabetesEveningDone(false);
    setDiabetesMorningValue(null);
    setDiabetesEveningValue(null);
    setWaterDone(false);
    setWaterGlasses(0);
    setMovementDone(false);
    setMovementRatio(0);
    setMovementHint("");
    setFastingState("loading");
    setFmodDoneToday(false);
    setLmodDoneToday(false);
    if (authUser) {
      fetchActiveSubscription(authUser.id).then(setSubscription);
      // Load coach meetings to drive "awaiting meeting" / upcoming meeting UI
      (async () => {
        // Show the nearest scheduled meeting — include meetings within the last 24h
        // so a session scheduled "for today" still surfaces here after the start time,
        // and any future-scheduled meeting always takes priority over the empty-state banner.
        const { data: ups } = await supabase
          .from("coach_meetings")
          .select("scheduled_at, duration_min, meeting_type, agenda, status, coach_id")
          .eq("user_id", authUser.id)
          .eq("status", "scheduled")
          .gte("scheduled_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(1);
        if (ups && ups.length > 0) {
          const m = ups[0] as any;
          const { data: coach } = await supabase
            .from("coaches")
            .select("phone, name, avatar_url")
            .eq("id", m.coach_id)
            .maybeSingle();
          setNextMeeting({ ...m, coach_phone: coach?.phone ?? null, coach_name: coach?.name ?? null, coach_avatar: (coach as any)?.avatar_url ?? null });
          if (coach?.name) setCoachName(coach.name);
          if ((coach as any)?.avatar_url) setCoachAvatar((coach as any).avatar_url);
          setHasAnyMeeting(true);
        } else {
          setNextMeeting(null);
          const { count } = await supabase
            .from("coach_meetings")
            .select("id", { head: true, count: "exact" })
            .eq("user_id", authUser.id);
          setHasAnyMeeting((count ?? 0) > 0);
        }
        const { count: doneCount } = await supabase
          .from("coach_meetings")
          .select("id", { head: true, count: "exact" })
          .eq("user_id", authUser.id)
          .eq("status", "completed");
        setHasCompletedMeeting((doneCount ?? 0) > 0);
      })();
      const loadMovement = async () => {
        try {
          const p = await fetchProfile(authUser.id);
          setDbProfile(p ?? null);
          const ov = await fetchMovementOverview(authUser.id, {
            bmiCategory: (p as any)?.bmi_category ?? null,
            activityLevel: (p as any)?.lifestyle?.activity ?? (p as any)?.activity_level ?? null,
            age: (p as any)?.age ?? null,
            weightKg: (p as any)?.weight ?? null,
            heightCm: (p as any)?.height ?? null,
          });
          setMovementDone(ov.targetSteps > 0 && ov.todaySteps >= ov.targetSteps);
          const ratio = ov.targetSteps > 0 ? Math.min(1, ov.todaySteps / ov.targetSteps) : 0;
          setMovementRatio(ratio);
          setMovementHint(`${(ov.todaySteps || 0).toLocaleString("en-IN")} / ${(ov.targetSteps || 0).toLocaleString("en-IN")} steps`);
        } catch {}
      };
      loadMovement();
      (window as any).__bbdoReloadMovement = loadMovement;
      fetchProfile(authUser.id).then(async (p) => {
        setDbProfile(p ?? null);
        // Use the same resolver as the My Coach tab so Home never shows a stale/ghost coach.
        try {
          const assignedCoach = await fetchAssignedCoach(authUser.id);
          if (assignedCoach?.name) {
            setCoachName(assignedCoach.name);
            setCoachAvatar(assignedCoach.avatar_url ?? null);
          } else {
            setCoachName(null);
            setCoachAvatar(null);
          }
        } catch { /* ignore */ }
        if (p?.initial_health_score != null) {
          setInitialScore(p.initial_health_score);
        } else if (healthScore) {
          // Backfill: save current health score as baseline if never set
          setInitialScore(healthScore);
          try {
            const { supabase } = await import("@/integrations/supabase/client");
            await supabase.from("profiles").update({
              initial_health_score: healthScore,
              initial_assessment_date: new Date().toISOString(),
            }).eq("user_id", authUser.id);
          } catch (e) { console.error("Failed to backfill initial_health_score", e); }
        }
        return p;
      });
      const profilePromise = fetchProfile(authUser.id);
      Promise.all([
        fetchHealthLogs("diabetes", authUser.id),
        fetchHealthLogs("bp", authUser.id),
        fetchHealthLogs("weight", authUser.id),
        fetchHealthLogs("water", authUser.id),
        fetchProgressSummaries(authUser.id),
        profilePromise,
      ]).then(([diabetesLogs, bpLogs, weightLogs, waterLogs, summaries, p]) => {
        setDbProfile(p ?? null);
        setGlucoseData(diabetesLogs.filter(l => l.glucose_morning).map(l => ({ v: Number(l.glucose_morning) })).reverse());
        setWeightData(weightLogs.filter(l => l.weight_kg).map(l => ({ v: Number(l.weight_kg) })).reverse());
        setBpData(bpLogs.filter(l => l.bp_systolic).map(l => ({ v: Number(l.bp_systolic) })).reverse());
        setProgressSummaries(summaries);

        // Extract current and baseline values for the 3-ring display.
        // Baseline comes from the onboarding profile; current comes from the latest log.
        const profileWeight = (p as any)?.weight ?? null;
        const profileGlucose = (p as any)?.deep_profiling?.fastingGlucose ?? null;

        const glucoseWithData = diabetesLogs.filter(l => l.glucose_morning != null);
        if (glucoseWithData.length > 0) {
          setLatestGlucose(Number(glucoseWithData[0].glucose_morning));
          setInitialGlucose(profileGlucose ?? Number(glucoseWithData[glucoseWithData.length - 1].glucose_morning));
        } else if (profileGlucose != null) {
          setLatestGlucose(profileGlucose);
          setInitialGlucose(profileGlucose);
        }

        const weightWithData = weightLogs.filter(l => l.weight_kg != null);
        if (weightWithData.length > 0) {
          setLatestWeight(Number(weightWithData[0].weight_kg));
          setInitialWeight(profileWeight ?? Number(weightWithData[weightWithData.length - 1].weight_kg));
        } else if (profileWeight != null) {
          setLatestWeight(profileWeight);
          setInitialWeight(profileWeight);
        }

        const todayStr = todayKey;
        const todayDiabetes = diabetesLogs.filter(l => toLocalDateKey(l.logged_at) === todayStr);
        const morningLog = todayDiabetes.find(l => l.glucose_morning != null);
        const eveningLog = todayDiabetes.find(l => l.glucose_evening != null);
        setDiabetesMorningDone(!!morningLog);
        setDiabetesEveningDone(!!eveningLog);
        setDiabetesMorningValue(morningLog ? Number(morningLog.glucose_morning) : null);
        setDiabetesEveningValue(eveningLog ? Number(eveningLog.glucose_evening) : null);
        setHasTodayDiabetesLog(!!morningLog || !!eveningLog);
        // Check if water goal met today
        const todayWater = waterLogs.filter(l => toLocalDateKey(l.logged_at) === todayStr);
        const totalGlasses = todayWater.reduce((sum, l) => sum + (l.weight_kg ?? 0), 0);
        setWaterDone(totalGlasses >= 8);
        setWaterGlasses(totalGlasses);
      });

      // Load real fasting data
      loadFastingData(authUser.id);
      // Load supplement data
      loadSupplementData(authUser.id);
      // Load today's meals (FMOD/LMOD plates)
      loadTodayMeals(authUser.id);
      fetchUserStats(authUser.id).then((s) => setOverallStreak(s.dayStreak)).catch(console.error);



    }
  }, [authUser, todayKey]);

  // Re-fetch health data when a log is saved from the FAB
  useEffect(() => {
    const handler = () => {
      if (!authUser) return;
      Promise.all([
        fetchHealthLogs("diabetes", authUser.id),
        fetchHealthLogs("bp", authUser.id),
        fetchHealthLogs("weight", authUser.id),
        fetchHealthLogs("water", authUser.id),
        fetchProgressSummaries(authUser.id),
        fetchProfile(authUser.id),
      ]).then(([diabetesLogs, bpLogs, weightLogs, waterLogs, summaries, p]) => {
        setDbProfile(p ?? null);
        setGlucoseData(diabetesLogs.filter(l => l.glucose_morning).map(l => ({ v: Number(l.glucose_morning) })).reverse());
        setWeightData(weightLogs.filter(l => l.weight_kg).map(l => ({ v: Number(l.weight_kg) })).reverse());
        setBpData(bpLogs.filter(l => l.bp_systolic).map(l => ({ v: Number(l.bp_systolic) })).reverse());
        setProgressSummaries(summaries);
        // Update latest values for rings; baseline stays anchored to the onboarding profile
        const profileWeight = (p as any)?.weight ?? null;
        const profileGlucose = (p as any)?.deep_profiling?.fastingGlucose ?? null;

        const glucoseWithData = diabetesLogs.filter(l => l.glucose_morning != null);
        if (glucoseWithData.length > 0) {
          setLatestGlucose(Number(glucoseWithData[0].glucose_morning));
          if (initialGlucose == null) setInitialGlucose(profileGlucose ?? Number(glucoseWithData[glucoseWithData.length - 1].glucose_morning));
        } else if (profileGlucose != null && latestGlucose == null) {
          setLatestGlucose(profileGlucose);
          setInitialGlucose(profileGlucose);
        }

        const weightWithData = weightLogs.filter(l => l.weight_kg != null);
        if (weightWithData.length > 0) {
          setLatestWeight(Number(weightWithData[0].weight_kg));
          if (initialWeight == null) setInitialWeight(profileWeight ?? Number(weightWithData[weightWithData.length - 1].weight_kg));
        } else if (profileWeight != null && latestWeight == null) {
          setLatestWeight(profileWeight);
          setInitialWeight(profileWeight);
        }
        const todayStr = todayKey;
        const todayDiabetes = diabetesLogs.filter(l => toLocalDateKey(l.logged_at) === todayStr);
        const morningLog = todayDiabetes.find(l => l.glucose_morning != null);
        const eveningLog = todayDiabetes.find(l => l.glucose_evening != null);
        setDiabetesMorningDone(!!morningLog);
        setDiabetesEveningDone(!!eveningLog);
        setDiabetesMorningValue(morningLog ? Number(morningLog.glucose_morning) : null);
        setDiabetesEveningValue(eveningLog ? Number(eveningLog.glucose_evening) : null);
        setHasTodayDiabetesLog(!!morningLog || !!eveningLog);
        const todayWater = waterLogs.filter(l => toLocalDateKey(l.logged_at) === todayStr);
        const totalGlasses = todayWater.reduce((sum, l) => sum + (l.weight_kg ?? 0), 0);
        setWaterDone(totalGlasses >= 8);
        setWaterGlasses(totalGlasses);
      });
      (window as any).__bbdoReloadMovement?.();
      fetchUserStats(authUser.id).then((s) => setOverallStreak(s.dayStreak)).catch(console.error);
    };
    window.addEventListener("health-log-saved", handler);
    return () => window.removeEventListener("health-log-saved", handler);
  }, [authUser, todayKey]);

  // Detect improvements and prompt sharing
  useEffect(() => {
    if (sharePrompt) return;
    const sharedKey = `achievement_shared_${authUser?.id}`;
    const lastShared = localStorage.getItem(sharedKey);
    const today = new Date().toISOString().slice(0, 10);
    if (lastShared === today) return;

    if (initialScore != null && healthScore > initialScore && (healthScore - initialScore) >= 3) {
      setSharePrompt({ type: "health_score", before: initialScore, after: healthScore, delta: healthScore - initialScore });
      localStorage.setItem(sharedKey, today);
    } else if (initialWeight != null && latestWeight != null && initialWeight - latestWeight >= 0.5) {
      setSharePrompt({ type: "weight", before: initialWeight, after: latestWeight, delta: latestWeight - initialWeight });
      localStorage.setItem(sharedKey, today);
    } else if (initialGlucose != null && latestGlucose != null && initialGlucose - latestGlucose >= 5) {
      setSharePrompt({ type: "sugar", before: initialGlucose, after: latestGlucose, delta: latestGlucose - initialGlucose });
      localStorage.setItem(sharedKey, today);
    }
  }, [initialScore, healthScore, initialWeight, latestWeight, initialGlucose, latestGlucose, authUser, sharePrompt]);

  const loadFastingData = async (userId: string) => {
    try {
      const protos = await fetchProtocols();
      setAvailableProtos(protos.filter(p => p.is_active));

      const up = await fetchUserProtocol(userId);
      if (!up) {
        setFastingState("no_plan");
        setFastingLabel("Choose your plan to start");
        setFastingStartTime(null);
        setFastingElapsedStatic(0);
        setFastingTrackDate(null);
        return;
      }

      const proto = protos.find(p => p.id === up.protocol_id);
      const week = getCurrentWeek(up.start_date);
      const plans = await fetchWeeklyPlans(up.protocol_id);
      const wp = plans.find(w => w.week_number === week);
      if (!wp) {
        setFastingState("none");
        setFastingLabel(proto?.protocol_name ?? "Active plan");
        setFastingStartTime(null);
        setFastingElapsedStatic(0);
        setFastingTrackDate(null);
        return;
      }

      const fastHours = parseInt(wp.fasting_pattern.split(":")[0]);
      setFastingTarget(fastHours);
      setFastingLabel(`${proto?.protocol_name ?? "Plan"} · Week ${week} · ${wp.fasting_pattern}`);
      setWeekPlanFmod(wp.fmod_time ? formatTime24to12(wp.fmod_time) : null);
      setWeekPlanLmod(wp.lmod_time ? formatTime24to12(wp.lmod_time) : null);

      const today = getLocalDateKey();
      const tracks = await fetchTrackingForUser(userId, 60);
      const todayTrack = tracks.find(t => t.date === today);
      const nowMs = Date.now();
      const rawTodayFmod = todayTrack?.fmod_actual_time ? new Date(todayTrack.fmod_actual_time) : null;
      const todayFmod = rawTodayFmod && rawTodayFmod.getTime() <= nowMs ? rawTodayFmod : null;
      const rawTodayLmod = todayTrack?.lmod_actual_time ? new Date(todayTrack.lmod_actual_time) : null;
      const validTodayLmod = !!rawTodayLmod && (!todayFmod || rawTodayLmod.getTime() > todayFmod.getTime());
      const normalizedTodayTrack = todayTrack
        ? {
            ...todayTrack,
            fmod_actual_time: todayFmod ? todayTrack.fmod_actual_time : null,
            lmod_actual_time: validTodayLmod && rawTodayLmod.getTime() <= nowMs ? todayTrack.lmod_actual_time : null,
          }
        : null;

      // Active fast is always previous LMOD → next FMOD. If today's FMOD is not
      // logged yet, keep yesterday's LMOD fast active even if a blank today row exists.
      const openYesterdayFast = (() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
        const yTrack = tracks.find(t => t.date === yKey);
        if (yTrack?.lmod_actual_time && !yTrack.fasting_hours_completed) {
          return yTrack;
        }
        return null;
      })();
      const resolvedTrack = normalizedTodayTrack?.fmod_actual_time ? normalizedTodayTrack : openYesterdayFast ?? normalizedTodayTrack ?? null;

      setFmodDoneToday(!!normalizedTodayTrack?.fmod_actual_time);
      setLmodDoneToday(!!normalizedTodayTrack?.lmod_actual_time);
      setFmodLoggedAt(normalizedTodayTrack?.fmod_actual_time ?? null);
      setLmodLoggedAt(normalizedTodayTrack?.lmod_actual_time ?? null);

      if (!resolvedTrack) {
        setFastingState("none");
        setFastingStartTime(null);
        setFastingElapsedStatic(0);
        setFastingTrackDate(null);
        return;
      }

      if (resolvedTrack.fasting_hours_completed && resolvedTrack.compliance_status === "completed") {
        setFastingState("done");
        setFastingElapsedStatic(resolvedTrack.fasting_hours_completed);
        setFastingPhase("Complete");
        setFastingStartTime(null);
        setFastingTrackDate(resolvedTrack.date);
        return;
      }

      if (resolvedTrack.lmod_actual_time) {
        const lmodTime = new Date(resolvedTrack.lmod_actual_time);
        const elapsedH = (Date.now() - lmodTime.getTime()) / (1000 * 60 * 60);
        setFastingState("fasting");
        setFastingStartTime(lmodTime);
        setFastingTrackDate(resolvedTrack.date);
        setFastingElapsedStatic(Math.round(elapsedH * 10) / 10);
        setFastingPhase(getPhaseInfo(elapsedH).phase);
      } else if (resolvedTrack.fmod_actual_time) {
        setFastingState("eating");
        setFastingStartTime(null);
        setFastingElapsedStatic(0);
        setFastingTrackDate(resolvedTrack.date);
        setFastingPhase("First meal tracked");
      } else {
        setFastingState("none");
        setFastingStartTime(null);
        setFastingElapsedStatic(0);
        setFastingTrackDate(null);
      }
    } catch (e) { console.error(e); }
  };

  const handleStartProtocol = async (protoId: string) => {
    if (!authUser) return;
    setStartingProtoId(protoId);
    try {
      const today = getLocalDateKey();
      await assignProtocolToUser(authUser.id, protoId, authUser.id, today);
      toast.success("Your 24-week journey has begun");
      await loadFastingData(authUser.id);
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't start plan");
    } finally {
      setStartingProtoId(null);
    }
  };

  const handlePlateSavedForMeal = async () => {
    if (!authUser || !plateModalFor) return;
    const today = getLocalDateKey();
    const mealISO = pendingMealISO ?? new Date().toISOString();
    if (plateModalFor === "lmod" && fmodLoggedAt && new Date(mealISO).getTime() <= new Date(fmodLoggedAt).getTime()) {
      toast.error("Last meal must be after your first meal");
      return;
    }
    try {
      await upsertTracking({
        user_id: authUser.id,
        date: today,
        [plateModalFor === "fmod" ? "fmod_actual_time" : "lmod_actual_time"]: mealISO,
        compliance_status: "pending",
      } as any);
      if (plateModalFor === "fmod") await closePreviousFastIfNeeded(mealISO);

      // Also save a meal_photo entry derived from the latest user_plate
      try {
        const { data: plates } = await supabase
          .from("user_plates" as any)
          .select("id, items, total_calories_kcal, total_protein_g, snapshot_url")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const plate = (plates as any[])?.[0];
        if (plate) {
          const items = (plate.items ?? []) as any[];
          const foodItems = items.map((it) => ({
            name: it.name,
            portion: it.serving_label ?? it.household_measure ?? "1 serving",
            calories: Math.round(Number(it.calories_kcal) || 0),
            protein_g: Number(it.protein_g) || 0,
            carbs_g: Number(it.carbs_max ?? it.carbs_min) || 0,
            fat_g: Number(it.fat_g) || 0,
          }));
          let photoUrl: string | null = null;
          if (plate.snapshot_url) {
            const { data: u } = supabase.storage.from("plate-snapshots").getPublicUrl(plate.snapshot_url);
            photoUrl = u?.publicUrl ?? null;
          }
          await supabase.from("meal_photos" as any).insert({
            user_id: authUser.id,
            meal_type: plateModalFor,
            photo_url: photoUrl,
            estimated_calories: Math.round(Number(plate.total_calories_kcal) || 0),
            food_items: foodItems,
            logged_at: mealISO,
          } as any);
        }
      } catch (e) { console.error("meal_photo log failed", e); }

      toast.success(plateModalFor === "fmod" ? "First meal logged" : "Last meal logged — fasting begins!");
      setPendingMealISO(null);
      await Promise.all([
        loadFastingData(authUser.id),
        loadTodayMeals(authUser.id),
      ]);
      fetchUserStats(authUser.id).then((s) => setOverallStreak(s.dayStreak)).catch(console.error);
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't log meal");
    }
  };


  const openMealTimePicker = (meal: "fmod" | "lmod") => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    setTimePickerValue(`${hh}:${mm}`);
    setTimePickerFor(meal);
  };

  const closePreviousFastIfNeeded = async (fmodISO: string) => {
    if (!authUser) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    const tracks = await fetchTrackingForUser(authUser.id, 3);
    const yTrack = tracks.find((t) => t.date === yKey);
    if (!yTrack?.lmod_actual_time || yTrack.fasting_hours_completed) return;
    const hours = (new Date(fmodISO).getTime() - new Date(yTrack.lmod_actual_time).getTime()) / (1000 * 60 * 60);
    const targetHours = fastingTarget > 0 ? fastingTarget : 12;
    const compliance = hours >= targetHours * 0.9 ? "completed" : hours >= targetHours * 0.5 ? "partial" : "missed";
    await upsertTracking({
      user_id: authUser.id,
      date: yTrack.date,
      fasting_hours_completed: Math.round(hours * 10) / 10,
      compliance_status: compliance,
    });
  };

  const logMealTimeOnly = async (meal: "fmod" | "lmod", mealISO: string) => {
    if (!authUser) return;
    const today = getLocalDateKey();
    if (meal === "lmod" && fmodLoggedAt && new Date(mealISO).getTime() <= new Date(fmodLoggedAt).getTime()) {
      toast.error("Last meal must be after your first meal");
      return;
    }
    try {
      await upsertTracking({
        user_id: authUser.id,
        date: today,
        [meal === "fmod" ? "fmod_actual_time" : "lmod_actual_time"]: mealISO,
        compliance_status: "pending",
      } as any);
      if (meal === "fmod") await closePreviousFastIfNeeded(mealISO);
      toast.success(meal === "fmod" ? "First meal logged" : "Last meal logged — fasting begins!");
      await Promise.all([
        loadFastingData(authUser.id),
        loadTodayMeals(authUser.id),
      ]);
      fetchUserStats(authUser.id).then((s) => setOverallStreak(s.dayStreak)).catch(console.error);
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't log meal");
    }
  };

  const confirmMealTime = (useNow: boolean) => {
    if (!timePickerFor) return;
    let iso: string;
    if (useNow || !timePickerValue) {
      iso = new Date().toISOString();
    } else {
      const [h, m] = timePickerValue.split(":").map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      if (d.getTime() > Date.now()) {
        toast.error(`${timePickerFor === "fmod" ? "First" : "Last"} meal time can't be in the future`);
        return;
      }
      iso = d.toISOString();
    }
    const meal = timePickerFor;
    setTimePickerFor(null);
    if (packageKey === "foundation") {
      // Foundation tier: no Build-my-Plate flow — just record the meal time.
      setPendingMealISO(null);
      logMealTimeOnly(meal, iso);
      return;
    }
    if (packageKey === "intensive" || packageKey === "pro") {
      // Package 3 (Intensive/Pro): users don't build plates — they use their
      // pre-created 30-day plate plan. Log the meal time and send them to the
      // Diet tab where the plating calendar is shown.
      setPendingMealISO(null);
      logMealTimeOnly(meal, iso);
      window.dispatchEvent(new CustomEvent("nav:set-tab", { detail: "diet" }));
      return;
    }
    setPendingMealISO(iso);
    setPlateModalFor(meal);
  };


  const todayStr = todayKey;

  const loadSupplementData = async (userId: string) => {
    try {
      const [p, supps] = await Promise.all([fetchUserPlan(userId), fetchAllSupplements()]);
      setSuppPlan(p);
      setSuppList(supps);
      if (p) {
        const [planItems, todayT, history] = await Promise.all([
          fetchPlanItems(p.id),
          fetchTodayTracking(userId, todayStr),
          fetchTrackingHistory(userId, 90),
        ]);
        setSuppItems(planItems);
        setSuppTracking(todayT);
      } else {
        setSuppItems([]);
        setSuppTracking([]);
      }
    } catch {
      setSuppPlan(null);
      setSuppItems([]);
      setSuppTracking([]);
    }
  };

  const loadTodayMeals = async (userId: string) => {
    const today = getLocalDateKey();
    const startWindow = new Date();
    startWindow.setDate(startWindow.getDate() - 1);
    const endWindow = new Date();
    endWindow.setDate(endWindow.getDate() + 1);

    // Read from meal_photos (linked to FMOD/LMOD) and user_plates (any saved plate)
    const [{ data: photos }, { data: plates }] = await Promise.all([
      supabase
        .from("meal_photos" as any)
        .select("id, meal_type, logged_at, estimated_calories, photo_url, food_items")
        .eq("user_id", userId)
        .gte("logged_at", startWindow.toISOString())
        .lte("logged_at", endWindow.toISOString())
        .order("logged_at", { ascending: true }),
      supabase
        .from("user_plates" as any)
        .select("id, name, items, total_calories_kcal, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g, snapshot_url, created_at")
        .eq("user_id", userId)
        .gte("created_at", startWindow.toISOString())
        .lte("created_at", endWindow.toISOString())
        .order("created_at", { ascending: true }),
    ]);

    const sumMacro = (items: any[], key: string) =>
      items.reduce((s, it) => s + (Number(it[key]) || 0), 0);

    const photoRows = ((photos as any[]) ?? [])
      .filter((r) => toLocalDateKey(r.logged_at) === today)
      .map((r) => {
        const items = (r.food_items ?? []) as any[];
        return {
          id: r.id as string,
          meal_type: r.meal_type as string,
          logged_at: r.logged_at as string,
          estimated_calories: (r.estimated_calories ?? 0) as number,
          protein_g: sumMacro(items, "protein_g") || null,
          carbs_g: sumMacro(items, "carbs_g") || sumMacro(items, "carbs_max") || null,
          fat_g: sumMacro(items, "fat_g") || null,
          fiber_g: sumMacro(items, "fiber_g") || null,
          photo_url: (r.photo_url ?? null) as string | null,
          food_items: items,
        };
      });

    // Collect storage paths needing signed URLs (private bucket)
    const platePaths = ((plates as any[]) ?? [])
      .filter((p) => toLocalDateKey(p.created_at) === today && p.snapshot_url)
      .map((p) => p.snapshot_url as string);
    let signedMap: Record<string, string> = {};
    if (platePaths.length > 0) {
      const { data: signed } = await supabase
        .storage.from("plate-snapshots")
        .createSignedUrls(platePaths, 60 * 60 * 6);
      (signed ?? []).forEach((s: any) => {
        if (s?.path && s?.signedUrl) signedMap[s.path] = s.signedUrl;
      });
    }

    // Plates not already represented in photos (within 2 min window)
    const photoTimes = photoRows.map((p) => new Date(p.logged_at).getTime());
    const plateRows = ((plates as any[]) ?? [])
      .filter((p) => toLocalDateKey(p.created_at) === today)
      .filter((p) => {
        const t = new Date(p.created_at).getTime();
        return !photoTimes.some((pt) => Math.abs(pt - t) < 2 * 60 * 1000);
      })
      .map((p) => {
        const items = ((p.items ?? []) as any[]).map((it) => ({
          name: it.name,
          portion: it.serving_label ?? it.household_measure ?? "1 serving",
          calories: Math.round(Number(it.calories_kcal) || 0),
          protein_g: Number(it.protein_g) || 0,
          carbs_g: Number(it.carbs_max ?? it.carbs_min) || 0,
          fat_g: Number(it.fat_g) || 0,
        }));
        return {
          id: `plate-${p.id}` as string,
          meal_type: "plate" as string,
          logged_at: p.created_at as string,
          estimated_calories: Math.round(Number(p.total_calories_kcal) || 0),
          protein_g: p.total_protein_g != null ? Number(p.total_protein_g) : null,
          carbs_g: p.total_carbs_g != null ? Number(p.total_carbs_g) : null,
          fat_g: p.total_fat_g != null ? Number(p.total_fat_g) : null,
          fiber_g: p.total_fiber_g != null ? Number(p.total_fiber_g) : null,
          photo_url: p.snapshot_url ? (signedMap[p.snapshot_url] ?? null) : null,
          food_items: items,
        };
      });

    const merged = [...photoRows, ...plateRows].sort(
      (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
    );
    setTodayMeals(merged);
  };


  const handleSuppToggle = async (planItemId: string) => {
    if (!authUser) return;
    const existing = suppTracking.find((t) => t.plan_item_id === planItemId);
    const newVal = !existing?.taken;
    const suppMap = Object.fromEntries(suppList.map((s) => [s.id, s]));
    const item = suppItems.find((i) => i.id === planItemId);
    const suppName = item ? suppMap[item.supplement_id]?.name ?? "Supplement" : "Supplement";
    try {
      await toggleTracking(authUser.id, planItemId, todayStr, newVal);
      let updatedTracking: SupplementTracking[];
      if (existing) {
        updatedTracking = suppTracking.map((t) => t.plan_item_id === planItemId ? { ...t, taken: newVal } : t);
      } else {
        updatedTracking = [...suppTracking, { id: "", user_id: authUser.id, plan_item_id: planItemId, date: todayStr, taken: newVal, notes: null }];
      }
      setSuppTracking(updatedTracking);
      if (newVal) {
        const takenNow = updatedTracking.filter((t) => t.taken).length;
        const total = suppItems.length;
        if (takenNow === total) {
          toast.success("All supplements taken. Great job!", { duration: 3000 });
          // Check for badge awards
          fetchTrackingHistory(authUser.id, 90).then(history => {
            const { currentStreak, longestStreak } = calculateSupplementStreak(history, total);
            checkAndAwardSupplementBadges(authUser.id, currentStreak, longestStreak).then(newBadges => {
              for (const b of newBadges) {
                toast.success(`New badge: ${b.badge_name}`, { duration: 4000 });
              }
            });
          });
        } else {
          toast.success(`${suppName} taken (${takenNow}/${total})`, { duration: 2000 });
        }
      } else {
        toast("Unmarked " + suppName, { duration: 1500 });
      }
    } catch (e: any) { toast.error(e.message); }
  };


  useEffect(() => {
    if (fastingState === "fasting" && fastingStartTime && fastingTarget > 0) {
      const id = setInterval(() => {
        const h = (Date.now() - fastingStartTime.getTime()) / (1000 * 60 * 60);
        setFastingElapsedStatic(Math.round(h * 10) / 10);
        setFastingPhase(getPhaseInfo(h).phase);
      }, 30000);
      return () => clearInterval(id);
    }
  }, [fastingState, fastingStartTime, fastingTarget]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const formatMealStatusTime = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  // Auto-check fasting & supplements based on real state
  const isFastingDone = fastingState === "done" || (fmodDoneToday && lmodDoneToday);
  const allSuppsTaken = hasActiveSupplements && suppTakenCount >= suppTotalCount;

  const exerciseDone = completedExercisesToday >= EXERCISE_DAILY_GOAL;
  const yogaDone = yogaMinutesToday >= YOGA_DAILY_MINUTES;
  const autoHabits = [
    ...(isFastingDone ? ["fasting"] : []),
    ...(allSuppsTaken ? ["supplements"] : []),
    ...(movementDone ? ["movement"] : []),
    ...(exerciseDone ? ["exercise"] : []),
    ...(yogaDone ? ["yoga"] : []),
    ...(waterDone ? ["water"] : []),
    ...(hasTodayDiabetesLog ? ["diabetes"] : []),
  ];

  const allCheckedHabits = [...new Set([...checkedHabits, ...autoHabits])];
  const completedVisibleHabits = allCheckedHabits.filter(h => habits.some(vh => vh.id === h)).length;
  const displayedOverallStreak = Math.max(overallStreak, habits.length > 0 && completedVisibleHabits === habits.length ? 1 : 0);

  // Whenever any auto-habit flips, recompute the BBDO global streak in the DB
  // and tell the streak card to refresh. This keeps the heart <-> streak in sync
  // without any hardcoded values.
  const autoHabitSignature = autoHabits.slice().sort().join("|");
  useEffect(() => {
    if (!authUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        await (supabase as any).rpc("compute_global_streak_for_user", { _user_id: authUser.id });
        if (!cancelled) window.dispatchEvent(new CustomEvent("bbdo:streak-refresh"));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [authUser?.id, autoHabitSignature]);

  const toggleHabit = (id: string) => {
    // Don't allow manual toggle of auto habits
    const habit = habits.find((h) => h.id === id);
    if (habit?.auto) return;
    setCheckedHabits((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col gap-6 px-5 md:px-8 xl:px-10 pt-3 md:pt-6 pb-6">
      {/* Hero greeting — always user's first name. Coach appears as a small chip below. */}
      <motion.div
        className="pt-1 pb-1"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-[30px] sm:text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-foreground no-break">
          {greeting || "Good morning"}, {firstName} <span className="inline-block">👋</span>
        </h1>
        {coachName && (
          <button
            type="button"
            onClick={openCoachChat}
            className="mt-3 inline-flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full liquid-glass ring-1 ring-primary/15 hover:ring-primary/30 transition-all active:scale-[0.98]"
            aria-label={`Message your coach ${coachName}`}
          >
            {coachAvatar ? (
              <img
                src={coachAvatar}
                alt={coachName}
                className="w-7 h-7 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-[12px] font-black flex items-center justify-center">
                {coachName.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <span className="text-[12px] font-semibold text-foreground/85 leading-none">
              <span className="text-muted-foreground font-medium">Your coach · </span>{coachName}
            </span>
          </button>
        )}
      </motion.div>


      {/* BBDO Global Streak */}
      <GlobalStreakCard />

      {/* Override Alert — placed below the consistency streak so the greeting
          leads and the medical banner sits in-context with today's status. */}
      {overrideTriggered && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" strokeWidth={1.6} />
          <div>
            <p className="text-destructive font-bold text-sm">{t("medicalAlert")}</p>
            <p className="text-destructive/70 text-xs mt-0.5">{t("planMonitoring")}</p>
          </div>
        </motion.div>
      )}

      {/* Today's Yoga Class reminder */}
      <TodaysYogaClass />

      {/* Foundation-tier: highlight baseline lab test / body-map tap-through */}
      {packageKey === "foundation" && authUser?.id && (
        <FoundationLabCard userId={authUser.id} />
      )}




      {/* ─── Awaiting Coach Meeting banner (paid plans, no upcoming meeting) ─── */}
      {packageKey && packageKey !== "foundation" && !nextMeeting && !hasCompletedMeeting && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="liquid-glass rounded-3xl p-5 ring-1 ring-primary/20"
        >
          <div className="flex items-start gap-3">
            <motion.div
              animate={{ opacity: [1, 0.55, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="relative w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0"
            >
              <Calendar className="w-5 h-5 text-primary" strokeWidth={1.6} />
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-70 animate-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
              </span>
            </motion.div>
            <div className="flex-1 min-w-0">
              <motion.p
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary"
              >
                {hasAnyMeeting ? "Coach follow-up pending" : "Meeting coming in shortly"}
              </motion.p>
              <h3 className="text-base font-black text-foreground mt-1 leading-tight">
                {coachName ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openCoachDialog(null)}
                      className="underline decoration-primary/40 decoration-2 underline-offset-4 hover:decoration-primary transition-colors"
                    >
                      {coachName}
                    </button>{" "}will reach out
                  </>
                ) : "Your coach will reach out shortly"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Your one-on-one onboarding consultation is being scheduled. Your fasting protocol and personalised diet
                plan will be set during this session and will appear here right after.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Next Coach Meeting (when scheduled) — WhatsApp video call card ─── */}
      {packageKey && packageKey !== "foundation" && nextMeeting && (() => {
        const d = new Date(nextMeeting.scheduled_at);
        const callable = isMeetingCallable(nextMeeting.scheduled_at, nextMeeting.duration_min ?? 30);
        const hasPhone = !!nextMeeting.coach_phone;
        const canJoin = callable && hasPhone;
        const joinHref = canJoin
          ? whatsappCallUrl(nextMeeting.coach_phone!, `Hi ${nextMeeting.coach_name ?? "Coach"}, joining our scheduled call now.`)
          : undefined;
        const initial = (nextMeeting.coach_name || "C").trim().charAt(0).toUpperCase();
        const meetingLabel = nextMeeting.meeting_type.replace(/_/g, " ");
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-3xl p-5 liquid-glass ring-1 ring-emerald-500/25 overflow-hidden"
          >
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
            <div className="relative flex items-start gap-3">
              {nextMeeting.coach_avatar ? (
                <img
                  src={nextMeeting.coach_avatar}
                  alt={nextMeeting.coach_name ?? "Coach"}
                  className="w-12 h-12 rounded-2xl object-cover shrink-0 ring-1 ring-border"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-lg font-black flex items-center justify-center shrink-0">
                  {initial}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400 capitalize">
                  Upcoming · {meetingLabel}
                </p>
                <h3 className="text-base font-black mt-1 leading-tight text-foreground no-break">
                  {d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · {d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </h3>
                {nextMeeting.coach_name && (
                  <p className="text-xs text-muted-foreground mt-0.5">with {nextMeeting.coach_name}</p>
                )}
                {nextMeeting.agenda && (
                  <p className="text-xs text-foreground/70 mt-1.5 line-clamp-2">{nextMeeting.agenda}</p>
                )}
              </div>
            </div>

            {/* WhatsApp video call CTA — disabled until meeting is callable */}
            <a
              href={joinHref}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!canJoin}
              onClick={(e) => { if (!canJoin) e.preventDefault(); }}
              className={`relative mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all ${
                canJoin
                  ? "bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-lift active:scale-[0.99]"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-70"
              }`}
            >
              {/* WhatsApp glyph */}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.5 0 .2 5.3.2 11.85c0 2.09.55 4.13 1.6 5.93L0 24l6.4-1.68a11.83 11.83 0 0 0 5.65 1.44h.01c6.55 0 11.85-5.3 11.85-11.85 0-3.17-1.23-6.14-3.39-8.43ZM12.06 21.3h-.01a9.44 9.44 0 0 1-4.82-1.32l-.35-.21-3.8 1 .99-3.7-.23-.38a9.45 9.45 0 0 1-1.45-5.04c0-5.23 4.26-9.49 9.5-9.49 2.53 0 4.91.99 6.7 2.78a9.42 9.42 0 0 1 2.77 6.71c0 5.24-4.26 9.5-9.5 9.5Zm5.2-7.11c-.28-.14-1.68-.83-1.94-.93-.26-.09-.45-.14-.63.14-.19.28-.72.93-.88 1.12-.16.19-.32.21-.6.07-.28-.14-1.2-.44-2.28-1.41-.84-.75-1.41-1.68-1.58-1.96-.16-.28-.02-.44.12-.58.13-.13.28-.32.42-.48.14-.16.19-.28.28-.47.09-.19.05-.35-.02-.49-.07-.14-.63-1.52-.87-2.08-.23-.55-.46-.47-.63-.48h-.54c-.19 0-.49.07-.75.35-.26.28-.98.96-.98 2.35 0 1.39 1.01 2.74 1.15 2.93.14.19 1.99 3.04 4.83 4.26.68.29 1.2.46 1.61.59.68.22 1.29.19 1.78.11.54-.08 1.68-.69 1.92-1.35.24-.66.24-1.22.17-1.35-.07-.13-.26-.21-.54-.35Z" />
              </svg>
              {canJoin ? "Join WhatsApp Video Call" : "WhatsApp video link opens at start time"}
            </a>
          </motion.div>
        );
      })()}


      {/* ─── Daily activity heart (hero) — single source of truth for today's habits ─── */}
      {(() => {
        const suppTaken = suppTakenCount;
        const suppTotal = suppTotalCount;
        const fastingRatio = isFastingDone
          ? 1
          : fastingTarget > 0
            ? Math.min(1, fastingElapsedStatic / fastingTarget)
            : 0;
        const waterRatio = Math.min(1, waterGlasses / 8);
        const exerciseRatio = EXERCISE_DAILY_GOAL > 0
          ? Math.min(1, completedExercisesToday / EXERCISE_DAILY_GOAL)
          : 0;
        const yogaRatio = YOGA_DAILY_MINUTES > 0
          ? Math.min(1, yogaMinutesToday / YOGA_DAILY_MINUTES)
          : 0;
        const rings: HeartRingItem[] = [];
        if (fastingState !== "no_plan" && fastingState !== "loading") {
          rings.push({
            key: "fasting",
            label: "Fasting",
            ratio: fastingRatio,
            color: "#0F1A3D",
            hint: fastingTarget ? `${Math.min(fastingElapsedStatic, fastingTarget).toFixed(1)} / ${fastingTarget}h` : undefined,
          });
        }
        if (hasActiveSupplements) {
          rings.push({
            key: "supplements",
            label: "Supplements",
            ratio: suppTaken / suppTotal,
            color: "#F59E0B",
            hint: `${suppTaken} / ${suppTotal} taken`,
          });
        }
        rings.push({
          key: "movement",
          label: "Movement",
          ratio: movementRatio,
          color: "#10B981",
          hint: movementHint || undefined,
        });
        rings.push({
          key: "exercise",
          label: "Exercise",
          ratio: exerciseRatio,
          color: "#248CCB",
            hint: `${Math.min(completedExercisesToday, EXERCISE_DAILY_GOAL).toLocaleString("en-IN", { maximumFractionDigits: 1 })} / ${EXERCISE_DAILY_GOAL} min`,
        });
        // Yoga only if the user has a yoga booking on file OR a foundation-level plan expectation.
        rings.push({
          key: "yoga",
          label: "Yoga & Stress",
          ratio: yogaRatio,
          color: "#8B5CF6",
            hint: `${Math.min(yogaMinutesToday, YOGA_DAILY_MINUTES).toLocaleString("en-IN", { maximumFractionDigits: 1 })} / ${YOGA_DAILY_MINUTES} min`,
        });
        rings.push({
          key: "water",
          label: "Water",
          ratio: waterRatio,
          color: "#38BDF8",
          hint: `${waterGlasses} / 8 glasses`,
        });
        rings.push({
          key: "breath",
          label: "Breath Protocol",
          ratio: breathGoalToday > 0 ? Math.min(1, breathCountToday / breathGoalToday) : 0,
          color: "#EA6A5E",
          hint: `${Math.min(breathCountToday, breathGoalToday)} / ${breathGoalToday} sessions`,
        });
        rings.push({
          key: "soleus",
          label: "Soleus Push-Ups",
          ratio: soleusGoalToday > 0 ? Math.min(1, soleusCountToday / soleusGoalToday) : 0,
          color: "#B91C1C",
          hint: `${Math.min(soleusCountToday, soleusGoalToday)} / ${soleusGoalToday} rounds`,
        });
        if (hasDiabetesFlag) {
          rings.push({
            key: "diabetes",
            label: "Blood sugar log",
            ratio: hasTodayDiabetesLog ? 1 : 0,
            color: "#E00101",
            hint: hasTodayDiabetesLog ? "Logged today" : "Not logged yet",
          });
        }
        return <DailyActivityDial items={rings} title="Close your rings" size="lg" />;
      })()}

      {/* ─── Metric Rings: Health, Weight, Blood Glucose, BMI/Obesity ─── */}
      {(() => {
        const wForBmi = typeof latestWeight === "number" ? latestWeight : (typeof user.bodyMetrics?.weight === "number" ? user.bodyMetrics.weight : null);
        const hForBmi = typeof user.bodyMetrics?.height === "number" ? user.bodyMetrics.height : (typeof userHeightCm === "number" ? userHeightCm : null);
        const bmi = wForBmi && hForBmi && hForBmi > 0 ? +(wForBmi / Math.pow(hForBmi / 100, 2)).toFixed(1) : null;
        // WHO adult BMI: <18.5 Underweight, 18.5–24.9 Healthy, 25–29.9 Overweight, ≥30 Obese
        const bmiStatus = bmi == null
          ? "—"
          : bmi < 18.5 ? "Underweight"
          : bmi < 25 ? "Healthy"
          : bmi < 30 ? "Overweight"
          : "Obese";
        const bmiColor = bmi == null
          ? "hsl(var(--primary))"
          : bmi < 18.5 ? "var(--bbdo-amber)"
          : bmi < 25 ? "var(--bbdo-mint)"
          : bmi < 30 ? "var(--bbdo-amber)"
          : "var(--bbdo-red)";
        return (
          <div className="grid grid-cols-4 gap-2">
            <MetricRing
              value={healthScore}
              label="Health"
              delta={initialScore != null ? healthScore - initialScore : null}
              ringColor={getRingColor("Health", healthScore, initialScore)}
              dangerColor={getRingColor("Health", healthScore, initialScore)}
            />
            <MetricRing
              value={latestWeight ?? (user.bodyMetrics.weight ?? "—")}
              label="Weight"
              unit="kg"
              delta={initialWeight != null && latestWeight != null ? Math.round((latestWeight - initialWeight) * 10) / 10 : null}
              ringColor={getRingColor("Weight", typeof latestWeight === "number" ? latestWeight : (user.bodyMetrics.weight ?? NaN), initialWeight)}
              dangerColor={getRingColor("Weight", typeof latestWeight === "number" ? latestWeight : (user.bodyMetrics.weight ?? NaN), initialWeight)}
            />
            <MetricRing
              value={latestGlucose ?? "—"}
              label="Blood Glucose"
              unit="mg/dL"
              delta={initialGlucose != null && latestGlucose != null ? Math.round(latestGlucose - initialGlucose) : null}
              ringColor={getRingColor("Blood Glucose", typeof latestGlucose === "number" ? latestGlucose : NaN, initialGlucose)}
              dangerColor={getRingColor("Blood Glucose", typeof latestGlucose === "number" ? latestGlucose : NaN, initialGlucose)}
            />
            <BmiTile bmi={bmi} status={bmiStatus} color={bmiColor} />
          </div>
        );
      })()}


      {/* Health Markers from lab reports */}
      



      {/* ─── Achievement Share Prompt ─── */}
      {sharePrompt && (
        <motion.div
          className="liquid-glass rounded-3xl p-5 border border-primary/30"
          initial={{ opacity: 0, y: 15, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full gradient-blue flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-foreground font-bold text-sm">
                {sharePrompt.type === "weight" ? "Weight going down!" : sharePrompt.type === "sugar" ? "Sugar improving!" : "Health score up!"}
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                {sharePrompt.type === "weight"
                  ? `You've lost ${Math.abs(sharePrompt.delta).toFixed(1)} kg since joining!`
                  : sharePrompt.type === "sugar"
                  ? `Your glucose dropped by ${Math.abs(sharePrompt.delta)} mg/dL!`
                  : `Your health score improved by +${sharePrompt.delta} points!`}
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">Would you like to share this win with the community?</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={async () => {
                if (!authUser) return;
                const content = generateAchievementContent(sharePrompt.type, {
                  before: sharePrompt.before,
                  after: sharePrompt.after,
                  delta: sharePrompt.delta,
                });
                await createPost(authUser.id, content, "achievement", {
                  type: sharePrompt.type,
                  before: sharePrompt.before,
                  after: sharePrompt.after,
                  delta: sharePrompt.delta,
                });
                toast.success("Shared with the community");
                setSharePrompt(null);
              }}
              className="flex-1 gradient-blue text-primary-foreground font-bold py-2.5 rounded-xl text-sm"
            >
              Share with Community
            </button>
            <button
              onClick={() => setSharePrompt(null)}
              className="px-4 py-2.5 rounded-xl liquid-glass text-muted-foreground text-sm font-medium"
            >
              Later
            </button>
          </div>
        </motion.div>
      )}


      {/* ─── Fasting Card ─── */}
      {fastingState === "loading" ? (
        <motion.div
          className="liquid-glass rounded-3xl p-5 relative overflow-hidden"
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-muted/50 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-muted/50 animate-pulse" />
              <div className="h-2 w-48 rounded bg-muted/40 animate-pulse" />
            </div>
          </div>
          <div className="h-20 rounded-2xl bg-muted/30 animate-pulse" />
        </motion.div>
      ) : fastingState === "no_plan" ? (
        <motion.div
          className="liquid-glass rounded-2xl p-3.5 relative overflow-hidden"
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Timer className="w-4 h-4 text-primary" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <p className="text-foreground font-bold text-[13px] leading-tight">
                {packageKey === "foundation" ? "Start your fasting journey" : "Awaiting meeting with your coach"}
              </p>
              <p className="text-muted-foreground text-[10px] font-medium">
                {packageKey === "foundation" ? "Pick a plan to begin 24 weeks" : "Your coach will assign your protocol"}
              </p>
            </div>
          </div>
          {packageKey === "foundation" ? (
            <div className="mt-3 space-y-1.5">
              {availableProtos.map((p) => {
                const isStarting = startingProtoId === p.id;
                return (
                  <div key={p.id} className="rounded-xl bg-muted/40 p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-foreground truncate">{p.protocol_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{p.total_weeks}w · 12:12 start</p>
                    </div>
                    <button
                      onClick={() => handleStartProtocol(p.id)}
                      disabled={isStarting}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-[11px] shrink-0 disabled:opacity-60"
                    >
                      {isStarting ? "…" : "Start"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-xl bg-primary/5 border border-primary/15 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
              Your coach will design a fasting protocol tailored to your health markers during your first 1:1 session.
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div
          className="liquid-glass rounded-3xl p-5 relative overflow-hidden"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.08), transparent 70%)" }} />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                {fastingState === "fasting" ? (
                  <Flame className="w-5 h-5 text-primary" strokeWidth={1.6} />
                ) : fastingState === "eating" ? (
                  <UtensilsCrossed className="w-5 h-5 text-primary" strokeWidth={1.6} />
                ) : (
                  <Timer className="w-5 h-5 text-primary" strokeWidth={1.6} />
                )}
              </div>
              <div>
                <span className="text-foreground font-bold text-sm">
                  {fastingState === "fasting" ? "Fasting Active" :
                   fastingState === "eating" ? "First Meal Tracked" :
                   fastingState === "done" ? "Fast Complete" :
                   "Today's Fast"}
                </span>
                <p className="text-muted-foreground text-[10px] font-medium">{fastingLabel}</p>
              </div>
            </div>
            {fastingState === "fasting" && (
              <span className="px-3 py-1.5 rounded-xl bg-primary/15 text-primary font-bold text-xs">{fastingPhase}</span>
            )}
            {fastingState === "done" && (
              <span className="px-3 py-1.5 rounded-xl bg-primary/15 text-primary font-bold text-xs">Done</span>
            )}
          </div>

          <div className="flex items-end justify-between mb-3">
            <div>
              {fastingState === "none" ? (
                <div>
                  <span className="text-muted-foreground text-sm font-medium">
                    Schedule: FMOD {weekPlanFmod ?? "—"} · LMOD {weekPlanLmod ?? "—"}
                    {fastingTarget > 0 && ` · ${fastingTarget}h fast`}
                  </span>
                </div>
              ) : fastingState === "done" ? (
                <span className="text-lg font-black text-primary">Fast complete</span>
              ) : fastingStartTime ? (
                <HomeLiveTimer startTime={fastingStartTime} className="text-4xl text-primary" />
              ) : null}
              {fastingState === "fasting" && fastingTarget > 0 && (
                <span className="text-muted-foreground text-xs ml-2">/ {fastingTarget}h target</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {fastingState === "none" && (
            <button
              onClick={() => openMealTimePicker("fmod")}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2"
            >
              <UtensilsCrossed className="w-4 h-4" />
              {packageKey === "foundation"
                ? "Log first meal (FMOD)"
                : packageKey === "intensive" || packageKey === "pro"
                ? "Track FMOD — View my plate"
                : "Track FMOD — Build my plate"}
            </button>
          )}
          {fastingState === "eating" && (() => {
            const readyLabel = packageKey === "foundation"
              ? "Log last meal (LMOD)"
              : packageKey === "intensive" || packageKey === "pro"
              ? "Track LMOD — View my plate"
              : "Track LMOD — Build my plate";
            return (
              <button
                onClick={() => openMealTimePicker("lmod")}
                className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2"
              >
                <UtensilsCrossed className="w-4 h-4" />
                {readyLabel}
              </button>
            );
          })()}
          {fastingState === "fasting" && (
            <div className="space-y-2">
              {fastingTrackDate && fastingTrackDate !== todayKey && fastingStartTime ? (() => {
                const elapsedH = (Date.now() - fastingStartTime.getTime()) / (1000 * 60 * 60);
                const canBreak = fastingTarget > 0 && elapsedH >= fastingTarget;
                const remainingH = Math.max(0, fastingTarget - elapsedH);
                const h = Math.floor(remainingH);
                const m = Math.floor((remainingH - h) * 60);
                return (
                  <button
                    onClick={() => canBreak && openMealTimePicker("fmod")}
                    disabled={!canBreak}
                    className={`w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 ${canBreak ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
                  >
                    <UtensilsCrossed className="w-4 h-4" />
                    {canBreak ? "Log first meal (FMOD)" : `FMOD unlocks in ${h}h ${m}m`}
                  </button>
                );
              })() : (
                <p className="text-[11px] text-muted-foreground text-center">
                  Fasting in progress — log tomorrow's first meal to end it.
                </p>
              )}
            </div>
          )}
          {(fastingState === "none" || fastingState === "eating") && (
            <button
              onClick={() => {
                const isPrebuilt = packageKey === "intensive" || packageKey === "pro";
                try {
                  if (!isPrebuilt) localStorage.setItem("bbdo:openReference", "1");
                } catch {}
                window.dispatchEvent(new CustomEvent("nav:set-tab", { detail: "diet" }));
              }}
              className="mt-2 w-full py-2 text-xs font-semibold text-primary underline-offset-2 hover:underline flex items-center justify-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {packageKey === "intensive" || packageKey === "pro"
                ? "Eat Smart · 30-day plate plan"
                : "View Quick Food Reference"}
            </button>
          )}

          {/* FMOD / LMOD sub-status */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-semibold">
            <div className={`rounded-xl px-3 py-2 ${fmodDoneToday ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"}`}>
              <span className="flex items-center gap-1">
                <Check className={`w-3 h-3 ${fmodDoneToday ? "opacity-100" : "opacity-30"}`} /> FMOD
              </span>
              <span className="mt-0.5 block text-[10px] font-medium">
                {fmodDoneToday ? formatMealStatusTime(fmodLoggedAt) : (weekPlanFmod ? `Target ${weekPlanFmod}` : "Pending")}
              </span>
            </div>
            <div className={`rounded-xl px-3 py-2 ${lmodDoneToday ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"}`}>
              <span className="flex items-center gap-1">
                <Check className={`w-3 h-3 ${lmodDoneToday ? "opacity-100" : "opacity-30"}`} /> LMOD
              </span>
              <span className="mt-0.5 block text-[10px] font-medium">
                {lmodDoneToday ? formatMealStatusTime(lmodLoggedAt) : weekPlanLmod ? `Target ${weekPlanLmod}` : "Pending"}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Today's Intake — calories & macros from logged plates */}
      {todayMeals.length > 0 && (() => {
        const totalKcal = todayMeals.reduce((s, m) => s + (m.estimated_calories || 0), 0);
        const totalProtein = Math.round(todayMeals.reduce((s, m) => s + (m.protein_g || 0), 0));
        const totalCarbs = Math.round(todayMeals.reduce((s, m) => s + (m.carbs_g || 0), 0));
        const totalFat = Math.round(todayMeals.reduce((s, m) => s + (m.fat_g || 0), 0));
        const totalFiber = Math.round(todayMeals.reduce((s, m) => s + (m.fiber_g || 0), 0));
        return (
          <motion.div
            className="liquid-glass rounded-3xl p-5"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-primary" strokeWidth={1.6} />
                <span className="text-foreground font-bold text-sm">Today's Intake</span>
              </div>
              <div className="text-right">
                <p className="text-primary font-black stat-number text-base leading-none">{totalKcal}</p>
                <p className="text-[9px] text-muted-foreground font-medium">kcal</p>
              </div>
            </div>

            {/* Macro totals row */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: "Protein", val: totalProtein, unit: "g", color: "text-primary" },
                { label: "Carbs", val: totalCarbs, unit: "g", color: "text-foreground" },
                { label: "Fat", val: totalFat, unit: "g", color: "text-foreground" },
                { label: "Fiber", val: totalFiber, unit: "g", color: "text-success" },
              ].map((m) => (
                <div key={m.label} className="rounded-xl bg-primary/5 px-2 py-2 text-center">
                  <p className={`stat-number text-sm font-black leading-none ${m.color}`}>{m.val}<span className="text-[9px] font-medium text-muted-foreground ml-0.5">{m.unit}</span></p>
                  <p className="text-[9px] text-muted-foreground font-medium mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {todayMeals.map((m) => {
                const time = new Date(m.logged_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
                const label = m.meal_type === "fmod" ? "First Meal" : m.meal_type === "lmod" ? "Last Meal" : m.meal_type === "plate" ? "Plate" : m.meal_type;
                const items = (m.food_items ?? []).slice(0, 3).map((it: any) => it.name).filter(Boolean).join(" · ");
                const macroLine = [
                  `${m.estimated_calories} kcal`,
                  m.protein_g ? `${Math.round(m.protein_g)}g P` : null,
                  m.carbs_g ? `${Math.round(m.carbs_g)}g C` : null,
                  m.fat_g ? `${Math.round(m.fat_g)}g F` : null,
                  m.fiber_g ? `${Math.round(m.fiber_g)}g fiber` : null,
                ].filter(Boolean).join(" · ");
                return (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-primary/5">
                    {m.photo_url ? (
                      <img
                        src={m.photo_url}
                        alt={label}
                        className="w-12 h-12 rounded-xl object-cover shrink-0 bg-primary/10"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <UtensilsCrossed className="w-5 h-5 text-primary" strokeWidth={1.6} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-foreground text-xs font-bold">{label}</p>
                        <p className="text-muted-foreground text-[10px]">{time}</p>
                      </div>
                      <p className="text-muted-foreground text-[10px] truncate mt-0.5">{items || "—"}</p>
                      <p className="text-primary text-[11px] font-bold mt-0.5">{macroLine}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        );
      })()}


      {/* Meal time picker — choose when the meal actually happened */}
      {timePickerFor && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--nav-h, 0px) + 12px)" }}
          onClick={() => setTimePickerFor(null)}
        >
          <div
            className="bg-background rounded-2xl p-5 w-full max-w-sm shadow-lift max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-foreground mb-1">
              When did you have your {timePickerFor === "fmod" ? "first meal" : "last meal"}?
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {packageKey === "foundation"
                ? "Pick the actual time to log this meal."
                : packageKey === "intensive" || packageKey === "pro"
                ? "Pick the actual time, then view your 30-day plate."
                : "Pick the actual time, then build your plate."}
            </p>
            <input
              type="time"
              value={timePickerValue}
              onChange={(e) => setTimePickerValue(e.target.value)}
              className="w-full h-12 rounded-xl border border-[var(--bbdo-line)] bg-white px-4 text-base text-foreground focus:outline-none focus:border-[var(--bbdo-blue)] focus:ring-2 focus:ring-[var(--bbdo-blue)]/30"
            />
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => confirmMealTime(false)}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
              >
                {packageKey === "foundation"
                  ? "Log meal"
                  : packageKey === "intensive" || packageKey === "pro"
                  ? "Continue → View my plate"
                  : "Continue → Build my plate"}
              </button>
              <button
                onClick={() => setTimePickerFor(null)}
                className="w-full py-2 text-xs text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Build-my-plate overlay for FMOD/LMOD */}
      {plateModalFor && (
        <BuildMyPlate
          onClose={() => { setPlateModalFor(null); setPendingMealISO(null); }}
          onSaved={handlePlateSavedForMeal}
        />
      )}


      {/* ─── Today's Steps / Movement Card ─── */}
      <TodayStepsCard onOpenMovement={() => {
        const evt = new CustomEvent("nav:set-tab", { detail: "habits" });
        window.dispatchEvent(evt);
      }} />

      {/* ─── Apple Health snapshot ─── */}
      <AppleHealthSnapshotCard />

      {/* ─── Last night's sleep breakdown ─── */}
      <SleepBreakdownCard />

      {/* ─── Apple Watch ECG ─── */}
      <AppleHealthEcgCard />


      {/* ─── Apple Health 30-day trends ─── */}
      <HealthTrendsCard days={30} />




      {/* ─── Supplement Tracker Card ─── */}
      {suppPlan && suppItems.length > 0 && (() => {
        const suppMap = Object.fromEntries(suppList.map((s) => [s.id, s]));
        const takenCount = suppTracking.filter((t) => t.taken).length;
        const totalSupps = suppItems.length;

        // Group by timing
        const timingGroups: Record<string, { item: PlanItem; supp: SupplementType | undefined }[]> = {};
        for (const item of suppItems) {
          const timing = item.timing ?? "with meal";
          if (!timingGroups[timing]) timingGroups[timing] = [];
          timingGroups[timing].push({ item, supp: suppMap[item.supplement_id] });
        }

        return (
          <motion.div
            className="liquid-glass rounded-3xl p-5 relative overflow-hidden"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Pill className="w-5 h-5 text-primary" strokeWidth={1.6} />
                </div>
                <div>
                  <span className="text-foreground font-bold text-sm">Today's Supplements</span>
                  <p className="text-muted-foreground text-[10px] font-medium">{takenCount}/{totalSupps} taken</p>
                </div>
              </div>
              <span className={`px-3 py-1.5 rounded-xl font-bold text-xs ${
                takenCount === totalSupps ? "bg-primary/15 text-primary" :
                takenCount > 0 ? "bg-warning-soft text-warning" :
                "bg-muted text-muted-foreground"
              }`}>
                {takenCount === totalSupps ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" strokeWidth={2.4} /> All Done</span> : `${totalSupps - takenCount} remaining`}
              </span>
            </div>

            <div className="space-y-3">
              {Object.entries(timingGroups).map(([timing, groupItems]) => (
                <div key={timing}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                    <SupplementTimingIcon timing={timing} /> {timing}
                  </p>
                  <div className="space-y-1">
                   {groupItems.map(({ item, supp }) => {
                      const taken = suppTracking.find((t) => t.plan_item_id === item.id)?.taken ?? false;
                      return (
                        <motion.button
                          key={item.id}
                          onClick={() => handleSuppToggle(item.id)}
                          className={`w-full flex items-center gap-2.5 p-3 rounded-xl transition-colors text-left ${
                            taken ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/50 hover:bg-muted"
                          }`}
                          whileTap={{ scale: 0.98 }}
                          layout
                        >
                          <motion.div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              taken ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "border-2 border-border"
                            }`}
                            animate={taken ? { scale: [1, 1.2, 1] } : {}}
                            transition={{ duration: 0.3 }}
                          >
                            {taken ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />}
                          </motion.div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold transition-colors ${taken ? "text-primary/70 line-through" : "text-foreground"}`}>
                              {supp?.name ?? "Supplement"}
                            </p>
                            <p className="text-[9px] text-muted-foreground">{item.dosage} · {item.frequency}</p>
                          </div>
                          {taken && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full"
                            >
                              <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" strokeWidth={2.4} /> Done</span>
                            </motion.span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        );
      })()}

      {/* ─── Diabetes Check-in Card ─── */}
      <motion.div
        className="liquid-glass rounded-2xl p-3.5 relative overflow-hidden"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.27 }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-primary" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <span className="text-foreground font-bold text-[13px]">Diabetes Check-in</span>
              <p className="text-muted-foreground text-[10px] font-medium">
                {diabetesMorningDone && diabetesEveningDone ? "2/2 logged" : diabetesMorningDone || diabetesEveningDone ? "1/2 logged" : "0/2 logged"}
              </p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-lg font-bold text-[10px] shrink-0 ${
            diabetesMorningDone && diabetesEveningDone ? "bg-primary/15 text-primary" :
            diabetesMorningDone || diabetesEveningDone ? "bg-warning-soft text-warning" :
            "bg-muted text-muted-foreground"
          }`}>
            {diabetesMorningDone && diabetesEveningDone ? "Complete" : diabetesMorningDone || diabetesEveningDone ? "Partial" : "Pending"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DiabetesSlot
            slot="morning"
            done={diabetesMorningDone}
            value={diabetesMorningValue}
            userId={authUser?.id}
          />
          <DiabetesSlot
            slot="evening"
            done={diabetesEveningDone}
            value={diabetesEveningValue}
            userId={authUser?.id}
          />
        </div>
      </motion.div>

      {/* Metric cards removed — deltas now surface directly on the Health / Weight / Blood Glucose rings above. */}



      {/* Today's Habits card removed — the "Complete your heart" hero is now the single source of truth. */}

      {/* Package status moved to left sidebar (above Sign Out) */}

      <CoachSummaryDialog
        open={coachDialogOpen}
        onOpenChange={setCoachDialogOpen}
        coachId={coachDialogCoachId}
        userId={authUser?.id ?? null}
      />

    </div>
  );
}


function DiabetesSlot({
  slot,
  done,
  value,
  userId,
}: {
  slot: "morning" | "evening";
  done: boolean;
  value: number | null;
  userId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const label = slot === "morning" ? "Morning" : "Evening";
  const SlotIcon = slot === "morning" ? Timer : Activity;

  async function save() {
    const num = parseFloat(val);
    if (!num || !Number.isFinite(num)) {
      toast.error("Enter a valid value");
      return;
    }
    if (!userId) return;
    setSaving(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.from("health_logs" as any).insert({
        user_id: userId,
        log_type: "diabetes",
        logged_at: new Date().toISOString(),
        glucose_morning: slot === "morning" ? num : null,
        glucose_evening: slot === "evening" ? num : null,
      });
      if (error) throw error;
      toast.success(`${slot === "morning" ? "Morning" : "Evening"} glucose saved`);
      setEditing(false);
      setVal("");
      window.dispatchEvent(new CustomEvent("health-log-saved"));
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`p-2.5 rounded-xl transition-colors border ${editing ? "col-span-2" : ""} ${
      done ? "bg-primary/10 border-primary/25" : "bg-card border-border"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
          done ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        }`}>
          {done ? <Check className="w-3.5 h-3.5" strokeWidth={2} /> : <SlotIcon className="w-3.5 h-3.5" strokeWidth={2} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-bold leading-tight ${done ? "text-primary" : "text-foreground"}`}>
            {label}
          </p>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5 truncate">
            {done ? `${value} mg/dL` : "Add glucose"}
          </p>
        </div>
      </div>
      {!done && (
        editing ? (
          <div className="space-y-2.5">
            <label className="block rounded-2xl bg-muted/45 px-4 py-4 focus-within:ring-2 focus-within:ring-primary/25">
              <div className="flex flex-col items-center justify-center gap-1 min-h-[84px]">
                <input
                  inputMode="decimal"
                  type="number"
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  placeholder="112"
                  className="no-number-spinner w-full min-w-0 bg-transparent text-center text-5xl leading-none font-black tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30"
                />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide shrink-0">mg/dL</span>
              </div>
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="no-pill h-11 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setVal("");
                }}
                className="no-pill h-11 px-3 rounded-xl bg-muted text-muted-foreground text-xs font-bold uppercase active:scale-[0.98] transition-transform"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="no-pill w-full h-9 rounded-lg bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center gap-1 active:scale-[0.98] transition-transform"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Add reading
          </button>
        )
      )}
    </div>
  );
}