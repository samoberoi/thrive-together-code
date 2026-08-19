import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronDown, Droplet, Footprints, Scale, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchJoinDate, fetchTrendSeries, todayKey, type TrendMetric, type TrendPoint } from "@/lib/trendsService";
import StepsShareCard from "@/components/StepsShareCard";

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
  { key: "health", title: "Health score", unit: "", icon: Activity, color: "#248CCB", goodDirection: "up" },
  { key: "weight", title: "Weight", unit: "kg", icon: Scale, color: "#10B981", goodDirection: "down" },
  { key: "glucose", title: "Blood glucose", unit: "mg/dL", icon: Droplet, color: "#F59E0B", goodDirection: "down" },
  { key: "steps", title: "Steps", unit: "steps", icon: Footprints, color: "#8B5CF6", goodDirection: "up" },
];

type RangeKey = "W" | "F" | "M" | "Q";

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "W", label: "Week", days: 7 },
  { key: "F", label: "Fortnight", days: 14 },
  { key: "M", label: "Month", days: 30 },
  { key: "Q", label: "Quarter", days: 90 },
];

function fmt(value: number, unit: string) {
  const v = unit === "steps" ? Math.round(value).toLocaleString("en-IN") : (Math.round(value * 10) / 10).toString();
  return unit && unit !== "steps" ? `${v} ${unit}` : v;
}

function shiftDays(dateKeyStr: string, days: number) {
  const d = new Date(`${dateKeyStr}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * Health-app style trends: one row per metric, tap to slide open an inline
 * chart with Week / Fortnight / Month / Quarter toggles. No dialogs.
 */
export default function MetricTrendsSection({ userId }: { userId?: string }) {
  const today = todayKey();
  const [open, setOpen] = useState<TrendMetric | null>(null);
  const [range, setRange] = useState<RangeKey>("W");
  const [full, setFull] = useState<Record<TrendMetric, TrendPoint[]>>({
    health: [], weight: [], glucose: [], steps: [],
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const jd = (await fetchJoinDate(userId)) ?? today;
      if (cancelled) return;
      // Load the widest window once (quarter or since joining, whichever is
      // longer) and slice it client-side when the toggle changes.
      const earliest = jd && jd < shiftDays(today, 90) ? jd : shiftDays(today, 90);
      const results = await Promise.all(METRICS.map((m) => fetchTrendSeries(userId, m.key, earliest, today)));
      if (cancelled) return;
      const next = { health: [], weight: [], glucose: [], steps: [] } as Record<TrendMetric, TrendPoint[]>;
      METRICS.forEach((m, i) => { next[m.key] = results[i]; });
      setFull(next);
    })();
    return () => { cancelled = true; };
  }, [userId, today]);

  const days = RANGES.find((r) => r.key === range)!.days;
  // Always a fixed rolling window ending today: 7 / 14 / 30 / 90 days back.
  const windowStart = useMemo(() => shiftDays(today, days - 1), [today, days]);

  return (
    <div className="space-y-2.5">
      {METRICS.map((m, idx) => {
        const all = full[m.key];
        const isOpen = open === m.key;
        const windowed = all.filter((p) => p.date >= windowStart && p.date <= today);
        const data = isOpen ? windowed : all.slice(-14);
        const first = windowed[0]?.value ?? null;
        const last = windowed[windowed.length - 1]?.value ?? all[all.length - 1]?.value ?? null;
        const delta = first != null && windowed.length > 1 ? windowed[windowed.length - 1].value - first : null;
        const improving = delta == null || delta === 0 ? null : m.goodDirection === "up" ? delta > 0 : delta < 0;
        const Icon = m.icon;

        return (
          <motion.div
            key={m.key}
            className="liquid-glass rounded-2xl overflow-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * idx, duration: 0.22 }}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : m.key)}
              className="w-full px-3.5 py-3 flex items-center gap-3 text-left active:scale-[0.995] transition-transform"
            >
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${m.color}1A` }}
              >
                <Icon className="w-4 h-4" style={{ color: m.color }} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-foreground leading-tight truncate">{m.title}</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                  {last != null ? fmt(last, m.unit) : "No data yet"}
                  {delta != null && delta !== 0 && (
                    <span
                      className="ml-1.5 inline-flex items-center gap-0.5 font-bold"
                      style={{ color: improving ? "#10B981" : "#EF4444" }}
                    >
                      {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {fmt(Math.abs(delta), m.unit)}
                    </span>
                  )}
                </p>
              </div>
              {!isOpen && data.length > 1 && (
                <div className="w-20 h-9 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }} barCategoryGap="18%">
                      <YAxis hide domain={[0, "dataMax"]} />
                      <Bar dataKey="value" fill={m.color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>

                </div>
              )}
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-3.5 pb-3.5">
                    <div className="flex gap-1 rounded-full bg-muted p-1 mb-3">
                      {RANGES.map((r) => {
                        const active = range === r.key;
                        return (
                          <button
                            key={r.key}
                            type="button"
                            onClick={() => setRange(r.key)}
                            className={`flex-1 rounded-full py-1.5 text-[11px] font-bold transition-colors ${
                              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                            }`}
                          >
                            {r.label}
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[10px] font-semibold text-muted-foreground mb-2">
                      {prettyDate(windowStart)} – {prettyDate(today)}
                    </p>

                    <div className="h-48 w-full">
                      {windowed.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={windowed} margin={{ top: 8, right: 6, bottom: 0, left: -12 }} barCategoryGap="22%">
                            <defs>
                              <linearGradient id={`fill-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={m.color} stopOpacity={0.95} />
                                <stop offset="100%" stopColor={m.color} stopOpacity={0.35} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                            <XAxis
                              dataKey="date"
                              tickFormatter={prettyDate}
                              tick={{ fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              stroke="hsl(var(--muted-foreground))"
                              minTickGap={24}
                            />
                            <YAxis
                              tick={{ fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              width={40}
                              stroke="hsl(var(--muted-foreground))"
                              domain={[0, "auto"]}
                            />
                            <Tooltip
                              cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                              labelFormatter={(l: any) => prettyDate(String(l))}
                              contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                              formatter={(v: any) => [fmt(Number(v), m.unit), m.title]}
                            />
                            <Bar
                              dataKey="value"
                              fill={`url(#fill-${m.key})`}
                              radius={[4, 4, 0, 0]}
                              maxBarSize={22}
                              isAnimationActive={false}
                            />
                            <Line
                              type="linear"
                              dataKey="value"
                              stroke={m.color}
                              strokeWidth={2}
                              dot={windowed.length <= 14 ? { r: 2.5, fill: m.color, strokeWidth: 0 } : false}
                              activeDot={{ r: 4 }}
                              isAnimationActive={false}
                            />
                          </ComposedChart>

                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-background/60 px-4 text-center text-[12px] font-medium text-muted-foreground">
                          No {m.title.toLowerCase()} data in this range yet.
                        </div>
                      )}
                    </div>

                    {windowed.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        {[
                          { label: "Start", value: fmt(windowed[0].value, m.unit) },
                          { label: "Latest", value: fmt(windowed[windowed.length - 1].value, m.unit) },
                          {
                            label: "Change",
                            value: `${delta != null && delta > 0 ? "+" : ""}${fmt(delta ?? 0, m.unit)}`,
                          },
                        ].map((s) => (
                          <div key={s.label} className="rounded-2xl border border-border bg-background/60 px-3 py-2">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              {s.label}
                            </p>
                            <p className="text-[14px] font-black text-foreground leading-tight mt-0.5">{s.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
