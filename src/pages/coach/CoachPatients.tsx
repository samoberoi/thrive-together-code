import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, ArrowLeft, Clock, Activity, Droplets, Heart, Phone,
  Weight, FileText, Loader2, ChevronRight, Flame, Trophy,
  Shield, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp, Minus,
  Pill, Timer, MessageCircle, Calendar, FlaskConical, CheckCircle2, Pencil
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentCoach } from "@/lib/coachService";
import { calculateSupplementStreak } from "@/lib/supplementBadgeService";
import ScheduleMeetingDialog from "@/components/coach/ScheduleMeetingDialog";
import RecommendTestsDialog from "@/components/coach/RecommendTestsDialog";
import RecommendSupplementsDialog from "@/components/coach/RecommendSupplementsDialog";
import PatientVitalsCard from "@/components/coach/PatientVitalsCard";
import PatientProfileEditor from "@/components/coach/PatientProfileEditor";
import PatientDietSymptomsSummary from "@/components/coach/PatientDietSymptomsSummary";


type LogTab = "diabetes" | "bp" | "weight" | "fasting" | "supps";

interface Patient {
  user_id: string;
  assigned_at: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  age: number | null;
  gender: string | null;
  weight: number | null;
  bmi: number | null;
  bmi_category: string | null;
  height: number | null;
  clinical: any;
  deep_profiling: any;
  assessment: any;
  plan_name: string | null;
  plan_expires_at: string | null;
}

interface HealthLogEntry {
  logged_at: string;
  glucose_morning: number | null;
  glucose_evening: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  weight_kg: number | null;
  log_type: string;
}

interface PatientHealthStatus {
  status: "green" | "yellow" | "red";
  label: string;
}

function CoachFlatBadgeIcon({ type }: { type: "fasting" | "supplement" }) {
  const Icon = type === "fasting" ? Timer : Pill;
  const color = type === "fasting" ? "var(--pillar-fasting)" : "var(--pillar-supplements)";
  const bg = type === "fasting" ? "var(--pillar-fasting-soft)" : "var(--pillar-supplements-soft)";

  return (
    <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: bg, color }}>
      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
    </span>
  );
}

function getHealthStatus(logs: HealthLogEntry[], patient: Patient): PatientHealthStatus {
  if (logs.length === 0) return { status: "yellow", label: "No Data" };

  let risk = 0;

  // Check latest glucose
  const glucoseLogs = logs.filter(l => l.log_type === "diabetes" && (l.glucose_morning || l.glucose_evening));
  if (glucoseLogs.length > 0) {
    const val = glucoseLogs[0].glucose_morning ?? glucoseLogs[0].glucose_evening ?? 0;
    if (val >= 180) risk += 4;
    else if (val >= 130) risk += 2;
  }


  // Check latest BP
  const bpLogs = logs.filter(l => l.log_type === "bp" && l.bp_systolic);
  if (bpLogs.length > 0) {
    const sys = bpLogs[0].bp_systolic ?? 0;
    if (sys >= 150) risk += 4;
    else if (sys >= 140) risk += 2;
  }

  // Check BMI
  if (patient.bmi) {
    if (patient.bmi >= 35) risk += 2;
    else if (patient.bmi >= 30) risk += 1;
  }

  // HbA1c from profile
  const hba1c = (patient.deep_profiling as any)?.hba1c;
  if (hba1c && hba1c >= 8.5) risk += 3;
  else if (hba1c && hba1c >= 7) risk += 1;

  if (risk >= 4) return { status: "red", label: "Needs Attention" };
  if (risk >= 2) return { status: "yellow", label: "Monitor" };
  return { status: "green", label: "On Track" };
}


function getLogDisplayValue(log: HealthLogEntry): { value: string; unit: string; session?: string } | null {
  if (log.log_type === "diabetes") {
    if (log.glucose_morning != null) return { value: String(log.glucose_morning), unit: "mg/dL", session: "Morning" };
    if (log.glucose_evening != null) return { value: String(log.glucose_evening), unit: "mg/dL", session: "Evening" };
    return null;
  }
  if (log.log_type === "bp") {
    if (log.bp_systolic != null) return { value: `${log.bp_systolic}/${log.bp_diastolic}`, unit: "mmHg" };
    return null;
  }
  if (log.log_type === "weight") {
    if (log.weight_kg != null) return { value: String(log.weight_kg), unit: "kg" };
    return null;
  }
  return null;
}

const statusColors = {
  green: { bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-400" },
  yellow: { bg: "bg-yellow-500/15", text: "text-yellow-400", dot: "bg-yellow-400" },
  red: { bg: "bg-red-500/15", text: "text-red-400", dot: "bg-red-400" },
};

interface CoachPatientsProps {
  onChatWithPatient?: (patientId: string) => void;
}

export default function CoachPatients({ onChatWithPatient }: CoachPatientsProps = {}) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientLogs, setPatientLogs] = useState<HealthLogEntry[]>([]);
  const [patientStatus, setPatientStatus] = useState<PatientHealthStatus>({ status: "yellow", label: "No Data" });
  const [fastingStreak, setFastingStreak] = useState<{ current: number; longest: number; badges: any[] }>({ current: 0, longest: 0, badges: [] });
  const [suppStreak, setSuppStreak] = useState<{ current: number; longest: number; badges: any[] }>({ current: 0, longest: 0, badges: [] });
  const [patientStatuses, setPatientStatuses] = useState<Record<string, PatientHealthStatus>>({});
  const [patientMetrics, setPatientMetrics] = useState<Record<string, { healthScore: number | null; initialScore: number | null; latestWeight: number | null; initialWeight: number | null; latestGlucose: number | null; initialGlucose: number | null }>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "green" | "yellow" | "red">("all");
  const [packageFilter, setPackageFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logTab, setLogTab] = useState<LogTab>("diabetes");
  const [fastingLogs, setFastingLogs] = useState<any[]>([]);
  const [suppTrackingLogs, setSuppTrackingLogs] = useState<any[]>([]);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [actionDlg, setActionDlg] = useState<null | "meeting" | "tests" | "supps">(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [summaryRefresh, setSummaryRefresh] = useState(0);


  useEffect(() => {
    if (!user) return;
    loadPatients();
  }, [user]);

  const loadPatients = async () => {
    if (!user) return;
    setLoading(true);

    const coachData = await resolveCurrentCoach(user, "id");
    if (!coachData) { setLoading(false); return; }
    setCoachId((coachData as any).id);

    const { data: assignments } = await supabase
      .from("coach_assignments" as any)
      .select("user_id, assigned_at")
      .eq("coach_id", (coachData as any).id)
      .eq("is_active", true);

    if (assignments && assignments.length > 0) {
      const patientIds = (assignments as any[]).map((a) => a.user_id);
      const [{ data: profiles }, { data: subs }] = await Promise.all([
        supabase
          .from("profiles" as any)
          .select("user_id, name, phone, avatar_url, age, gender, weight, bmi, bmi_category, height, clinical, deep_profiling, assessment, initial_health_score")
          .in("user_id", patientIds),
        supabase
          .from("subscriptions" as any)
          .select("user_id, plan_name, expires_at, started_at, status")
          .in("user_id", patientIds)
          .eq("status", "active"),
      ]);

      // Pick most-recent active sub per user
      const subByUser = new Map<string, { plan_name: string | null; expires_at: string | null }>();
      ((subs as any[]) ?? []).forEach((s) => {
        const prev = subByUser.get(s.user_id);
        if (!prev || (s.started_at ?? "") > ((prev as any).started_at ?? "")) {
          subByUser.set(s.user_id, { plan_name: s.plan_name ?? null, expires_at: s.expires_at ?? null, ...(s as any) });
        }
      });

      const merged = (assignments as any[]).map((a) => {
        const p = (profiles as any[])?.find((pr) => pr.user_id === a.user_id);
        const s = subByUser.get(a.user_id);
        return { ...a, ...p, plan_name: s?.plan_name ?? null, plan_expires_at: s?.expires_at ?? null };
      });
      setPatients(merged);

      // Fetch latest logs per patient for status indicators
      const { data: allLogs } = await supabase
        .from("health_logs" as any)
        .select("user_id, logged_at, glucose_morning, glucose_evening, bp_systolic, bp_diastolic, weight_kg, log_type")
        .in("user_id", patientIds)
        .order("logged_at", { ascending: false })
        .limit(200);

      if (allLogs) {
        const statusMap: Record<string, PatientHealthStatus> = {};
        const metricsMap: Record<string, { healthScore: number | null; initialScore: number | null; latestWeight: number | null; initialWeight: number | null; latestGlucose: number | null; initialGlucose: number | null }> = {};
        merged.forEach((p: Patient) => {
          const pLogs = (allLogs as any[]).filter(l => l.user_id === p.user_id);
          statusMap[p.user_id] = getHealthStatus(pLogs, p);
          
          // Extract health score from profile
          const profile = (profiles as any[])?.find((pr: any) => pr.user_id === p.user_id);
          const currentScore = profile?.assessment?.healthScore ?? null;
          const initScore = profile?.initial_health_score ?? null;
          
          // Latest & initial weight
          const wLogs = pLogs.filter((l: any) => l.log_type === "weight" && l.weight_kg != null).sort((a: any, b: any) => b.logged_at.localeCompare(a.logged_at));
          const latestW = wLogs[0]?.weight_kg ?? p.weight ?? null;
          const initialW = wLogs.length > 0 ? wLogs[wLogs.length - 1].weight_kg : p.weight ?? null;
          
          // Latest & initial glucose
          const gLogs = pLogs.filter((l: any) => l.log_type === "diabetes" && l.glucose_morning != null).sort((a: any, b: any) => b.logged_at.localeCompare(a.logged_at));
          const latestG = gLogs[0]?.glucose_morning ?? null;
          const initialG = gLogs.length > 0 ? gLogs[gLogs.length - 1].glucose_morning : null;
          
          metricsMap[p.user_id] = { healthScore: currentScore, initialScore: initScore, latestWeight: latestW, initialWeight: initialW, latestGlucose: latestG, initialGlucose: initialG };
        });
        setPatientStatuses(statusMap);
        setPatientMetrics(metricsMap);
      }
    }
    setLoading(false);
  };

  const openPatient = async (patient: Patient) => {
    setSelectedPatient(patient);
    setLogsLoading(true);
    setLogTab("diabetes");

    // Fetch health logs, fasting tracking, supplement tracking, and badges in parallel
    const [logsRes, fastTrackRes, suppTrackRes, suppPlanItemsRes, fastBadgesRes, suppBadgesRes] = await Promise.all([
      supabase
        .from("health_logs" as any)
        .select("logged_at, glucose_morning, glucose_evening, bp_systolic, bp_diastolic, weight_kg, log_type")
        .eq("user_id", patient.user_id)
        .order("logged_at", { ascending: false })
        .limit(50),
      supabase
        .from("fasting_tracking" as any)
        .select("date, lmod_actual_time, fmod_actual_time, fasting_hours_completed, compliance_status, symptoms_flag, symptoms_notes")
        .eq("user_id", patient.user_id)
        .order("date", { ascending: false })
        .limit(30),
      supabase
        .from("user_supplement_tracking" as any)
        .select("date, plan_item_id, taken")
        .eq("user_id", patient.user_id)
        .order("date", { ascending: false })
        .limit(200),
      supabase
        .from("user_supplement_plan_items" as any)
        .select("id, supplement_id, dosage, timing, is_active, supplement_master(name)")
        .eq("is_active", true)
        .in("plan_id", 
          // We need to get plan IDs for this user - fetch plans inline
          (await supabase.from("user_supplement_plans" as any).select("id").eq("user_id", patient.user_id).eq("status", "active")).data?.map((p: any) => p.id) ?? []
        ),
      supabase
        .from("user_fasting_badges" as any)
        .select("current_streak, longest_streak, badge_id, earned_at, fasting_badges(badge_name, badge_emoji, level)")
        .eq("user_id", patient.user_id)
        .order("earned_at", { ascending: false }),
      supabase
        .from("user_supplement_badges" as any)
        .select("current_streak, longest_streak, badge_id, earned_at, supplement_badges(badge_name, badge_emoji, level)")
        .eq("user_id", patient.user_id)
        .order("earned_at", { ascending: false }),
    ]);

    const logs = (logsRes.data as unknown as HealthLogEntry[]) ?? [];
    setPatientLogs(logs);
    setPatientStatus(getHealthStatus(logs, patient));

    // Fasting data
    const fastTracks = (fastTrackRes.data as any[]) ?? [];
    setFastingLogs(fastTracks);

    // Calculate fasting streak from actual tracking data
    const completedDates = fastTracks
      .filter((t: any) => t.fasting_hours_completed != null)
      .map((t: any) => t.date)
      .sort()
      .reverse();
    let fastCurrentStreak = 0;
    const today = new Date().toISOString().split("T")[0];
    for (let i = 0; i < completedDates.length; i++) {
      const expected = new Date();
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split("T")[0];
      if (completedDates.includes(expectedStr)) {
        fastCurrentStreak++;
      } else if (i === 0) {
        // Today not done yet, check from yesterday
        continue;
      } else {
        break;
      }
    }

    // Fasting badges for display
    const fb = (fastBadgesRes.data as any[]) ?? [];
    setFastingStreak({
      current: fastCurrentStreak || (fb[0]?.current_streak ?? 0),
      longest: Math.max(fastCurrentStreak, fb[0]?.longest_streak ?? 0),
      badges: fb.map(b => ({ ...b, ...(b.fasting_badges ?? {}) })),
    });

    // Supplement tracking
    const suppTracks = (suppTrackRes.data as any[]) ?? [];
    setSuppTrackingLogs(suppTracks);
    const activePlanItems = (suppPlanItemsRes.data as any[]) ?? [];
    const totalActiveItems = activePlanItems.length;

    // Calculate supplement streak from actual tracking data
    const suppStreakCalc = calculateSupplementStreak(
      suppTracks.map((t: any) => ({ date: t.date, plan_item_id: t.plan_item_id, taken: t.taken })),
      totalActiveItems
    );

    const sb = (suppBadgesRes.data as any[]) ?? [];
    setSuppStreak({
      current: suppStreakCalc.currentStreak,
      longest: suppStreakCalc.longestStreak,
      badges: sb.map(b => ({ ...b, ...(b.supplement_badges ?? {}) })),
    });

    setLogsLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Patient detail view
  if (selectedPatient) {

    const glucoseLogs = patientLogs.filter(l => l.log_type === "diabetes" && (l.glucose_morning ?? l.glucose_evening));
    const bpLogs = patientLogs.filter(l => l.log_type === "bp" && l.bp_systolic);
    const weightLogs = patientLogs.filter(l => l.log_type === "weight" && l.weight_kg);

    const latestGlucose = glucoseLogs[0] ? (glucoseLogs[0].glucose_morning ?? glucoseLogs[0].glucose_evening) : null;
    const latestBp = bpLogs[0] ? `${bpLogs[0].bp_systolic}/${bpLogs[0].bp_diastolic}` : null;
    const latestWeight = weightLogs[0]?.weight_kg;

    const dp = selectedPatient.deep_profiling as any;
    const clinical = selectedPatient.clinical as any;
    const sc = statusColors[patientStatus.status];

    return (
      <div className="flex flex-col gap-5 px-5 pt-14 pb-4">
        <motion.div className="flex items-center gap-3" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <button onClick={() => setSelectedPatient(null)} className="liquid-glass rounded-xl p-2">
            <ArrowLeft className="w-5 h-5 text-foreground" strokeWidth={1.8} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">{selectedPatient.name ?? "Patient"}</h1>
            <p className="text-muted-foreground text-xs">Patient Details</p>
          </div>
          {/* Health status badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${sc.bg}`}>
            <div className={`w-2 h-2 rounded-full ${sc.dot} animate-pulse`} />
            <span className={`text-xs font-bold ${sc.text}`}>{patientStatus.label}</span>
          </div>
          <button
            onClick={() => setEditProfileOpen(true)}
            className="liquid-glass rounded-xl p-2"
            aria-label="Edit patient profile"
            title="Edit profile"
          >
            <Pencil className="w-4 h-4 text-foreground" strokeWidth={1.8} />
          </button>
        </motion.div>

        <PatientProfileEditor
          open={editProfileOpen}
          onClose={() => setEditProfileOpen(false)}
          patientUserId={selectedPatient.user_id}
          patientName={selectedPatient.name ?? "Patient"}
          onSaved={() => { loadPatients(); openPatient(selectedPatient); setSummaryRefresh((n) => n + 1); }}
        />

        {/* Patient Info Card */}
        <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {selectedPatient.avatar_url ? (
                <img src={selectedPatient.avatar_url} alt="" className="w-14 h-14 rounded-2xl object-cover" />
              ) : (
                <span className="text-primary font-black text-xl">
                  {(selectedPatient.name ?? "?")[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-foreground font-black text-base">{selectedPatient.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {selectedPatient.age && <span className="text-muted-foreground text-xs">{selectedPatient.age} years</span>}
                {selectedPatient.gender && <span className="text-muted-foreground text-xs">• {selectedPatient.gender}</span>}
              </div>
              {selectedPatient.phone && (
                <a href={`tel:+91${selectedPatient.phone}`} className="flex items-center gap-1.5 mt-1.5 text-primary text-xs font-medium">
                  <Phone className="w-3.5 h-3.5" strokeWidth={1.8} />
                  +91 {selectedPatient.phone}
                </a>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedPatient.height && (
                  <span className="text-[10px] font-medium text-foreground bg-muted px-2 py-0.5 rounded-full">
                    {selectedPatient.height} cm
                  </span>
                )}
                {selectedPatient.weight && (
                  <span className="text-[10px] font-medium text-foreground bg-muted px-2 py-0.5 rounded-full">
                    {selectedPatient.weight} kg
                  </span>
                )}
                {selectedPatient.bmi && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    selectedPatient.bmi >= 30 ? "text-warning bg-warning/15" : "text-primary bg-primary/15"
                  }`}>
                    BMI {selectedPatient.bmi} • {selectedPatient.bmi_category}
                  </span>
                )}
              </div>
            </div>
          </div>
          {selectedPatient.phone && (
            <a
              href={`https://wa.me/91${String(selectedPatient.phone).replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${selectedPatient.name ?? ""}, this is your BBDO coach.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)" }}
            >
              <MessageCircle className="w-4 h-4" strokeWidth={2.2} />
              Click here to chat
            </a>
          )}
        </motion.div>

        <PatientDietSymptomsSummary userId={selectedPatient.user_id} refreshKey={summaryRefresh} />



        {/* Coach actions */}
        {coachId && (
          <motion.div className="grid grid-cols-3 gap-2" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <button onClick={() => setActionDlg("meeting")} className="liquid-glass rounded-2xl py-3 px-2 flex flex-col items-center gap-1 hover:bg-primary/5">
              <Calendar className="w-4.5 h-4.5 text-primary" />
              <span className="text-[11px] font-bold text-foreground">Meeting</span>
            </button>
            <button onClick={() => setActionDlg("tests")} className="liquid-glass rounded-2xl py-3 px-2 flex flex-col items-center gap-1 hover:bg-primary/5">
              <FlaskConical className="w-4.5 h-4.5 text-primary" />
              <span className="text-[11px] font-bold text-foreground">Tests</span>
            </button>
            <button onClick={() => setActionDlg("supps")} className="liquid-glass rounded-2xl py-3 px-2 flex flex-col items-center gap-1 hover:bg-primary/5">
              <Pill className="w-4.5 h-4.5 text-primary" />
              <span className="text-[11px] font-bold text-foreground">Supplements</span>
            </button>
            <button onClick={() => setActionDlg("fasting")} className="liquid-glass rounded-2xl py-3 px-2 flex flex-col items-center gap-1 hover:bg-primary/5">
              <Timer className="w-4.5 h-4.5 text-primary" />
              <span className="text-[11px] font-bold text-foreground">Fasting</span>
            </button>
          </motion.div>
        )}

        {coachId && selectedPatient && (
          <>
            <ScheduleMeetingDialog
              open={actionDlg === "meeting"} onOpenChange={(b) => !b && setActionDlg(null)}
              coachId={coachId} patientId={selectedPatient.user_id} patientName={selectedPatient.name ?? undefined}
            />
            <RecommendTestsDialog
              open={actionDlg === "tests"} onOpenChange={(b) => !b && setActionDlg(null)}
              coachId={coachId} patientId={selectedPatient.user_id} patientName={selectedPatient.name ?? undefined}
            />
            <RecommendSupplementsDialog
              open={actionDlg === "supps"} onOpenChange={(b) => !b && setActionDlg(null)}
              coachId={coachId} patientId={selectedPatient.user_id} patientName={selectedPatient.name ?? undefined}
            />
            <AssignFastingDialog
              open={actionDlg === "fasting"} onOpenChange={(b) => !b && setActionDlg(null)}
              coachId={coachId} patientId={selectedPatient.user_id} patientName={selectedPatient.name ?? undefined}
            />

          </>
        )}

        {/* Apple Health vitals + trends */}
        {selectedPatient && <PatientVitalsCard patientId={selectedPatient.user_id} />}




        {/* Current Vitals */}
        {(() => {
          const sysBp = bpLogs[0]?.bp_systolic ?? null;
          const glucoseDanger = latestGlucose != null && latestGlucose >= 180;
          const glucoseWarn = latestGlucose != null && latestGlucose >= 130 && latestGlucose < 180;
          const bpDanger = sysBp != null && sysBp >= 150;
          const bpWarn = sysBp != null && sysBp >= 140 && sysBp < 150;
          const bmi = selectedPatient.height && latestWeight ? latestWeight / Math.pow((selectedPatient.height as number) / 100, 2) : null;
          const weightDanger = bmi != null && bmi >= 35;
          const weightWarn = bmi != null && bmi >= 30 && bmi < 35;
          const cardTone = (danger: boolean, warn: boolean) =>
            danger
              ? "danger-flash border border-destructive/40"
              : warn
                ? "bg-warning/15 border border-warning/30"
                : "liquid-glass";
          const numTone = (danger: boolean, warn: boolean) =>
            danger ? "text-destructive" : warn ? "text-warning" : "text-foreground";
          return (
            <motion.div className="grid grid-cols-3 gap-3" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className={`rounded-2xl p-4 text-center ${cardTone(glucoseDanger, glucoseWarn)}`}>
                <Droplets className={`w-5 h-5 mx-auto mb-1.5 ${glucoseDanger ? "text-destructive" : "text-secondary"}`} strokeWidth={1.8} />
                <p className={`stat-number text-lg ${numTone(glucoseDanger, glucoseWarn)}`}>{latestGlucose ?? "—"}</p>
                <p className="text-muted-foreground text-[10px] font-medium">Glucose mg/dL</p>
              </div>
              <div className={`rounded-2xl p-4 text-center ${cardTone(bpDanger, bpWarn)}`}>
                <Heart className={`w-5 h-5 mx-auto mb-1.5 ${bpDanger ? "text-destructive" : "text-destructive"}`} strokeWidth={1.8} />
                <p className={`stat-number text-lg ${numTone(bpDanger, bpWarn)}`}>{latestBp ?? "—"}</p>
                <p className="text-muted-foreground text-[10px] font-medium">BP mmHg</p>
              </div>
              <div className={`rounded-2xl p-4 text-center ${cardTone(weightDanger, weightWarn)}`}>
                <Weight className={`w-5 h-5 mx-auto mb-1.5 ${weightDanger ? "text-destructive" : "text-primary"}`} strokeWidth={1.8} />
                <p className={`stat-number text-lg ${numTone(weightDanger, weightWarn)}`}>{latestWeight ?? "—"}</p>
                <p className="text-muted-foreground text-[10px] font-medium">Weight kg</p>
              </div>
            </motion.div>
          );
        })()}

        {/* Streaks & Badges */}
        <motion.div className="grid grid-cols-2 gap-3" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          {/* Fasting Streak */}
          <div className="liquid-glass rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-foreground font-bold text-xs">Fasting Streak</span>
            </div>
            <p className="stat-number text-2xl text-foreground">{fastingStreak.current}<span className="text-muted-foreground text-xs font-normal ml-1">days</span></p>
            <p className="text-muted-foreground text-[10px] mt-0.5">Best: {fastingStreak.longest} days</p>
            {fastingStreak.badges.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {fastingStreak.badges.slice(0, 4).map((b, i) => (
                  <span key={i} title={b.badge_name}>
                    <CoachFlatBadgeIcon type="fasting" />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Supplement Streak */}
          <div className="liquid-glass rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-foreground font-bold text-xs">Supplement Streak</span>
            </div>
            <p className="stat-number text-2xl text-foreground">{suppStreak.current}<span className="text-muted-foreground text-xs font-normal ml-1">days</span></p>
            <p className="text-muted-foreground text-[10px] mt-0.5">Best: {suppStreak.longest} days</p>
            {suppStreak.badges.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {suppStreak.badges.slice(0, 4).map((b, i) => (
                  <span key={i} title={b.badge_name}>
                    <CoachFlatBadgeIcon type="supplement" />
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Clinical Info */}
        {(clinical || dp) && (
          <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-primary" strokeWidth={1.8} />
              <span className="text-foreground font-bold">Clinical Overview</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {clinical?.diabetesType && (
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="text-muted-foreground text-[10px] font-medium">Diabetes Type</p>
                  <p className="text-foreground text-sm font-semibold">{clinical.diabetesType}</p>
                </div>
              )}
              {clinical?.diabetesDuration && (
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="text-muted-foreground text-[10px] font-medium">Duration</p>
                  <p className="text-foreground text-sm font-semibold">{clinical.diabetesDuration}</p>
                </div>
              )}
              {dp?.hba1c && (
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="text-muted-foreground text-[10px] font-medium">HbA1c</p>
                  <p className="text-foreground text-sm font-semibold">{dp.hba1c}%</p>
                </div>
              )}
              {dp?.fastingGlucose && (
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="text-muted-foreground text-[10px] font-medium">Fasting Glucose</p>
                  <p className="text-foreground text-sm font-semibold">{dp.fastingGlucose} mg/dL</p>
                </div>
              )}
              {clinical?.medications && (
                <div className="bg-muted/50 rounded-xl p-3 col-span-2">
                  <p className="text-muted-foreground text-[10px] font-medium">Medications</p>
                  <p className="text-foreground text-sm font-semibold">{clinical.medications}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Health Log History — Tabbed like end-user view */}
        <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-primary" strokeWidth={1.8} />
            <span className="text-foreground font-bold">Health Log History</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-5 px-5 snap-x scroll-smooth">
            {([
              { key: "diabetes" as LogTab, label: "Diabetes", icon: <Droplets className="w-3.5 h-3.5" /> },
              { key: "bp" as LogTab, label: "BP", icon: <Heart className="w-3.5 h-3.5" /> },
              { key: "weight" as LogTab, label: "Weight", icon: <Weight className="w-3.5 h-3.5" /> },
              { key: "fasting" as LogTab, label: "Fasting", icon: <Timer className="w-3.5 h-3.5" /> },
              { key: "supps" as LogTab, label: "Supps", icon: <Pill className="w-3.5 h-3.5" /> },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setLogTab(tab.key)}
                className={`flex-none snap-start no-break flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                  logTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-[400px] overflow-y-auto">
              {/* Diabetes / BP / Weight tabs */}
              {(logTab === "diabetes" || logTab === "bp" || logTab === "weight") && (() => {
                const filtered = patientLogs.filter(l => {
                  if (logTab === "diabetes") return l.log_type === "diabetes" && (l.glucose_morning != null || l.glucose_evening != null);
                  if (logTab === "bp") return l.log_type === "bp" && l.bp_systolic != null;
                  return l.log_type === "weight" && l.weight_kg != null;
                });
                if (filtered.length === 0) return <p className="text-muted-foreground text-sm text-center py-6">No {logTab} logs yet</p>;
                return filtered.slice(0, 30).map((log, i) => {
                  const display = getLogDisplayValue(log)!;
                  return (
                    <div key={i} className="liquid-glass rounded-2xl p-4">
                      <p className="text-muted-foreground text-[10px] font-medium mb-2">
                        {new Date(log.logged_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                        {", "}
                        {new Date(log.logged_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </p>
                      {logTab === "diabetes" ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-muted/40 rounded-xl p-3">
                            <p className="text-muted-foreground text-[10px]">Morning</p>
                            <p className="text-foreground font-bold text-sm">{log.glucose_morning != null ? `${log.glucose_morning} mg/dL` : "—"}</p>
                          </div>
                          <div className="bg-muted/40 rounded-xl p-3">
                            <p className="text-muted-foreground text-[10px]">Evening</p>
                            <p className="text-foreground font-bold text-sm">{log.glucose_evening != null ? `${log.glucose_evening} mg/dL` : "—"}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-foreground font-bold text-lg">{display.value} <span className="text-muted-foreground text-xs font-normal">{display.unit}</span></p>
                      )}
                    </div>
                  );
                });
              })()}

              {/* Fasting tab */}
              {logTab === "fasting" && (() => {
                if (fastingLogs.length === 0) return <p className="text-muted-foreground text-sm text-center py-6">No fasting logs yet</p>;
                return fastingLogs.map((ft: any, i: number) => (
                  <div key={i} className="liquid-glass rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-muted-foreground text-[10px] font-medium">
                        {new Date(ft.date + "T00:00:00").toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ft.compliance_status === "completed" ? "bg-primary/15 text-primary" :
                        ft.compliance_status === "partial" ? "bg-yellow-500/15 text-yellow-400" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {ft.compliance_status ?? "pending"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-muted/40 rounded-xl p-2 text-center">
                        <p className="text-muted-foreground text-[9px]">LMOD</p>
                        <p className="text-foreground text-xs font-bold">
                          {ft.lmod_actual_time ? new Date(ft.lmod_actual_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                        </p>
                      </div>
                      <div className="bg-muted/40 rounded-xl p-2 text-center">
                        <p className="text-muted-foreground text-[9px]">FMOD</p>
                        <p className="text-foreground text-xs font-bold">
                          {ft.fmod_actual_time ? new Date(ft.fmod_actual_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                        </p>
                      </div>
                      <div className="bg-muted/40 rounded-xl p-2 text-center">
                        <p className="text-muted-foreground text-[9px]">Hours</p>
                        <p className="text-foreground text-xs font-bold">{ft.fasting_hours_completed ?? "—"}</p>
                      </div>
                    </div>
                    {ft.symptoms_flag && ft.symptoms_notes && (
                      <p className="text-destructive text-[10px] mt-2">⚠️ {ft.symptoms_notes}</p>
                    )}
                  </div>
                ));
              })()}

              {/* Supplements tab */}
              {logTab === "supps" && (() => {
                if (suppTrackingLogs.length === 0) return <p className="text-muted-foreground text-sm text-center py-6">No supplement logs yet</p>;
                // Group by date
                const byDate = new Map<string, { taken: number; total: number }>();
                suppTrackingLogs.forEach((t: any) => {
                  const existing = byDate.get(t.date) ?? { taken: 0, total: 0 };
                  existing.total++;
                  if (t.taken) existing.taken++;
                  byDate.set(t.date, existing);
                });
                const dates = [...byDate.keys()].sort().reverse();
                return dates.map((date, i) => {
                  const d = byDate.get(date)!;
                  const allDone = d.taken === d.total;
                  return (
                    <div key={i} className="liquid-glass rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-foreground text-sm font-medium">
                          {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { month: "short", day: "numeric", weekday: "short" })}
                        </p>
                        <p className="text-muted-foreground text-[10px]">{d.taken}/{d.total} taken</p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        allDone ? "bg-primary/15 text-primary" : "bg-yellow-500/15 text-yellow-400"
                      }`}>
                        {allDone ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" strokeWidth={2.4} /> Complete</span> : "Partial"}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // Patient list view
  const filteredPatients = patients.filter((p) => {
    if (statusFilter !== "all" && patientStatuses[p.user_id]?.status !== statusFilter) return false;
    if (packageFilter && p.plan_name !== packageFilter) return false;
    return true;
  });

  const statusCounts = {
    all: patients.length,
    green: patients.filter(p => patientStatuses[p.user_id]?.status === "green").length,
    yellow: patients.filter(p => patientStatuses[p.user_id]?.status === "yellow").length,
    red: patients.filter(p => patientStatuses[p.user_id]?.status === "red").length,
  };

  // Renewals due in next 30 days
  const now = Date.now();
  const in30d = now + 30 * 24 * 60 * 60 * 1000;
  const upcomingRenewals = patients.filter((p) => {
    if (!p.plan_expires_at) return false;
    const t = Date.parse(p.plan_expires_at);
    return Number.isFinite(t) && t >= now && t <= in30d;
  });

  // Patients by package
  const byPackage = new Map<string, number>();
  patients.forEach((p) => {
    if (!p.plan_name) return;
    byPackage.set(p.plan_name, (byPackage.get(p.plan_name) ?? 0) + 1);
  });
  const packageEntries = Array.from(byPackage.entries()).sort((a, b) => b[1] - a[1]);

  const fmtDate = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  };
  const daysUntil = (iso: string) => Math.ceil((Date.parse(iso) - now) / (24 * 60 * 60 * 1000));

  return (
    <div className="flex flex-col gap-4 px-5 pt-3 pb-4">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black text-foreground leading-tight">My Patients</h1>
      </motion.div>

      {/* KPI: Patients / On Track / Off Track — one row, clickable */}
      {patients.length > 0 && (
        <motion.div className="grid grid-cols-3 gap-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
          <button
            onClick={() => setStatusFilter("all")}
            className={`liquid-glass rounded-2xl p-3 text-left transition ${statusFilter === "all" ? "ring-2 ring-primary" : ""}`}
          >
            <p className="text-muted-foreground text-[9px] font-semibold uppercase tracking-wide">Patients</p>
            <p className="stat-number text-2xl text-foreground mt-1 leading-none">{patients.length}</p>
            <p className="text-muted-foreground text-[10px] mt-1">Active</p>
          </button>
          <button
            onClick={() => setStatusFilter("green")}
            className={`rounded-2xl p-3 text-left transition bg-emerald-500/10 border border-emerald-500/30 ${statusFilter === "green" ? "ring-2 ring-emerald-400" : ""}`}
          >
            <p className="text-emerald-500 text-[9px] font-semibold uppercase tracking-wide">On Track</p>
            <p className="stat-number text-2xl text-emerald-500 mt-1 leading-none">{statusCounts.green}</p>
            <p className="text-muted-foreground text-[10px] mt-1">Healthy</p>
          </button>
          <button
            onClick={() => setStatusFilter("red")}
            className={`rounded-2xl p-3 text-left transition bg-red-500/10 border border-red-500/30 ${statusFilter === "red" ? "ring-2 ring-red-400" : ""}`}
          >
            <p className="text-red-500 text-[9px] font-semibold uppercase tracking-wide">Off Track</p>
            <p className="stat-number text-2xl text-red-500 mt-1 leading-none">{statusCounts.red}</p>
            <p className="text-muted-foreground text-[10px] mt-1">Needs care</p>
          </button>
        </motion.div>
      )}

      {/* Patients by package — clickable to filter */}
      {packageEntries.length > 0 && (
        <motion.div className="liquid-glass rounded-2xl p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
          <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide mb-2">Patients by package</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPackageFilter(null)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold no-break transition ${
                packageFilter === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              All
              <span className="text-[10px] font-black bg-black/10 rounded-full px-1.5 py-0.5">{patients.length}</span>
            </button>
            {packageEntries.map(([name, count]) => {
              const active = packageFilter === name;
              return (
                <button
                  key={name}
                  onClick={() => setPackageFilter(active ? null : name)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold no-break transition ${
                    active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                  }`}
                >
                  {name}
                  <span className={`text-[10px] font-black rounded-full px-1.5 py-0.5 ${active ? "bg-black/10" : "bg-primary/20"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Upcoming renewals detail (only when there are any) */}
      {upcomingRenewals.length > 0 && (
        <motion.div className="rounded-2xl p-4 bg-warning/5 border border-warning/20" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <p className="text-warning text-[10px] font-semibold uppercase tracking-wide mb-2">Renewal reminders</p>
          <div className="flex flex-col gap-1.5">
            {upcomingRenewals.slice(0, 5).map((p) => (
              <button
                key={p.user_id}
                onClick={() => openPatient(p)}
                className="flex items-center justify-between text-left"
              >
                <span className="text-foreground text-sm font-semibold truncate">{p.name ?? "Unknown"}</span>
                <span className="text-warning text-[11px] font-bold ml-2 no-break">in {daysUntil(p.plan_expires_at!)}d</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Status Filter */}
      {patients.length > 0 && (
        <motion.div className="flex gap-2 flex-wrap" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          {([
            { key: "all" as const, label: "All", color: "text-foreground", bg: "bg-muted" },
            { key: "red" as const, label: "Needs Attention", color: "text-red-400", bg: "bg-red-500/15" },
            { key: "yellow" as const, label: "Monitor", color: "text-yellow-400", bg: "bg-yellow-500/15" },
            { key: "green" as const, label: "On Track", color: "text-emerald-400", bg: "bg-emerald-500/15" },
          ]).map(f => {
            const isDangerChip = f.key === "red" && statusCounts.red > 0;
            return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap no-break ${
                statusFilter === f.key ? `${f.bg} ${f.color} ring-1 ring-current` : "bg-muted/50 text-muted-foreground hover:bg-muted"
              } ${isDangerChip ? "danger-flash" : ""}`}
            >
              {f.label}
              <span className="text-[10px] opacity-70">{statusCounts[f.key]}</span>
            </button>
            );
          })}

        </motion.div>
      )}

      {patients.length === 0 ? (
        <motion.div className="liquid-glass rounded-3xl p-8 text-center" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-foreground font-bold">No patients yet</p>
          <p className="text-muted-foreground text-sm mt-1">Patients will appear here once assigned</p>
        </motion.div>
      ) : filteredPatients.length === 0 ? (
        <motion.div className="liquid-glass rounded-3xl p-8 text-center" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-muted-foreground text-sm">No patients in this category</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
          {filteredPatients.map((p, i) => {
            const ps = patientStatuses[p.user_id];
            const sc = ps ? statusColors[ps.status] : statusColors.yellow;
            const m = patientMetrics[p.user_id];
            const scoreDelta = m?.healthScore != null && m?.initialScore != null ? m.healthScore - m.initialScore : null;
            const weightDelta = m?.latestWeight != null && m?.initialWeight != null ? Math.round((m.latestWeight - m.initialWeight) * 10) / 10 : null;
            const glucoseDelta = m?.latestGlucose != null && m?.initialGlucose != null ? Math.round(m.latestGlucose - m.initialGlucose) : null;

            return (
              <motion.button
                key={p.user_id}
                onClick={() => openPatient(p)}
                className="liquid-glass rounded-2xl p-3 text-left w-full hover:bg-primary/5 transition-colors min-w-0"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
              >
                {/* Row 1: avatar + name + status + actions — always single line */}
                <div className="flex items-center gap-2 mb-2 min-w-0">
                  <div className="relative w-10 h-10 flex-shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                      ) : (
                        <span className="text-primary font-bold text-sm">
                          {(p.name ?? "?")[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${sc.dot}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground font-bold text-sm truncate">{p.name ?? "Unknown"}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                      {p.age && <span className="text-muted-foreground text-[11px] shrink-0">{p.age}y</span>}
                      {p.gender && <span className="text-muted-foreground text-[11px] shrink-0">· {p.gender}</span>}
                      {p.plan_name && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary truncate">
                          {p.plan_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {ps && (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 whitespace-nowrap ${sc.bg} ${sc.text}`}>
                      {ps.label}
                    </span>
                  )}
                  {onChatWithPatient && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onChatWithPatient(p.user_id); }}
                      className="p-2 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors shrink-0"
                      title="Chat with patient"
                    >
                      <MessageCircle className="w-4 h-4 text-primary" strokeWidth={2} />
                    </button>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>

                {/* Row 2: expiry (if any) */}
                {p.plan_expires_at && (() => {
                  const d = daysUntil(p.plan_expires_at);
                  const isSoon = d >= 0 && d <= 30;
                  const isExpired = d < 0;
                  return (
                    <p className={`text-[11px] font-semibold mb-2 whitespace-nowrap ${
                      isExpired ? "text-destructive" : isSoon ? "text-warning" : "text-muted-foreground"
                    }`}>
                      {isExpired ? "expired " : "expires "}{fmtDate(p.plan_expires_at)}
                    </p>
                  );
                })()}


                {/* 3 Key Metrics */}
                {(() => {
                  const glucose = m?.latestGlucose ?? null;
                  const glucoseDanger = glucose != null && glucose >= 180;
                  const glucoseWarn = glucose != null && glucose >= 130 && glucose < 180;
                  const bmi = p.bmi ?? null;
                  const weightDanger = bmi != null && bmi >= 35;
                  const weightWarn = bmi != null && bmi >= 30 && bmi < 35;
                  const score = m?.healthScore ?? null;
                  const scoreDanger = score != null && score < 40;
                  const scoreWarn = score != null && score >= 40 && score < 60;
                  const tone = (danger: boolean, warn: boolean) =>
                    danger
                      ? "danger-flash text-destructive"
                      : warn
                        ? "bg-warning/15 text-warning"
                        : "bg-muted/40 text-foreground";
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      <div className={`rounded-xl p-2.5 text-center ${tone(scoreDanger, scoreWarn)}`}>
                        <p className="text-muted-foreground text-[9px] font-medium mb-0.5">Health</p>
                        <p className={`stat-number text-sm ${scoreDanger ? "text-destructive" : "text-foreground"}`}>{score ?? "—"}</p>
                        {scoreDelta != null && (
                          <p className={`text-[9px] font-bold ${scoreDelta > 0 ? "text-emerald-400" : scoreDelta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                            {scoreDelta > 0 ? `▲ +${scoreDelta}` : scoreDelta < 0 ? `▼ ${scoreDelta}` : "—"}
                          </p>
                        )}
                      </div>
                      <div className={`rounded-xl p-2.5 text-center ${tone(weightDanger, weightWarn)}`}>
                        <p className="text-muted-foreground text-[9px] font-medium mb-0.5">Weight</p>
                        <p className={`stat-number text-sm ${weightDanger ? "text-destructive" : "text-foreground"}`}>
                          {m?.latestWeight ?? "—"}<span className="text-[8px] text-muted-foreground font-normal"> kg</span>
                        </p>
                        {weightDelta != null && (
                          <p className={`text-[9px] font-bold ${weightDelta < 0 ? "text-emerald-400" : weightDelta > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                            {weightDelta < 0 ? `▼ ${weightDelta}` : weightDelta > 0 ? `▲ +${weightDelta}` : "—"}
                          </p>
                        )}
                      </div>
                    </div>

                  );
                })()}

              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
