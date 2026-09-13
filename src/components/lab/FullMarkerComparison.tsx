import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ArrowRight, Minus, TrendingDown, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchAllParameters,
  fetchUserResults,
  type LabParameter,
  type LabResult,
} from "@/lib/labResultsService";
import { statusFor, STATUS_COLOR, organForParameter } from "@/lib/labOrganMap";

interface Props {
  userId: string;
  patientName?: string | null;
  onClose: () => void;
}

type ReportGroup = {
  key: string;
  date: string;
  list: LabResult[];
};

/** Group results by report_id (fallback observed_at date) and return the two most recent. */
function pickTwoLatestReports(results: LabResult[]) {
  const byReport = new Map<string, LabResult[]>();
  for (const result of results) {
    const key = result.external_report_id || result.report_id || result.observed_at.slice(0, 10);
    const existing = byReport.get(key);
    if (existing) existing.push(result);
    else byReport.set(key, [result]);
  }

  const entries: ReportGroup[] = Array.from(byReport.entries())
    .map(([key, list]) => ({
      key,
      date: list.reduce((latest, result) => (result.observed_at > latest ? result.observed_at : latest), list[0]?.observed_at ?? ""),
      list,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return { previous: entries[1] ?? null, newest: entries[0] ?? null, count: entries.length };
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function FullMarkerComparison({ userId, patientName, onClose }: Props) {
  const [params, setParams] = useState<LabParameter[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAllParameters(), fetchUserResults(userId)])
      .then(([parameters, userResults]) => {
        setParams(parameters);
        setResults(userResults);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const paramsByCode = useMemo(
    () => Object.fromEntries(params.map((parameter) => [parameter.code, parameter])) as Record<string, LabParameter>,
    [params],
  );
  const { previous, newest, count } = useMemo(() => pickTwoLatestReports(results), [results]);

  const rows = useMemo(() => {
    if (!newest) return [];
    const newestByCode = new Map(newest.list.map((result) => [result.parameter_code, result]));
    const previousByCode = new Map(previous ? previous.list.map((result) => [result.parameter_code, result]) : []);
    const allCodes = new Set<string>([...newestByCode.keys(), ...previousByCode.keys()]);

    return Array.from(allCodes)
      .map((code) => {
        const currentResult = newestByCode.get(code);
        const previousResult = previousByCode.get(code);
        const parameter = paramsByCode[code];
        const status = statusFor(currentResult, parameter);
        const previousStatus = statusFor(previousResult, parameter);
        let delta: number | null = null;
        if (currentResult?.value_numeric != null && previousResult?.value_numeric != null) {
          delta = Math.round((currentResult.value_numeric - previousResult.value_numeric) * 100) / 100;
        }
        return {
          code,
          name: currentResult?.parameter_name || previousResult?.parameter_name || parameter?.name || code,
          organ: organForParameter({ code, group_name: parameter?.group_name ?? null }),
          groupName: parameter?.group_name || "",
          unit: currentResult?.unit || previousResult?.unit || parameter?.unit || "",
          refLow: currentResult?.ref_low ?? parameter?.ref_low ?? null,
          refHigh: currentResult?.ref_high ?? parameter?.ref_high ?? null,
          previousResult,
          currentResult,
          previousStatus,
          status,
          delta,
        };
      })
      .sort((a, b) => {
        const rank = { critical: 0, out_of_range: 1, normal: 2, no_data: 3 } as const;
        if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        return a.name.localeCompare(b.name);
      });
  }, [newest, previous, paramsByCode]);

  const comparison = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[100] flex min-h-0 flex-col overflow-hidden bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Full marker comparison"
    >
      <header className="z-10 shrink-0 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Full marker comparison</p>
            <h2 className="mt-0.5 text-base font-black leading-snug text-foreground sm:text-lg">
              {patientName ? `${patientName} · ` : ""}Lab reports
            </h2>
            {previous && newest ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span>{fmtDate(previous.date)}</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
                <span>{fmtDate(newest.date)}</span>
                {count > 2 && <span>· latest 2 of {count}</span>}
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">Latest report</p>
            )}
          </div>
          <Button type="button" variant="outline" size="icon" onClick={onClose} className="h-10 w-10 shrink-0 rounded-full" aria-label="Close comparison">
            <X className="h-4 w-4" strokeWidth={2.4} />
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-6xl px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
          {loading ? (
            <div className="space-y-3" aria-label="Loading comparison">
              {[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : !newest ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <p className="text-sm font-bold text-foreground">No lab results yet</p>
              <p className="mt-1 text-xs text-muted-foreground">A comparison will appear after a report is added.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {rows.map((row) => (
                  <article key={row.code} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                    <div className="border-b border-border/70 px-4 py-3">
                      <h3 className="text-sm font-bold leading-snug text-foreground">{row.name}</h3>
                      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                        {[row.groupName, referenceText(row.refLow, row.refHigh, row.unit)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-border/70">
                      <ReportValue label="Previous" date={previous ? fmtDate(previous.date) : "No older report"} result={row.previousResult} unit={row.unit} status={row.previousStatus} />
                      <ReportValue label="Latest" date={fmtDate(newest.date)} result={row.currentResult} unit={row.unit} status={row.status} emphasized />
                    </div>
                    <DeltaBar delta={row.delta} unit={row.unit} />
                  </article>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,0.8fr)] gap-4 bg-muted/50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <span>Marker</span>
                  <span>Previous<br /><span className="normal-case tracking-normal">{previous ? fmtDate(previous.date) : "No older report"}</span></span>
                  <span>Latest<br /><span className="normal-case tracking-normal">{fmtDate(newest.date)}</span></span>
                  <span className="text-right">Change</span>
                </div>
                <ul className="divide-y divide-border/70">
                  {rows.map((row) => (
                    <li key={row.code} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,0.8fr)] items-center gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground">{row.name}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{[row.groupName, referenceText(row.refLow, row.refHigh, row.unit)].filter(Boolean).join(" · ")}</p>
                      </div>
                      <CompactValue result={row.previousResult} unit={row.unit} status={row.previousStatus} />
                      <CompactValue result={row.currentResult} unit={row.unit} status={row.status} />
                      <DeltaValue delta={row.delta} unit={row.unit} />
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </main>
    </motion.div>
  );

  return createPortal(comparison, document.body);
}

function referenceText(low: number | null, high: number | null, unit: string) {
  if (low != null && high != null) return `Reference ${low}–${high}${unit ? ` ${unit}` : ""}`;
  return unit;
}

function ReportValue({ label, date, result, unit, status, emphasized = false }: {
  label: string;
  date: string;
  result: LabResult | undefined;
  unit: string;
  status: keyof typeof STATUS_COLOR;
  emphasized?: boolean;
}) {
  const statusColor = STATUS_COLOR[status];
  return (
    <div className={`min-w-0 p-4 ${emphasized ? "bg-primary/5" : ""}`}>
      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-foreground">{date}</p>
      {!result || (result.value_numeric == null && !result.value_text) ? (
        <p className="mt-4 text-xs text-muted-foreground">Not in this report</p>
      ) : (
        <div className="mt-3">
          <p className="break-words text-lg font-black tabular-nums text-foreground">
            {result.value_numeric ?? result.value_text}
            {result.unit && result.value_numeric != null && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{result.unit || unit}</span>}
          </p>
          <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${statusColor.bg} ${statusColor.text}`}>
            {statusColor.label}
          </span>
        </div>
      )}
    </div>
  );
}

function CompactValue({ result, unit, status }: { result: LabResult | undefined; unit: string; status: keyof typeof STATUS_COLOR }) {
  const statusColor = STATUS_COLOR[status];
  if (!result || (result.value_numeric == null && !result.value_text)) return <span className="text-xs text-muted-foreground">Not in report</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-black tabular-nums text-foreground">
        {result.value_numeric ?? result.value_text}
        {result.unit && result.value_numeric != null && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{result.unit || unit}</span>}
      </span>
      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${statusColor.bg} ${statusColor.text}`}>{statusColor.label}</span>
    </div>
  );
}

function DeltaBar({ delta, unit }: { delta: number | null; unit: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between border-t border-border/70 bg-muted/30 px-4 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Change</span>
      <DeltaValue delta={delta} unit={unit} />
    </div>
  );
}

function DeltaValue({ delta, unit }: { delta: number | null; unit: string }) {
  if (delta == null) return <span className="text-xs font-semibold text-muted-foreground">Not comparable</span>;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span className="flex items-center justify-end gap-1 text-sm font-black tabular-nums text-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      {delta > 0 ? "+" : ""}{delta}{unit ? <span className="text-[10px] font-normal text-muted-foreground">{unit}</span> : null}
    </span>
  );
}