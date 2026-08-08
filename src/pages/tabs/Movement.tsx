import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Footprints, Flame, Trophy, Target, Plus, TrendingUp, Sparkles, ChevronRight, CheckCircle2, Lock, Watch } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchProfile } from "@/lib/profileService";
import { getUserStreakStartDate } from "@/lib/globalStreak";
import { canUseNativeHealth, isHealthStepsConnected } from "@/lib/healthProvider";
import { healthSourceLabel } from "@/lib/platformLabels";

import {
  fetchMovementOverview,
  logTodaySteps,
  type MovementOverview,
} from "@/lib/movementUserService";

function fmtSteps(n: number) {
  return n.toLocaleString("en-IN");
}

function dayLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
}

export default function MovementTab() {
  const { user } = useAuth();
  const [data, setData] = useState<MovementOverview | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputSteps, setInputSteps] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [p, sd] = await Promise.all([
        fetchProfile(user.id),
        getUserStreakStartDate(user.id).catch(() => null),
      ]);
      setStartDate(sd);
      const ov = await fetchMovementOverview(user.id, {
        bmiCategory: (p as any)?.bmi_category ?? null,
        activityLevel: (p as any)?.lifestyle?.activity ?? (p as any)?.activity_level ?? null,
        age: (p as any)?.age ?? null,
        weightKg: (p as any)?.weight ?? null,
        heightCm: (p as any)?.height ?? null,
      });
      setData(ov);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't load movement data");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!user) return;
    const n = Math.max(0, Math.round(Number(inputSteps)));
    if (!n) return toast.error("Enter today's step count");
    setSaving(true);
    try {
      await logTodaySteps(user.id, n);
      toast.success(`Logged ${fmtSteps(n)} steps for today`);
      setInputSteps("");
      window.dispatchEvent(new CustomEvent("health-log-saved"));
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save steps");
    } finally {
      setSaving(false);
    }
  };

  const ratio = useMemo(() => {
    if (!data || !data.targetSteps) return 0;
    return Math.min(1, data.todaySteps / data.targetSteps);
  }, [data]);

  if (loading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading movement…</div>;
  }

  const { progress, level, targetSteps, todaySteps, history: rawHistory, badgesEarned, allBadges, personalLevels, nextLevelTarget } = data;
  // Only show history from the user's contract/program start date onwards.
  const history = startDate ? rawHistory.filter((h) => h.date >= startDate) : rawHistory;
  const historyLabel = history.length <= 1 ? "Since day one" : `Last ${history.length} days`;
  const remaining = Math.max(0, targetSteps - todaySteps);
  const maxBar = Math.max(targetSteps, ...history.map((h) => h.steps), 1);
  const earnedCodes = new Set(badgesEarned.map((b) => b.badge_code));
  const nextLevel = personalLevels.find((l) => l.level_number === (level?.level_number ?? 0) + 1) ?? null;
  // When the phone/watch is actively delivering steps, manual entry is hidden so it can't be overridden.
  const deviceSyncing = canUseNativeHealth() && isHealthStepsConnected();

  return (
    <div className="theme-move px-4 md:px-6 pt-3 md:pt-8 pb-8 space-y-5">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 md:p-6 text-white shadow-card relative overflow-hidden"
        style={{ background: "var(--bbdo-gradient)" }}
      >
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
        <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/80">Movement</p>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mt-1">
          {level?.name ? `${level.name}` : "Get moving"}
        </h1>
        <p className="text-sm text-white/85 mt-1">
          Daily target <span className="font-black">{fmtSteps(targetSteps)} steps</span> · Level {progress.current_level}
        </p>
        <div className="flex items-center gap-3 mt-3 text-xs">
          <span className="inline-flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded-full font-semibold">
            <Flame className="w-3.5 h-3.5" /> {progress.current_streak_weeks} wk streak
          </span>
          <span className="inline-flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded-full font-semibold">
            <Trophy className="w-3.5 h-3.5" /> {badgesEarned.length} badges
          </span>
        </div>
      </motion.div>

      {/* Today ring + log */}
      <div className="rounded-3xl p-5 liquid-glass">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative w-24 h-24 shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke="var(--bbdo-red)" strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={`${ratio * 264} 264`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Footprints className="w-7 h-7 text-primary" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">Today</p>
              <p className="text-3xl font-black text-foreground leading-tight">{fmtSteps(todaySteps)}</p>
              <p className="text-xs text-muted-foreground">
                of {fmtSteps(targetSteps)} ·{" "}
                {todaySteps >= targetSteps
                  ? <span className="text-success font-bold inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" strokeWidth={2.4} />Goal hit</span>
                  : <span>{fmtSteps(remaining)} to go</span>}
              </p>
            </div>
          </div>
          <Target className="w-5 h-5 text-muted-foreground hidden sm:block" />
        </div>

        {canUseNativeHealth() && (
          <div className="mt-4 rounded-2xl border border-border bg-background px-3 py-2.5 flex items-center gap-2">
            <Watch className="h-4 w-4 shrink-0 text-primary" />
            <p className="text-[12px] font-semibold text-muted-foreground">
              {deviceSyncing
                ? `${healthSourceLabel()} syncs your steps automatically`
                : `${healthSourceLabel()} isn't connected — log your steps manually below`}
            </p>
          </div>
        )}

        {!deviceSyncing && (
          <>
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Log steps for today"
                value={inputSteps}
                onChange={(e) => setInputSteps(e.target.value)}
                className="flex-1 h-10 rounded-xl border border-input bg-background px-3 text-sm"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="h-10 px-4 rounded-xl bg-[var(--bbdo-red)] text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Plus className="w-4 h-4" /> {saving ? "Saving…" : "Log"}
              </button>
            </div>
            {canUseNativeHealth() && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                No device connected or permission denied? Enter your steps manually above.
              </p>
            )}
          </>
        )}

      </div>

      {/* History since contract start */}
      <div className="rounded-3xl p-5 liquid-glass">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black uppercase tracking-[0.12em] text-foreground/80 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-primary" /> {historyLabel}
          </h3>
          <span className="text-[11px] text-muted-foreground">Target {fmtSteps(targetSteps)}</span>
        </div>
        <div className="flex items-stretch gap-1.5 h-32">
          {history.map((h, idx) => {
            const pct = Math.min(100, (h.steps / maxBar) * 100);
            const hit = h.steps >= targetSteps;
            const isToday = idx === history.length - 1;
            const barPx = Math.max(h.steps > 0 ? 6 : 3, Math.round((pct / 100) * 96));
            return (
              <div key={h.date} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 h-full">
                <div className="w-full flex items-end justify-center" style={{ height: 96 }}>
                  <div
                    className={`w-full rounded-t-md ${
                      hit
                        ? "bg-success"
                        : h.steps > 0
                        ? "bg-primary/60"
                        : "bg-muted"
                    } ${isToday ? "ring-2 ring-[var(--bbdo-red)] ring-offset-1 ring-offset-card" : ""}`}
                    style={{ height: `${barPx}px` }}
                    title={`${h.date}: ${fmtSteps(h.steps)} steps`}
                  />
                </div>
                <span className={`text-[9px] ${isToday ? "font-black text-[var(--bbdo-red)]" : "text-muted-foreground"}`}>
                  {dayLabel(h.date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Level progression */}
      {nextLevel && (
        <div className="rounded-3xl p-5 liquid-glass">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-black uppercase tracking-[0.12em] text-foreground/80 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" /> Next level
            </h3>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-black text-foreground">{nextLevel.name}</p>
              <p className="text-xs text-muted-foreground">
                Hit {fmtSteps(nextLevelTarget)} steps a day to advance
              </p>
            </div>
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--pillar-move-soft)", color: "var(--pillar-move)" }}
            >
              <Footprints className="w-5 h-5" strokeWidth={1.75} />
            </span>
          </div>
        </div>
      )}

      {/* Badges */}
      {allBadges.length > 0 && (
        <div className="rounded-3xl p-5 liquid-glass">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black uppercase tracking-[0.12em] text-foreground/80 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-primary" /> Badges
            </h3>
            <span className="text-[11px] text-muted-foreground">{badgesEarned.length}/{allBadges.length}</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {allBadges.map((b) => {
              const earned = earnedCodes.has(b.code);
              return (
                <div
                  key={b.id}
                  className={`rounded-2xl p-3 text-center ${earned ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/40 opacity-50"}`}
                >
                  <span
                    className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center"
                    style={{
                      background: earned ? "var(--pillar-move-soft)" : "hsl(var(--muted))",
                      color: earned ? "var(--pillar-move)" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {earned ? <Footprints className="w-5 h-5" strokeWidth={1.75} /> : <Lock className="w-5 h-5" strokeWidth={1.75} />}
                  </span>
                  <p className="text-[11px] font-bold mt-1 text-foreground leading-tight">{b.name}</p>
                  {b.description && (
                    <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2">{b.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
