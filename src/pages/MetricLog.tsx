import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Droplets, Heart, Plus, Scale, Trash2, Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchHealthLogs,
  formatLogDate,
  insertHealthLog,
  type HealthLog,
} from "@/lib/healthLogsService";
import {
  DAY_LABELS,
  defaultPref,
  fetchMetricPref,
  saveMetricPref,
  type MetricPref,
  type TrackedMetric,
} from "@/lib/metricTrackingService";
import { Switch } from "@/components/ui/switch";

const SLUG_TO_METRIC: Record<string, TrackedMetric> = {
  bp: "bp",
  sugar: "diabetes",
  diabetes: "diabetes",
  weight: "weight",
  water: "water",
};

const META: Record<TrackedMetric, { title: string; subtitle: string; icon: typeof Heart; accent: string }> = {
  bp: { title: "Blood Pressure", subtitle: "Systolic / diastolic readings", icon: Heart, accent: "#F26D6D" },
  diabetes: { title: "Blood Sugar", subtitle: "Fasting and post-meal glucose", icon: Activity, accent: "#5B8DEF" },
  weight: { title: "Weight", subtitle: "Track your body weight", icon: Scale, accent: "#7C6BF0" },
  water: { title: "Water", subtitle: "Glasses of water through the day", icon: Droplets, accent: "#38BDF8" },
};

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MetricLog() {
  const { metric: slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const metric = SLUG_TO_METRIC[String(slug ?? "")] ?? null;

  const [pref, setPref] = useState<MetricPref | null>(null);
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [when, setWhen] = useState(() => toLocalInputValue(new Date()));
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [glucose, setGlucose] = useState("");
  const [glucoseSlot, setGlucoseSlot] = useState<"morning" | "evening">("morning");
  const [weight, setWeight] = useState("");
  const [glasses, setGlasses] = useState("1");

  const meta = metric ? META[metric] : null;

  useEffect(() => {
    if (!user?.id || !metric) return;
    let alive = true;
    setLoading(true);
    Promise.all([fetchMetricPref(user.id, metric), fetchHealthLogs(metric, user.id)]).then(([p, l]) => {
      if (!alive) return;
      setPref(p);
      setLogs(l);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user?.id, metric]);

  const reload = async () => {
    if (!user?.id || !metric) return;
    setLogs(await fetchHealthLogs(metric, user.id));
    window.dispatchEvent(new CustomEvent("health-log-saved"));
  };

  const updatePref = async (next: MetricPref) => {
    setPref(next);
    if (user?.id) await saveMetricPref(user.id, next);
  };

  const toggleDay = (day: number) => {
    if (!pref) return;
    const has = pref.days_of_week.includes(day);
    const days = has ? pref.days_of_week.filter((d) => d !== day) : [...pref.days_of_week, day];
    void updatePref({ ...pref, days_of_week: days });
  };

  async function handleSave() {
    if (!user?.id || !metric) return;
    const loggedAt = new Date(when);
    if (Number.isNaN(loggedAt.getTime())) { toast.error("Pick a valid date and time"); return; }

    const base = {
      user_id: user.id,
      log_type: metric as HealthLog["log_type"],
      logged_at: loggedAt.toISOString(),
      glucose_morning: null as number | null,
      glucose_evening: null as number | null,
      bp_systolic: null as number | null,
      bp_diastolic: null as number | null,
      weight_kg: null as number | null,
    };

    if (metric === "bp") {
      const s = parseFloat(systolic), d = parseFloat(diastolic);
      if (!s || !d) { toast.error("Enter both systolic and diastolic"); return; }
      base.bp_systolic = s; base.bp_diastolic = d;
    } else if (metric === "diabetes") {
      const g = parseFloat(glucose);
      if (!g) { toast.error("Enter a glucose value"); return; }
      if (glucoseSlot === "morning") base.glucose_morning = g; else base.glucose_evening = g;
    } else if (metric === "weight") {
      const w = parseFloat(weight);
      if (!w) { toast.error("Enter your weight"); return; }
      base.weight_kg = w;
    } else {
      const g = parseFloat(glasses);
      if (!g) { toast.error("Enter number of glasses"); return; }
      base.weight_kg = g;
    }

    setSaving(true);
    const res = await insertHealthLog(base);
    setSaving(false);
    if (!res) { toast.error("Couldn't save that reading"); return; }
    toast.success("Reading saved");
    setSystolic(""); setDiastolic(""); setGlucose(""); setWeight(""); setGlasses("1");
    setWhen(toLocalInputValue(new Date()));
    void reload();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("health_logs" as any).delete().eq("id", id);
    if (error) { toast.error("Couldn't delete"); return; }
    toast.success("Reading removed");
    void reload();
  }

  const readingLabel = useMemo(() => (log: HealthLog) => {
    if (metric === "bp") return `${log.bp_systolic ?? "—"} / ${log.bp_diastolic ?? "—"} mmHg`;
    if (metric === "diabetes") {
      if (log.glucose_morning != null) return `${log.glucose_morning} mg/dL · Fasting`;
      if (log.glucose_evening != null) return `${log.glucose_evening} mg/dL · Post-meal`;
      return "—";
    }
    if (metric === "weight") return `${log.weight_kg ?? "—"} kg`;
    return `${log.weight_kg ?? 0} glass${(log.weight_kg ?? 0) === 1 ? "" : "es"}`;
  }, [metric]);

  if (!metric || !meta) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Unknown metric
      </div>
    );
  }

  const Icon = meta.icon;

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="sticky top-0 z-20 bg-background/85 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="w-10 h-10 rounded-xl liquid-glass flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" strokeWidth={1.8} />
          </button>
          <div className="min-w-0">
            <h1 className="text-foreground font-black text-lg leading-tight truncate">{meta.title}</h1>
            <p className="text-muted-foreground text-xs truncate">{meta.subtitle}</p>
          </div>
          <div
            className="ml-auto w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${meta.accent}1A` }}
          >
            <Icon className="w-5 h-5" style={{ color: meta.accent }} strokeWidth={1.9} />
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Tracking schedule */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-foreground font-bold text-sm">Track {meta.title.toLowerCase()}</p>
              <p className="text-muted-foreground text-xs">Your daily ring only appears on tracking days</p>
            </div>
            <Switch
              checked={pref?.enabled ?? true}
              onCheckedChange={(v) => updatePref({ ...(pref ?? defaultPref(metric)), enabled: v })}
            />
          </div>

          {(pref?.enabled ?? true) && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["daily", "custom"] as const).map((f) => {
                  const active = (pref?.frequency ?? "daily") === f;
                  return (
                    <button
                      key={f}
                      onClick={() => updatePref({ ...(pref ?? defaultPref(metric)), frequency: f })}
                      className={`h-11 rounded-2xl text-sm font-semibold transition-colors ${
                        active ? "bg-primary text-primary-foreground" : "liquid-glass text-muted-foreground"
                      }`}
                    >
                      {f === "daily" ? "Every day" : "Chosen days"}
                    </button>
                  );
                })}
              </div>

              {pref?.frequency === "custom" && (
                <div className="mt-4 flex items-center justify-between gap-1.5">
                  {DAY_LABELS.map((label, i) => {
                    const on = pref.days_of_week.includes(i);
                    return (
                      <button
                        key={i}
                        onClick={() => toggleDay(i)}
                        aria-pressed={on}
                        className={`flex-1 h-11 rounded-2xl text-xs font-bold transition-colors ${
                          on ? "bg-primary text-primary-foreground" : "liquid-glass text-muted-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* Add a reading */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="liquid-glass rounded-3xl p-5">
          <p className="text-foreground font-bold text-sm mb-4">Add a reading</p>

          {metric === "bp" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Systolic" value={systolic} onChange={setSystolic} placeholder="120" />
              <Field label="Diastolic" value={diastolic} onChange={setDiastolic} placeholder="80" />
            </div>
          )}

          {metric === "diabetes" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(["morning", "evening"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setGlucoseSlot(s)}
                    className={`h-11 rounded-2xl text-sm font-semibold transition-colors ${
                      glucoseSlot === s ? "bg-primary text-primary-foreground" : "liquid-glass text-muted-foreground"
                    }`}
                  >
                    {s === "morning" ? "Fasting" : "Post-meal"}
                  </button>
                ))}
              </div>
              <Field label="Glucose (mg/dL)" value={glucose} onChange={setGlucose} placeholder="95" />
            </div>
          )}

          {metric === "weight" && <Field label="Weight (kg)" value={weight} onChange={setWeight} placeholder="72.5" />}

          {metric === "water" && <Field label="Glasses" value={glasses} onChange={setGlasses} placeholder="1" />}

          <div className="mt-3">
            <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide mb-1.5">Date &amp; time</p>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full h-12 rounded-2xl liquid-glass px-4 text-sm text-foreground outline-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 w-full h-13 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Plus className="w-4 h-4" strokeWidth={2.4} />
            {saving ? "Saving…" : "Save reading"}
          </button>
        </motion.div>

        {/* History */}
        <div>
          <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 px-1">Previous readings</p>
          {loading ? (
            <p className="text-muted-foreground text-sm px-1">Loading…</p>
          ) : logs.length === 0 ? (
            <div className="liquid-glass rounded-3xl p-6 text-center">
              <p className="text-muted-foreground text-sm">No readings yet. Add your first one above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="liquid-glass rounded-2xl p-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground font-bold text-sm">{readingLabel(log)}</p>
                    <p className="text-muted-foreground text-xs">{formatLogDate(log.logged_at)}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(log.id)}
                    aria-label="Delete reading"
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide mb-1.5">{label}</p>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 rounded-2xl liquid-glass px-4 text-base font-bold text-foreground outline-none"
      />
    </div>
  );
}
