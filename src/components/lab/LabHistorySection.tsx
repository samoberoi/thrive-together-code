import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, TrendingDown, TrendingUp, Minus, FlaskConical, Clock } from "lucide-react";
import {
  fetchAllParameters,
  fetchParametersForProducts,
  fetchUserResults,
  formatDelta,
  latestResultsByParam,
  type LabParameter,
  type LabResult,
} from "@/lib/labResultsService";
import BodyInvestigationMap from "@/components/lab/BodyInvestigationMap";

interface Props {
  userId: string;
  patientName?: string | null;
  /**
   * Product codes the user has been recommended / has uploaded reports for.
   * Their catalog markers are rendered as a "skeleton" (awaiting value) even
   * before any values have been captured — same experience as a partner-lab report.
   */
  expectedProductCodes?: string[];
}

function statusBg(status: string | null) {
  if (status === "high") return "bg-destructive/10 text-destructive";
  if (status === "low") return "bg-amber-500/10 text-amber-600 dark:text-amber-300";
  if (status === "normal") return "bg-[var(--bbdo-mint)]/10 text-[var(--bbdo-mint)]";
  return "bg-muted text-muted-foreground";
}

function trendIcon(trend: string | null) {
  if (!trend || trend === "baseline" || trend === "stable") return <Minus className="w-3 h-3" />;
  if (trend === "improving") return <TrendingDown className="w-3 h-3" />;
  return <TrendingUp className="w-3 h-3" />;
}

type Row = { param: LabParameter | undefined; code: string; name: string; result: LabResult | undefined };

export default function LabHistorySection({ userId, patientName, expectedProductCodes = [] }: Props) {
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<LabParameter[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [expected, setExpected] = useState<LabParameter[]>([]);

  const codesKey = useMemo(
    () => Array.from(new Set(expectedProductCodes.filter(Boolean))).sort().join(","),
    [expectedProductCodes],
  );

  useEffect(() => {
    setLoading(true);
    const codes = codesKey ? codesKey.split(",") : [];
    Promise.all([
      fetchAllParameters(),
      fetchUserResults(userId),
      codes.length ? fetchParametersForProducts(codes).catch(() => []) : Promise.resolve([]),
    ])
      .then(([p, r, e]) => {
        setParams(p);
        setResults(r);
        setExpected(e);
      })
      .finally(() => setLoading(false));
  }, [userId, codesKey]);

  const latest = useMemo(() => latestResultsByParam(results), [results]);
  const paramsByCode = useMemo(
    () => Object.fromEntries(params.map((p) => [p.code, p])) as Record<string, LabParameter>,
    [params],
  );

  const grouped = useMemo(() => {
    const rows: Record<string, Row> = {};
    // Skeleton first: every marker the recommended panels cover
    for (const p of expected) {
      rows[p.code] = { param: p, code: p.code, name: p.name, result: latest[p.code] };
    }
    // Then anything that already has a value
    for (const code of Object.keys(latest)) {
      const r = latest[code];
      rows[code] = { param: paramsByCode[code], code, name: r.parameter_name || code, result: r };
    }
    const map: Record<string, Row[]> = {};
    for (const row of Object.values(rows)) {
      const g = row.param?.group_name || "OTHER";
      (map[g] = map[g] || []).push(row);
    }
    for (const g of Object.keys(map)) {
      map[g].sort((a, b) => (a.param?.display_order ?? 999) - (b.param?.display_order ?? 999));
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [latest, paramsByCode, expected]);

  const pendingCount = useMemo(
    () => grouped.reduce((s, [, items]) => s + items.filter((i) => !i.result).length, 0),
    [grouped],
  );

  if (loading) {
    return (
      <div className="liquid-glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
        Loading lab history…
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="space-y-4">
        <BodyInvestigationMap userId={userId} patientName={patientName} />
        <div className="liquid-glass rounded-2xl p-6 text-center">
          <FlaskConical className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="text-sm font-semibold">No lab results yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Once a report comes in, the values are read into your markers and you'll start seeing deltas here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BodyInvestigationMap userId={userId} patientName={patientName} />

      {pendingCount > 0 && (
        <div className="liquid-glass rounded-2xl px-4 py-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-snug">
            <span className="font-bold text-foreground">{pendingCount} marker{pendingCount === 1 ? "" : "s"} awaiting values.</span>{" "}
            These come from your recommended panels — as soon as the report values are read in, each one lights up with your value,
            range and trend.
          </p>
        </div>
      )}

      {grouped.map(([group, items]) => (
        <motion.div
          key={group}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="liquid-glass rounded-2xl overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-wider text-primary">{group}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{items.length}</span>
          </div>
          <ul className="divide-y divide-border/40">
            {items.map(({ code, name, param, result: r }) => {
              const refLow = r?.ref_low ?? param?.ref_low ?? null;
              const refHigh = r?.ref_high ?? param?.ref_high ?? null;
              const unit = r?.unit ?? param?.unit ?? null;
              const delta = r?.delta_vs_baseline ?? null;
              const trend = r?.trend ?? null;
              const trendColor =
                trend === "improving"
                  ? "text-[var(--bbdo-mint)] bg-[var(--bbdo-mint)]/10"
                  : trend === "worsening"
                    ? "text-destructive bg-destructive/10"
                    : "text-muted-foreground bg-muted";
              return (
                <li key={code} className={`px-4 py-3 flex items-center gap-3 ${r ? "" : "opacity-70"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{r?.parameter_name || name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {refLow != null && refHigh != null
                        ? `Ref ${refLow}–${refHigh}${unit ? ` ${unit}` : ""}`
                        : unit || code}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {r ? (
                      <>
                        <div className="text-sm font-black tabular-nums">
                          {r.value_numeric ?? r.value_text ?? "—"}
                          {unit && r.value_numeric != null && (
                            <span className="text-[10px] font-normal text-muted-foreground ml-1">{unit}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          {r.status && (
                            <span className={`text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 ${statusBg(r.status)}`}>
                              {r.status}
                            </span>
                          )}
                          {r.is_baseline ? (
                            <span className="text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 bg-primary/10 text-primary">
                              Baseline
                            </span>
                          ) : (
                            delta != null &&
                            delta !== 0 && (
                              <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 flex items-center gap-0.5 ${trendColor}`}>
                                {trendIcon(trend)}
                                {formatDelta(delta, null)}
                              </span>
                            )
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="h-2.5 w-14 rounded-full bg-muted animate-pulse ml-auto" />
                        <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground">
                          <Clock className="w-2.5 h-2.5" /> Awaiting
                        </span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </motion.div>
      ))}
    </div>
  );
}
