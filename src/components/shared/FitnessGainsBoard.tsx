import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface FitnessClient {
  user_id: string;
  name: string | null;
}

interface Gain {
  user_id: string;
  name: string;
  sugarDrop: number | null;   // mg/dL improvement (positive = better)
  bpDrop: number | null;      // systolic points improvement
  weightDrop: number | null;  // kg lost
  scoreGain: number | null;   // health score points gained
  score: number;              // ranking score
}

/** Window we look back over when measuring "who is getting fitter". */
const LOOKBACK_DAYS = 90;

type Row = {
  user_id: string;
  log_type: string;
  logged_at: string;
  glucose_morning: number | null;
  glucose_evening: number | null;
  bp_systolic: number | null;
  weight_kg: number | null;
};

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** First (oldest) and last (newest) numeric value in a chronological list. */
function edges(values: { at: string; v: number }[]) {
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a.at.localeCompare(b.at));
  return { first: sorted[0].v, last: sorted[sorted.length - 1].v };
}

/**
 * "Getting Fitter" leaderboard — ranks members by real health improvement
 * (blood sugar down, BP down, weight down, health score up) over the last
 * 90 days. Shared by the coach dashboard and the super-admin overview.
 */
export default function FitnessGainsBoard({
  clients,
  title = "Getting Fitter",
  subtitle = "Last 90 days",
}: {
  clients: FitnessClient[];
  title?: string;
  subtitle?: string;
}) {
  const [gains, setGains] = useState<Gain[]>([]);
  const [loading, setLoading] = useState(true);

  const ids = useMemo(
    () => Array.from(new Set(clients.map((c) => c.user_id).filter(Boolean))),
    [clients],
  );
  const key = ids.join(",");
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach((c) => m.set(c.user_id, c.name || "Unnamed"));
    return m;
  }, [clients]);

  useEffect(() => {
    if (!ids.length) { setGains([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - LOOKBACK_DAYS);
      const db = supabase as any;

      const batches = chunk(ids, 200);
      const logRes = await Promise.all(
        batches.map((b) =>
          db
            .from("health_logs")
            .select("user_id, log_type, logged_at, glucose_morning, glucose_evening, bp_systolic, weight_kg")
            .in("user_id", b)
            .in("log_type", ["diabetes", "bp", "weight"])
            .gte("logged_at", since.toISOString())
            .order("logged_at", { ascending: true })
            .limit(20000),
        ),
      );
      const profRes = await Promise.all(
        batches.map((b) =>
          db.from("profiles").select("user_id, assessment, initial_health_score").in("user_id", b),
        ),
      );
      if (cancelled) return;

      const rows: Row[] = logRes.flatMap((r) => (r?.data as Row[]) ?? []);
      const byUser = new Map<string, { sugar: { at: string; v: number }[]; bp: { at: string; v: number }[]; wt: { at: string; v: number }[] }>();
      for (const r of rows) {
        const b = byUser.get(r.user_id) ?? { sugar: [], bp: [], wt: [] };
        if (r.log_type === "diabetes") {
          const g = r.glucose_morning ?? r.glucose_evening;
          if (g != null) b.sugar.push({ at: r.logged_at, v: Number(g) });
        } else if (r.log_type === "bp" && r.bp_systolic != null) {
          b.bp.push({ at: r.logged_at, v: Number(r.bp_systolic) });
        } else if (r.log_type === "weight" && r.weight_kg != null) {
          b.wt.push({ at: r.logged_at, v: Number(r.weight_kg) });
        }
        byUser.set(r.user_id, b);
      }

      const scoreDelta = new Map<string, number>();
      profRes.forEach((r) => {
        ((r?.data as any[]) ?? []).forEach((p) => {
          const now = Number(p?.assessment?.healthScore);
          const init = Number(p?.initial_health_score);
          if (Number.isFinite(now) && Number.isFinite(init)) scoreDelta.set(p.user_id, now - init);
        });
      });

      const out: Gain[] = [];
      for (const id of ids) {
        const b = byUser.get(id);
        const s = b ? edges(b.sugar) : null;
        const p = b ? edges(b.bp) : null;
        const w = b ? edges(b.wt) : null;
        const sugarDrop = s ? Math.round((s.first - s.last) * 10) / 10 : null;
        const bpDrop = p ? Math.round(p.first - p.last) : null;
        const weightDrop = w ? Math.round((w.first - w.last) * 10) / 10 : null;
        const sg = scoreDelta.get(id) ?? null;
        const scoreGain = sg != null ? Math.round(sg) : null;

        // Normalised improvement score — each pillar contributes comparably.
        const rank =
          Math.max(0, sugarDrop ?? 0) / 20 +
          Math.max(0, bpDrop ?? 0) / 10 +
          Math.max(0, weightDrop ?? 0) / 2 +
          Math.max(0, scoreGain ?? 0) / 5;

        if (rank <= 0) continue;
        out.push({
          user_id: id,
          name: nameOf.get(id) || "Unnamed",
          sugarDrop, bpDrop, weightDrop, scoreGain,
          score: rank,
        });
      }

      out.sort((a, b2) => b2.score - a.score);
      setGains(out.slice(0, 10));
      setLoading(false);
    })().catch(() => { if (!cancelled) { setGains([]); setLoading(false); } });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  return (
    <motion.div
      className="liquid-glass rounded-2xl p-3 sm:p-5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2} />
        <span className="text-foreground font-bold text-sm sm:text-base">{title}</span>
        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-auto">
          {subtitle}
        </span>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : gains.length === 0 ? (
        <p className="text-sm text-muted-foreground py-5 text-center">
          No measurable improvement yet — keep logging sugar, BP and weight.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {gains.map((g, i) => (
            <div
              key={g.user_id}
              className={cn(
                "flex items-start gap-3 rounded-xl p-2.5",
                i < 3 ? "bg-emerald-500/10" : "bg-muted/40",
              )}
            >
              <span className="w-7 text-center text-sm font-black shrink-0">{medal(i)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{g.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {g.sugarDrop != null && g.sugarDrop > 0 && (
                    <GainChip icon="down" label={`${g.sugarDrop} mg/dL sugar`} />
                  )}
                  {g.bpDrop != null && g.bpDrop > 0 && (
                    <GainChip icon="down" label={`${g.bpDrop} pts BP`} />
                  )}
                  {g.weightDrop != null && g.weightDrop > 0 && (
                    <GainChip icon="down" label={`${g.weightDrop} kg`} />
                  )}
                  {g.scoreGain != null && g.scoreGain > 0 && (
                    <GainChip icon="up" label={`${g.scoreGain} health score`} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function GainChip({ icon, label }: { icon: "up" | "down"; label: string }) {
  const Icon = icon === "up" ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
