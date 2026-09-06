import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Droplets, Heart, Scale, Timer, Pill, Footprints, Dumbbell, Flower2, Wind, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchProfile } from "@/lib/profileService";
import { getUser } from "@/lib/userStore";
import { Switch } from "@/components/ui/switch";
import {
  DAY_LABELS,
  fetchMetricPrefs,
  isScheduledToday,
  saveMetricPref,
  scheduleSummary,
  type MetricPref,
  type TrackedMetric,
} from "@/lib/metricTrackingService";

const CONFIGURABLE: { metric: TrackedMetric; label: string; icon: typeof Heart; accent: string; note: string }[] = [
  { metric: "bp", label: "Blood pressure", icon: Heart, accent: "#F26D6D", note: "Systolic / diastolic readings" },
  { metric: "diabetes", label: "Blood sugar", icon: Activity, accent: "#E00101", note: "Fasting and post-meal glucose" },
  { metric: "weight", label: "Weight", icon: Scale, accent: "#7C6BF0", note: "Body weight check-ins" },
  { metric: "water", label: "Water", icon: Droplets, accent: "#38BDF8", note: "Glasses of water each day" },
];

const AUTO_RINGS: { label: string; icon: typeof Heart; accent: string; note: string }[] = [
  { label: "Fasting", icon: Timer, accent: "#0F1A3D", note: "Shows when a fasting protocol is active" },
  { label: "Supplements", icon: Pill, accent: "#F59E0B", note: "Shows when you have an active supplement plan" },
  { label: "Movement", icon: Footprints, accent: "#10B981", note: "Daily steps — always on" },
  { label: "Exercise", icon: Dumbbell, accent: "#248CCB", note: "Daily exercise minutes — always on" },
  { label: "Yoga & Stress", icon: Flower2, accent: "#8B5CF6", note: "Daily yoga minutes — always on" },
  { label: "Breath Protocol", icon: Wind, accent: "#EA6A5E", note: "Daily breathing sessions — always on" },
  { label: "Soleus Push-Ups", icon: ArrowUpDown, accent: "#B91C1C", note: "Daily soleus rounds — always on" },
];

/**
 * Ring Manager — one place to decide which daily rings appear and on which days.
 */
export default function RingManagement() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Record<TrackedMetric, MetricPref> | null>(null);
  const [clinical, setClinical] = useState<{ hasDiabetes: boolean; hasHypertension: boolean }>({
    hasDiabetes: false,
    hasHypertension: false,
  });

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [p, profile] = await Promise.all([
      fetchMetricPrefs(user.id),
      fetchProfile(user.id, { force: true }).catch(() => null),
    ]);
    const c = (getUser().clinical ?? (profile as any)?.clinical ?? {}) as any;
    setPrefs(p);
    setClinical({ hasDiabetes: c.hasDiabetes === true, hasHypertension: c.hasHypertension === true });
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const update = async (next: MetricPref) => {
    setPrefs((prev) => (prev ? { ...prev, [next.metric]: next } : prev));
    if (user?.id) {
      const ok = await saveMetricPref(user.id, next);
      if (!ok) toast.error("Could not save. Please try again.");
    }
  };

  const applicable = (m: TrackedMetric) => {
    if (m === "diabetes") return clinical.hasDiabetes;
    if (m === "bp") return clinical.hasHypertension;
    return true;
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm leading-relaxed">
        Choose which rings show up on your home screen and how often you want to track them. Changes apply right away.
      </p>

      <div className="flex flex-col gap-3">
        <h3 className="text-foreground font-bold text-sm">You decide these</h3>
        {CONFIGURABLE.map(({ metric, label, icon: Icon, accent, note }) => {
          const pref = prefs?.[metric];
          const usable = applicable(metric);
          const showsToday = usable && isScheduledToday(pref);
          return (
            <motion.div
              key={metric}
              layout
              className="rounded-2xl liquid-glass p-4 flex flex-col gap-3"
              style={{ opacity: usable ? 1 : 0.6 }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center"
                  style={{ background: `${accent}1F` }}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.8} style={{ color: accent }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground font-semibold text-sm leading-tight">{label}</p>
                  <p className="text-muted-foreground text-xs mt-0.5 break-words">
                    {usable ? (pref ? scheduleSummary(pref) : note) : "Not needed — you haven't reported this condition"}
                  </p>
                </div>
                {usable && pref && (
                  <Switch
                    checked={pref.enabled}
                    onCheckedChange={(v) => void update({ ...pref, enabled: v })}
                    aria-label={`Track ${label}`}
                  />
                )}
              </div>

              {usable && pref?.enabled && (
                <>
                  <div className="flex gap-2">
                    {(["daily", "custom"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => void update({ ...pref, frequency: f })}
                        className={`flex-1 h-9 rounded-xl text-xs font-semibold transition ${
                          pref.frequency === f
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/60 text-muted-foreground"
                        }`}
                      >
                        {f === "daily" ? "Every day" : "Pick days"}
                      </button>
                    ))}
                  </div>

                  {pref.frequency === "custom" && (
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((d, i) => {
                        const on = pref.days_of_week.includes(i);
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              const days = on
                                ? pref.days_of_week.filter((x) => x !== i)
                                : [...pref.days_of_week, i];
                              void update({ ...pref, days_of_week: days });
                            }}
                            className={`flex-1 h-9 rounded-xl text-xs font-bold transition ${
                              on ? "bg-primary/15 text-primary border border-primary/40" : "bg-muted/60 text-muted-foreground border border-transparent"
                            }`}
                            aria-pressed={on}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    {showsToday ? "Showing on your rings today" : "Hidden today — it will come back on your chosen days"}
                  </p>
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-foreground font-bold text-sm">Part of your programme</h3>
        {AUTO_RINGS.map(({ label, icon: Icon, accent, note }) => (
          <div key={label} className="rounded-2xl liquid-glass p-4 flex items-center gap-3">
            <div
              className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center"
              style={{ background: `${accent}1F` }}
            >
              <Icon className="w-5 h-5" strokeWidth={1.8} style={{ color: accent }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground font-semibold text-sm leading-tight">{label}</p>
              <p className="text-muted-foreground text-xs mt-0.5 break-words">{note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
