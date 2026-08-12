import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, ChevronRight, Droplet, Footprints, Scale, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchJoinDate, fetchTrendSeries, todayKey, type TrendMetric, type TrendPoint } from "@/lib/trendsService";

interface MetricDef {
  key: TrendMetric;
  title: string;
  unit: string;
  icon: typeof Activity;
  color: string;
  /** direction that counts as improvement */
  goodDirection: "up" | "down";
}

const METRICS: MetricDef[] = [
  { key: "health", title: "Health trends", unit: "", icon: Activity, color: "#248CCB", goodDirection: "up" },
  { key: "weight", title: "Weight trends", unit: "kg", icon: Scale, color: "#10B981", goodDirection: "down" },
  { key: "glucose", title: "Blood glucose trends", unit: "mg/dL", icon: Droplet, color: "#F59E0B", goodDirection: "down" },
  { key: "steps", title: "Steps trends", unit: "steps", icon: Footprints, color: "#8B5CF6", goodDirection: "up" },
];

function fmt(value: number, unit: string) {
  const v = unit === "steps" ? Math.round(value).toLocaleString("en-IN") : (Math.round(value * 10) / 10).toString();
  return unit && unit !== "steps" ? `${v} ${unit}` : v;
}

function prettyDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function MetricTrendsSection({ userId }: { userId?: string }) {
  const [joinDate, setJoinDate] = useState<string | null>(null);
  const [series, setSeries] = useState<Record<TrendMetric, TrendPoint[]>>({
    health: [], weight: [], glucose: [], steps: [],
  });
  const [open, setOpen] = useState<TrendMetric | null>(null);

  const today = todayKey();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const jd = (await fetchJoinDate(userId)) ?? today;
      if (cancelled) return;
      setJoinDate(jd);
      const results = await Promise.all(
        METRICS.map((m) => fetchTrendSeries(userId, m.key, jd, today)),
      );
      if (cancelled) return;
      const next = { health: [], weight: [], glucose: [], steps: [] } as Record<TrendMetric, TrendPoint[]>;
      METRICS.forEach((m, i) => { next[m.key] = results[i]; });
      setSeries(next);
    })();
    return () => { cancelled = true; };
  }, [userId, today]);

  const activeMetric = METRICS.find((m) => m.key === open) ?? null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {METRICS.map((m, idx) => {
          const data = series[m.key];
          const first = data[0]?.value ?? null;
          const last = data[data.length - 1]?.value ?? null;
          const delta = first != null && last != null ? last - first : null;
          const improving = delta == null || delta === 0
            ? null
            : m.goodDirection === "up" ? delta > 0 : delta < 0;
          const Icon = m.icon;
          return (
            <motion.button
              key={m.key}
              type="button"
              onClick={() => setOpen(m.key)}
              className="liquid-glass rounded-2xl p-3.5 text-left flex items-center gap-3 active:scale-[0.99] transition-transform"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * idx, duration: 0.22 }}
            >
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${m.color}1A` }}
              >
                <Icon className="w-4.5 h-4.5" style={{ color: m.color }} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-foreground leading-tight truncate">{m.title}</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                  {last != null ? `Now ${fmt(last, m.unit)}` : "No data yet"}
                  {delta != null && delta !== 0 && (
                    <span
                      className="ml-1.5 inline-flex items-center gap-0.5 font-bold"
                      style={{ color: improving ? "#10B981" : "#EF4444" }}
                    >
                      {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {fmt(Math.abs(delta), m.unit === "steps" ? "steps" : m.unit)}
                    </span>
                  )}
                </p>
              </div>
              {data.length > 1 && (
                <div className="w-16 h-8 shrink-0 opacity-90">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                      <Area type="monotone" dataKey="value" stroke={m.color} fill={`${m.color}33`} strokeWidth={1.6} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </motion.button>
          );
        })}
      </div>

      <TrendDetailDialog
        metric={activeMetric}
        userId={userId}
        joinDate={joinDate ?? today}
        today={today}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

function TrendDetailDialog({
  metric,
  userId,
  joinDate,
  today,
  onClose,
}: {
  metric: MetricDef | null;
  userId?: string;
  joinDate: string;
  today: string;
  onClose: () => void;
}) {
  type RangeKey = "weekly" | "fortnightly" | "monthly" | "quarterly" | "all" | "custom";
  const RANGES: { key: RangeKey; label: string; days: number | "all" }[] = [
    { key: "weekly", label: "Weekly", days: 7 },
    { key: "fortnightly", label: "Fortnightly", days: 14 },
    { key: "monthly", label: "Monthly", days: 30 },
    { key: "quarterly", label: "Quarterly", days: 90 },
    { key: "all", label: "Since joining", days: "all" },
  ];

  const startFor = useCallback(
    (days: number | "all") => {
      if (days === "all") return joinDate;
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() - (days - 1));
      const key = d.toISOString().slice(0, 10);
      return key < joinDate ? joinDate : key;
    },
    [joinDate, today],
  );

  const [range, setRange] = useState<RangeKey>("weekly");
  const [start, setStart] = useState(() => startFor(7));
  const [end, setEnd] = useState(today);
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset to the default weekly window whenever a different metric is opened.
  useEffect(() => {
    setRange("weekly");
    setStart(startFor(7));
    setEnd(today);
  }, [metric?.key, startFor, today]);

  const load = useCallback(async () => {
    if (!userId || !metric) return;
    setLoading(true);
    const rows = await fetchTrendSeries(userId, metric.key, start, end);
    setData(rows);
    setLoading(false);
  }, [userId, metric, start, end]);

  useEffect(() => { load(); }, [load]);

  const preset = (r: RangeKey, days: number | "all") => {
    setRange(r);
    setStart(startFor(days));
    setEnd(today);
  };

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const values = data.map((d) => d.value);
    const first = values[0];
    const last = values[values.length - 1];
    return {
      first, last,
      delta: last - first,
      best: metric?.goodDirection === "down" ? Math.min(...values) : Math.max(...values),
    };
  }, [data, metric]);

  const chartData = data.map((d) => ({ ...d, label: prettyDate(d.date) }));

  return (
    <Dialog open={!!metric} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[88svh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-black">{metric?.title ?? ""}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((p) => {
            const active = range === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => preset(p.key, p.days)}
                className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>


        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Start date
            <input
              type="date"
              value={start}
              min={joinDate}
              max={end}
              onChange={(e) => { setRange("custom"); setStart(e.target.value); }}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] font-semibold text-foreground normal-case tracking-normal"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            End date
            <input
              type="date"
              value={end}
              min={start}
              max={today}
              onChange={(e) => { setRange("custom"); setEnd(e.target.value); }}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] font-semibold text-foreground normal-case tracking-normal"
            />
          </label>
        </div>

        <div className="h-56 w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">Loading…</div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" minTickGap={18} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={38} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: any) => [fmt(Number(v), metric?.unit ?? ""), metric?.title ?? ""]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={metric?.color ?? "hsl(var(--primary))"}
                  strokeWidth={2.4}
                  dot={{ r: 2.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-background/60 px-4 text-center text-[12px] font-medium text-muted-foreground">
              No {metric?.title.replace(" trends", "").toLowerCase()} data in this range yet.
            </div>
          )}
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Start", value: fmt(stats.first, metric?.unit ?? "") },
              { label: "Latest", value: fmt(stats.last, metric?.unit ?? "") },
              { label: "Change", value: `${stats.delta > 0 ? "+" : ""}${fmt(stats.delta, metric?.unit ?? "")}` },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-background/60 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
                <p className="text-[15px] font-black text-foreground leading-tight mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
