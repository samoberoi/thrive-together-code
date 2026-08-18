import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  Users, Star, Activity, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Heart, UserCheck, Loader2, Bell,
  CalendarClock, Clock, Plus, Package, Send, CheckCircle2, Search, Percent, FlaskConical, FileText, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { coachTypeLabel, resolveCurrentCoach, type Coach } from "@/lib/coachService";
import { createNotification } from "@/lib/notificationService";
import { meetingTypeLabel } from "@/lib/meetingService";
import { toast } from "sonner";
import ScheduleMeetingDialog from "@/components/coach/ScheduleMeetingDialog";
import PatientDailySummaryDialog from "@/components/coach/PatientDailySummaryDialog";
import CoachCommissionDialog from "@/components/coach/CoachCommissionDialog";
import CoachActivityNudgeDialog, {
  ACTIVITY_META,
  type ActivityKey,
  type PendingPatient,
} from "@/components/coach/CoachActivityNudgeDialog";
import CoachReviewsDialog from "@/components/coach/CoachReviewsDialog";
import CoachActivityRings from "@/components/coach/CoachActivityRings";
import CoachSelfCheckins from "@/components/coach/CoachSelfCheckins";
import { buildActivityProgress, splitVideoMinutes, fetchActivityGoals, DEFAULT_ACTIVITY_GOALS, type ActivityCounters } from "@/lib/adherenceService";



interface PatientSummary {
  user_id: string;
  assigned_at: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  age: number | null;
  gender: string | null;
  weight: number | null;
  latestWeight: number | null;
  previousWeight: number | null;
  bmi: number | null;
  bmi_category: string | null;
  latestGlucose: number | null;
  latestBpSystolic: number | null;
  latestBpDiastolic: number | null;
  initialScore: number | null;
  currentScore: number | null;
  planName: string | null;
  planStarted: string | null;
  planExpires: string | null;
  hasFastingProtocol: boolean;
  hasSuppPlan: boolean;
  activities: Record<ActivityKey, boolean>;
  applicable: Record<ActivityKey, boolean>;
  progress?: Partial<Record<ActivityKey, { text: string; ratio: number }>>;

  doneCount: number;
  applicableCount: number;
  onTrack: boolean;
}

interface Alert {
  user_id: string;
  patient_name: string;
  type: "danger" | "warning";
  message: string;
  metric: string;
  created_at?: string;
  source?: "notification" | "calculated";
}

interface CoachHealthNotification {
  id: string;
  title: string | null;
  body: string | null;
  icon: string | null;
  created_at: string;
}

interface CommissionBreakdownRow {
  plan_name: string;
  count: number;
  monthly_revenue: number;
}

interface CommissionSummary {
  percent: number;
  name: string;
  frequency: string;
  totalAssigned: number;
  totalPaying: number;
  totalMonthlyRevenue: number;
  monthlyCommission: number;
  rows: CommissionBreakdownRow[];
}

function parseCoachHealthNotification(row: CoachHealthNotification): Alert | null {
  const rawTitle = (row.title ?? "").trim();
  const rawBody = (row.body ?? "").trim();
  if (!rawTitle && !rawBody) return null;

  const titleText = rawTitle
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/^Critical:\s*/i, "")
    .trim();
  const lowerTitle = titleText.toLowerCase();
  const updatedIndex = lowerTitle.indexOf(" updated health data");
  const attentionIndex = lowerTitle.indexOf(" needs attention");
  const splitIndex = updatedIndex >= 0 ? updatedIndex : attentionIndex;
  const patientName = splitIndex >= 0 ? titleText.slice(0, splitIndex).trim() : titleText;

  const colonIndex = rawBody.indexOf(":");
  const metric = colonIndex > 0 ? rawBody.slice(0, colonIndex).trim() : "Health";
  const message = (colonIndex > 0 ? rawBody.slice(colonIndex + 1) : rawBody)
    .replace(/\.?\s*Tap to review\.?$/i, "")
    .trim();

  return {
    user_id: row.id,
    patient_name: patientName || "Patient",
    type: rawTitle.includes("🚨") || /critical/i.test(rawTitle) ? "danger" : "warning",
    message: message || rawBody || "Health data updated",
    metric: metric || "Health",
    created_at: row.created_at,
    source: "notification",
  };
}

function evaluateAlerts(patients: PatientSummary[], healthNotifications: CoachHealthNotification[] = []): Alert[] {
  const seen = new Set<string>();
  const alerts: Alert[] = [];
  const push = (a: Alert) => {
    const key = `${a.patient_name.toLowerCase()}|${a.metric.toLowerCase()}|${a.message.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push(a);
  };
  healthNotifications
    .map(parseCoachHealthNotification)
    .forEach((alert) => {
      if (alert) push(alert);
    });
  for (const p of patients) {
    const name = p.name ?? "Unknown";
    if (p.latestWeight != null && p.previousWeight != null) {
      const delta = p.latestWeight - p.previousWeight;
      const absDelta = Math.abs(delta);
      if (absDelta >= 2) {
        push({
          user_id: p.user_id,
          patient_name: name,
          type: absDelta >= 10 ? "danger" : "warning",
          message: `Weight ${delta > 0 ? "increased" : "decreased"} by ${Math.round(absDelta * 10) / 10} kg (${p.previousWeight} → ${p.latestWeight})`,
          metric: "Weight",
          source: "calculated",
        });
      }
    } else if (p.latestWeight != null && (p.latestWeight >= 150 || p.latestWeight <= 35)) {
      push({ user_id: p.user_id, patient_name: name, type: "warning", message: `Weight is ${p.latestWeight} kg`, metric: "Weight", source: "calculated" });
    }
    if (p.bmi && p.bmi >= 30) {
      push({ user_id: p.user_id, patient_name: name, type: p.bmi >= 35 ? "danger" : "warning", message: `BMI is ${p.bmi} (${p.bmi_category})`, metric: "BMI", source: "calculated" });
    }
    if (p.latestGlucose != null) {
      if (p.latestGlucose >= 250 || p.latestGlucose <= 54) {
        push({ user_id: p.user_id, patient_name: name, type: "danger", message: `Glucose at ${p.latestGlucose} mg/dL`, metric: "Glucose", source: "calculated" });
      } else if (p.latestGlucose >= 140 || p.latestGlucose <= 70) {
        push({ user_id: p.user_id, patient_name: name, type: p.latestGlucose >= 180 ? "danger" : "warning", message: `Glucose at ${p.latestGlucose} mg/dL`, metric: "Glucose", source: "calculated" });
      }
    }
    if (p.latestBpSystolic != null && p.latestBpDiastolic != null) {
      if (p.latestBpSystolic >= 180 || p.latestBpDiastolic >= 120) {
        push({ user_id: p.user_id, patient_name: name, type: "danger", message: `BP at ${p.latestBpSystolic}/${p.latestBpDiastolic} mmHg`, metric: "BP", source: "calculated" });
      } else if (p.latestBpSystolic >= 140 || p.latestBpDiastolic >= 90 || p.latestBpSystolic <= 90 || p.latestBpDiastolic <= 60) {
        push({ user_id: p.user_id, patient_name: name, type: p.latestBpSystolic >= 150 ? "danger" : "warning", message: `BP at ${p.latestBpSystolic}/${p.latestBpDiastolic} mmHg`, metric: "BP", source: "calculated" });
      }
    }
    if (p.initialScore != null && p.currentScore != null && p.currentScore < p.initialScore) {
      const delta = p.currentScore - p.initialScore;
      push({ user_id: p.user_id, patient_name: name, type: delta <= -5 ? "danger" : "warning", message: `Health score dropped ${Math.abs(delta)} pts (${p.initialScore} → ${p.currentScore})`, metric: "Score", source: "calculated" });
    }
  }
  return alerts.sort((a, b) => {
    if (a.created_at && b.created_at) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (a.created_at) return -1;
    if (b.created_at) return 1;
    if (a.type === b.type) return 0;
    return a.type === "danger" ? -1 : 1;
  });
}

const ALL_ACTIVITIES: ActivityKey[] = [
  "glucose", "bp", "weight", "fasting", "supplements", "exercise", "yoga", "diet",
  "water", "soleus", "breath",
];

const WATER_GLASS_GOAL = 8;
const SOLEUS_GOAL = 3;
const BREATH_GOAL = 4;

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;


export default function CoachHome({ onViewPatient, onViewMessages, onViewLabTests }: { onViewPatient?: () => void; onViewFasting?: () => void; onViewMessages?: () => void; onViewLabTests?: () => void }) {
  const { user } = useAuth();
  const { greeting } = useLanguage();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [newLabReports, setNewLabReports] = useState<{ id: string; name: string; fileName: string | null; createdAt: string }[]>([]);

  const [needsScheduling, setNeedsScheduling] = useState<PatientSummary[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<{ user_id: string; name: string; scheduledAt: string; type: string }[]>([]);
  const [scheduleFor, setScheduleFor] = useState<PatientSummary | null>(null);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nudgingAll, setNudgingAll] = useState(false);
  const [summaryPatient, setSummaryPatient] = useState<PatientSummary | null>(null);
  const [activityDialog, setActivityDialog] = useState<ActivityKey | null>(null);
  const [search, setSearch] = useState("");
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commissionInfo, setCommissionInfo] = useState<CommissionSummary | null>(null);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadSequence = useRef(0);


  useEffect(() => {
    if (!user) return;
    loadData();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => loadData({ silent: true }), 400);
    };

    const channel = supabase
      .channel(`coach-health-alerts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { type?: string };
          if (row.type === "health_alert") loadData({ silent: true });
        }
      );

    // Live patient activity — any check-in updates the coach view immediately
    for (const table of [
      "health_logs",
      "user_supplement_tracking",
      "fasting_tracking",
      "user_exercise_logs",
      "video_progress",
      "meal_photos",
      "user_soleus_sessions",
      "user_breath_sessions",
      "user_supplement_plans",
      "user_protocols",
    ]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refreshSoon);
    }

    channel.subscribe();

    const onFocus = () => refreshSoon();
    window.addEventListener("focus", onFocus);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const loadData = async (opts?: { silent?: boolean }) => {
    if (!user) return;
    const sequence = ++loadSequence.current;
    if (!opts?.silent) setLoading(true);


    const coachData = await resolveCurrentCoach(user);

    if (sequence !== loadSequence.current) return;
    if (!coachData) { setLoading(false); return; }
    setCoach(coachData as unknown as Coach);

    const { data: assignments } = await supabase
      .from("coach_assignments" as any)
      .select("user_id, assigned_at")
      .eq("coach_id", (coachData as any).id)
      .eq("is_active", true);

    // Always compute commission — even for coaches with 0 patients we still show 0 with the model %
    await computeCommission(coachData, ((assignments as any[]) ?? []).map((a) => a.user_id));

    if (!assignments || assignments.length === 0) {
      setPatients([]); setAlerts([]); setNeedsScheduling([]); setNewLabReports([]); setUpcomingMeetings([]);
      setLoading(false); return;
    }

    const patientIds = (assignments as any[]).map((a) => a.user_id);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();
    // Date-only tracking columns store the patient's local calendar day. Using
    // toISOString() here shifts India midnight to the previous UTC date.
    const todayDate = localDateKey(todayStart);
    const recentHealthAlertIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Fetch everything in parallel across all patients (single queries, not per-patient loops)
    const [
      { data: profiles },
      { data: subs },
      { data: hLogsToday },
      { data: fastTodayRows },
      { data: suppTodayRows },
      { data: activePlans },
      { data: activeProtocols },
      { data: exRows },
      { data: vidRows },
      { data: mealRows },
      { data: latestGlucose },
      { data: latestBp },
      { data: recentWeights },
      { data: recentCoachHealthAlerts },
      { data: soleusRows },
      { data: breathRows },
    ] = await Promise.all([

      supabase.from("profiles" as any)
        .select("user_id, name, phone, avatar_url, age, gender, weight, bmi, bmi_category, initial_health_score, assessment")
        .in("user_id", patientIds),
      supabase.from("subscriptions" as any)
        .select("user_id, plan_name, started_at, expires_at, status")
        .in("user_id", patientIds)
        .eq("status", "active"),
      supabase.from("health_logs" as any)
        .select("user_id, log_type, glucose_morning, glucose_evening, bp_systolic, weight_kg, logged_at")
        .in("user_id", patientIds)
        .gte("logged_at", todayIso),
      supabase.from("fasting_tracking" as any)
        .select("user_id, compliance_status, fasting_hours_completed, fmod_actual_time, lmod_actual_time")
        .in("user_id", patientIds)
        .eq("date", todayDate),
      supabase.from("user_supplement_tracking" as any)
        .select("user_id, taken")
        .in("user_id", patientIds)
        .eq("date", todayDate),
      supabase.from("user_supplement_plans" as any)
        .select("user_id")
        .in("user_id", patientIds)
        .eq("status", "active"),
      supabase.from("user_protocols" as any)
        .select("user_id")
        .in("user_id", patientIds)
        .eq("status", "active"),
      supabase.from("user_exercise_logs" as any)
        .select("user_id").in("user_id", patientIds).gte("created_at", todayIso),
      supabase.from("video_progress" as any)
        .select("user_id, video_id, progress_sec, duration_sec, completed").in("user_id", patientIds).gte("watched_at", todayIso),
      supabase.from("meal_photos" as any)
        .select("user_id").in("user_id", patientIds).gte("logged_at", todayIso),
      supabase.from("health_logs" as any)
        .select("user_id, glucose_morning, glucose_evening, logged_at")
        .in("user_id", patientIds).eq("log_type", "diabetes")
        .order("logged_at", { ascending: false }),
      supabase.from("health_logs" as any)
        .select("user_id, bp_systolic, bp_diastolic, logged_at")
        .in("user_id", patientIds).eq("log_type", "bp")
        .order("logged_at", { ascending: false }),
      supabase.from("health_logs" as any)
        .select("user_id, weight_kg, logged_at")
        .in("user_id", patientIds).eq("log_type", "weight")
        .not("weight_kg", "is", null)
        .order("logged_at", { ascending: false })
        .limit(1000),
      supabase.from("notifications" as any)
        .select("id, title, body, icon, created_at")
        .eq("user_id", user.id)
        .eq("type", "health_alert")
        .gte("created_at", recentHealthAlertIso)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("user_soleus_sessions" as any)
        .select("user_id").in("user_id", patientIds).gte("session_at", todayIso),
      supabase.from("user_breath_sessions" as any)
        .select("user_id").in("user_id", patientIds).gte("session_at", todayIso),

    ]);

    if (sequence !== loadSequence.current) return;

    const suppPlanSet = new Set(((activePlans as any[]) ?? []).map((r) => r.user_id));
    const fastProtoSet = new Set(((activeProtocols as any[]) ?? []).map((r) => r.user_id));
    const { exerciseMin: exMinByUser, yogaMin: yogaMinByUser } = splitVideoMinutes((vidRows as any[]) ?? []);
    const exSet = new Set([...exMinByUser].filter(([, m]) => m >= EXERCISE_GOAL_MINUTES).map(([id]) => id));
    const yogaSet = new Set([...yogaMinByUser].filter(([, m]) => m >= YOGA_GOAL_MINUTES).map(([id]) => id));
    const dietSet = new Set(((mealRows as any[]) ?? []).map((r) => r.user_id));

    // Per-activity detail counters so nudges show exactly what is pending
    const countBy = (rows: any[] | null | undefined) => {
      const m = new Map<string, number>();
      (rows ?? []).forEach((r) => m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1));
      return m;
    };
    const exCountByUser = countBy(exRows as any[]);
    const mealCountByUser = countBy(mealRows as any[]);
    const glucoseCountByUser = new Map<string, number>();
    ((hLogsToday as any[]) ?? []).forEach((l) => {
      if (l.log_type !== "diabetes") return;
      const n = (l.glucose_morning != null ? 1 : 0) + (l.glucose_evening != null ? 1 : 0);
      if (n) glucoseCountByUser.set(l.user_id, (glucoseCountByUser.get(l.user_id) ?? 0) + n);
    });
    const fastingRowByUser = new Map<string, any>();
    ((fastTodayRows as any[]) ?? []).forEach((r) => fastingRowByUser.set(r.user_id, r));
    const suppTakenByUser = new Map<string, number>();
    const suppTotalByUser = new Map<string, number>();
    ((suppTodayRows as any[]) ?? []).forEach((r) => {
      suppTotalByUser.set(r.user_id, (suppTotalByUser.get(r.user_id) ?? 0) + 1);
      if (r.taken) suppTakenByUser.set(r.user_id, (suppTakenByUser.get(r.user_id) ?? 0) + 1);
    });

    // Per-patient today flags
    const glucoseSet = new Set<string>();
    const bpSet = new Set<string>();
    const weightSet = new Set<string>();
    const waterByUser = new Map<string, number>();
    (hLogsToday as any[] | null)?.forEach((l) => {
      if (l.log_type === "diabetes" && (l.glucose_morning != null || l.glucose_evening != null)) glucoseSet.add(l.user_id);
      if (l.log_type === "bp" && l.bp_systolic != null) bpSet.add(l.user_id);
      if (l.log_type === "weight" && l.weight_kg != null) weightSet.add(l.user_id);
      // Water glasses are stored as deltas in weight_kg on log_type "water"
      if (l.log_type === "water" && l.weight_kg != null) {
        waterByUser.set(l.user_id, (waterByUser.get(l.user_id) ?? 0) + Number(l.weight_kg));
      }
    });

    const soleusByUser = new Map<string, number>();
    ((soleusRows as any[]) ?? []).forEach((r) => {
      soleusByUser.set(r.user_id, (soleusByUser.get(r.user_id) ?? 0) + 1);
    });
    const breathByUser = new Map<string, number>();
    ((breathRows as any[]) ?? []).forEach((r) => {
      breathByUser.set(r.user_id, (breathByUser.get(r.user_id) ?? 0) + 1);
    });


    const fastingSet = new Set<string>();
    (fastTodayRows as any[] | null)?.forEach((r) => {
      if (r.compliance_status === "completed" || r.compliance_status === "partial" || (r.fasting_hours_completed ?? 0) > 0) {
        fastingSet.add(r.user_id);
      }
    });

    const suppSet = new Set<string>();
    (suppTodayRows as any[] | null)?.forEach((r) => { if (r.taken) suppSet.add(r.user_id); });

    // Latest glucose / BP (already ordered desc)
    const latestGlucoseByUser = new Map<string, number>();
    (latestGlucose as any[] | null)?.forEach((l) => {
      const glucose = l.glucose_morning ?? l.glucose_evening;
      if (!latestGlucoseByUser.has(l.user_id) && glucose != null) {
        latestGlucoseByUser.set(l.user_id, Number(glucose));
      }
    });
    const latestBpByUser = new Map<string, number>();
    const latestBpDiastolicByUser = new Map<string, number>();
    (latestBp as any[] | null)?.forEach((l) => {
      if (!latestBpByUser.has(l.user_id) && l.bp_systolic != null) {
        latestBpByUser.set(l.user_id, Number(l.bp_systolic));
        if (l.bp_diastolic != null) latestBpDiastolicByUser.set(l.user_id, Number(l.bp_diastolic));
      }
    });
    const weightHistoryByUser = new Map<string, number[]>();
    (recentWeights as any[] | null)?.forEach((l) => {
      if (l.weight_kg == null) return;
      const arr = weightHistoryByUser.get(l.user_id) ?? [];
      if (arr.length < 2) {
        arr.push(Number(l.weight_kg));
        weightHistoryByUser.set(l.user_id, arr);
      }
    });

    const enriched: PatientSummary[] = (assignments as any[]).flatMap((a) => {
      const profile = (profiles as any[])?.find((p) => p.user_id === a.user_id);
      // Purged accounts can leave an assignment behind. Exclude those rows from every
      // coach Home KPI and patient card instead of displaying an Unknown patient.
      if (!profile || (!profile.name?.trim() && !profile.phone?.trim())) return [];
      const sub = (subs as any[])?.find((s) => s.user_id === a.user_id);
      const hasFasting = fastProtoSet.has(a.user_id);
      const hasSupp = suppPlanSet.has(a.user_id);

      const waterGlasses = Math.max(0, Math.round(waterByUser.get(a.user_id) ?? 0));
      const soleusRounds = soleusByUser.get(a.user_id) ?? 0;
      const breathRounds = breathByUser.get(a.user_id) ?? 0;

      const applicable: Record<ActivityKey, boolean> = {
        glucose: true, bp: true, weight: true,
        fasting: hasFasting,
        supplements: hasSupp,
        exercise: true, yoga: true, diet: true,
        water: true, soleus: true, breath: true,
      };
      const activities: Record<ActivityKey, boolean> = {
        glucose: glucoseSet.has(a.user_id),
        bp: bpSet.has(a.user_id),
        weight: weightSet.has(a.user_id),
        fasting: fastingSet.has(a.user_id),
        supplements: suppSet.has(a.user_id),
        exercise: exSet.has(a.user_id),
        yoga: yogaSet.has(a.user_id),
        diet: dietSet.has(a.user_id),
        water: waterGlasses >= WATER_GLASS_GOAL,
        soleus: soleusRounds >= SOLEUS_GOAL,
        breath: breathRounds >= BREATH_GOAL,
      };
      const fastRow = fastingRowByUser.get(a.user_id);
      const counters: ActivityCounters = {
        glucoseReadings: glucoseCountByUser.get(a.user_id) ?? 0,
        bpLogged: bpSet.has(a.user_id),
        weightLogged: weightSet.has(a.user_id),
        fastingHours: fastRow?.fasting_hours_completed ?? null,
        fastingStatus: fastRow?.compliance_status ?? null,
        fmod: fastRow?.fmod_actual_time ?? null,
        lmod: fastRow?.lmod_actual_time ?? null,
        suppTaken: suppTakenByUser.get(a.user_id) ?? 0,
        suppTotal: suppTotalByUser.get(a.user_id) ?? 0,
        exerciseLogs: exCountByUser.get(a.user_id) ?? 0,
        exerciseMinutes: exMinByUser.get(a.user_id) ?? 0,
        yogaMinutes: yogaMinByUser.get(a.user_id) ?? 0,
        mealsLogged: mealCountByUser.get(a.user_id) ?? 0,
        waterGlasses,
        soleusRounds,
        breathRounds,
      };
      const progress: Partial<Record<ActivityKey, { text: string; ratio: number }>> = buildActivityProgress(counters);


      let applicableCount = 0;
      let doneCount = 0;
      for (const k of ALL_ACTIVITIES) {
        if (applicable[k]) {
          applicableCount++;
          if (activities[k]) doneCount++;
        }
      }
      const onTrack = applicableCount > 0 && doneCount >= Math.ceil(applicableCount * 0.7);

      const latestWeightValue = weightHistoryByUser.get(a.user_id)?.[0] ?? profile?.weight ?? null;
      const previousWeightValue = weightHistoryByUser.get(a.user_id)?.[1]
        ?? (profile?.weight != null && latestWeightValue != null && Number(profile.weight) !== Number(latestWeightValue) ? Number(profile.weight) : null);

      return [{
        user_id: a.user_id,
        assigned_at: a.assigned_at,
        name: profile?.name ?? null,
        phone: profile?.phone ?? null,
        avatar_url: profile?.avatar_url ?? null,
        age: profile?.age ?? null,
        gender: profile?.gender ?? null,
        weight: profile?.weight ?? null,
        latestWeight: latestWeightValue,
        previousWeight: previousWeightValue,
        bmi: profile?.bmi ?? null,
        bmi_category: profile?.bmi_category ?? null,
        latestGlucose: latestGlucoseByUser.get(a.user_id) ?? null,
        latestBpSystolic: latestBpByUser.get(a.user_id) ?? null,
        latestBpDiastolic: latestBpDiastolicByUser.get(a.user_id) ?? null,
        initialScore: profile?.initial_health_score ?? null,
        currentScore: profile?.assessment?.healthScore ?? null,
        planName: sub?.plan_name ?? null,
        planStarted: sub?.started_at ?? null,
        planExpires: sub?.expires_at ?? null,
        hasFastingProtocol: hasFasting,
        hasSuppPlan: hasSupp,
        activities,
        applicable,
        progress,

        doneCount,
        applicableCount,
        onTrack,
      }];
    });

    setPatients(enriched);
    setAlerts(evaluateAlerts(enriched, ((recentCoachHealthAlerts as any[]) ?? []) as CoachHealthNotification[]));

    // Patient-uploaded (external) lab reports the coach has not reviewed yet
    try {
      const { data: extRows } = await (supabase as any)
        .from("external_lab_reports")
        .select("id, user_id, file_name, created_at, reviewed_at")
        .in("user_id", patientIds)
        .is("reviewed_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      const nameById = new Map(enriched.map((p) => [p.user_id, p.name || "Patient"]));
      setNewLabReports(((extRows as any[]) ?? []).map((r) => ({
        id: r.id,
        name: nameById.get(r.user_id) || "Patient",
        fileName: r.file_name ?? null,
        createdAt: r.created_at,
      })));
    } catch {
      setNewLabReports([]);
    }


    const { data: handledMeetings } = await supabase
      .from("coach_meetings" as any)
      .select("user_id, status, scheduled_at, meeting_type")
      .eq("coach_id", (coachData as any).id)
      .in("status", ["scheduled", "completed"]);
    const rows = ((handledMeetings as any[]) ?? []);
    setCompletedSessions(rows.filter((m) => m.status === "completed").length);
    // A patient is "handled" only if they have a completed meeting, or a scheduled one
    // that has not already lapsed (grace: 2h after start). A stale scheduled meeting that
    // never happened must come back into the action list instead of disappearing forever.
    const graceIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const handledIds = new Set(
      rows
        .filter((m) => m.status === "completed" || (m.scheduled_at ?? "") >= graceIso)
        .map((m) => m.user_id),
    );
    // Longest-waiting patient first (SLA), newest at the bottom.
    setNeedsScheduling(
      enriched
        .filter((p) => !handledIds.has(p.user_id))
        .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()),
    );

    // Upcoming (not yet lapsed) meetings, so newly booked patients stay visible on Home.
    const nameById2 = new Map(enriched.map((p) => [p.user_id, p.name || "Patient"]));
    setUpcomingMeetings(
      rows
        .filter((m) => m.status === "scheduled" && (m.scheduled_at ?? "") >= graceIso)
        .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))
        .slice(0, 6)
        .map((m) => ({
          user_id: m.user_id,
          name: nameById2.get(m.user_id) || "Patient",
          scheduledAt: m.scheduled_at,
          type: m.meeting_type ?? "consultation",
        })),
    );





    setLoading(false);
  };

  const computeCommission = async (coachData: any, patientIds: string[]) => {
    const { data, error } = await (supabase as any).rpc("get_coach_commission_summary", {
      _coach_id: coachData.id,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      const first = data[0] as any;
      setCommissionInfo({
        percent: Number(first.commission_percent) || 0,
        name: first.commission_name || "Standard",
        frequency: first.payout_frequency || "monthly",
        totalAssigned: Number(first.total_assigned) || patientIds.length,
        totalPaying: Number(first.total_paying) || 0,
        totalMonthlyRevenue: Number(first.total_monthly_revenue) || 0,
        monthlyCommission: Number(first.monthly_commission) || 0,
        rows: data
          .filter((r: any) => r.plan_name)
          .map((r: any) => ({
            plan_name: r.plan_name,
            count: Number(r.plan_users) || 0,
            monthly_revenue: Number(r.plan_monthly_revenue) || 0,
          })),
      });
      return;
    }

    // Fallback keeps the card meaningful if the backend calculation is temporarily unavailable.
    const modelId = (coachData as any).commission_model_id;
    let model: any = null;
    if (modelId) {
      const { data: m } = await supabase
        .from("commission_models" as any)
        .select("name, percent, payout_frequency")
        .eq("id", modelId)
        .maybeSingle();
      model = m;
    }
    if (!model) {
      const { data: m } = await supabase
        .from("commission_models" as any)
        .select("name, percent, payout_frequency")
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();
      model = m;
    }
    const percent = Number(model?.percent) || 8;
    let revenue = 0;
    const grouped = new Map<string, CommissionBreakdownRow>();
    if (patientIds.length > 0) {
      const { data: subs } = await supabase
        .from("subscriptions" as any)
        .select("user_id, plan_name, plan_price, duration_months, status, started_at")
        .in("user_id", patientIds)
        .eq("status", "active")
        .order("started_at", { ascending: false });
      const byUser = new Map<string, any>();
      ((subs as any[]) ?? []).forEach((sub) => {
        const previous = byUser.get(sub.user_id);
        if (!previous || Number(sub.plan_price ?? 0) > Number(previous.plan_price ?? 0)) byUser.set(sub.user_id, sub);
      });
      byUser.forEach((sub) => {
        const monthly = Number(sub.plan_price ?? 0) / Math.max(1, Number(sub.duration_months ?? 1));
        revenue += monthly;
        const key = sub.plan_name || "Unnamed plan";
        const current = grouped.get(key) ?? { plan_name: key, count: 0, monthly_revenue: 0 };
        current.count += 1;
        current.monthly_revenue += monthly;
        grouped.set(key, current);
      });
    }
    setCommissionInfo({
      percent,
      name: model?.name || "Standard",
      frequency: model?.payout_frequency || "monthly",
      totalAssigned: patientIds.length,
      totalPaying: Array.from(grouped.values()).reduce((sum, row) => sum + row.count, 0),
      totalMonthlyRevenue: revenue,
      monthlyCommission: revenue * (percent / 100),
      rows: Array.from(grouped.values()).sort((a, b) => b.monthly_revenue - a.monthly_revenue),
    });
  };

  // Derived stats
  const onTrackCount = patients.filter((p) => p.onTrack).length;
  const offTrackPatients = patients.filter((p) => !p.onTrack);

  const activityStats = useMemo(() => {
    const map = new Map<ActivityKey, { done: number; applicable: number; pending: PendingPatient[] }>();
    for (const k of ALL_ACTIVITIES) map.set(k, { done: 0, applicable: 0, pending: [] });
    for (const p of patients) {
      for (const k of ALL_ACTIVITIES) {
        if (!p.applicable[k]) continue;
        const s = map.get(k)!;
        s.applicable++;
        if (p.activities[k]) s.done++;
        else s.pending.push({
          user_id: p.user_id,
          name: p.name,
          avatar_url: p.avatar_url,
          progress: p.progress?.[k]?.text ?? null,
          ratio: p.progress?.[k]?.ratio ?? 0,
        });

      }
    }
    return map;
  }, [patients]);

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => (p.name ?? "").toLowerCase().includes(q) || (p.phone ?? "").includes(q));
  }, [patients, search]);

  const nudgeAllOffTrack = async () => {
    if (!offTrackPatients.length) return;
    setNudgingAll(true);
    try {
      await Promise.all(offTrackPatients.map((p) =>
        createNotification({
          user_id: p.user_id,
          title: `A gentle nudge from ${coach?.name ?? "your coach"}`,
          body: "You have pending items for today — a few quick logs will keep you on track. You've got this! 💪",
          type: "coach_nudge",
          icon: "👋",
        })
      ));
      toast.success(`Nudge sent to ${offTrackPatients.length} patient${offTrackPatients.length > 1 ? "s" : ""}`);
    } catch {
      toast.error("Some nudges could not be sent");
    } finally {
      setNudgingAll(false);
    }
  };

  const trend = (p: PatientSummary) => {
    if (p.initialScore == null || p.currentScore == null) return null;
    const d = p.currentScore - p.initialScore;
    if (d > 0) return { icon: TrendingUp, color: "text-success", label: `+${d}` };
    if (d < 0) return { icon: TrendingDown, color: "text-destructive", label: `${d}` };
    return { icon: Minus, color: "text-muted-foreground", label: "0" };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const activeActivityStats = activityDialog ? activityStats.get(activityDialog) : null;

  return (
    <div className="flex flex-col gap-3 px-4 sm:px-5 pt-3 pb-4">
      {/* Greeting — same topology as the patient home screen */}
      <motion.div
        className="pt-1 pb-1"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-[clamp(22px,6.5vw,32px)] leading-[1.15] font-semibold tracking-[-0.03em] text-foreground break-words">
          {greeting || "Good morning"}, {(coach?.name || "Coach").split(" ")[0]} <span className="inline-block">👋</span>
        </h1>
      </motion.div>

      {/* Coach's own daily rings — walk the talk */}
      <CoachActivityRings />



      {/* Dashboard — Patients / Commission / Rating / Sessions (2×2, always) */}
      <motion.div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 w-full" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <button
          onClick={onViewPatient}
          className="liquid-glass rounded-2xl p-2 hover:bg-accent/40 transition-colors min-w-0 h-[66px] flex items-center gap-2 text-left"
        >
          <Users className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
          <div className="min-w-0">
            <p className="stat-number text-lg text-foreground leading-none">{patients.length}</p>
            <p className="text-muted-foreground text-[10px] font-medium mt-1 truncate">Patients</p>
          </div>
        </button>
        <button
          onClick={() => commissionInfo && setCommissionOpen(true)}
          disabled={!commissionInfo}
          className="liquid-glass rounded-2xl p-2 hover:bg-accent/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-w-0 h-[66px] flex items-center gap-2 text-left"
          title="Estimated monthly commission — tap to see breakdown"
        >
          <Percent className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
          <div className="min-w-0">
            <p className="stat-number text-base text-foreground leading-none truncate">
              {commissionInfo
              ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0, notation: commissionInfo.monthlyCommission >= 100000 ? "compact" : "standard" }).format(commissionInfo.monthlyCommission)
              : "—"}
            </p>
            <p className="text-muted-foreground text-[10px] font-medium mt-1 truncate">
              Commission{commissionInfo ? ` · ${commissionInfo.percent}%` : ""}
            </p>
          </div>
        </button>
        <button
          onClick={() => setReviewsOpen(true)}
          className="liquid-glass rounded-2xl p-2 hover:bg-accent/40 transition-colors min-w-0 h-[66px] flex items-center gap-2 text-left"
          title="See who rated you and their reviews"
        >
          <Star className="w-5 h-5 text-warning fill-warning shrink-0" />
          <div className="min-w-0">
            <p className="stat-number text-lg text-foreground leading-none">{Number(coach?.avg_rating ?? 0).toFixed(1)}</p>
            <p className="text-muted-foreground text-[10px] font-medium mt-1 truncate">
              Rating{coach?.total_ratings ? ` · ${coach.total_ratings}` : ""}
            </p>
          </div>
        </button>
        <button
          onClick={() => setSchedulePickerOpen(true)}
          className="liquid-glass rounded-2xl p-2 hover:bg-accent/40 transition-colors min-w-0 h-[66px] flex items-center gap-2 text-left"
          title="Sessions completed — tap to schedule a new meeting"
        >
          <Activity className="w-5 h-5 text-success shrink-0" strokeWidth={1.8} />
          <div className="min-w-0">
            <p className="stat-number text-lg text-foreground leading-none">{completedSessions}</p>
            <p className="text-muted-foreground text-[10px] font-medium mt-1 truncate">Sessions</p>
          </div>
        </button>
        <button
          onClick={() =>
            document.getElementById("coach-pending-meetings")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className={`col-span-2 rounded-2xl p-2 transition-colors min-w-0 h-[66px] flex items-center gap-2 text-left ${
            needsScheduling.length > 0
              ? "bg-destructive/10 ring-1 ring-destructive/25 hover:bg-destructive/15"
              : "liquid-glass hover:bg-accent/40"
          }`}
          title="Patients awaiting a scheduled meeting"
        >
          <CalendarClock
            className={`w-5 h-5 shrink-0 ${needsScheduling.length > 0 ? "text-destructive" : "text-muted-foreground"}`}
            strokeWidth={1.8}
          />
          <div className="min-w-0">
            <p className={`stat-number text-lg leading-none ${needsScheduling.length > 0 ? "text-destructive" : "text-foreground"}`}>
              {needsScheduling.length}
            </p>
            <p className={`text-[10px] font-medium mt-1 truncate ${needsScheduling.length > 0 ? "text-destructive/80" : "text-muted-foreground"}`}>
              Pending meetings
            </p>
          </div>
        </button>
      </motion.div>


      {/* Meetings to Schedule — SLA ordered, longest wait first */}
      {needsScheduling.length > 0 && (
        <motion.div
          id="coach-pending-meetings"
          className="liquid-glass rounded-3xl p-5 ring-1 ring-primary/15 scroll-mt-20"
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5 text-primary" strokeWidth={1.6} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Action needed</p>
              <h3 className="text-base font-black text-foreground leading-tight mt-0.5 no-break">Pending meetings</h3>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-destructive bg-destructive/10 px-2.5 py-1 rounded-full whitespace-nowrap no-break">
              {needsScheduling.length} pending
            </span>
          </div>
          <div className="space-y-2">
            {needsScheduling.slice(0, 8).map((p) => {
              const hours = Math.max(0, Math.floor((Date.now() - new Date(p.assigned_at).getTime()) / 3600000));
              const waitLabel =
                hours < 1 ? "Just now" : hours < 24 ? `${hours}+ hrs waiting` : `${Math.floor(hours / 24)}+ days waiting`;
              const sla = hours >= 48 ? "danger" : hours >= 20 ? "warn" : "ok";
              return (
                <div
                  key={p.user_id}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card/70"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-11 h-11 rounded-xl object-cover" />
                    ) : (
                      <span className="text-primary font-bold text-sm">{(p.name ?? "?")[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-foreground font-semibold text-sm leading-snug truncate">
                      {p.name ?? "Patient"}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md no-break ${
                          sla === "danger"
                            ? "bg-destructive/10 text-destructive"
                            : sla === "warn"
                              ? "bg-warning/10 text-warning"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Clock className="w-3 h-3" strokeWidth={2.2} /> {waitLabel}
                      </span>
                      {p.planName && (
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md truncate max-w-[55%]">
                          {p.planName}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setScheduleFor(p)}
                    className="gradient-blue text-primary-foreground rounded-xl px-3 h-9 text-xs font-bold flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={2.6} /> Schedule
                  </button>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Upcoming meetings — booked sessions stay visible instead of vanishing */}
      {upcomingMeetings.length > 0 && (
        <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4 text-primary" strokeWidth={1.8} />
            <span className="text-foreground font-bold text-sm">Upcoming meetings</span>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full ml-auto no-break">
              {upcomingMeetings.length}
            </span>
          </div>
          <div className="space-y-2">
            {upcomingMeetings.map((m) => (
              <div key={`${m.user_id}-${m.scheduledAt}`} className="flex items-center gap-3 p-3 rounded-2xl bg-card/70">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold text-xs">{(m.name || "?")[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-semibold text-sm truncate">{m.name}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {meetingTypeLabel(m.type as any)} · {new Date(m.scheduledAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}


      {/* Patient Tracking — compact single row */}
      {patients.length > 0 && (
        <motion.div className="liquid-glass rounded-3xl p-4" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div className="flex items-center gap-2 mb-2.5">
            <UserCheck className="w-4 h-4 text-primary" strokeWidth={1.8} />
            <span className="text-foreground font-bold text-sm">Patient Tracking</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-medium">Today</span>
          </div>
          <div className="flex items-stretch rounded-xl overflow-hidden border border-border/50 divide-x divide-border/50">
            <div className="flex-1 bg-muted/50 px-2 py-2 flex flex-col items-center justify-center">
              <p className="text-lg font-black text-foreground leading-none">{patients.length}</p>
              <p className="text-[9px] text-muted-foreground font-medium mt-0.5 no-break">Total</p>
            </div>
            <div className="flex-1 bg-success/10 px-2 py-2 flex flex-col items-center justify-center">
              <p className="text-lg font-black text-success leading-none">{onTrackCount}</p>
              <p className="text-[9px] text-muted-foreground font-medium mt-0.5 no-break">On Track</p>
            </div>
            <div className="flex-1 bg-destructive/10 px-2 py-2 flex flex-col items-center justify-center">
              <p className="text-lg font-black text-destructive leading-none">{offTrackPatients.length}</p>
              <p className="text-[9px] text-muted-foreground font-medium mt-0.5 no-break">Off Track</p>
            </div>
          </div>
          {offTrackPatients.length > 0 && (
            <button
              onClick={nudgeAllOffTrack}
              disabled={nudgingAll}
              className="mt-2.5 w-full gradient-blue text-primary-foreground rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {nudgingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Nudge all {offTrackPatients.length} off-track
            </button>
          )}
        </motion.div>
      )}

      {/* Activity Tracking — compact */}
      {patients.length > 0 && (
        <motion.div className="liquid-glass rounded-3xl p-4" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <div className="flex items-center gap-2 mb-2.5">
            <CheckCircle2 className="w-4 h-4 text-primary" strokeWidth={1.8} />
            <span className="text-foreground font-bold text-sm">Activity Tracking</span>
            <button
              onClick={async () => {
                if (refreshing) return;
                setRefreshing(true);
                try { await loadData({ silent: true }); } finally { setRefreshing(false); }
              }}
              disabled={refreshing}
              className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-muted hover:bg-accent text-[10px] font-bold text-foreground disabled:opacity-60"
              aria-label="Refresh activity tracking"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
            <span className="text-[10px] text-muted-foreground font-medium">
              Tap to nudge
            </span>
          </div>

          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] min-[520px]:grid-cols-[repeat(4,minmax(0,1fr))] gap-1.5 w-full">

            {ALL_ACTIVITIES.map((k) => {
              const s = activityStats.get(k)!;
              const meta = ACTIVITY_META[k];
              const pct = s.applicable ? Math.round((s.done / s.applicable) * 100) : 0;
              const allDone = s.applicable > 0 && s.done === s.applicable;
              const noneApplicable = s.applicable === 0;
              return (
                <button
                  key={k}
                  onClick={() => !noneApplicable && setActivityDialog(k)}
                  disabled={noneApplicable}
                  className={`rounded-2xl p-2.5 text-left transition min-w-0 ${
                    noneApplicable
                      ? "bg-muted/30 opacity-50 cursor-not-allowed"
                      : allDone
                        ? "bg-success/10 border border-success/30 hover:bg-success/15"
                        : "bg-card border border-border hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base">{meta.emoji}</span>
                    <span className={`text-[10px] font-bold ${
                      noneApplicable ? "text-muted-foreground" :
                      allDone ? "text-success" :
                      pct >= 70 ? "text-warning" : "text-destructive"
                    }`}>
                      {noneApplicable ? "N/A" : `${pct}%`}
                    </span>
                  </div>
                  <p className="text-foreground text-base font-black leading-none">
                    {s.done}<span className="text-xs text-muted-foreground font-medium">/{s.applicable || 0}</span>
                  </p>
                  <p className="text-muted-foreground text-[10px] font-medium mt-1 truncate">{meta.label}</p>
                  {!noneApplicable && s.pending.length > 0 && (
                    <p className="text-[10px] font-semibold text-primary mt-0.5">
                      {s.pending.length} pending →
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* New lab reports uploaded by patients */}
      {newLabReports.length > 0 && (
        <motion.button
          type="button"
          onClick={onViewLabTests}
          className="liquid-glass rounded-3xl p-5 text-left w-full hover:bg-accent/40 transition-colors"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="w-5 h-5 text-primary" strokeWidth={1.8} />
            <span className="text-foreground font-bold">Lab reports available</span>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full ml-auto">
              {newLabReports.length} new
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {newLabReports.slice(0, 4).map((r) => (
              <div key={r.id} className="flex items-start gap-3 rounded-2xl bg-primary/5 p-3">
                <FileText className="w-4 h-4 mt-0.5 text-primary shrink-0" strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-semibold truncate">{r.name}</p>
                  <p className="text-muted-foreground text-xs truncate">
                    Report uploaded{r.fileName ? ` · ${r.fileName}` : ""} · {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-primary text-xs font-bold mt-3">Click here to review →</p>
        </motion.button>
      )}

      {/* Alerts */}

      {alerts.length > 0 && (
        <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-warning" strokeWidth={1.8} />
            <span className="text-foreground font-bold">Attention Needed</span>
            <span className="text-[10px] font-bold text-warning bg-warning/10 px-2 py-0.5 rounded-full ml-auto">
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {alerts.slice(0, 6).map((alert, i) => (
              <div
                key={`${alert.user_id}-${alert.metric}-${i}`}
                className={`flex items-start gap-3 rounded-2xl p-3 ${
                  alert.type === "danger" ? "danger-flash" : "bg-warning/10"
                }`}
              >
                <AlertTriangle
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    alert.type === "danger" ? "text-destructive danger-dot" : "text-warning"
                  }`}
                  strokeWidth={2}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-semibold">{alert.patient_name}</p>
                  <p className="text-muted-foreground text-xs">{alert.message}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  alert.type === "danger" ? "text-destructive bg-destructive/15" : "text-warning bg-warning/15"
                }`}>
                  {alert.metric}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* My own check-ins — supplements + fasting (only when they exist) */}
      <CoachSelfCheckins />

      {/* All clear */}
      {alerts.length === 0 && patients.length > 0 && (
        <motion.div
          className="liquid-glass rounded-3xl p-5 flex items-center gap-3"
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
        >
          <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5 text-success" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-foreground font-bold text-sm">All patients healthy</p>
            <p className="text-muted-foreground text-xs">No concerns flagged right now</p>
          </div>
        </motion.div>
      )}


      {coach && scheduleFor && (
        <ScheduleMeetingDialog
          open={!!scheduleFor}
          onOpenChange={(b) => { if (!b) setScheduleFor(null); }}
          coachId={coach.id}
          patientId={scheduleFor.user_id}
          patientName={scheduleFor.name ?? "Patient"}
          defaultType="onboarding"
          onScheduled={() => { setScheduleFor(null); loadData(); }}
        />
      )}
      {coach && (
        <ScheduleMeetingDialog
          open={schedulePickerOpen}
          onOpenChange={setSchedulePickerOpen}
          coachId={coach.id}
          patients={patients.map((p) => ({ user_id: p.user_id, name: p.name, phone: p.phone }))}
          onScheduled={() => { setSchedulePickerOpen(false); loadData(); }}
        />
      )}
      {summaryPatient && (
        <PatientDailySummaryDialog
          open={!!summaryPatient}
          onClose={() => setSummaryPatient(null)}
          patient={{
            user_id: summaryPatient.user_id,
            name: summaryPatient.name,
            avatar_url: summaryPatient.avatar_url,
            assigned_at: summaryPatient.assigned_at,
          }}
          coachName={coach?.name ?? null}
        />
      )}
      {activityDialog && activeActivityStats && (
        <CoachActivityNudgeDialog
          open={!!activityDialog}
          onClose={() => setActivityDialog(null)}
          activity={activityDialog}
          pending={activeActivityStats.pending}
          doneCount={activeActivityStats.done}
          totalApplicable={activeActivityStats.applicable}
          coachName={coach?.name ?? null}
        />
      )}
      {coach && commissionInfo && (
        <CoachCommissionDialog
          open={commissionOpen}
          onClose={() => setCommissionOpen(false)}
          coachId={coach.id}
          commissionPercent={commissionInfo.percent}
          commissionName={commissionInfo.name}
          payoutFrequency={commissionInfo.frequency}
          totalAssigned={commissionInfo.totalAssigned}
          totalPaying={commissionInfo.totalPaying}
          totalMonthlyRevenue={commissionInfo.totalMonthlyRevenue}
          monthlyCommission={commissionInfo.monthlyCommission}
          rows={commissionInfo.rows}
        />
      )}
      {coach && (
        <CoachReviewsDialog
          open={reviewsOpen}
          onOpenChange={setReviewsOpen}
          coachId={coach.id}
          avgRating={Number(coach.avg_rating ?? 0)}
          totalRatings={Number(coach.total_ratings ?? 0)}
        />
      )}
    </div>
  );
}
