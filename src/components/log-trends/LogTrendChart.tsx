import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthLog } from "@/lib/healthLogsService";

type LogKind = "diabetes" | "bp" | "weight";

type RangeKey = "W" | "F" | "M" | "Q" | "ALL";

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "W", label: "7 days", days: 7 },
  { key: "F", label: "14 days", days: 14 },
  { key: "M", label: "30 days", days: 30 },
  { key: "Q", label: "90 days", days: 90 },
  { key: "ALL", label: "All", days: null },
];

interface SeriesDef {
  key: string;
  name: string;
  color: string;
}

const CONFIG: Record<LogKind, { title: string; unit: string; series: SeriesDef[]; primary: string }> = {
  diabetes: {
    title: "Glucose trend",
    unit: "mg/dL",
    primary: "morning",
    series: [
      { key: "morning", name: "Morning", color: "#248CCB" },
      { key: "evening", name: "Evening", color: "#F59E0B" },
    ],
  },
  bp: {
    title: "Blood pressure trend",
    unit: "mmHg",
    primary: "systolic",
    series: [
      { key: "systolic", name: "Systolic", color: "#EF4444" },
      { key: "diastolic", name: "Diastolic", color: "#248CCB" },
    ],
  },
  weight: {
    title: "Weight trend",
    unit: "kg",
    primary: "weight",
    series: [{ key: "weight", name: "Weight", color: "#10B981" }],
  },
};

function prettyDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function localKey(iso: string) {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

/**
 * Health-logs trend chart: Week / Fortnight / Month / Quarter / All toggles with
 * min, max and current tiles — the same shape as the dashboard metric charts.
 */
export default function LogTrendChart({ kind, logs }: { kind: LogKind; logs: HealthLog[] }) {
  const cfg = CONFIG[kind];
  const [range, setRange] = useState<RangeKey>("F");

  const points = useMemo(() => {
    // Oldest → newest, one point per reading (day-keyed for the axis label).
    const rows = [...logs].sort(
      (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime(),
    );
    return rows
      .map((l) => {
        if (kind === "weight") return { date: localKey(l.logged_at), weight: l.weight_kg ?? null };
        if (kind === "bp")
          return { date: localKey(l.logged_at), systolic: l.bp_systolic ?? null, diastolic: l.bp_diastolic ?? null };
        return {
          date: localKey(l.logged_at),
          morning: l.glucose_morning ?? null,
          evening: l.glucose_evening ?? null,
        } as any;
      })
      .filter((p: any) => cfg.series.some((s) => p[s.key] != null));
  }, [logs, kind, cfg.series]);

  const days = RANGES.find((r) => r.key === range)!.days;
  const windowed = useMemo(() => {
    if (days == null) return points;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const key = new Date(cutoff.getTime() - cutoff.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    return points.filter((p: any) => p.date >= key);
  }, [points, days]);

  const primaryValues = windowed
    .map((p: any) => p[cfg.primary])
    .filter((v: any) => typeof v === "number") as number[];

  const min = primaryValues.length ? Math.min(...primaryValues) : null;
  const max = primaryValues.length ? Math.max(...primaryValues) : null;
  const current = primaryValues.length ? primaryValues[primaryValues.length - 1] : null;
  const avg = primaryValues.length ? primaryValues.reduce((s, v) => s + v, 0) / primaryValues.length : null;

  const currentLabel = (() => {
    if (kind !== "bp") return current != null ? `${round1(current)}` : "—";
    const last: any = [...windowed].reverse().find((p: any) => p.systolic != null);
    return last ? `${last.systolic}/${last.diastolic ?? "—"}` : "—";
  })();

  const tiles = [
    { label: "Current", value: currentLabel },
    { label: "Lowest", value: min != null ? String(round1(min)) : "—" },
    { label: "Highest", value: max != null ? String(round1(max)) : "—" },
    { label: "Average", value: avg != null ? String(round1(avg)) : "—" },
  ];

  return (
    <motion.div
      className="liquid-glass mb-4 min-w-0 overflow-hidden rounded-2xl p-3.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <p className="min-w-0 text-foreground text-sm font-bold leading-tight break-words">{cfg.title}</p>
        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">{cfg.unit}</span>
      </div>

      <div className="grid grid-cols-5 gap-1 rounded-xl bg-muted p-1 mb-3" role="tablist" aria-label="Trend period">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            role="tab"
            aria-selected={range === r.key}
            className={`min-w-0 whitespace-nowrap rounded-lg px-1 py-2 text-[10px] font-bold transition-colors ${
              range === r.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="h-48 w-full">
        {windowed.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={windowed} margin={{ top: 8, right: 6, bottom: 0, left: 2 }}>
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
                width={44}
                stroke="hsl(var(--muted-foreground))"
                domain={["auto", "auto"]}
              />
              <Tooltip
                labelFormatter={(l: any) => prettyDate(String(l))}
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
              />
              {cfg.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />}
              {cfg.series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  connectNulls
                  dot={windowed.length <= 20 ? { r: 2.5, fill: s.color, strokeWidth: 0 } : false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-background/60 px-4 text-center text-[12px] font-medium text-muted-foreground">
            No readings in this range yet.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 min-[380px]:grid-cols-4 keep-mobile-cols">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-background/60 px-2.5 py-2 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground leading-tight break-words">
              {t.label}
            </p>
            <p className="text-[14px] font-black text-foreground leading-tight mt-0.5 break-words">{t.value}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
