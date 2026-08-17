import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
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

/** Group results by report_id (fallback observed_at date) and return the two most recent. */
function pickTwoLatestReports(results: LabResult[]) {
  const byReport = new Map<string, LabResult[]>();
  for (const r of results) {
    const k = r.report_id || r.observed_at.slice(0, 10);
    if (!byReport.has(k)) byReport.set(k, []);
    byReport.get(k)!.push(r);
  }
  const entries = Array.from(byReport.entries())
    .map(([key, list]) => ({
      key,
      date: list.reduce((max, r) => (r.observed_at > max ? r.observed_at : max), list[0].observed_at),
      list,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { previous: entries[1] || null, newest: entries[0] || null, count: entries.length };
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso.slice(0, 10); }
}

export default function FullMarkerComparison({ userId, patientName, onClose }: Props) {
  const [params, setParams] = useState<LabParameter[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAllParameters(), fetchUserResults(userId)])
      .then(([p, r]) => { setParams(p); setResults(r); })
      .finally(() => setLoading(false));
  }, [userId]);

  const paramsByCode = useMemo(
    () => Object.fromEntries(params.map((p) => [p.code, p])) as Record<string, LabParameter>,
    [params],
  );
  const { previous, newest, count } = useMemo(() => pickTwoLatestReports(results), [results]);

  const rows = useMemo(() => {
    if (!newest) return [];
    const newestByCode = new Map(newest.list.map((r) => [r.parameter_code, r]));
    const previousByCode = new Map(previous ? previous.list.map((r) => [r.parameter_code, r]) : []);
    const allCodes = new Set<string>([
      ...newestByCode.keys(),
      ...previousByCode.keys(),
    ]);
    return Array.from(allCodes)
      .map((code) => {
        const n = newestByCode.get(code);
        const p = previousByCode.get(code);
        const param = paramsByCode[code];
        const status = statusFor(n, param);
        const prevStatus = statusFor(p, param);
        let delta: number | null = null;
        if (n?.value_numeric != null && p?.value_numeric != null) {
          delta = Math.round((n.value_numeric - p.value_numeric) * 100) / 100;
        }
        return {
          code,
          name: (n?.parameter_name || p?.parameter_name || param?.name || code),
          organ: organForParameter({ code, group_name: param?.group_name ?? null }),
          groupName: param?.group_name || "",
          unit: n?.unit || p?.unit || param?.unit || "",
          refLow: n?.ref_low ?? param?.ref_low ?? null,
          refHigh: n?.ref_high ?? param?.ref_high ?? null,
          prev: p,
          curr: n,
          prevStatus,
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-background overflow-y-auto"
    >
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black tracking-[0.18em] uppercase text-[var(--bbdo-blue)] mb-0.5">
              Full Marker Comparison
            </p>
            <h2 className="text-base sm:text-lg font-black text-foreground leading-snug truncate">
              {patientName ? `${patientName} · ` : ""}Previous vs new report
            </h2>
            {previous && newest && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {fmtDate(previous.date)} → {fmtDate(newest.date)}
                {count > 2 && ` · showing the latest 2 of ${count} reports`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-9 pl-3 pr-4 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2.4} />
            Close
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading comparison…</p>
        ) : !newest ? (
          <p className="text-sm text-muted-foreground">No lab results to compare yet.</p>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden bg-card">
            <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.8fr)] gap-3 px-4 py-2.5 bg-muted/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <span>Marker</span>
              <span>Previous {previous ? `· ${fmtDate(previous.date)}` : ""}</span>
              <span>New · {fmtDate(newest.date)}</span>
              <span className="text-right">Δ</span>
            </div>
            <ul className="divide-y divide-border/60">
              {rows.map((row) => {
                const s = STATUS_COLOR[row.status];
                const ps = STATUS_COLOR[row.prevStatus];
                return (
                  <li key={row.code} className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.8fr)] gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{row.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {row.groupName ? `${row.groupName} · ` : ""}
                        {row.refLow != null && row.refHigh != null
                          ? `Ref ${row.refLow}–${row.refHigh}${row.unit ? ` ${row.unit}` : ""}`
                          : row.unit || ""}
                      </p>
                    </div>
                    <ValueCell result={row.prev} unit={row.unit} statusColor={ps} />
                    <ValueCell result={row.curr} unit={row.unit} statusColor={s} />
                    <div className="text-right text-sm font-black tabular-nums">
                      {row.delta == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={
                            row.delta > 0
                              ? "text-[#E00101]"
                              : row.delta < 0
                                ? "text-[#10B981]"
                                : "text-muted-foreground"
                          }
                        >
                          {row.delta > 0 ? "+" : ""}
                          {row.delta}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ValueCell({
  result,
  unit,
  statusColor,
}: {
  result: LabResult | undefined;
  unit: string;
  statusColor: (typeof STATUS_COLOR)[keyof typeof STATUS_COLOR];
}) {
  if (!result || (result.value_numeric == null && !result.value_text)) {
    return <span className="text-sm text-muted-foreground">Not in report</span>;
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-black tabular-nums text-foreground">
        {result.value_numeric ?? result.value_text}
        {result.unit && result.value_numeric != null && (
          <span className="text-[10px] font-normal text-muted-foreground ml-1">{result.unit || unit}</span>
        )}
      </span>
      <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full ${statusColor.bg} ${statusColor.text}`}>
        {statusColor.label}
      </span>
    </div>
  );
}
