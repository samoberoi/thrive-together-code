import { useState, useEffect, useRef } from "react";
import { useUserStore } from "@/hooks/useUserStore";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Settings, Bell, Shield, LogOut, ChevronRight,
  Flame, Zap, Award, ClipboardList, Activity, Scale, Heart,
  Globe, Moon, Sun, Package, ArrowLeft, BellOff, BellRing, X, Camera,
  UserCog, Gift, Trophy, Lock, Timer, Utensils, Pill, Check, XCircle, MessageCircle, Sparkles,
  AlertTriangle, Plus, Footprints, Star, type LucideIcon
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import EditProfile from "@/components/EditProfile";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGE_LABELS, type Language } from "@/lib/i18n";
import { useAppLanguages } from "@/hooks/useAppLanguages";
import { fetchHealthLogs, fetchProgressSummaries, formatLogDate, insertHealthLog, type HealthLog, type ProgressSummary } from "@/lib/healthLogsService";
import { toast } from "sonner";
import { fetchProfile } from "@/lib/profileService";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { clearAppBadge } from "@/lib/appBadge";
import { LoadingState, EmptyState } from "@/components/shared";
import MyPlanSection from "@/components/MyPlanSection";
import { fetchActiveSubscription } from "@/lib/subscriptionService";

import ReferAndEarn from "@/components/ReferAndEarn";

import LabHistorySection from "@/components/lab/LabHistorySection";
import AbnormalMarkersCard from "@/components/dashboard/AbnormalMarkersCard";
import PrivacySecurityPage from "@/components/PrivacySecurityPage";
import DietPreferences from "@/components/DietPreferences";
import { calculateStreak, checkAndAwardBadges, fetchBadgeDefinitions, fetchUserBadges, getBadgeLevel, type FastingBadge, type UserFastingBadge } from "@/lib/streakService";
import { fetchSupplementBadgeDefinitions, fetchUserSupplementBadges, getSupplementBadgeLevel, type SupplementBadge, type UserSupplementBadge } from "@/lib/supplementBadgeService";
import { fetchUserPlan, fetchPlanItems, fetchSupplements as fetchAllSupplements, fetchTrackingHistory, type PlanItem, type Supplement as SupplementType, type SupplementTracking } from "@/lib/supplementService";
import { listMovementBadges, type MovementBadge } from "@/lib/movementService";
import { fetchUserBadges as fetchUserMovementBadges, type UserMovementBadge } from "@/lib/movementUserService";
import { supabase } from "@/integrations/supabase/client";
import { fetchCompliments, markAllSeen, type Compliment } from "@/lib/complimentService";
import HealthScoreRing from "@/components/HealthScoreRing";
import BbdoBadgeGrid from "@/components/badges/BbdoBadgeGrid";
import { playNotificationSound, getMasterVolume, setMasterVolume, getMuted, setMuted } from "@/lib/soundEngine";
import { getNotificationSoundSettings } from "@/lib/notificationSoundService";
import { registerNativePush, registerNativePushWithToast, isNativePushSupported } from "@/lib/nativePush";
import { sendLocalHealthAlert, sendRemoteHealthPushResult } from "@/lib/healthAlerts";

const APP_VERSION = (globalThis as any).__APP_VERSION__ ?? "1.0.0";

const formatProfileGender = (gender?: string | null) => {
  if (!gender) return "Gender not set";
  return gender.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function toLocalDateKey(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

import { fetchUserStats, type UserStats } from "@/lib/userStatsService";

const statsMeta = [
  { key: "dayStreak", field: "dayStreak" as const, icon: Flame, color: "text-destructive" },
  { key: "habitsCompleted", field: "habitsDone" as const, icon: Award, color: "text-primary" },
  { key: "xpEarned", field: "xpEarned" as const, icon: Zap, color: "text-primary" },
  { key: "level", field: "level" as const, icon: Zap, color: "text-warning" },
];

function FlatBadgeIcon({ earned, type }: { earned: boolean; type: "fasting" | "supplement" | "movement" }) {
  const Icon = !earned ? Lock : type === "fasting" ? Timer : type === "supplement" ? Pill : Footprints;
  const color = type === "fasting" ? "var(--pillar-fasting)" : type === "supplement" ? "var(--pillar-supplements)" : "var(--pillar-move)";
  const bg = type === "fasting" ? "var(--pillar-fasting-soft)" : type === "supplement" ? "var(--pillar-supplements-soft)" : "var(--pillar-move-soft)";

  return (
    <span
      className="w-10 h-10 rounded-xl flex items-center justify-center mb-1"
      style={{ background: earned ? bg : "hsl(var(--muted))", color: earned ? color : "hsl(var(--muted-foreground))" }}
    >
      <Icon className="w-5 h-5" strokeWidth={1.75} />
    </span>
  );
}

function FlatComplimentIcon({ type }: { type?: string | null }) {
  const key = (type || "").toLowerCase();
  const Icon: LucideIcon = key.includes("streak")
    ? Flame
    : key.includes("supp")
      ? Pill
      : key.includes("move") || key.includes("step")
        ? Footprints
        : key.includes("score") || key.includes("health")
          ? Heart
          : Sparkles;

  return (
    <span
      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: "var(--bbdo-blue-soft)", color: "var(--bbdo-blue)" }}
    >
      <Icon className="w-5 h-5" strokeWidth={1.75} />
    </span>
  );
}

// Health logs are now fetched from the backend

type SubPage = null | "logs" | "appSettings" | "notifications" | "plan" | "editProfile" | "referral" | "achievements" | "privacy" | "diet";

function SubScreenShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <div
        className="sticky top-0 z-30 flex items-center gap-3 px-4 pb-3 bg-background/95 backdrop-blur border-b border-border"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-11 h-11 shrink-0 rounded-full liquid-glass flex items-center justify-center active:scale-95 transition"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" strokeWidth={2} />
        </button>
        <h2 className="flex-1 min-w-0 text-lg font-black text-foreground leading-tight break-words">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </div>
  );
}

interface ProfileProps { onClose?: () => void; isDark?: boolean; onToggleTheme?: () => void; }

export default function Profile({ onClose, isDark = true, onToggleTheme }: ProfileProps) {
  const navigate = useNavigate();
  const storedUser = useUserStore();
  const { t, lang, setLang } = useLanguage();
  const { languages: enabledLanguages } = useAppLanguages({ onlyEnabled: true });
  const { user, signOut } = useAuth();
  const confirm = useConfirm();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    const ok = await confirm({
      title: "Log out?",
      description: "You'll need to sign in again to access your account.",
      confirmText: "Log out",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    setLoggingOut(true);
    try {
      await clearAppBadge();
      await signOut();
    } catch (e) {
      console.error("logout failed", e);
    } finally {
      // Hard reset to auth page — clears any lingering in-memory state.
      window.location.replace("/auth");
    }
  };
  const userName = storedUser?.profile?.name ?? "Friend";
  const userScore = storedUser?.assessment?.healthScore ?? 72;
  const userRiskCategory = storedUser?.assessment?.riskCategory ?? "Good";
  const userGender = formatProfileGender(storedUser?.profile?.gender);
  const [planName, setPlanName] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const isPaidPlan = planId === "active" || planId === "intensive" || planId === "pro";
  const [initialScore, setInitialScore] = useState<number | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const userAvatar = storedUser?.avatarUrl;
  const [subPage, setSubPage] = useState<SubPage>(null);
  const [logsTab, setLogsTab] = useState<"diabetes" | "bp" | "weight" | "fasting" | "supplements" | "plates">("diabetes");
  const [plateLogs, setPlateLogs] = useState<any[]>([]);
  const [notifDailyLog, setNotifDailyLog] = useState(true);
  const [notifWeightReminder, setNotifWeightReminder] = useState(true);
  const [notifCommunity, setNotifCommunity] = useState(true);
  const [notifSupplement, setNotifSupplement] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [soundVolume, setSoundVolumeState] = useState(() => getMasterVolume());
  const [soundMuted, setSoundMutedState] = useState(() => getMuted());
  const [sendingTest, setSendingTest] = useState(false);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [progressSummaries, setProgressSummaries] = useState<ProgressSummary[]>([]);
  const [logsReloadKey, setLogsReloadKey] = useState(0);
  const [showAddLog, setShowAddLog] = useState(false);
  const [savingLog, setSavingLog] = useState(false);
  const [logGlucoseM, setLogGlucoseM] = useState("");
  const [logGlucoseE, setLogGlucoseE] = useState("");
  const [logSystolic, setLogSystolic] = useState("");
  const [logDiastolic, setLogDiastolic] = useState("");
  const [logWeight, setLogWeight] = useState("");
  const [allBadges, setAllBadges] = useState<FastingBadge[]>([]);
  const [userBadges, setUserBadges] = useState<UserFastingBadge[]>([]);
  const [fastingLogs, setFastingLogs] = useState<any[]>([]);
  // Supplement badges
  const [suppBadgeDefs, setSuppBadgeDefs] = useState<SupplementBadge[]>([]);
  const [userSuppBadges, setUserSuppBadges] = useState<UserSupplementBadge[]>([]);
  // Movement badges
  const [movementBadgeDefs, setMovementBadgeDefs] = useState<MovementBadge[]>([]);
  const [userMovementBadges, setUserMovementBadges] = useState<UserMovementBadge[]>([]);
  // Supplement logs
  const [suppTrackingLogs, setSuppTrackingLogs] = useState<SupplementTracking[]>([]);
  const [suppPlanItems, setSuppPlanItems] = useState<PlanItem[]>([]);
  const [suppList, setSuppList] = useState<SupplementType[]>([]);
  // Meal photos for fasting logs
  const [fastingMealPhotos, setFastingMealPhotos] = useState<any[]>([]);
  // Compliments
  const [compliments, setCompliments] = useState<Compliment[]>([]);
  const complimentsFetched = useRef(false);
  const [stats, setStats] = useState<UserStats>({ dayStreak: 0, habitsDone: 0, xpEarned: 0, level: 1 });
  // Fetch badges + initial score
  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetchBadgeDefinitions(),
      fetchUserBadges(user.id),
      fetchSupplementBadgeDefinitions(),
      fetchUserSupplementBadges(user.id),
      fetchProfile(user.id),
      fetchCompliments(),
      listMovementBadges(),
      (async () => {
        const { error } = await supabase.rpc("recompute_movement_progress_for_user" as any, { _user_id: user.id });
        if (error) console.error(error);
        return fetchUserMovementBadges(user.id);
      })(),
    ]).then(([defs, earned, suppDefs, suppEarned, profile, comps, moveDefs, moveEarned]) => {
      setAllBadges(defs);
      setUserBadges(earned);
      setSuppBadgeDefs(suppDefs);
      setUserSuppBadges(suppEarned);
      setMovementBadgeDefs((moveDefs || []).filter((b) => b.is_active));
      setUserMovementBadges(moveEarned || []);
      if (profile?.initial_health_score != null) setInitialScore(profile.initial_health_score);
      if (profile?.created_at) setMemberSince(profile.created_at);
      setCompliments(comps);
      if (comps.length > 0) markAllSeen().catch(console.error);
      void (async () => {
        const { data } = await supabase
          .from("fasting_tracking")
          .select("date, compliance_status, fmod_actual_time, lmod_actual_time, fasting_hours_completed")
          .eq("user_id", user.id);
        const streak = calculateStreak(((data ?? []) as Array<{ date: string; compliance_status: string | null; fmod_actual_time: string | null; lmod_actual_time: string | null; fasting_hours_completed: number | null }>).map((row) => ({
          date: row.date,
          compliance_status: row.compliance_status ?? "pending",
          fmod_actual_time: row.fmod_actual_time,
          lmod_actual_time: row.lmod_actual_time,
          fasting_hours_completed: row.fasting_hours_completed,
        })));
        await checkAndAwardBadges(user.id, streak.currentStreak, streak.longestStreak);
        setUserBadges(await fetchUserBadges(user.id));
      })().catch(console.error);
    }).catch(console.error);
    fetchUserStats(user.id).then(setStats).catch(console.error);
  }, [user]);

  // Fetch active plan name for profile subtitle
  useEffect(() => {
    if (!user) return;
    fetchActiveSubscription(user.id).then((sub) => {
      if (sub?.plan_name) setPlanName(sub.plan_name);
      if (sub?.plan_id) setPlanId(sub.plan_id);
    }).catch(console.error);
  }, [user]);

  useEffect(() => {
    if (subPage === "logs" && user) {
      setLogsLoading(true);
      const promises: Promise<any>[] = [fetchProgressSummaries()];
      if (logsTab === "fasting") {
        promises.push(
          Promise.resolve(supabase.from("fasting_tracking").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(30)).then(({ data }) => data ?? [])
        );
        promises.push(
          Promise.resolve(supabase.from("meal_photos").select("*").eq("user_id", user.id).order("logged_at", { ascending: false }).limit(100)).then(({ data }) => data ?? [])
        );
      } else if (logsTab === "supplements") {
        promises.push(
          Promise.all([
            fetchTrackingHistory(user.id, 30),
            fetchUserPlan(user.id).then(async (plan) => {
              if (!plan) return [];
              return fetchPlanItems(plan.id);
            }),
            fetchAllSupplements(),
          ])
        );
      } else if (logsTab === "plates") {
        promises.push(
          Promise.resolve(supabase.from("user_plates" as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(60)).then(({ data }) => data ?? [])
        );
      } else {
        promises.push(fetchHealthLogs(logsTab));
      }
      Promise.all(promises).then(([summaries, logs, mealPhotos]) => {
        setProgressSummaries(summaries);
        if (logsTab === "fasting") {
          setFastingLogs(logs);
          setFastingMealPhotos(mealPhotos ?? []);
        } else if (logsTab === "supplements") {
          const [tracking, items, supps] = logs as [SupplementTracking[], PlanItem[], SupplementType[]];
          setSuppTrackingLogs(tracking);
          setSuppPlanItems(items);
          setSuppList(supps);
        } else if (logsTab === "plates") {
          setPlateLogs(logs ?? []);
        } else {
          setHealthLogs(logs);
        }
        setLogsLoading(false);
      });
    }
  }, [subPage, logsTab, user, logsReloadKey]);

  const handleSaveLog = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    const base = { user_id: user.id, logged_at: now };
    setSavingLog(true);
    try {
      if (logsTab === "diabetes") {
        const m = logGlucoseM ? parseFloat(logGlucoseM) : null;
        const e = logGlucoseE ? parseFloat(logGlucoseE) : null;
        if (!m && !e) { toast.error("Enter at least one glucose value"); setSavingLog(false); return; }
        const res = await insertHealthLog({ ...base, log_type: "diabetes", glucose_morning: m, glucose_evening: e } as any);
        if (!res) throw new Error("save failed");
        setLogGlucoseM(""); setLogGlucoseE("");
      } else if (logsTab === "bp") {
        const s = logSystolic ? parseInt(logSystolic) : null;
        const d = logDiastolic ? parseInt(logDiastolic) : null;
        if (!s || !d) { toast.error("Enter both systolic and diastolic"); setSavingLog(false); return; }
        const res = await insertHealthLog({ ...base, log_type: "bp", bp_systolic: s, bp_diastolic: d } as any);
        if (!res) throw new Error("save failed");
        setLogSystolic(""); setLogDiastolic("");
      } else if (logsTab === "weight") {
        const w = logWeight ? parseFloat(logWeight) : null;
        if (!w) { toast.error("Enter your weight"); setSavingLog(false); return; }
        const res = await insertHealthLog({ ...base, log_type: "weight", weight_kg: w } as any);
        if (!res) throw new Error("save failed");
        setLogWeight("");
      }
      toast.success("Reading saved");
      setShowAddLog(false);
      setLogsReloadKey((k) => k + 1);
    } catch (err) {
      toast.error("Could not save reading. Please try again.");
      console.error(err);
    } finally {
      setSavingLog(false);
    }
  };

  const [notifAppointment, setNotifAppointment] = useState(true);

  // Load & persist notification preferences
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("notification_preferences" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setNotifDailyLog(d.daily_log_reminders);
        setNotifWeightReminder(d.weekly_weight_reminder);
        setNotifSupplement(d.supplement_reminders);
        setNotifAppointment(d.appointment_alerts);
        setNotifCommunity(d.community_updates);
      }
      setPrefsLoaded(true);
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !prefsLoaded) return;
    const prefs = {
      daily_log_reminders: notifDailyLog,
      weekly_weight_reminder: notifWeightReminder,
      supplement_reminders: notifSupplement,
      appointment_alerts: notifAppointment,
      community_updates: notifCommunity,
    };
    supabase.from("notification_preferences" as any).upsert({
      user_id: user.id,
      ...prefs,
    } as any, { onConflict: "user_id" });
  }, [notifDailyLog, notifWeightReminder, notifSupplement, notifAppointment, notifCommunity, user, prefsLoaded]);

  const menuItems = [
    { icon: UserCog, label: t("editProfile"), sublabel: t("updateDetails"), action: () => setSubPage("editProfile") },
    { icon: Utensils, label: "Diet Preferences", sublabel: "Veg, Vegan, Jain, Non-veg & allergies", action: () => setSubPage("diet") },
    { icon: Bell, label: t("notifications"), sublabel: t("manageAlerts"), action: () => setSubPage("notifications") },
    { icon: Shield, label: t("privacySecurity"), sublabel: t("dataControl"), action: () => setSubPage("privacy") },
    { icon: Settings, label: t("appSettings"), sublabel: t("themeLanguage"), action: () => setSubPage("appSettings") },
    { icon: ClipboardList, label: t("myLogs"), sublabel: t("logsSubtitle"), action: () => setSubPage("logs") },
    { icon: Package, label: t("myPlan"), sublabel: t("planSubtitle"), action: () => setSubPage("plan") },
    { icon: Gift, label: "Refer & Earn", sublabel: "Invite friends, earn free months", action: () => setSubPage("referral") },
    { icon: Star, label: "Rate the app", sublabel: "Enjoying BBDO? Leave a review", action: () => {
        const ua = navigator.userAgent || "";
        const isIOS = /iPad|iPhone|iPod/.test(ua);
        const url = isIOS
          ? "https://apps.apple.com/app/id0000000000?action=write-review"
          : "https://play.google.com/store/apps/details?id=com.byebyediabetes.app";
        window.open(url, "_blank", "noopener,noreferrer");
      } },
  ];


  if (subPage === "logs") {
    return (
      <SubScreenShell onBack={() => setSubPage(null)} title="My Health Logs">
        {/* Progress Gauges */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {([
            { type: "diabetes" as const, label: "Glucose", unit: "mg/dL", icon: Activity, color: "text-primary" },
            { type: "bp" as const, label: "BP", unit: "mmHg", icon: Heart, color: "text-destructive" },
            { type: "weight" as const, label: "Weight", unit: "kg", icon: Scale, color: "text-primary" },
          ]).map(({ type, label, unit, icon: Icon, color }) => {
            const s = progressSummaries.find((p) => p.logType === type);
            const noData = !s || !s.hasData;
            const isPositive = s && s.change < 0; // lower is better for all 3
            const isNeutral = s && s.change === 0;
            return (
              <motion.div key={type} className="liquid-glass rounded-2xl p-3 min-w-0 flex flex-col items-center text-center gap-1" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <Icon className={`w-4 h-4 ${color}`} strokeWidth={1.6} />
                <p className="text-muted-foreground text-[10px] font-medium leading-tight break-words">{label}</p>
                {noData ? (
                  <p className="text-muted-foreground text-xs">—</p>
                ) : (
                  <>
                    <p className="w-full text-foreground text-sm font-black leading-tight break-words">{s!.latestValue}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span></p>
                    <div className={`flex flex-wrap items-center justify-center gap-0.5 text-[11px] leading-tight font-bold ${isNeutral ? "text-muted-foreground" : isPositive ? "text-success" : "text-critical"}`}>
                      {isNeutral ? (
                        <span>No change</span>
                      ) : (
                        <>
                          <span>{s!.change > 0 ? "▲" : "▼"}</span>
                          <span>{Math.abs(Math.round(s!.change * 10) / 10)} {unit}</span>
                          <span className="text-muted-foreground font-normal">({Math.abs(s!.changePercent)}%)</span>
                        </>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="flex gap-1 mb-5 liquid-glass rounded-xl p-1 overflow-x-auto no-scrollbar">
          {(["diabetes", "bp", "weight", "fasting", "supplements", ...(isPaidPlan ? ["plates" as const] : [])] as const).map((tab) => {
            const icons = { diabetes: Activity, bp: Heart, weight: Scale, fasting: Timer, supplements: Pill, plates: Utensils };
            const labels = { diabetes: "Diabetes", bp: "BP", weight: "Weight", fasting: "Fasting", supplements: "Supps", plates: "Plates" };
            const TabIcon = icons[tab];
            return (
              <button key={tab} onClick={() => { setLogsTab(tab); setShowAddLog(false); }} className={`shrink-0 min-w-fit flex items-center justify-center gap-1 px-3 py-2.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${logsTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <TabIcon className="w-3.5 h-3.5" strokeWidth={1.6} />{labels[tab]}
              </button>
            );
          })}
        </div>

        {(logsTab === "diabetes" || logsTab === "bp" || logsTab === "weight") && (
          <div className="mb-4">
            {!showAddLog ? (
              <button
                onClick={() => setShowAddLog(true)}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3 rounded-2xl shadow-card hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" strokeWidth={2.2} />
                Add {logsTab === "diabetes" ? "glucose" : logsTab === "bp" ? "BP" : "weight"} reading
              </button>
            ) : (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="liquid-glass rounded-2xl p-4 border border-primary/20">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <p className="min-w-0 text-foreground text-sm font-bold leading-tight break-words">New {logsTab === "diabetes" ? "glucose" : logsTab === "bp" ? "BP" : "weight"} reading</p>
                  <button onClick={() => setShowAddLog(false)} className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" strokeWidth={1.6} />
                  </button>
                </div>
                {logsTab === "diabetes" && (
                  <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight break-words">Morning (mg/dL)</span>
                      <input type="number" inputMode="numeric" value={logGlucoseM} onChange={(e) => setLogGlucoseM(e.target.value)} placeholder="e.g. 95" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight break-words">Evening (mg/dL)</span>
                      <input type="number" inputMode="numeric" value={logGlucoseE} onChange={(e) => setLogGlucoseE(e.target.value)} placeholder="e.g. 120" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
                    </label>
                  </div>
                )}
                {logsTab === "bp" && (
                  <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight break-words">Systolic</span>
                      <input type="number" inputMode="numeric" value={logSystolic} onChange={(e) => setLogSystolic(e.target.value)} placeholder="e.g. 120" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight break-words">Diastolic</span>
                      <input type="number" inputMode="numeric" value={logDiastolic} onChange={(e) => setLogDiastolic(e.target.value)} placeholder="e.g. 80" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
                    </label>
                  </div>
                )}
                {logsTab === "weight" && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight break-words">Weight (kg)</span>
                    <input type="number" inputMode="decimal" step="0.1" value={logWeight} onChange={(e) => setLogWeight(e.target.value)} placeholder="e.g. 68.5" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
                  </label>
                )}
                <button
                  onClick={handleSaveLog}
                  disabled={savingLog}
                  className="w-full mt-3 bg-primary text-primary-foreground font-bold py-3 rounded-xl disabled:opacity-50"
                >
                  {savingLog ? "Saving…" : "Save reading"}
                </button>
              </motion.div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {logsLoading ? (
            <LoadingState variant="card" />
          ) : logsTab === "fasting" ? (
            fastingLogs.length === 0 ? (
              <EmptyState icon={Timer} title="No fasting logs yet" description="Start tracking your meals in the Fasting tab." />
            ) : (
              fastingLogs.map((log: any) => {
                const fmodTime = log.fmod_actual_time ? new Date(log.fmod_actual_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : null;
                const lmodTime = log.lmod_actual_time ? new Date(log.lmod_actual_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : null;
                const dateLabel = formatLogDate(log.date + "T12:00:00").split(",")[0];
                const statusColors: Record<string, string> = { completed: "text-success", partial: "text-warning", missed: "text-critical", pending: "text-muted-foreground" };
                const statusLabels: Record<string, string> = { completed: "Completed", partial: "Partial", missed: "Missed", pending: "Pending" };
                const status = log.compliance_status ?? "pending";
                // Find meal photos for this date
                const dayPhotos = fastingMealPhotos.filter((mp: any) => mp.fasting_tracking_id === log.id || toLocalDateKey(mp.logged_at) === log.date);
                const dayCalories = dayPhotos.reduce((s: number, mp: any) => s + (mp.estimated_calories ?? 0), 0);
                return (
                  <motion.div key={log.id} className="liquid-glass rounded-2xl p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <p className="min-w-0 text-foreground text-xs font-bold flex items-center gap-2 leading-tight break-words"><Timer className="w-3.5 h-3.5 shrink-0 text-primary" strokeWidth={1.6} />{dateLabel}</p>
                      <span className={`shrink-0 text-[11px] font-semibold leading-tight ${statusColors[status] ?? "text-muted-foreground"}`}>{statusLabels[status] ?? status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="liquid-glass rounded-xl p-3">
                        <p className="text-muted-foreground text-[10px] mb-1 flex items-center gap-1"><Utensils className="w-3 h-3" />First Meal (FMOD)</p>
                        <p className="text-foreground text-base font-black">{fmodTime ?? "—"}</p>
                      </div>
                      <div className="liquid-glass rounded-xl p-3">
                        <p className="text-muted-foreground text-[10px] mb-1 flex items-center gap-1"><Utensils className="w-3 h-3" />Last Meal (LMOD)</p>
                        <p className="text-foreground text-base font-black">{lmodTime ?? "—"}</p>
                      </div>
                    </div>
                    {log.fasting_hours_completed != null && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground text-[10px]">Fasted:</span>
                        <span className="text-primary text-xs font-bold break-words">{log.fasting_hours_completed}h</span>
                      </div>
                    )}
                    {/* Meal photos with calorie breakdown */}
                    {dayPhotos.length > 0 && (
                      <div className="mt-3 border-t border-border/30 pt-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="min-w-0 text-muted-foreground text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 leading-tight"><Camera className="w-3 h-3 shrink-0" /> Meals</p>
                          <span className="shrink-0 text-primary text-xs font-bold leading-tight">{dayCalories} kcal</span>
                        </div>
                        <div className="space-y-2">
                          {dayPhotos.map((meal: any) => {
                            const mealTime = new Date(meal.logged_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
                            const typeLabel = meal.meal_type === "fmod" ? "First Meal" : meal.meal_type === "lmod" ? "Last Meal" : meal.meal_type;
                            const foodItems = (meal.food_items ?? []) as { name: string; portion: string; calories: number }[];
                            return (
                              <div key={meal.id} className="flex gap-3">
                                {meal.photo_url && (
                                  <img src={meal.photo_url} alt={typeLabel} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 mb-0.5">
                                    <p className="min-w-0 text-foreground text-[11px] font-bold leading-tight break-words">{typeLabel}</p>
                                    <p className="shrink-0 text-muted-foreground text-[10px] leading-tight text-right">{mealTime}</p>
                                  </div>
                                  <p className="text-primary text-xs font-bold mb-1 leading-tight break-words">{meal.estimated_calories ?? 0} kcal</p>
                                  <div className="space-y-0.5">
                                    {foodItems.slice(0, 3).map((fi, i) => (
                                      <div key={i} className="flex items-start justify-between gap-2 text-[9px] leading-tight">
                                        <span className="min-w-0 text-foreground break-words">{fi.name}</span>
                                        <span className="text-muted-foreground shrink-0 text-right">{fi.calories} cal</span>
                                      </div>
                                    ))}
                                    {foodItems.length > 3 && <p className="text-muted-foreground text-[9px]">+{foodItems.length - 3} more</p>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )
          ) : logsTab === "plates" ? (
            plateLogs.length === 0 ? (
              <EmptyState icon={Utensils} title="No plates saved yet" description="Build a plate to track your meals." />
            ) : (() => {
              const dateGroups = new Map<string, any[]>();
              for (const p of plateLogs) {
                const dk = toLocalDateKey(p.created_at);
                if (!dateGroups.has(dk)) dateGroups.set(dk, []);
                dateGroups.get(dk)!.push(p);
              }
              const sortedDates = [...dateGroups.keys()].sort((a, b) => b.localeCompare(a));
              return (
                <>
                  {sortedDates.map((date) => {
                    const plates = dateGroups.get(date)!;
                    const dayKcal = plates.reduce((s, p) => s + Math.round(Number(p.total_calories_kcal) || 0), 0);
                    const dayProtein = Math.round(plates.reduce((s, p) => s + (Number(p.total_protein_g) || 0), 0));
                    const dateLabel = formatLogDate(date + "T12:00:00").split(",")[0];
                    return (
                      <motion.div key={date} className="liquid-glass rounded-2xl p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <p className="min-w-0 text-foreground text-xs font-bold flex items-center gap-2 leading-tight break-words">
                            <Utensils className="w-3.5 h-3.5 shrink-0 text-primary" strokeWidth={1.6} />{dateLabel}
                          </p>
                          <span className="shrink-0 max-w-[52%] text-right text-primary text-[11px] font-bold leading-tight break-words">{dayKcal} kcal · {dayProtein}g protein</span>
                        </div>
                        <div className="space-y-2">
                          {plates.map((p) => {
                            const time = new Date(p.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
                            const items = (p.items ?? []) as any[];
                            const photoUrl = p.snapshot_url
                              ? supabase.storage.from("plate-snapshots").getPublicUrl(p.snapshot_url).data?.publicUrl
                              : null;
                            return (
                              <div key={p.id} className="flex gap-3 p-2.5 rounded-xl bg-primary/5">
                                {photoUrl ? (
                                  <img src={photoUrl} alt={p.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                                ) : (
                                  <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                    <Utensils className="w-5 h-5 text-primary" strokeWidth={1.6} />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <p className="min-w-0 text-foreground text-[11px] font-bold leading-tight break-words">{p.name}</p>
                                    <p className="text-muted-foreground text-[10px] shrink-0 text-right leading-tight">{time}</p>
                                  </div>
                                  <p className="text-primary text-xs font-bold mb-1 leading-tight break-words">
                                    {Math.round(Number(p.total_calories_kcal) || 0)} kcal
                                    {p.total_protein_g ? ` · ${Math.round(Number(p.total_protein_g))}g protein` : ""}
                                  </p>
                                  <div className="space-y-0.5">
                                    {items.slice(0, 4).map((it: any, i: number) => (
                                      <div key={i} className="flex items-start justify-between gap-2 text-[9px] leading-tight">
                                        <span className="min-w-0 text-foreground break-words">{it.name}</span>
                                        <span className="text-muted-foreground shrink-0 max-w-[48%] text-right break-words">
                                          {it.serving_label ?? it.household_measure ?? "1 serving"}
                                        </span>
                                      </div>
                                    ))}
                                    {items.length > 4 && <p className="text-muted-foreground text-[9px]">+{items.length - 4} more</p>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    );
                  })}
                </>
              );
            })()
          ) : logsTab === "supplements" ? (
            suppTrackingLogs.length === 0 ? (
              <EmptyState icon={Pill} title="No supplement logs yet" description="Take your supplements to see tracking history." />
            ) : (() => {
              const suppMap = Object.fromEntries(suppList.map(s => [s.id, s]));
              const itemMap = Object.fromEntries(suppPlanItems.map(i => [i.id, i]));
              // Group by date
              const dateGroups = new Map<string, SupplementTracking[]>();
              for (const t of suppTrackingLogs) {
                if (!dateGroups.has(t.date)) dateGroups.set(t.date, []);
                dateGroups.get(t.date)!.push(t);
              }
              const sortedDates = [...dateGroups.keys()].sort((a, b) => b.localeCompare(a));
              return (
                <>
                  {sortedDates.map(date => {
                    const entries = dateGroups.get(date)!;
                    const takenCount = entries.filter(e => e.taken).length;
                    const totalItems = suppPlanItems.length;
                    const allDone = takenCount >= totalItems;
                    const dateLabel = formatLogDate(date + "T12:00:00").split(",")[0];
                    return (
                      <motion.div key={date} className="liquid-glass rounded-2xl p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <p className="min-w-0 text-foreground text-xs font-bold flex items-center gap-2 leading-tight break-words">
                            <Pill className="w-3.5 h-3.5 shrink-0 text-primary" strokeWidth={1.6} />{dateLabel}
                          </p>
                          <span className={`shrink-0 max-w-[52%] text-right text-[11px] font-semibold inline-flex items-center justify-end gap-1 leading-tight ${allDone ? "text-success" : takenCount > 0 ? "text-warning" : "text-critical"}`}>
                            {allDone ? <><Check className="w-3 h-3" strokeWidth={2.5} /> All Taken</> : `${takenCount}/${totalItems} taken`}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {entries.map(entry => {
                            const item = itemMap[entry.plan_item_id];
                            const supp = item ? suppMap[item.supplement_id] : null;
                            return (
                              <div key={entry.id || entry.plan_item_id} className={`flex items-start gap-2 p-2 rounded-lg ${entry.taken ? "bg-primary/5" : "bg-destructive/5"}`}>
                                {entry.taken ? (
                                  <Check className="w-3.5 h-3.5 text-success shrink-0" strokeWidth={2.5} />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-critical shrink-0" strokeWidth={1.6} />
                                )}
                                <span className={`min-w-0 flex-1 text-xs font-medium leading-tight break-words ${entry.taken ? "text-foreground" : "text-muted-foreground line-through"}`}>
                                  {supp?.name ?? "Unknown"}
                                </span>
                                {item && <span className="max-w-[42%] text-right text-[9px] text-muted-foreground leading-tight break-words">{item.dosage}</span>}
                              </div>
                            );
                          })}
                          {/* Show missed items (plan items without tracking for this date) */}
                          {suppPlanItems.filter(pi => !entries.some(e => e.plan_item_id === pi.id)).map(pi => {
                            const supp = suppMap[pi.supplement_id];
                            return (
                              <div key={pi.id} className="flex items-start gap-2 p-2 rounded-lg bg-destructive/5">
                                <XCircle className="w-3.5 h-3.5 text-critical shrink-0" strokeWidth={1.6} />
                                <span className="min-w-0 flex-1 text-xs font-medium text-muted-foreground leading-tight break-words">{supp?.name ?? "Unknown"}</span>
                                <span className="shrink-0 text-[9px] text-critical font-semibold">Missed</span>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    );
                  })}
                </>
              );
            })()
          ) : healthLogs.length === 0 ? (
            <EmptyState icon={Activity} title="No logs yet" description="Use the + button to log your first reading." />
          ) : (
            <>
              {logsTab === "diabetes" && healthLogs.map((log) => (
                <motion.div key={log.id} className="liquid-glass rounded-2xl p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <p className="text-foreground text-xs font-bold mb-3 flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-primary" strokeWidth={1.6} />{formatLogDate(log.logged_at)}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <GlucoseSlot log={log} slot="morning" onSaved={() => setLogsReloadKey((k) => k + 1)} />
                    <GlucoseSlot log={log} slot="evening" onSaved={() => setLogsReloadKey((k) => k + 1)} />
                  </div>
                </motion.div>
              ))}
              {logsTab === "bp" && healthLogs.map((log) => (
                <motion.div key={log.id} className="liquid-glass rounded-2xl p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <p className="text-foreground text-xs font-bold mb-2 flex items-center gap-2"><Heart className="w-3.5 h-3.5 text-destructive" strokeWidth={1.6} />{formatLogDate(log.logged_at)}</p>
                  <p className="text-foreground text-2xl font-black">{log.bp_systolic ?? "—"}<span className="text-muted-foreground text-base font-normal">/{log.bp_diastolic ?? "—"}</span><span className="text-muted-foreground text-sm font-normal ml-2">mmHg</span></p>
                </motion.div>
              ))}
              {logsTab === "weight" && healthLogs.map((log) => (
                <motion.div key={log.id} className="liquid-glass rounded-2xl p-4 flex items-center justify-between" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div>
                    <p className="text-foreground text-xs font-bold mb-1 flex items-center gap-2"><Scale className="w-3.5 h-3.5 text-primary" strokeWidth={1.6} />{formatLogDate(log.logged_at)}</p>
                    <p className="text-foreground text-xl font-black">{log.weight_kg ? `${log.weight_kg} kg` : "—"}</p>
                  </div>
                </motion.div>
              ))}
            </>
          )}
        </div>
      </SubScreenShell>
    );
  }

  if (subPage === "appSettings") {
    return (
      <SubScreenShell onBack={() => setSubPage(null)} title={t("appSettings")}>
        <div className="flex flex-col gap-3">
          <div className="liquid-glass rounded-2xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 shrink-0 rounded-xl liquid-glass flex items-center justify-center"><Globe className="w-4 h-4 text-primary" strokeWidth={1.6} /></div>
              <div className="min-w-0"><p className="text-foreground font-medium text-sm leading-tight break-words">{t("language")}</p><p className="text-muted-foreground text-xs leading-snug break-words">{t("appDisplayLang")}</p></div>
            </div>
            <div className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-2">
              {(enabledLanguages.length > 0
                ? enabledLanguages
                    .map((l) => l.code as Language)
                    .filter((c) => c in LANGUAGE_LABELS)
                : (Object.keys(LANGUAGE_LABELS) as Language[])
              ).map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`min-h-10 text-xs px-2 py-2 rounded-xl font-medium transition-colors text-center leading-tight break-words ${lang === l ? "bg-primary text-primary-foreground" : "liquid-glass text-muted-foreground hover:text-foreground"}`}>{LANGUAGE_LABELS[l]}</button>
              ))}
            </div>

          </div>
          <div className="liquid-glass rounded-2xl p-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-3">
              <div className="w-9 h-9 shrink-0 rounded-xl liquid-glass flex items-center justify-center"><Zap className="w-4 h-4 text-primary" strokeWidth={1.6} /></div>
              <div className="min-w-0"><p className="text-foreground font-medium text-sm leading-tight break-words">{t("appVersion")}</p><p className="text-muted-foreground text-xs leading-snug break-words">v{APP_VERSION} — {t("upToDate")}</p></div>
            </div>
            <span className="shrink-0 text-primary text-xs font-semibold leading-tight text-right">{t("latest")}</span>
          </div>
        </div>
      </SubScreenShell>
    );
  }

  if (subPage === "notifications") {
    return (
      <SubScreenShell onBack={() => setSubPage(null)} title="Notification Settings">
        <div className="flex flex-col gap-3">
          {[
            { label: "Daily Log Reminders", sublabel: "Diabetes, BP & health logs at 8am and 8pm", value: notifDailyLog, setter: setNotifDailyLog, icon: Activity },
            { label: "Supplement Reminders", sublabel: "Pill reminders based on your prescription timing", value: notifSupplement, setter: setNotifSupplement, icon: Pill },
            { label: "Weekly Weight Reminder", sublabel: "Every Monday morning", value: notifWeightReminder, setter: setNotifWeightReminder, icon: Scale },
            { label: "Appointment Alerts", sublabel: "1 hour before scheduled consultations", value: notifAppointment, setter: setNotifAppointment, icon: BellRing },
            { label: "Community Updates", sublabel: "Likes and comments on your posts", value: notifCommunity, setter: setNotifCommunity, icon: BellOff },
          ].map(({ label, sublabel, value, setter, icon: Icon }) => (
            <div key={label} className="liquid-glass rounded-2xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-3">
                <div className="w-9 h-9 shrink-0 rounded-xl liquid-glass flex items-center justify-center"><Icon className="w-4 h-4 text-primary" strokeWidth={1.6} /></div>
                <div className="min-w-0 flex-1"><p className="text-foreground font-medium text-sm leading-tight break-words">{label}</p><p className="text-muted-foreground text-xs leading-snug break-words">{sublabel}</p></div>
              </div>
              <Switch className="shrink-0 mt-1" checked={value} onCheckedChange={setter} />
            </div>
          ))}

          {/* Sound preview + test notification */}
          <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-3 mt-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-foreground font-semibold text-sm">Notification Sound</p>
                <p className="text-muted-foreground text-xs">BBDO signature chime plays on new alerts</p>
              </div>
              <Switch
                checked={!soundMuted}
                onCheckedChange={(on) => { setMuted(!on); setSoundMutedState(!on); }}
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-14">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={soundVolume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setMasterVolume(v);
                  setSoundVolumeState(v);
                }}
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-foreground w-10 text-right">{Math.round(soundVolume * 100)}%</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={async () => {
                  setMuted(false);
                  setSoundMutedState(false);
                  if (soundVolume < 0.8) {
                    setMasterVolume(0.8);
                    setSoundVolumeState(0.8);
                  }
                  const s = await getNotificationSoundSettings();
                  playNotificationSound(s.variant);
                  if (isNativePushSupported()) {
                    void sendLocalHealthAlert("BBDO sound check", "This is the phone notification sound preview.");
                  }
                }}
                className="rounded-xl liquid-glass py-2.5 text-sm font-semibold text-foreground active:scale-[0.98] transition"
              >
                Play sound
              </button>
              <button
                disabled={sendingTest || !user?.id}
                onClick={async () => {
                  if (!user?.id) return;
                  setSendingTest(true);
                  try {
                    if (isNativePushSupported()) {
                      const registration = await registerNativePush(user.id);
                      if (registration.ok === false) {
                        toast.error(registration.reason === "permission_denied" ? "Enable notifications in phone settings." : `Push setup failed: ${registration.reason}`);
                      } else if (!registration.token) {
                        toast.warning("Phone permission is on, but the push token is not ready yet. Try again in a few seconds.");
                      }

                      const remote = await sendRemoteHealthPushResult("BBDO push test", "Lock your phone — this should beep when it arrives.", { delaySeconds: 8 });
                      if (remote.ok) {
                        toast.success(`Phone push queued — lock the phone now (${remote.sent ?? 0}/${remote.attempted ?? 0})`);
                      } else {
                        toast.error(remote.note ?? remote.error ?? "Phone push was not accepted yet");
                      }
                    } else {
                      const s = await getNotificationSoundSettings();
                      if (!getMuted()) playNotificationSound(s.variant);
                      toast.success("Test notification sent");
                    }
                  } catch (err: any) {
                    toast.error(err?.message ?? "Failed to send test");
                  } finally {
                    setSendingTest(false);
                  }
                }}
                className="rounded-xl gradient-blue py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.98] transition disabled:opacity-60"
              >
                {sendingTest ? "Sending…" : "Send test notification"}
              </button>
            </div>
          </div>

          {isNativePushSupported() && (
            <button
              onClick={() => user?.id && void registerNativePushWithToast(user.id)}
              className="mt-2 rounded-2xl liquid-glass p-4 flex items-center justify-between gap-3 active:scale-[0.99] transition"
            >
              <div className="min-w-0 text-left">
                <p className="text-foreground font-semibold text-sm">Enable push notifications</p>
                <p className="text-muted-foreground text-xs">Get alerts even when the app is closed</p>
              </div>
              <BellRing className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
            </button>
          )}
          <p className="text-muted-foreground text-xs px-1 mt-2">Push notifications require device permission to work.</p>
        </div>
      </SubScreenShell>
    );
  }

  if (subPage === "plan") {
    return <MyPlanSection onBack={() => setSubPage(null)} />;
  }

  if (subPage === "editProfile") {
    return <EditProfile onBack={() => setSubPage(null)} />;
  }

  if (subPage === "referral") {
    return <ReferAndEarn onBack={() => setSubPage(null)} />;
  }

  if (subPage === "diet") {
    return <DietPreferences onBack={() => setSubPage(null)} />;
  }

  if (subPage === "privacy") {
    return (
      <PrivacySecurityPage
        userId={user?.id}
        userName={userName}
        onBack={() => setSubPage(null)}
      />
    );
  }

  if (subPage === "achievements") {
    const fastingEarnedIds = new Set(userBadges.map(b => b.badge_id));
    const { nextBadge: fastingNext, progress: fastingProgress } = getBadgeLevel(userBadges, allBadges);
    const fastingSorted = [...allBadges].sort((a, b) => a.level - b.level);

    const suppEarnedIds = new Set(userSuppBadges.map(b => b.badge_id));
    const { nextBadge: suppNext, progress: suppProgress } = getSupplementBadgeLevel(userSuppBadges, suppBadgeDefs);
    const suppSorted = [...suppBadgeDefs].sort((a, b) => a.level - b.level);

    const movementEarnedIds = new Set(userMovementBadges.map(b => b.badge_code));
    const movementSorted = [...movementBadgeDefs].sort((a, b) => a.name.localeCompare(b.name));

    const totalEarned = userBadges.length + userSuppBadges.length + userMovementBadges.length;
    const totalBadges = allBadges.length + suppBadgeDefs.length + movementBadgeDefs.length;

    return (
      <SubScreenShell onBack={() => setSubPage(null)} title="Achievements">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <Trophy className="w-5 h-5 shrink-0 text-primary" strokeWidth={1.6} />
              <span className="text-foreground font-bold text-base leading-tight break-words">{totalEarned}/{totalBadges} Badges Earned</span>
            </div>
          </div>

          {/* Weekly + Monthly Progress cards */}
          <BbdoBadgeGrid />


          {/* Fasting Badges Section */}
          <div>
            <div className="flex items-start gap-2 mb-3">
              <Timer className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.6} />
              <span className="min-w-0 flex-1 text-foreground font-bold text-sm leading-tight break-words">Fasting Streaks</span>
              <span className="shrink-0 text-muted-foreground text-xs text-right">{userBadges.length}/{allBadges.length}</span>
            </div>
            {fastingNext && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 mb-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="min-w-0 text-foreground text-xs font-semibold leading-tight break-words">Next: {fastingNext.badge_name}</span>
                  <span className="shrink-0 text-primary text-xs font-bold">{fastingProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-border overflow-hidden">
                  <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${fastingProgress}%` }} transition={{ duration: 0.8 }} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-2">
              {fastingSorted.map((badge) => {
                const isEarned = fastingEarnedIds.has(badge.id);
                return (
                  <motion.div key={badge.id} className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl text-center ${isEarned ? "bg-primary/10 border border-primary/20" : "bg-muted/50 border border-border opacity-50"}`} whileHover={{ y: -1 }}>
                    <FlatBadgeIcon earned={isEarned} type="fasting" />
                    <span className={`text-[10px] font-semibold leading-tight ${isEarned ? "text-foreground" : "text-muted-foreground"}`}>{badge.badge_name}</span>
                    <span className="text-[9px] text-muted-foreground">{badge.required_streak_days}d</span>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Supplement Badges Section */}
          {suppBadgeDefs.length > 0 && (
            <div>
              <div className="flex items-start gap-2 mb-3">
                <Pill className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.6} />
                <span className="min-w-0 flex-1 text-foreground font-bold text-sm leading-tight break-words">Supplement Streaks</span>
                <span className="shrink-0 text-muted-foreground text-xs text-right">{userSuppBadges.length}/{suppBadgeDefs.length}</span>
              </div>
              {suppNext && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 mb-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="min-w-0 text-foreground text-xs font-semibold leading-tight break-words">Next: {suppNext.badge_name}</span>
                    <span className="shrink-0 text-primary text-xs font-bold">{suppProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-border overflow-hidden">
                    <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${suppProgress}%` }} transition={{ duration: 0.8 }} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-2">
                {suppSorted.map((badge) => {
                  const isEarned = suppEarnedIds.has(badge.id);
                  return (
                    <motion.div key={badge.id} className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl text-center ${isEarned ? "bg-primary/10 border border-primary/20" : "bg-muted/50 border border-border opacity-50"}`} whileHover={{ y: -1 }}>
                      <FlatBadgeIcon earned={isEarned} type="supplement" />
                      <span className={`text-[10px] font-semibold leading-tight ${isEarned ? "text-foreground" : "text-muted-foreground"}`}>{badge.badge_name}</span>
                      <span className="text-[9px] text-muted-foreground">{badge.required_streak_days}d</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Movement Badges Section */}
          {movementBadgeDefs.length > 0 && (
            <div>
              <div className="flex items-start gap-2 mb-3">
                <Footprints className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.6} />
                <span className="min-w-0 flex-1 text-foreground font-bold text-sm leading-tight break-words">Movement Achievements</span>
                <span className="shrink-0 text-muted-foreground text-xs text-right">{userMovementBadges.length}/{movementBadgeDefs.length}</span>
              </div>
              <div className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-2">
                {movementSorted.map((badge) => {
                  const isEarned = movementEarnedIds.has(badge.code);
                  return (
                    <motion.div key={badge.id} className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl text-center ${isEarned ? "bg-primary/10 border border-primary/20" : "bg-muted/50 border border-border opacity-50"}`} whileHover={{ y: -1 }}>
                      <FlatBadgeIcon earned={isEarned} type="movement" />
                      <span className={`text-[10px] font-semibold leading-tight ${isEarned ? "text-foreground" : "text-muted-foreground"}`}>{badge.name}</span>
                      {badge.description && (
                        <span className="text-[9px] text-muted-foreground leading-tight line-clamp-2">{badge.description}</span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Coach Compliments Section */}
          {compliments.length > 0 && (
            <div>
              <div className="flex items-start gap-2 mb-3">
                <MessageCircle className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.6} />
                <span className="min-w-0 flex-1 text-foreground font-bold text-sm leading-tight break-words">Coach Compliments</span>
                <span className="shrink-0 text-muted-foreground text-xs text-right">{compliments.length} received</span>
              </div>
              <div className="flex flex-col gap-2">
                {compliments.map((c) => {
                  const timeAgo = getTimeAgo(c.created_at);
                  return (
                    <motion.div
                      key={c.id}
                      className="liquid-glass rounded-2xl p-4 border border-primary/10"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="flex items-start gap-3">
                        <FlatComplimentIcon type={c.compliment_type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground text-sm leading-relaxed">{c.message}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {c.metric_value && (
                              <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-semibold">{c.metric_value}</span>
                            )}
                            <span className="text-muted-foreground text-[10px]">{timeAgo}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SubScreenShell>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-5 pb-28 bg-background min-h-dvh">
      <div
        className="-mx-5 px-5 flex items-center justify-between gap-3"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 0.875rem)",
          paddingBottom: "0.75rem",
        }}
      >
        <h1 className="min-w-0 text-xl font-black text-foreground leading-tight break-words">{t("profile")}</h1>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close profile"
            className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center border border-[var(--bbdo-line)]"
            style={{ boxShadow: "var(--shadow-lift)" }}
          >
            <X className="w-4 h-4 text-foreground" strokeWidth={2} />
          </button>
        )}
      </div>

      <motion.div className="flex flex-col items-center gap-3" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="w-24 h-24 rounded-3xl overflow-hidden bg-primary/10 shadow-md flex items-center justify-center">
          {userAvatar ? (
            <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-primary font-black text-4xl">{userName.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="max-w-full text-center">
          <h2 className="text-2xl font-black text-foreground leading-tight break-words">{userName}</h2>
          <p className="text-muted-foreground text-sm leading-snug break-words">{planName ?? t("member")}</p>
          <p className={`text-xs font-bold mt-1 leading-snug break-words ${storedUser?.profile?.gender ? "text-foreground" : "text-destructive"}`}>Gender: {userGender}</p>
        </div>
        {(() => {
          let label: string;
          let tone: "good" | "wake" | "attention" | "moderate" | "high";
          if (userScore < 40) { tone = "high"; label = "High Risk"; }
          else if (userScore < 50) { tone = "moderate"; label = "Moderate Risk"; }
          else if (userScore < 60) { tone = "attention"; label = "Attention Required"; }
          else if (userScore < 70) { tone = "wake"; label = "Wake-up Call"; }
          else { tone = "good"; label = "Good Health"; }
          const styles =
            tone === "high" ? "bg-destructive/10 text-destructive" :
            tone === "moderate" ? "bg-orange-500/10 text-orange-600" :
            tone === "attention" ? "bg-amber-500/10 text-amber-600" :
            tone === "wake" ? "bg-yellow-500/10 text-yellow-600" :
            "bg-primary/10 text-primary";
          return (
            <div className={`max-w-full flex items-center gap-2 px-4 py-2 rounded-full ${styles}`}>
              <Flame className="w-4 h-4" strokeWidth={1.6} />
              <span className="min-w-0 text-sm font-semibold leading-tight break-words">{label}</span>
            </div>
          );
        })()}
      </motion.div>

      <motion.div className={`liquid-glass rounded-2xl p-4 flex items-center justify-between gap-3 ${initialScore !== null && userScore < initialScore ? "border border-destructive/40 bg-destructive/5" : "bg-primary/20"}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs mb-1 leading-tight break-words">{t("healthScore")}</p>
          <p className="text-foreground font-black text-3xl">{userScore} <span className="text-muted-foreground text-base font-normal">/ 100</span></p>
          <p className="text-primary text-xs font-medium mt-0.5 leading-tight break-words">{userRiskCategory}</p>
          {initialScore !== null && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {userScore > initialScore ? (
                <span className="text-xs font-bold text-success flex items-center gap-0.5 leading-tight break-words">
                  📈 +{userScore - initialScore} from start
                </span>
              ) : userScore < initialScore ? (
                <span className="text-xs font-bold text-destructive flex items-center gap-0.5 leading-tight break-words">
                  📉 {userScore - initialScore} from start
                </span>
              ) : (
                <span className="text-xs font-medium text-muted-foreground leading-tight break-words">No change from start</span>
              )}
            </div>
          )}
        </div>
        <HealthScoreRing
          score={userScore}
          size={72}
          thickness={6}
          showSubtitle={false}
          scoreClassName="text-lg"
          className="shrink-0"
        />
      </motion.div>

      <motion.div className="grid grid-cols-2 gap-3" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        {statsMeta.map((stat) => {
          const Icon = stat.icon;
          const raw = stats[stat.field];
          const value = stat.field === "xpEarned" ? raw.toLocaleString() : String(raw);
          return (
            <div key={stat.key} className="liquid-glass rounded-2xl p-4 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 min-w-0"><Icon className={`w-4 h-4 shrink-0 ${stat.color}`} strokeWidth={1.6} /><span className={`min-w-0 text-2xl font-black leading-tight break-words ${stat.color}`}>{value}</span></div>
              <span className="text-muted-foreground text-xs font-medium leading-tight break-words">{t(stat.key)}</span>
            </div>
          );
        })}
      </motion.div>

      <motion.div className="liquid-glass rounded-2xl p-4" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="flex items-start gap-2 mb-3"><Activity className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.6} /><span className="min-w-0 text-foreground font-bold text-sm leading-tight break-words">{t("yourGoals")}</span></div>
        <div className="flex flex-wrap gap-2">
          {[t("controlDiabetes"), t("loseWeight"), t("boostEnergy")].map((goal) => (
            <span key={goal} className="px-3 py-1.5 bg-primary/20 border border-primary/30 rounded-full text-primary text-xs font-medium leading-tight break-words">{goal}</span>
          ))}
        </div>
      </motion.div>

      {/* ─── Achievements teaser ─── */}
      {(allBadges.length > 0 || suppBadgeDefs.length > 0 || movementBadgeDefs.length > 0) && (
        <motion.button
          onClick={() => setSubPage("achievements")}
          className="liquid-glass rounded-2xl p-4 flex items-start justify-between gap-3 w-full text-left"
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="min-w-0 flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <p className="text-foreground font-medium text-sm leading-tight break-words">Achievements</p>
              <p className="text-muted-foreground text-xs leading-snug break-words">
                {userBadges.length + userSuppBadges.length + userMovementBadges.length}/{allBadges.length + suppBadgeDefs.length + movementBadgeDefs.length} badges earned
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
        </motion.button>
      )}

      {/* Compliments teaser */}
      {compliments.length > 0 && (
        <motion.button
          onClick={() => setSubPage("achievements")}
          className="liquid-glass rounded-2xl p-4 w-full text-left"
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" strokeWidth={1.6} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-foreground font-medium text-sm leading-tight break-words">Coach Compliments</p>
              <p className="text-muted-foreground text-xs leading-snug break-words">{compliments.length} received</p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
            <FlatComplimentIcon type={compliments[0].compliment_type} />
            <p className="text-foreground text-xs leading-relaxed line-clamp-2">{compliments[0].message}</p>
          </div>
        </motion.button>
      )}

      {/* Abnormal markers (high/low) - surfaced at top */}
      {user && <AbnormalMarkersCard userId={user.id} />}

      {/* Lab Markers: latest values, baseline, deltas */}
      {user && (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2 px-1">
            <h3 className="min-w-0 text-sm font-black text-foreground leading-tight break-words">Lab Markers</h3>
            <span className="shrink-0 text-right text-[10px] text-muted-foreground leading-tight">Baseline · Δ vs first</span>
          </div>
          <LabHistorySection userId={user.id} />
        </div>
      )}


      <motion.div className="liquid-glass rounded-3xl overflow-hidden" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        {menuItems.map((item, i) => {
          const Icon = item.icon;
          const isLast = i === menuItems.length - 1;
          return (
            <button key={item.label} className={`w-full flex items-start gap-4 p-5 text-left hover:bg-accent transition-colors ${!isLast ? "border-b border-border" : ""}`} onClick={item.action}>
              <div className="w-10 h-10 shrink-0 rounded-xl liquid-glass flex items-center justify-center"><Icon className="w-5 h-5 text-muted-foreground" strokeWidth={1.6} /></div>
              <div className="min-w-0 flex-1"><p className="text-foreground font-medium text-sm leading-tight break-words">{item.label}</p><p className="text-muted-foreground text-xs leading-snug break-words">{item.sublabel}</p></div>
              <ChevronRight className="w-4 h-4 shrink-0 mt-3 text-muted-foreground" />
            </button>
          );
        })}
      </motion.div>

      <motion.button
        onClick={handleLogout}
        disabled={loggingOut}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        whileTap={{ scale: 0.98 }}
        className="w-full mt-2 mb-6 h-14 rounded-2xl bg-destructive text-destructive-foreground font-semibold text-[15px] tracking-tight flex items-center justify-center gap-2 shadow-[0_8px_24px_-8px_hsl(var(--destructive)/0.5)] active:opacity-90 disabled:opacity-60"
      >
        {loggingOut ? (
          <>
            <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            Logging out…
          </>
        ) : (
          <>
            <LogOut className="w-[18px] h-[18px]" strokeWidth={2} />
            {t("logOut")}
          </>
        )}
      </motion.button>
    </div>
  );
}

function GlucoseSlot({ log, slot, onSaved }: { log: HealthLog; slot: "morning" | "evening"; onSaved: () => void }) {
  const value = slot === "morning" ? log.glucose_morning : log.glucose_evening;
  const label = slot === "morning" ? "Morning" : "Evening";
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const num = parseFloat(val);
    if (!num || !Number.isFinite(num)) { toast.error("Enter a valid value"); return; }
    setSaving(true);
    try {
      const field = slot === "morning" ? "glucose_morning" : "glucose_evening";
      const { error } = await supabase.from("health_logs" as any).update({ [field]: num }).eq("id", log.id);
      if (error) throw error;
      toast.success(`${label} glucose saved`);
      setEditing(false);
      setVal("");
      onSaved();
      window.dispatchEvent(new CustomEvent("health-log-saved"));
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  if (value != null) {
    return (
      <div className="liquid-glass rounded-xl p-3">
        <p className="text-muted-foreground text-xs mb-1">{label}</p>
        <p className="text-foreground text-base font-black">{value} mg/dL</p>
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="liquid-glass rounded-xl p-3 text-left border border-dashed border-border hover:border-primary/50 transition-colors"
      >
        <p className="text-muted-foreground text-xs mb-1">{label}</p>
        <p className="text-primary text-xs font-bold flex items-center gap-1"><Plus className="w-3 h-3" /> Add reading</p>
      </button>
    );
  }

  return (
    <div className="liquid-glass rounded-xl p-3">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      <div className="flex items-center gap-1">
        <input
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="mg/dL"
          className="flex-1 min-w-0 bg-transparent text-foreground text-sm font-bold outline-none border-b border-border focus:border-primary"
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
      </div>
    </div>
  );
}
