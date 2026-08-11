import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Timer, Clock, Flame, Droplets, Coffee, AlertTriangle,
  Check, Zap, Play, Square, Shield, Award, Trophy, UtensilsCrossed,
  Camera, Loader2, ImageIcon, Lock, Moon, X, Minus
} from "lucide-react";
import {
  uploadMealPhoto, fileToBase64, analyzeFood, saveMealPhotoRecord,
  getTodayCalories, type FoodItem, type FoodAnalysis
} from "@/lib/mealPhotoService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchUserProtocol, fetchWeeklyPlans, fetchProtocols, upsertTracking,
  fetchTrackingForUser, getCurrentWeek, getCurrentDay,
  getPhaseInfo, formatTime24to12, assignProtocolToUser,
  type UserProtocol, type WeeklyPlan, type FastingProtocol, type FastingTracking
} from "@/lib/fastingService";
import {
  calculateStreak, checkAndAwardBadges, fetchBadgeDefinitions,
  fetchUserBadges, getBadgeLevel, type FastingBadge, type UserFastingBadge
} from "@/lib/streakService";
import FastingMilestoneProgress from "@/components/fasting/FastingMilestoneProgress";
import ExpertConnectBar from "@/components/support/ExpertConnectBar";

/* ── Live elapsed timer ── */
function LiveTimer({ startTime, className = "" }: { startTime: Date; className?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const hours = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <span className={`font-mono font-black tabular-nums ${className}`}>
      {pad(hours)}:{pad(mins)}:{pad(secs)}
    </span>
  );
}

/* ── Countdown timer ── */
function CountdownTimer({ targetTime, className = "" }: { targetTime: Date; className?: string }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.floor((targetTime.getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTime]);

  const hours = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <span className={`font-mono font-black tabular-nums ${className}`}>
      {pad(hours)}:{pad(mins)}:{pad(secs)}
    </span>
  );
}

/* ── Time picker modal ── */
function TimePicker({
  onSelect,
  onCancel,
  label,
}: {
  onSelect: (hour: number, minute: number) => void;
  onCancel: () => void;
  label: string;
}) {
  const now = new Date();
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(Math.floor(now.getMinutes() / 5) * 5);
  const fmt12 = (h: number) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12} ${ampm}`;
  };

  return (
    <motion.div
      className="liquid-glass rounded-3xl p-6 space-y-4"
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
    >
      <p className="text-sm font-bold text-foreground text-center">{label}</p>
      <div className="flex items-center justify-center gap-4">
        {/* Hour */}
        <div className="flex flex-col items-center gap-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Hour</label>
          <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
            <SelectTrigger className="w-[110px] rounded-xl bg-muted text-lg font-bold justify-center border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl max-h-[240px]">
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={String(i)} className="rounded-lg text-sm font-semibold">{fmt12(i)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-2xl font-bold text-muted-foreground mt-5">:</span>
        {/* Minute */}
        <div className="flex flex-col items-center gap-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Min</label>
          <Select value={String(minute)} onValueChange={(v) => setMinute(Number(v))}>
            <SelectTrigger className="w-[90px] rounded-xl bg-muted text-lg font-bold justify-center border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl max-h-[240px]">
              {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                <SelectItem key={m} value={String(m)} className="rounded-lg text-sm font-semibold">{m.toString().padStart(2, "0")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Selected: <span className="font-bold text-foreground">{fmt12(hour)}:{minute.toString().padStart(2, "0")}</span>
      </p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-2xl liquid-glass text-foreground font-semibold text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => onSelect(hour, minute)}
          className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm"
        >
          Confirm
        </button>
      </div>
    </motion.div>
  );
}

/* ── Meal Photo Capture ── */
function MealPhotoCapture({
  preview,
  onSelect,
  onClear,
  analyzing,
}: {
  preview: string | null;
  onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  analyzing: boolean;
}) {
  return (
    <div className="space-y-2">
      {preview ? (
        <div className="relative inline-block">
          <img src={preview} alt="Meal" className="w-24 h-24 rounded-2xl object-cover mx-auto border-2 border-primary/30" />
          {analyzing ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded-2xl">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : (
            <button
              onClick={onClear}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.4} />
            </button>
          )}
        </div>
      ) : (
        <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-accent cursor-pointer transition-colors mx-auto w-fit text-sm text-muted-foreground font-medium">
          <Camera className="w-4 h-4" />
          <span>Snap your meal</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onSelect}
            className="hidden"
          />
        </label>
      )}
      <p className="text-[10px] text-muted-foreground">Optional — AI estimates calories from your food photo</p>
    </div>
  );
}

export default function UserFasting({ packageKey }: { packageKey?: string | null } = {}) {
  const { user } = useAuth();
  const [userProto, setUserProto] = useState<UserProtocol | null>(null);
  const [protocol, setProtocol] = useState<FastingProtocol | null>(null);
  const [weekPlan, setWeekPlan] = useState<WeeklyPlan | null>(null);
  const [tracking, setTracking] = useState<FastingTracking[]>([]);
  const [todayTracking, setTodayTracking] = useState<FastingTracking | null>(null);
  const [yesterdayFasting, setYesterdayFasting] = useState<FastingTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [availableProtos, setAvailableProtos] = useState<FastingProtocol[]>([]);
  const [startingProtoId, setStartingProtoId] = useState<string | null>(null);

  // Meal photo state
  const [mealPhotoFile, setMealPhotoFile] = useState<File | null>(null);
  const [mealPhotoPreview, setMealPhotoPreview] = useState<string | null>(null);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [todayCalories, setTodayCalories] = useState<{ total: number; meals: { type: string; calories: number; foodItems: FoodItem[] }[] }>({ total: 0, meals: [] });

  // Badge/streak state
  const [allBadges, setAllBadges] = useState<FastingBadge[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<UserFastingBadge[]>([]);
  const [streak, setStreak] = useState({ currentStreak: 0, longestStreak: 0 });

  const today = new Date().toISOString().split("T")[0];

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const up = await fetchUserProtocol(user.id);
      setUserProto(up);

      const [badgeDefs, userBadges] = await Promise.all([
        fetchBadgeDefinitions(),
        fetchUserBadges(user.id),
      ]);
      setAllBadges(badgeDefs);
      setEarnedBadges(userBadges);

      if (up) {
        const protos = await fetchProtocols();
        setAvailableProtos(protos);
        const p = protos.find((pr) => pr.id === up.protocol_id) ?? null;
        setProtocol(p);

        const week = getCurrentWeek(up.start_date);
        const plans = await fetchWeeklyPlans(up.protocol_id);
        const wp = plans.find((w) => w.week_number === week) ?? null;
        setWeekPlan(wp);

        const t = await fetchTrackingForUser(user.id, 60);
        setTracking(t);
        const todayEntry = t.find((tr) => tr.date === today) ?? null;
        setTodayTracking(todayEntry);

        // Fasting window is LMOD (yesterday) → FMOD (today). If yesterday's LMOD
        // exists and the fast wasn't completed, the user is currently fasting.
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
        const yTrack = t.find((tr) => tr.date === yKey) ?? null;
        setYesterdayFasting(
          yTrack?.lmod_actual_time && !yTrack.fasting_hours_completed ? yTrack : null
        );

        const s = calculateStreak(t);
        setStreak(s);

        const newBadges = await checkAndAwardBadges(user.id, s.currentStreak, s.longestStreak);
        if (newBadges.length > 0) {
          for (const b of newBadges) {
            toast.success(`New badge: ${b.badge_name}`, { duration: 5000 });
          }
          const updated = await fetchUserBadges(user.id);
          setEarnedBadges(updated);
        }
      } else {
        // No protocol yet — load available protocols so Foundation users can pick one.
        try {
          const protos = await fetchProtocols();
          setAvailableProtos(protos);
        } catch {}
      }
      // Load today's calorie data
      getTodayCalories(user.id).then(setTodayCalories).catch(() => {});
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [user, today]);

  useEffect(() => { load(); }, [load]);

  /* ── Derived state ── */
  const eatingWindowHours = weekPlan ? parseInt(weekPlan.fasting_pattern.split(":")[1]) : 12;
  const fastingHours = weekPlan ? parseInt(weekPlan.fasting_pattern.split(":")[0]) : 12;

  // Parse FMOD/LMOD from today's tracking. Ignore impossible future rows so
  // backfilled/test data cannot close today's live fasting window.
  const nowMs = Date.now();
  const rawFmodTime = todayTracking?.fmod_actual_time ? new Date(todayTracking.fmod_actual_time) : null;
  const fmodTime = rawFmodTime && rawFmodTime.getTime() <= nowMs ? rawFmodTime : null;
  // Has LMOD been logged?
  const rawLmodTime = todayTracking?.lmod_actual_time ? new Date(todayTracking.lmod_actual_time) : null;
  const lmodTime = rawLmodTime && rawLmodTime.getTime() <= nowMs && (!fmodTime || rawLmodTime.getTime() > fmodTime.getTime()) ? rawLmodTime : null;
  const lmodLogged = !!lmodTime;

  // Yesterday's LMOD → today's FMOD is the fasting window. If yesterday's LMOD
  // is logged and today's FMOD isn't yet, the user is currently fasting.
  const yLmodTime = yesterdayFasting?.lmod_actual_time ? new Date(yesterdayFasting.lmod_actual_time) : null;
  const isCarryFasting = !!yLmodTime && !fmodTime;

  // Determine phase
  const isFmodTracked = !!fmodTime;
  // Eating window = FMOD → LMOD (today). Users may take SMOD and skip LMOD, so
  // "Track LMOD" is available anytime after FMOD, not gated by the countdown.
  const isEatingWindow = isFmodTracked && !lmodLogged;
  const isFastingActive = (lmodLogged && !todayTracking?.fasting_hours_completed) || isCarryFasting;
  const isFastComplete = !!todayTracking?.fasting_hours_completed && todayTracking.compliance_status === "completed";

  // Active fast started at: yesterday's LMOD (carry) or today's LMOD.
  const activeFastStart = isCarryFasting ? yLmodTime : lmodTime;
  const elapsedFastingHours = activeFastStart
    ? (Date.now() - activeFastStart.getTime()) / (1000 * 60 * 60)
    : 0;
  const phase = getPhaseInfo(elapsedFastingHours);

  /* ── Photo handling ── */
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMealPhotoFile(file);
    const url = URL.createObjectURL(file);
    setMealPhotoPreview(url);
  };

  const clearPhoto = () => {
    setMealPhotoFile(null);
    setMealPhotoPreview(null);
  };

  const processPhotoAndSave = async (mealType: "fmod" | "lmod") => {
    if (!user || !mealPhotoFile) return;
    setAnalyzingPhoto(true);
    try {
      const [base64, photoUrl] = await Promise.all([
        fileToBase64(mealPhotoFile),
        uploadMealPhoto(user.id, mealPhotoFile, mealType),
      ]);
      const analysis = await analyzeFood(base64, mealType);
      await saveMealPhotoRecord({
        userId: user.id,
        mealType,
        photoUrl,
        estimatedCalories: analysis.total_calories,
        foodItems: analysis.food_items,
      });
      toast.success(`📸 ~${analysis.total_calories} cal estimated`, { duration: 3000 });
      clearPhoto();
      getTodayCalories(user.id).then(setTodayCalories).catch(() => {});
    } catch (e: any) {
      console.error("Photo analysis error:", e);
      toast.error("Could not analyze photo. Meal still tracked.");
      clearPhoto();
    }
    setAnalyzingPhoto(false);
  };

  /* ── Actions ── */
  const trackFMOD = async (hour: number, minute: number) => {
    if (!user) return;
    const fmodDate = new Date();
    fmodDate.setHours(hour, minute, 0, 0);
    if (fmodDate.getTime() > Date.now()) {
      toast.error("First meal time can't be in the future");
      return;
    }
    setShowTimePicker(false);
    try {
      await upsertTracking({
        user_id: user.id,
        date: today,
        fmod_actual_time: fmodDate.toISOString(),
        compliance_status: "pending",
      });

      // If a fast from yesterday is still open (LMOD → today's FMOD), close it
      // now that the user has broken the fast with their first meal.
      if (yesterdayFasting && yLmodTime) {
        const hoursFasted = (fmodDate.getTime() - yLmodTime.getTime()) / (1000 * 60 * 60);
        const compliance = hoursFasted >= fastingHours * 0.9 ? "completed" : hoursFasted >= fastingHours * 0.5 ? "partial" : "missed";
        await upsertTracking({
          user_id: user.id,
          date: yesterdayFasting.date,
          fasting_hours_completed: Math.round(hoursFasted * 10) / 10,
          compliance_status: compliance,
        });
        toast.success(`Fast ended: ${Math.round(hoursFasted * 10) / 10}h`);
      } else {
        toast.success(`First meal tracked at ${formatTime12(hour, minute)}`);
      }
      if (mealPhotoFile) await processPhotoAndSave("fmod");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const trackLMOD = async () => {
    if (!user) return;
    const now = new Date();
    if (fmodTime && now.getTime() <= fmodTime.getTime()) {
      toast.error("Last meal must be after your first meal");
      return;
    }
    try {
      await upsertTracking({
        user_id: user.id,
        date: today,
        lmod_actual_time: now.toISOString(),
        compliance_status: "pending",
      });
      toast.success("Last meal tracked — fasting has begun!");
      if (mealPhotoFile) await processPhotoAndSave("lmod");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const reportSymptoms = async () => {
    if (!user) return;
    try {
      await upsertTracking({
        user_id: user.id, date: today,
        symptoms_flag: true, symptoms_notes: "User reported symptoms",
      });
      toast("⚠️ Symptoms reported — your coach will be notified");
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading…</div>;

  const badgeLevel = getBadgeLevel(earnedBadges, allBadges);

  if (!userProto || !protocol || !weekPlan) {
    const normalizedKey = packageKey === "starter" ? "foundation" : packageKey === "pro" ? "intensive" : packageKey;
    const isFoundation = !normalizedKey || normalizedKey === "foundation";
    // Tier gating: Foundation sees only the Foundation Care Plan, Active sees
    // Foundation + Active, Intensive sees all three.
    const TIER_RANK: Record<string, number> = { foundation: 1, active: 2, intensive: 3 };
    const protoRank = (name: string) => {
      const n = name.toLowerCase();
      if (n.includes("foundation")) return 1;
      if (n.includes("active")) return 2;
      if (n.includes("intensive")) return 3;
      return 1;
    };
    const maxRank = TIER_RANK[normalizedKey ?? "foundation"] ?? 1;
    const visibleProtos = availableProtos.filter((p) => protoRank(p.protocol_name) <= maxRank);
    const handleStart = async (protoId: string) => {
      if (!user) return;
      setStartingProtoId(protoId);
      try {
        await assignProtocolToUser(user.id, protoId, user.id, today);
        toast.success("Your 24-week journey has begun");
        await load();
      } catch (e: any) {
        toast.error(e.message ?? "Couldn't start plan");
      } finally {
        setStartingProtoId(null);
      }
    };
    return (
      <div className="p-4 md:p-6 space-y-5">
        <div className="liquid-glass rounded-3xl p-6 md:p-8 space-y-4">
          <div className="text-center space-y-2">
            <Timer className="w-12 h-12 text-primary mx-auto" />
            <h3 className="text-lg font-bold text-foreground break-words">
              {isFoundation ? "Start your fasting journey" : "Awaiting meeting with your coach"}
            </h3>
            <p className="text-sm text-muted-foreground break-words">
              {isFoundation
                ? "Pick a plan to begin your 24-week protocol. You can change it later."
                : "Your coach will design your personalised fasting protocol during your first one-on-one consultation. You'll see the full plan here right after the meeting."}
            </p>
          </div>
          {isFoundation && visibleProtos.length > 0 && (
            <div className="space-y-2.5">
              {visibleProtos.map((p) => {
                const isStarting = startingProtoId === p.id;
                return (
                  <div key={p.id} className="rounded-2xl bg-muted/40 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 text-left flex-1">
                      <p className="text-sm font-bold text-foreground truncate">{p.protocol_name}</p>
                      <p className="text-[10px] text-muted-foreground break-words">{p.total_weeks} weeks · starts with 12:12 (FMOD 7 AM · LMOD 7 PM)</p>
                    </div>
                    <button
                      onClick={() => handleStart(p.id)}
                      disabled={isStarting}
                      className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shrink-0 disabled:opacity-60"
                    >
                      {isStarting ? "Starting…" : "Start"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {allBadges.length > 0 && (
          <BadgeSection allBadges={allBadges} earnedBadges={earnedBadges} badgeLevel={badgeLevel} streak={streak} />
        )}
      </div>
    );
  }

  const currentWeek = getCurrentWeek(userProto.start_date);
  const currentDay = getCurrentDay(userProto.start_date);

  // "This Week" strip starts from the user's contract/protocol start date so
  // days before the program are not shown as empty history.
  const startDateKey = (userProto.start_date ?? today).slice(0, 10);
  const todayKey = today;
  const parseKey = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDaysKey = (k: string, n: number) => {
    const d = parseKey(k); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const daysBetweenKeys = (a: string, b: string) =>
    Math.floor((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000);
  const elapsedFromStart = Math.max(0, daysBetweenKeys(startDateKey, todayKey));
  const weekStartKey = addDaysKey(startDateKey, Math.floor(elapsedFromStart / 7) * 7);
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const ds = addDaysKey(weekStartKey, i);
    const d = parseKey(ds);
    const t = tracking.find((tr) => tr.date === ds);
    const isFuture = ds > todayKey;
    return {
      day: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()],
      status: isFuture ? "future" : (t?.compliance_status ?? "pending"),
      isToday: ds === todayKey,
    };
  });


  return (
    <div className="p-6 space-y-5">
      <ExpertConnectBar context="my fasting protocol" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground">Today's Fast</h2>
          <p className="text-xs text-muted-foreground">
            Week {currentWeek} · Day {currentDay} · {weekPlan.fasting_pattern}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-primary">{protocol.protocol_name}</p>
          <p className="text-[10px] text-muted-foreground">
            Meals today · {fastingHours}h fast after LMOD
          </p>
        </div>
      </div>

      {/* Streak + Badge Level Card */}
      <motion.div
        className="liquid-glass rounded-3xl p-4"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Timer className="w-6 h-6 text-primary" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {badgeLevel.currentLevel > 0 ? `Level ${badgeLevel.currentLevel}` : "Getting Started"}
              </p>
              <p className="text-sm font-black text-foreground">
                {badgeLevel.currentBadge?.badge_name ?? "Start your streak!"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1">
              <Flame className="w-4 h-4 text-primary" />
              <span className="text-xl font-black text-foreground">{streak.currentStreak}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">day streak</p>
          </div>
        </div>
        {badgeLevel.nextBadge && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>Next: {badgeLevel.nextBadge.badge_name}</span>
              <span>{streak.longestStreak}/{badgeLevel.nextBadge.required_streak_days} days</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <motion.div className="h-full bg-primary rounded-full" initial={{ width: 0 }} animate={{ width: `${badgeLevel.progress}%` }} />
            </div>
          </div>
        )}
      </motion.div>

      {/* ═══ MAIN FASTING CARD ═══ */}
      <AnimatePresence initial={false}>
        {/* STATE 1: No FMOD tracked → Track First Meal */}
        {!isFmodTracked && !isCarryFasting && !showTimePicker && (
          <motion.div
            key="track-fmod"
            className="liquid-glass rounded-3xl p-6 text-center space-y-4"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <UtensilsCrossed className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Track Your First Meal</h3>
            <p className="text-sm text-muted-foreground">
              Log your first meal. Your fasting timer starts only after your last meal.
            </p>

            {/* If photo already captured, show preview + proceed to time picker */}
            {mealPhotoPreview ? (
              <>
                <MealPhotoCapture
                  preview={mealPhotoPreview}
                  onSelect={handlePhotoSelect}
                  onClear={clearPhoto}
                  analyzing={analyzingPhoto}
                />
                <button
                  onClick={() => setShowTimePicker(true)}
                  className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm mx-auto"
                >
                  <Clock className="w-4 h-4" /> Set Meal Time
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {/* Primary action: snap photo first */}
                <label className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm cursor-pointer">
                  <Camera className="w-4 h-4" /> Snap Your Meal
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </label>
                {/* Secondary: skip photo and just track time */}
                <button
                  onClick={() => setShowTimePicker(true)}
                  className="text-xs text-muted-foreground underline underline-offset-2"
                >
                  Skip photo & track time only
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* TIME PICKER */}
        {showTimePicker && (
          <motion.div key="picker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <TimePicker
              label="When did you have your first meal?"
              onSelect={trackFMOD}
              onCancel={() => setShowTimePicker(false)}
            />
          </motion.div>
        )}

        {/* STATE 2: FMOD tracked, LMOD not yet → daytime meals only; no timer or lock */}
        {isEatingWindow && !showTimePicker && (
          <motion.div
            key="eating-window"
            className="liquid-glass rounded-3xl p-6 text-center space-y-4 ring-2 ring-primary/20"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-xs uppercase tracking-widest font-semibold text-primary">First Meal Tracked</p>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">First meal at</p>
              <p className="text-lg font-bold text-foreground">
                {fmodTime && formatTime12(fmodTime.getHours(), fmodTime.getMinutes())}
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Log your last meal whenever you finish eating — that's when your fast begins.
            </p>

            {/* Snap meal photo for LMOD (optional) */}
            {mealPhotoPreview ? (
              <MealPhotoCapture
                preview={mealPhotoPreview}
                onSelect={handlePhotoSelect}
                onClear={clearPhoto}
                analyzing={analyzingPhoto}
              />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <label className="flex items-center gap-2 px-6 py-2.5 rounded-xl liquid-glass text-foreground text-sm font-medium cursor-pointer">
                  <Camera className="w-4 h-4 text-primary" /> Snap your last meal (optional)
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
                </label>
              </div>
            )}

            <button
              onClick={trackLMOD}
              disabled={analyzingPhoto}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm mx-auto disabled:opacity-50"
            >
              <UtensilsCrossed className="w-4 h-4" /> Track LMOD & Start Fasting
            </button>
          </motion.div>
        )}

        {/* STATE 3: LMOD tracked, fasting in progress (until next day's FMOD) */}
        {isFastingActive && activeFastStart && (
          <motion.div
            key="fasting"
            className="liquid-glass rounded-3xl p-6 text-center space-y-4 ring-2 ring-primary/30"
          >
            <p className="text-xs uppercase tracking-widest font-semibold text-primary inline-flex items-center justify-center gap-1.5">
              <Flame className="w-3.5 h-3.5" strokeWidth={1.75} /> Fasting In Progress
            </p>
            <LiveTimer startTime={activeFastStart} className="text-4xl text-primary" />
            <p className="text-[11px] text-muted-foreground">
              Fasting since {formatTime12(activeFastStart.getHours(), activeFastStart.getMinutes())}
              {isCarryFasting && " (yesterday)"} · ends when you log tomorrow's first meal
            </p>
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className={`font-semibold ${phase.color}`}>{phase.phase}</span>
            </div>
            <p className="text-xs text-muted-foreground">{phase.description}</p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (elapsedFastingHours / fastingHours) * 100)}%` }}
                transition={{ duration: 1 }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {Math.round(elapsedFastingHours * 10) / 10}h / {fastingHours}h target
            </p>
            <div className="flex gap-3 justify-center">
              {isCarryFasting && activeFastStart && (() => {
                const unlockAt = new Date(activeFastStart.getTime() + fastingHours * 60 * 60 * 1000);
                const canBreak = Date.now() >= unlockAt.getTime();
                return canBreak ? (
                  <button
                    onClick={() => setShowTimePicker(true)}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm"
                  >
                    <UtensilsCrossed className="w-4 h-4" /> Log FMOD
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      disabled
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-muted text-muted-foreground font-bold text-sm cursor-not-allowed"
                      title={`FMOD unlocks at ${formatTime12(unlockAt.getHours(), unlockAt.getMinutes())}`}
                    >
                      <Lock className="w-4 h-4" /> FMOD Locked
                    </button>
                    <p className="text-[10px] text-muted-foreground">
                      Unlocks in <CountdownTimer targetTime={unlockAt} className="text-[10px] text-foreground" /> · at {formatTime12(unlockAt.getHours(), unlockAt.getMinutes())}
                    </p>
                  </div>
                );
              })()}
              <button
                onClick={reportSymptoms}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-destructive/10 text-destructive font-semibold text-sm"
              >
                <AlertTriangle className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* STATE 4: Fast completed */}
        {isFastComplete && (
          <motion.div
            key="complete"
            className="liquid-glass rounded-3xl p-6 text-center space-y-3"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground">Fast Complete</p>
            <p className="text-sm text-muted-foreground">Log your next LMOD to begin the next fasting window.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ TODAY'S CALORIES ═══ */}
      {todayCalories.total > 0 && (
        <motion.div
          className="liquid-glass rounded-3xl p-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                <Flame className="w-5 h-5 text-secondary" strokeWidth={1.8} />
              </div>
              <div>
                <span className="text-foreground font-bold text-sm">Calories Today</span>
                <p className="text-muted-foreground text-[10px]">AI-estimated from your meal photos</p>
              </div>
            </div>
            <span className="text-2xl font-black text-foreground">{todayCalories.total}</span>
          </div>
          <div className="space-y-2">
            {todayCalories.meals.map((meal, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-xl">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {meal.type === "fmod" ? <UtensilsCrossed className="w-3.5 h-3.5" strokeWidth={1.75} /> : <Moon className="w-3.5 h-3.5" strokeWidth={1.75} />}
                      {meal.type === "fmod" ? "First Meal" : "Last Meal"}
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {meal.foodItems.map(f => f.name).join(", ")}
                  </p>
                </div>
                <span className="text-sm font-bold text-foreground">{meal.calories} cal</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Weekly compliance */}
      <div className="liquid-glass rounded-3xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">This Week</h3>
        <div className="flex justify-between">
          {last7.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className={`text-[10px] font-semibold ${d.isToday ? "text-primary" : "text-muted-foreground"}`}>{d.day}</span>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                d.status === "completed" ? "bg-primary/20 text-primary" :
                d.status === "partial" ? "bg-amber-500/20 text-amber-500" :
                d.status === "missed" ? "bg-destructive/20 text-destructive" :
                d.status === "future" ? "bg-muted/40 text-muted-foreground/60 border border-dashed border-border" :
                "bg-muted text-muted-foreground"
              } ${d.isToday ? "ring-2 ring-primary/40" : ""}`}>
                {d.status === "completed" ? <Check className="w-3.5 h-3.5" strokeWidth={2.4} /> : d.status === "partial" ? <Minus className="w-3.5 h-3.5" strokeWidth={2.4} /> : d.status === "missed" ? <X className="w-3.5 h-3.5" strokeWidth={2.4} /> : d.status === "future" ? "" : "·"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Milestone progress toward next stage badge */}
      <FastingMilestoneProgress />

      {/* Badge Collection */}
      <BadgeSection allBadges={allBadges} earnedBadges={earnedBadges} badgeLevel={badgeLevel} streak={streak} />

      {/* Phase indicators */}
      <div className="liquid-glass rounded-3xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Fasting Phases</h3>
        <div className="space-y-2">
          {[
            { h: 12, label: "Insulin Falling", desc: "Body shifts from glucose to fat", icon: Zap },
            { h: 14, label: "Ketone Production", desc: "Liver producing ketones", icon: Flame },
            { h: 16, label: "Fat Burning", desc: "Active fat oxidation", icon: Flame },
            { h: 18, label: "Deep Metabolic State", desc: "Autophagy & cellular repair", icon: Shield },
          ].map((p) => {
            const active = elapsedFastingHours >= p.h;
            return (
              <div key={p.h} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${active ? "bg-primary/10" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <p.icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{p.label}</p>
                  <p className="text-[10px] text-muted-foreground">{p.desc}</p>
                </div>
                <span className={`text-xs font-mono font-bold ${active ? "text-primary" : "text-muted-foreground"}`}>{p.h}h+</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Metabolic push notice */}
      {weekPlan.metabolic_push && (
        <div className="liquid-glass rounded-3xl p-4 border border-amber-500/20">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-foreground">Metabolic Push Week</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Push to <span className="font-bold text-amber-500">{weekPlan.push_pattern}</span> on {weekPlan.push_days} days this week.
                {weekPlan.requires_coach_guidance && " Coach guidance required."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Allowed / Avoid */}
      {protocol && (
        <div className="grid grid-cols-2 gap-3">
          <div className="liquid-glass rounded-3xl p-4">
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5" /> Allowed
            </h4>
            <ul className="space-y-1">
              {protocol.allowed_items.map((item, i) => (
                <li key={i} className="text-xs text-foreground flex items-center gap-1">
                  <Check className="w-3 h-3 text-primary shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="liquid-glass rounded-3xl p-4">
            <h4 className="text-xs font-bold text-destructive uppercase tracking-wider mb-2">🚫 Avoid</h4>
            <ul className="space-y-1">
              {protocol.avoid_items.map((item, i) => (
                <li key={i} className="text-xs text-foreground">{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Breaking fast guide */}
      {protocol?.breaking_fast_guide && (
        <div className="liquid-glass rounded-3xl p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Coffee className="w-3.5 h-3.5" /> Breaking Your Fast
          </h4>
          <p className="text-sm text-foreground">{protocol.breaking_fast_guide}</p>
        </div>
      )}

      {/* Safety */}
      {protocol?.safety_notes && (
        <div className="liquid-glass rounded-3xl p-4 border border-destructive/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-destructive">Safety Alert</h4>
              <p className="text-xs text-muted-foreground mt-1">{protocol.safety_notes}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime12(h: number, m: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** Badge collection component */
function BadgeSection({
  allBadges, earnedBadges, badgeLevel, streak
}: {
  allBadges: FastingBadge[];
  earnedBadges: UserFastingBadge[];
  badgeLevel: ReturnType<typeof getBadgeLevel>;
  streak: { currentStreak: number; longestStreak: number };
}) {
  const earnedIds = new Set(earnedBadges.map((b) => b.badge_id));

  return (
    <div className="liquid-glass rounded-3xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Trophy className="w-3.5 h-3.5" /> Fasting Badges
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {earnedBadges.length}/{allBadges.length} earned
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {allBadges.map((badge) => {
          const earned = earnedIds.has(badge.id);
          return (
            <motion.div
              key={badge.id}
              className={`rounded-2xl p-3 text-center transition-colors ${
                earned ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted/50 opacity-40"
              }`}
              whileHover={{ y: -1 }}
            >
              <span className={`w-10 h-10 rounded-xl mx-auto mb-1 flex items-center justify-center ${earned ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {earned ? <Timer className="w-5 h-5" strokeWidth={1.75} /> : <Lock className="w-5 h-5" strokeWidth={1.75} />}
              </span>
              <p className={`text-[10px] font-bold ${earned ? "text-foreground" : "text-muted-foreground"}`}>
                {badge.badge_name}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {earned ? "Earned" : `${badge.required_streak_days}d streak`}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
