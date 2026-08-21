import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Droplets, Heart, Weight, Timer, Pill, Send, Loader2,
  CheckCircle2, Circle, ChevronRight, ChevronLeft, CalendarDays,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createNotification } from "@/lib/notificationService";
import { toast } from "sonner";

type TaskKey = "glucose" | "bp" | "weight" | "fasting" | "supplements";

interface Task {
  key: TaskKey;
  label: string;
  icon: React.ElementType;
  color: string;
  done: boolean;
  detail?: string | null;
}

interface DayRecord {
  date: string; // YYYY-MM-DD
  tasks: Record<TaskKey, boolean>;
  doneCount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  patient: {
    user_id: string;
    name: string | null;
    avatar_url: string | null;
    assigned_at: string;
  };
  coachName?: string | null;
}

const TASK_LABELS: Record<TaskKey, { label: string; icon: React.ElementType; color: string; nudge: string }> = {
  glucose:     { label: "Log fasting glucose", icon: Droplets, color: "text-red-500",     nudge: "Please log your fasting glucose today — even a quick reading helps us stay on top of your progress." },
  bp:          { label: "Log blood pressure",  icon: Heart,    color: "text-rose-500",    nudge: "Quick reminder to log your blood pressure today. It only takes a minute!" },
  weight:      { label: "Log weight",          icon: Weight,   color: "text-blue-500",    nudge: "Please log today's weight so we can track your progress accurately." },
  fasting:     { label: "Complete fasting window", icon: Timer, color: "text-amber-500",  nudge: "Stay strong on your fasting window today — you've got this! 💪" },
  supplements: { label: "Take supplements",    icon: Pill,     color: "text-emerald-500", nudge: "Reminder: take today's supplements as per your plan." },
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default function PatientDailySummaryDialog({ open, onClose, patient, coachName }: Props) {
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<Task[]>([]);
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [view, setView] = useState<"today" | "chronology">("today");
  const [nudging, setNudging] = useState<TaskKey | "all" | null>(null);

  useEffect(() => {
    if (!open) return;
    setView("today");
    void loadAll();
     
  }, [open, patient.user_id]);

  const loadAll = async () => {
    setLoading(true);
    const now = new Date();
    const todayStr = isoDay(now);
    const joinDate = new Date(patient.assigned_at);
    joinDate.setHours(0, 0, 0, 0);

    // Cap history to a reasonable range (last 60 days OR since join, whichever is smaller)
    const startDate = new Date(Math.max(joinDate.getTime(), now.getTime() - 60 * 86400000));
    const startIso = isoDay(startDate);
    const startAt = new Date(startIso + "T00:00:00").toISOString();

    const [{ data: hLogs }, { data: fastRows }, { data: suppRows }, { data: suppPlans }] = await Promise.all([
      supabase.from("health_logs" as any)
        .select("logged_at, glucose_morning, glucose_evening, bp_systolic, weight_kg, log_type")
        .eq("user_id", patient.user_id)
        .gte("logged_at", startAt),
      supabase.from("fasting_tracking" as any)
        .select("tracking_date, compliance_status, fasting_hours_completed")
        .eq("user_id", patient.user_id)
        .gte("tracking_date", startIso),
      supabase.from("user_supplement_tracking" as any)
        .select("date, taken")
        .eq("user_id", patient.user_id)
        .gte("date", startIso),
      supabase.from("user_supplement_plans" as any)
        .select("id, status")
        .eq("user_id", patient.user_id)
        .eq("status", "active")
        .limit(1),
    ]);

    const hasSuppPlan = !!(suppPlans && suppPlans.length);

    // Bucket per day
    const days = new Map<string, Record<TaskKey, boolean>>();
    const totalDays = Math.ceil((now.getTime() - startDate.getTime()) / 86400000) + 1;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      days.set(isoDay(d), { glucose: false, bp: false, weight: false, fasting: false, supplements: false });
    }

    (hLogs as any[] | null)?.forEach((l) => {
      const day = (l.logged_at as string).slice(0, 10);
      const bucket = days.get(day);
      if (!bucket) return;
      if (l.log_type === "diabetes" && (l.glucose_morning != null || l.glucose_evening != null)) bucket.glucose = true;
      if (l.log_type === "bp" && l.bp_systolic != null) bucket.bp = true;
      if (l.log_type === "weight" && l.weight_kg != null) bucket.weight = true;
    });

    (fastRows as any[] | null)?.forEach((r) => {
      const bucket = days.get(r.tracking_date);
      if (!bucket) return;
      if (r.compliance_status === "completed" || r.compliance_status === "partial" || (r.fasting_hours_completed ?? 0) > 0) {
        bucket.fasting = true;
      }
    });

    (suppRows as any[] | null)?.forEach((r) => {
      const bucket = days.get(r.date);
      if (!bucket) return;
      if (r.taken) bucket.supplements = true;
    });

    // Today's task list
    const todayBucket = days.get(todayStr) ?? { glucose: false, bp: false, weight: false, fasting: false, supplements: false };
    const todayLogs = (hLogs as any[] | null)?.filter((l) => (l.logged_at as string).startsWith(todayStr)) ?? [];
    const gLog = todayLogs.find((l) => l.log_type === "diabetes");
    const bpLog = todayLogs.find((l) => l.log_type === "bp");
    const wLog = todayLogs.find((l) => l.log_type === "weight");
    const fastLog = (fastRows as any[] | null)?.find((r) => r.tracking_date === todayStr);

    const taskList: Task[] = [
      { key: "glucose", ...pick("glucose"), done: todayBucket.glucose, detail: gLog?.glucose_morning ? `${gLog.glucose_morning} mg/dL` : gLog?.glucose_evening ? `${gLog.glucose_evening} mg/dL (evening)` : null },
      { key: "bp",      ...pick("bp"),      done: todayBucket.bp,      detail: bpLog?.bp_systolic ? `${bpLog.bp_systolic} mmHg` : null },
      { key: "weight",  ...pick("weight"),  done: todayBucket.weight,  detail: wLog?.weight_kg ? `${wLog.weight_kg} kg` : null },
      { key: "fasting", ...pick("fasting"), done: todayBucket.fasting, detail: fastLog?.fasting_hours_completed ? `${fastLog.fasting_hours_completed}h` : null },
    ];
    if (hasSuppPlan) {
      taskList.push({ key: "supplements", ...pick("supplements"), done: todayBucket.supplements, detail: null });
    }
    setToday(taskList);

    // Chronology, newest first
    const records: DayRecord[] = [];
    days.forEach((tasks, date) => {
      const doneCount = Object.values(tasks).filter(Boolean).length;
      records.push({ date, tasks, doneCount });
    });
    records.sort((a, b) => (a.date < b.date ? 1 : -1));
    setHistory(records);
    setLoading(false);
  };

  const pick = (k: TaskKey) => ({ label: TASK_LABELS[k].label, icon: TASK_LABELS[k].icon, color: TASK_LABELS[k].color });

  const nudgeTask = async (task: Task) => {
    setNudging(task.key);
    try {
      await createNotification({
        user_id: patient.user_id,
        title: `Reminder from ${coachName ?? "your coach"}`,
        body: TASK_LABELS[task.key].nudge,
        type: "coach_nudge",
        icon: "👋",
      });
      toast.success(`Nudge sent — "${task.label}"`);
    } catch {
      toast.error("Could not send nudge");
    } finally {
      setNudging(null);
    }
  };

  const nudgeAll = async () => {
    const pending = today.filter((t) => !t.done);
    if (!pending.length) return;
    setNudging("all");
    try {
      const items = pending.map((t) => t.label.toLowerCase()).join(", ");
      await createNotification({
        user_id: patient.user_id,
        title: `Reminder from ${coachName ?? "your coach"}`,
        body: `A gentle reminder to complete today's pending items: ${items}. You've got this! 💪`,
        type: "coach_nudge",
        icon: "👋",
      });
      toast.success("Nudge sent for all pending items");
    } catch {
      toast.error("Could not send nudge");
    } finally {
      setNudging(null);
    }
  };

  const doneToday = today.filter((t) => t.done).length;

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full sm:max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col overflow-hidden"
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-5 border-b border-border">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {patient.avatar_url ? (
                <img src={patient.avatar_url} alt="" className="w-11 h-11 rounded-2xl object-cover" />
              ) : (
                <span className="text-primary font-black text-base">{(patient.name ?? "?")[0].toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-foreground font-black text-base truncate">{patient.name ?? "Client"}</h3>
              <p className="text-muted-foreground text-xs">
                Joined {new Date(patient.assigned_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab switch */}
          <div className="flex gap-2 px-5 pt-4">
            <button
              onClick={() => setView("today")}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${view === "today" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Today
            </button>
            <button
              onClick={() => setView("chronology")}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${view === "chronology" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Full summary
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : view === "today" ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-foreground font-black text-2xl">{doneToday}<span className="text-muted-foreground text-base font-medium"> / {today.length}</span></p>
                    <p className="text-muted-foreground text-xs">completed today</p>
                  </div>
                  {today.length > doneToday && (
                    <button
                      onClick={nudgeAll}
                      disabled={nudging === "all"}
                      className="gradient-blue text-primary-foreground rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1 disabled:opacity-60"
                    >
                      {nudging === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Nudge all pending
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {today.map((t) => (
                    <div key={t.key} className={`flex items-center gap-3 p-3 rounded-2xl border ${t.done ? "bg-success/5 border-success/30" : "bg-card border-border"}`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${t.done ? "bg-success/15" : "bg-muted"}`}>
                        {t.done ? <CheckCircle2 className="w-5 h-5 text-success" /> : <t.icon className={`w-5 h-5 ${t.color}`} strokeWidth={1.8} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${t.done ? "text-foreground" : "text-foreground"}`}>{t.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t.done ? `Done${t.detail ? ` • ${t.detail}` : ""}` : "Pending"}
                        </p>
                      </div>
                      {!t.done && (
                        <button
                          onClick={() => nudgeTask(t)}
                          disabled={nudging === t.key}
                          className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-primary/10 text-primary flex items-center gap-1 disabled:opacity-60"
                        >
                          {nudging === t.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Nudge
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-muted-foreground text-xs mb-3">
                  Daily activity since {new Date(patient.assigned_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <div className="space-y-1.5">
                  {history.map((rec) => {
                    const total = Object.keys(rec.tasks).length;
                    const pct = Math.round((rec.doneCount / total) * 100);
                    const date = new Date(rec.date + "T00:00:00");
                    return (
                      <div key={rec.date} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40">
                        <div className="w-14 flex-shrink-0 text-center">
                          <p className="text-foreground text-xs font-black">{date.toLocaleDateString("en-IN", { day: "numeric" })}</p>
                          <p className="text-muted-foreground text-[10px] uppercase font-semibold">{date.toLocaleDateString("en-IN", { month: "short" })}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-1">
                          {(Object.keys(TASK_LABELS) as TaskKey[]).map((k) => {
                            const Icon = TASK_LABELS[k].icon;
                            const active = rec.tasks[k];
                            return (
                              <div
                                key={k}
                                title={`${TASK_LABELS[k].label}: ${active ? "Done" : "Missed"}`}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center ${active ? "bg-success/20 text-success" : "bg-muted text-muted-foreground/50"}`}
                              >
                                <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                              </div>
                            );
                          })}
                        </div>
                        <div className="w-14 text-right">
                          <p className={`text-xs font-black ${pct >= 80 ? "text-success" : pct >= 40 ? "text-warning" : "text-destructive"}`}>{pct}%</p>
                          <p className="text-[10px] text-muted-foreground">{rec.doneCount}/{total}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
