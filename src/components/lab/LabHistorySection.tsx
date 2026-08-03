import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, TrendingDown, TrendingUp, Minus, FlaskConical, CircleSlash2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string;
  patientName?: string | null;
  /**
   * Product codes the user has been recommended / has uploaded reports for.
   * Their catalog markers are rendered alongside captured values. Markers that
   * are absent from the uploaded report are explicitly shown as unavailable.
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

type Row = {
  param: LabParameter | undefined;
  code: string;
  name: string;
  group: string;
  result: LabResult | undefined;
};

type PanelMarker = { code: string; name: string; groupName: string | null };

const norm = (v: string) => (v || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Every marker a panel covers, straight from the partner-lab catalog payload. */
async function fetchPanelMarkers(productCodes: string[]): Promise<PanelMarker[]> {
  if (!productCodes.length) return [];
  const { data } = await (supabase as any)
    .from("thyrocare_tests")
    .select("product_code, raw_data")
    .in("product_code", productCodes);
  const out: Record<string, PanelMarker> = {};
  for (const t of ((data as any[]) || [])) {
    const included = Array.isArray(t?.raw_data?.testsIncluded) ? t.raw_data.testsIncluded : [];
    for (const it of included) {
      const name = String(it?.name || it?.code || "").trim();
      if (!name) continue;
      const code = String(it?.code || name).trim();
      const key = norm(code) || norm(name);
      if (!out[key]) out[key] = { code, name, groupName: it?.groupName || null };
    }
  }
  return Object.values(out);
}

export default function LabHistorySection({ userId, patientName, expectedProductCodes = [] }: Props) {
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<LabParameter[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [expected, setExpected] = useState<LabParameter[]>([]);
  const [panelMarkers, setPanelMarkers] = useState<PanelMarker[]>([]);

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
      fetchPanelMarkers(codes).catch(() => []),
    ])
      .then(([p, r, e, pm]) => {
        setParams(p);
        setResults(r);
        setExpected(e);
        setPanelMarkers(pm);
      })
      .finally(() => setLoading(false));
  }, [userId, codesKey]);

  const latest = useMemo(() => latestResultsByParam(results), [results]);
  const paramsByCode = useMemo(
    () => Object.fromEntries(params.map((p) => [p.code, p])) as Record<string, LabParameter>,
    [params],
  );

  const paramsByNorm = useMemo(() => {
    const m: Record<string, LabParameter> = {};
    for (const p of params) {
      m[norm(p.code)] = p;
      if (!m[norm(p.name)]) m[norm(p.name)] = p;
    }
    return m;
  }, [params]);

  const grouped = useMemo(() => {
    const rows: Record<string, Row> = {};

    const addSkeleton = (code: string, name: string, group: string | null, param?: LabParameter) => {
      const key = norm(code) || norm(name);
      if (!key) return;
      const p = param || paramsByNorm[key] || paramsByNorm[norm(name)];
      const result = latest[code] || (p ? latest[p.code] : undefined);
      rows[key] = { param: p, code: p?.code || code, name: p?.name || name, group: (p?.group_name || group || "OTHER").toUpperCase(), result };
    };

    // 1. Catalog params mapped to the recommended panels (when mapping exists)
    for (const p of expected) addSkeleton(p.code, p.name, p.group_name, p);
    // 2. Full marker list straight from the panel definition (100 params etc.)
    for (const m of panelMarkers) addSkeleton(m.code, m.name, m.groupName);
    // 3. Anything that already has a value wins
    for (const code of Object.keys(latest)) {
      const r = latest[code];
      const p = paramsByCode[code] || paramsByNorm[norm(code)] || paramsByNorm[norm(r.parameter_name)];
      const key = norm(code) || norm(r.parameter_name);
      rows[key] = {
        param: p,
        code,
        name: r.parameter_name || p?.name || code,
        group: (p?.group_name || rows[key]?.group || "OTHER").toUpperCase(),
        result: r,
      };
    }

    const map: Record<string, Row[]> = {};
    for (const row of Object.values(rows)) {
      (map[row.group] = map[row.group] || []).push(row);
    }
    for (const g of Object.keys(map)) {
      map[g].sort((a, b) => {
        const oa = a.result ? 0 : 1;
        const ob = b.result ? 0 : 1;
        if (oa !== ob) return oa - ob;
        const da = a.param?.display_order ?? 999;
        const db = b.param?.display_order ?? 999;
        if (da !== db) return da - db;
        return a.name.localeCompare(b.name);
      });
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [latest, paramsByCode, paramsByNorm, expected, panelMarkers]);

  const unavailableCount = useMemo(
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

      {unavailableCount > 0 && (
        <div className="liquid-glass rounded-2xl px-4 py-3 flex items-center gap-2">
          <CircleSlash2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-snug">
            <span className="font-bold text-foreground">{unavailableCount} marker{unavailableCount === 1 ? " is" : "s are"} unavailable.</span>{" "}
            These markers were not found in the uploaded test report.
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
                <li key={`${group}-${code}`} className={`px-4 py-3 flex items-center gap-3 ${r ? "" : "opacity-70"}`}>
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
                        <div className="text-sm font-black text-muted-foreground">—</div>
                        <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground">
                          <CircleSlash2 className="w-2.5 h-2.5" /> Unavailable
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
