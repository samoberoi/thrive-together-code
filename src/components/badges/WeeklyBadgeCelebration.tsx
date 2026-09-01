import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BbdoBadge, markBadgeViewed, dismissBadgeLocally } from "@/lib/globalStreak";
import { X, Download, Sparkles, Award, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { toast } from "sonner";

type Props = {
  badge: BbdoBadge;
  open: boolean;
  onClose: () => void;
};

const EASE = [0.22, 1, 0.36, 1] as const;

// ---------- Confetti / Glitter ----------
type Piece = { id: number; left: number; delay: number; duration: number; size: number; color: string; drift: number; rotate: number };

function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo<Piece[]>(() => {
    const palette = ["#E00101", "#248CCB", "#F59E0B", "#10B981", "#0F1A3D"];
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2.5,
      duration: 3.5 + Math.random() * 3,
      size: 4 + Math.random() * 6,
      color: palette[Math.floor(Math.random() * palette.length)],
      drift: (Math.random() - 0.5) * 80,
      rotate: Math.random() * 360,
    }));
  }, [count]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: -40, x: 0, opacity: 0, rotate: 0 }}
          animate={{ y: "110vh", x: p.drift, opacity: [0, 1, 1, 0.8, 0], rotate: p.rotate + 720 }}
          transition={{ delay: p.delay, duration: p.duration, ease: "easeIn", repeat: Infinity, repeatDelay: 0.5 }}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size * (Math.random() > 0.5 ? 1 : 1.6),
            background: p.color,
            borderRadius: Math.random() > 0.5 ? "999px" : "2px",
            boxShadow: `0 0 6px ${p.color}55`,
          }}
        />
      ))}
    </div>
  );
}

// ---------- Delta card ----------
function DeltaCard({
  label,
  from,
  to,
  unit,
  betterDown = true,
}: {
  label: string;
  from?: number | null;
  to?: number | null;
  unit: string;
  betterDown?: boolean;
}) {
  if (from == null || to == null || isNaN(Number(from)) || isNaN(Number(to))) return null;
  const f = Number(from);
  const t = Number(to);
  const delta = t - f;
  const isBetter = delta === 0 ? null : betterDown ? delta < 0 : delta > 0;
  const Icon = delta === 0 ? Minus : delta < 0 ? TrendingDown : TrendingUp;
  const tone =
    isBetter === null
      ? "text-muted-foreground bg-muted"
      : isBetter
        ? "text-emerald-700 bg-emerald-500/12 ring-1 ring-emerald-500/25"
        : "text-red-700 bg-red-500/12 ring-1 ring-red-500/30";

  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
      <div className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider mb-2">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground/70 text-sm line-through">{f.toFixed(1)}</span>
        <span className="text-muted-foreground text-xs">→</span>
        <span className="text-foreground font-black text-2xl">{t.toFixed(1)}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{unit}</div>
      <div className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold mt-2 ${tone}`}>
        <Icon className="w-3 h-3" />
        {delta === 0 ? "no change" : `${Math.abs(delta).toFixed(1)} ${unit}`}
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number | undefined | null; unit: string }) {
  const n = Number(value ?? 0);
  if (!n) return null;
  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
      <div className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider mb-2">{label}</div>
      <div className="text-foreground font-black text-2xl">{n.toLocaleString()}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{unit}</div>
    </div>
  );
}

export default function WeeklyBadgeCelebration({ badge, open, onClose }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [name, setName] = useState<string>("Champion");
  const [pillarHits, setPillarHits] = useState<Record<string, { hit: number; missed: number; applicable: number }>>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("name, avatar_url").eq("user_id", user.id).maybeSingle();
      if (data) {
        setName((data as any).name?.split(" ")[0] || "Champion");
        setAvatarUrl((data as any).avatar_url || null);
      }
      const { data: days } = await supabase
        .from("user_global_streak_days")
        .select("pillars_status")
        .eq("user_id", user.id)
        .gte("day", badge.period_start)
        .lte("day", badge.period_end);
      const agg: Record<string, { hit: number; missed: number; applicable: number }> = {};
      (days || []).forEach((d: any) => {
        const ps = d.pillars_status || {};
        Object.entries(ps).forEach(([k, v]: [string, any]) => {
          if (!agg[k]) agg[k] = { hit: 0, missed: 0, applicable: 0 };
          if (v?.applicable === false) return;
          agg[k].applicable += 1;
          if (v?.hit) agg[k].hit += 1;
          else agg[k].missed += 1;
        });
      });
      setPillarHits(agg);
    })();
  }, [badge.id, badge.period_start, badge.period_end]);

  const s: any = badge.snapshot || {};
  const isMonthly = badge.badge_type === "monthly";
  const completeDays = Number(s.complete_days ?? 0);
  const tier: "gold" | "mixed" | "rough" =
    completeDays >= 7 ? "gold" : completeDays >= 4 ? "mixed" : "rough";
  const isRough = !isMonthly && tier !== "gold";
  const headline = isMonthly
    ? `A full month, ${name}.`
    : tier === "gold"
      ? `One week completed, ${name}.`
      : tier === "mixed"
        ? `A mixed week, ${name}.`
        : `A rough week, ${name}.`;
  const subline = isMonthly
    ? null
    : tier === "gold"
      ? "7/7 pillar-perfect days"
      : `${completeDays}/7 pillar-perfect days`;
  const chipLabel = isMonthly ? `MONTHLY · #${badge.period_number}` : `WEEK ${badge.period_number}`;
  const chipBg =
    isMonthly || tier === "gold"
      ? "linear-gradient(135deg, #248CCB 0%, #E00101 100%)"
      : tier === "mixed"
        ? "linear-gradient(135deg, #248CCB 0%, #F59E0B 100%)"
        : "linear-gradient(135deg, #0F1A3D 0%, #6B7280 100%)";
  // Light theme surface — matches Home page background wash.
  const heroBg = "radial-gradient(1100px 640px at 50% -10%, #EEF3FF 0%, #FCFCFD 55%, #FCFCFD 100%)";
  const dateRange = `${new Date(badge.period_start).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — ${new Date(badge.period_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  const handleClose = () => {
    // Close instantly and remember the dismissal locally so returning from
    // background / another tab never re-opens this weekly review.
    dismissBadgeLocally(badge.id);
    onClose();
    if (!badge.viewed) void markBadgeViewed(badge.id).catch(() => undefined);
  };


  const handleDownload = async () => {
    try {
      const { generateBbdoBadgePdf } = await import("@/lib/generateBbdoBadgePdf");
      await generateBbdoBadgePdf(badge, { name, avatarUrl });
      toast.success("Badge downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Could not download");
    }
  };

  const hasHealthDeltas =
    s.weight_start != null || s.glucose_start != null || s.insulin_start != null || s.bp_systolic_start != null;

  const messageTone =
    tier === "gold"
      ? "bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/25"
      : tier === "mixed"
        ? "bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/30"
        : "bg-red-500/10 text-red-800 ring-1 ring-red-500/25";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          style={{ background: heroBg }}
        >
          {/* Soft brand wash at the bottom */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(720px 500px at 50% 110%, rgba(36,140,203,0.10), transparent 55%)",
            }}
          />

          {/* Falling glitter — only for celebratory weeks */}
          {!isRough && <Confetti count={tier === "gold" ? 70 : 30} />}

          {/* Close — pinned below the status bar / notch, always visible */}
          <button
            onClick={handleClose}
            className="no-pill fixed right-4 z-[120] h-11 rounded-full pl-3 pr-4 shadow-lift inline-flex items-center gap-1.5 text-white text-sm font-bold transition-transform active:scale-95"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 14px)",
              background: "linear-gradient(135deg, #0F1A3D 0%, #1E2A52 100%)",
            }}
            aria-label="Close weekly review"
          >
            <X className="w-5 h-5" strokeWidth={3} />
            Close
          </button>

          <div
            id={`bbdo-badge-${badge.id}`}
            className="relative max-w-md mx-auto px-6 pb-10 min-h-screen flex flex-col items-center justify-center"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 76px)" }}
          >

            {/* BBDO wordmark */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.22, ease: EASE }}
              className="text-[13px] tracking-[0.35em]"
            >
              <span style={{ color: "var(--bbdo-red)" }} className="font-black">BB</span>
              <span style={{ color: "var(--bbdo-blue)" }} className="font-black">DO</span>
            </motion.div>

            {/* Week chip + date */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.22, ease: EASE }}
              className="mt-4 flex flex-col items-center gap-1.5"
            >
              <div
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-[11px] font-black tracking-wider text-white"
                style={{ background: chipBg }}
              >
                {isMonthly ? <Award className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                {chipLabel}
              </div>
              <div className="text-muted-foreground text-xs font-semibold">{dateRange}</div>
              {subline && (
                <div className="text-bbdo-ink-soft text-[11px] font-bold uppercase tracking-wider">
                  {subline}
                </div>
              )}
            </motion.div>

            {/* Avatar ring */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.22, ease: EASE }}
              className="mt-6 relative"
            >
              <div
                className="w-28 h-28 rounded-full p-[3px] shadow-lift"
                style={{ background: "linear-gradient(135deg, #248CCB 0%, #E00101 100%)" }}
              >
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-bbdo-ink text-3xl font-black">{name.charAt(0)}</span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.22, ease: EASE }}
              className="mt-6 text-foreground text-3xl font-black text-center leading-tight px-2 tracking-tight"
            >
              {headline}
            </motion.h1>

            {/* Motivational message */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.22, ease: EASE }}
              className={`mt-4 w-full rounded-2xl px-4 py-3 text-center text-sm font-semibold leading-snug ${messageTone}`}
            >
              {isMonthly
                ? "A full 28 days. Your body is thanking you — keep the compounding going."
                : tier === "gold"
                  ? "Perfect week. Compounding is real — protect this rhythm next 7 days."
                  : tier === "mixed"
                    ? `Solid on ${completeDays} days, missed on ${7 - completeDays}. Tighten the misses next week — the streak needs all 7.`
                    : `Rough week — only ${completeDays}/7 clean days. Buckle up, ${name}. Reset tomorrow: one pillar at a time. Your body is waiting for consistency.`}
            </motion.div>

            {/* Pillar breakdown */}
            {!isMonthly && Object.keys(pillarHits).length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.22, ease: EASE }}
                className="mt-6 w-full"
              >
                <div className="text-muted-foreground text-xs font-black uppercase tracking-[0.2em] mb-3 text-center">
                  Pillar breakdown
                </div>
                <div className="space-y-2">
                  {(["fasting","supplements","exercise","movement","water","yoga","diabetes"] as const)
                    .filter((k) => pillarHits[k]?.applicable > 0)
                    .map((k) => {
                      const p = pillarHits[k];
                      const ratio = p.applicable ? p.hit / p.applicable : 0;
                      const good = ratio === 1;
                      const bad = ratio < 0.5;
                      const label = k === "diabetes" ? "Health log" : k.charAt(0).toUpperCase() + k.slice(1);
                      const rowTone = good
                        ? "bg-emerald-500/10 ring-1 ring-emerald-500/25"
                        : bad
                          ? "bg-red-500/10 ring-1 ring-red-500/25"
                          : "bg-amber-500/10 ring-1 ring-amber-500/25";
                      const numTone = good
                        ? "text-emerald-700"
                        : bad
                          ? "text-red-700"
                          : "text-amber-700";
                      return (
                        <div
                          key={k}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 ${rowTone}`}
                        >
                          <span className="text-foreground text-sm font-bold capitalize">{label}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-black ${numTone}`}>
                              {p.hit}/{p.applicable}
                            </span>
                            {good ? (
                              <TrendingUp className={`w-3.5 h-3.5 ${numTone}`} />
                            ) : bad ? (
                              <TrendingDown className={`w-3.5 h-3.5 ${numTone}`} />
                            ) : (
                              <Minus className={`w-3.5 h-3.5 ${numTone}`} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="text-muted-foreground text-[11px] text-center mt-3 leading-relaxed">
                  Every pillar in your package must be hit to count a clean day.
                  Missed pillars break the daily streak and block the weekly badge.
                </div>
              </motion.div>
            )}

            {/* Health deltas */}
            {hasHealthDeltas && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22, duration: 0.22, ease: EASE }}
                className="mt-8 w-full"
              >
                <div className="text-muted-foreground text-xs font-black uppercase tracking-[0.2em] mb-3 text-center">
                  Health markers
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <DeltaCard label="Weight" from={s.weight_start} to={s.weight_end} unit="kg" betterDown />
                  <DeltaCard label="Glucose" from={s.glucose_start} to={s.glucose_end} unit="mg/dL" betterDown />
                  <DeltaCard label="Insulin" from={s.insulin_start} to={s.insulin_end} unit="units" betterDown />
                  {s.bp_systolic_start != null && s.bp_diastolic_start != null ? (
                    <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
                      <div className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider mb-2">
                        Blood Pressure
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-muted-foreground/70 text-sm line-through">
                          {Number(s.bp_systolic_start).toFixed(0)}/{Number(s.bp_diastolic_start).toFixed(0)}
                        </span>
                      </div>
                      <div className="text-foreground font-black text-2xl">
                        {Number(s.bp_systolic_end).toFixed(0)}/{Number(s.bp_diastolic_end).toFixed(0)}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">mmHg</div>
                      {(() => {
                        const ds = Number(s.bp_systolic_end) - Number(s.bp_systolic_start);
                        const dd = Number(s.bp_diastolic_end) - Number(s.bp_diastolic_start);
                        const better = ds < 0 && dd < 0;
                        const worse = ds > 0 && dd > 0;
                        const tone = better
                          ? "text-emerald-700 bg-emerald-500/12 ring-1 ring-emerald-500/25"
                          : worse
                            ? "text-red-700 bg-red-500/12 ring-1 ring-red-500/30"
                            : "text-muted-foreground bg-muted";
                        const Icon = better ? TrendingDown : worse ? TrendingUp : Minus;
                        return (
                          <div className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold mt-2 ${tone}`}>
                            <Icon className="w-3 h-3" />
                            {ds >= 0 ? "+" : ""}{ds.toFixed(0)} / {dd >= 0 ? "+" : ""}{dd.toFixed(0)}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              </motion.div>
            )}

            {/* Activity totals */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.22, ease: EASE }}
              className="mt-6 w-full"
            >
              <div className="text-muted-foreground text-xs font-black uppercase tracking-[0.2em] mb-3 text-center">
                What you did
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Steps" value={s.total_steps} unit={`over ${s.complete_days ?? 0} days`} />
                <Stat label="Water" value={s.total_water_glasses} unit="glasses" />
                <Stat label="Exercise" value={s.total_exercise_min} unit="minutes" />
                <Stat label="Yoga" value={s.total_yoga_min} unit="minutes" />
                <Stat label="Supplements" value={s.total_supplements} unit="taken" />
                <Stat label="Fasting" value={Math.round(Number(s.total_fasting_hours ?? 0))} unit="hours" />
              </div>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.34, duration: 0.22, ease: EASE }}
              className="mt-8 w-full flex gap-3"
            >
              <button
                onClick={handleDownload}
                className="no-pill flex-1 h-12 rounded-xl bg-card border border-border text-foreground font-bold text-sm inline-flex items-center justify-center gap-2 shadow-card hover:bg-muted transition-colors"
              >
                <Download className="w-4 h-4" /> Download PDF
              </button>
              <button
                onClick={handleClose}
                className="no-pill flex-1 h-12 rounded-xl font-bold text-sm text-white shadow-lift hover:opacity-90 transition-opacity"
                style={{ background: "linear-gradient(135deg, #248CCB 0%, #E00101 100%)" }}
              >
                Done — Back to Home
              </button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
