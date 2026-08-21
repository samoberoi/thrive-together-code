import { useCallback, useEffect, useState } from "react";
import { Beef, Droplets, Flame, Leaf, Loader2, Salad, Wheat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PlateRow {
  id: string;
  name: string;
  items: any[] | null;
  total_carbs_g: number | null;
  total_protein_g: number | null;
  total_fat_g: number | null;
  total_fiber_g: number | null;
  total_calories_kcal: number | null;
  avg_gi: number | null;
  sugar_spike_risk: string | null;
  created_at: string;
}

/**
 * Read-only log of the plates a client has built, with full macro breakdown so
 * the coach can review nutrition during a check-in.
 */
export default function PatientPlatesLog({ userId, limit = 10 }: { userId: string; limit?: number }) {
  const [rows, setRows] = useState<PlateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_plates" as any)
      .select("id,name,items,total_carbs_g,total_protein_g,total_fat_g,total_fiber_g,total_calories_kcal,avg_gi,sugar_spike_risk,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) console.error("[coach] plates load failed", error);
    setRows(((data as any) || []) as PlateRow[]);
    setLoading(false);
  }, [userId, limit]);

  useEffect(() => { load(); }, [load]);

  const riskTone = (r: string | null) =>
    r === "low" ? "bg-emerald-500/15 text-emerald-700"
      : r === "moderate" ? "bg-amber-500/15 text-amber-700"
      : "bg-rose-500/15 text-rose-700";

  return (
    <div className="rounded-2xl bg-card border border-border/60 p-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[var(--bbdo-blue)]/10 flex items-center justify-center">
          <Salad className="w-4 h-4 text-[var(--bbdo-blue)]" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-black text-foreground leading-none">Plates built</p>
          <p className="text-[11px] text-muted-foreground mt-1">Nutrition logged by the client</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading plates…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No plates built yet.</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {rows.map((p) => (
            <div key={p.id} className="rounded-xl border border-border/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {(p.items || []).length} items ·{" "}
                    {new Date(p.created_at).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                    {p.avg_gi != null && <> · Avg GI {p.avg_gi}</>}
                  </p>
                </div>
                {p.sugar_spike_risk && (
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full capitalize shrink-0 ${riskTone(p.sugar_spike_risk)}`}>
                    {p.sugar_spike_risk} risk
                  </span>
                )}
              </div>

              <div className="grid grid-cols-5 gap-1.5 mt-2.5">
                <Macro icon={Wheat} value={`${p.total_carbs_g ?? 0}g`} label="Carbs" />
                <Macro icon={Beef} value={`${p.total_protein_g ?? 0}g`} label="Protein" />
                <Macro icon={Droplets} value={`${p.total_fat_g ?? 0}g`} label="Fat" />
                <Macro icon={Leaf} value={`${p.total_fiber_g ?? 0}g`} label="Fibre" />
                <Macro icon={Flame} value={`${p.total_calories_kcal ?? 0}`} label="kcal" />
              </div>

              {!!(p.items || []).length && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(p.items || []).slice(0, 8).map((it: any, i: number) => (
                    <span key={`${it?.id ?? i}`} className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-muted text-foreground">
                      {it?.name}
                      {it?.servings ? ` ×${it.servings}` : ""}
                    </span>
                  ))}
                  {(p.items || []).length > 8 && (
                    <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      +{(p.items || []).length - 8}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Macro({ icon: Icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-1.5 py-1.5 text-center">
      <Icon className="w-3 h-3 mx-auto text-muted-foreground" strokeWidth={2} />
      <p className="text-[10px] font-black text-foreground mt-0.5 leading-none">{value}</p>
      <p className="text-[8px] text-muted-foreground mt-0.5 leading-none">{label}</p>
    </div>
  );
}
