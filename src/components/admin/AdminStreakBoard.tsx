import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Flame, ChevronRight, Loader2 } from "lucide-react";
import BbdoStreakDialog from "@/components/coach/BbdoStreakDialog";
import { fetchBbdoStreak, ACTIVE_DAYS_TARGET, type BbdoStreakOverview } from "@/lib/bbdoStreakService";
import { cn } from "@/lib/utils";

export interface AdminStreakClient {
  user_id: string;
  name: string | null;
  planKey: string;
}

export interface StreakPackage {
  key: string;
  name: string;
}

/** Fixed display order requested by the business: Foundation → Active → Intensive. */
const PLAN_ORDER = ["foundation", "active", "intensive"];

function orderPackages(pkgs: StreakPackage[]): StreakPackage[] {
  return [...pkgs].sort((a, b) => {
    const ia = PLAN_ORDER.indexOf(a.key);
    const ib = PLAN_ORDER.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/** Fetch streaks with a small concurrency window so big rosters don't stall the page. */
async function fetchAll(ids: string[]): Promise<Record<string, BbdoStreakOverview | null>> {
  const out: Record<string, BbdoStreakOverview | null> = {};
  const size = 6;
  for (let i = 0; i < ids.length; i += size) {
    const slice = ids.slice(i, i + size);
    const res = await Promise.all(slice.map((id) => fetchBbdoStreak(id)));
    slice.forEach((id, idx) => { out[id] = res[idx]; });
  }
  return out;
}

export default function AdminStreakBoard({
  clients,
  packages,
}: {
  clients: AdminStreakClient[];
  packages: StreakPackage[];
}) {
  const ordered = useMemo(
    () => orderPackages(packages.filter((p) => PLAN_ORDER.includes(p.key))),
    [packages],
  );
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, BbdoStreakOverview | null>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminStreakClient | null>(null);

  // Default: every package selected.
  useEffect(() => {
    setSelectedPlans(ordered.map((p) => p.key));
  }, [ordered.map((p) => p.key).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only paid users appear here — "no package" users are intentionally excluded.
  const paidClients = useMemo(
    () => clients.filter((c) => PLAN_ORDER.includes(c.planKey)),
    [clients],
  );

  const ids = paidClients.map((c) => c.user_id).join(",");

  useEffect(() => {
    if (!paidClients.length) { setData({}); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await fetchAll(paidClients.map((c) => c.user_id));
      if (cancelled) return;
      setData(res);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const visible = useMemo(
    () => paidClients
      .filter((c) => selectedPlans.includes(c.planKey))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [paidClients, selectedPlans],
  );

  const togglePlan = (key: string) =>
    setSelectedPlans((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  return (
    <motion.div
      className="liquid-glass rounded-2xl p-3 sm:p-5"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Flame className="w-4 h-4 text-amber-600 shrink-0" strokeWidth={2} />
        <span className="text-foreground font-bold text-sm sm:text-base">BBDO Streaks</span>
        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-auto">
          {ACTIVE_DAYS_TARGET}+ active days = week kept
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {ordered.map((p) => {
          const on = selectedPlans.includes(p.key);
          const count = paidClients.filter((c) => c.planKey === p.key).length;
          return (
            <button
              key={p.key}
              onClick={() => togglePlan(p.key)}
              className={cn(
                "text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors",
                on
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:bg-accent/40",
              )}
            >
              {p.name} · {count}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No users for the selected packages</p>
      ) : (
        <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
          {visible.map((c) => {
            const d = data[c.user_id];
            const streak = d ? (d.mode === "daily" ? d.dayStreak : d.weekStreak) : 0;
            const unit = d?.mode === "daily" ? "day" : "week";
            const recent = d ? d.weeks.slice(-8) : [];
            const pkgName = ordered.find((p) => p.key === c.planKey)?.name ?? c.planKey;
            return (
              <button
                key={c.user_id}
                onClick={() => setSelected(c)}
                className="flex items-center gap-3 rounded-xl p-2.5 sm:p-3 bg-muted/40 hover:bg-accent transition-colors text-left w-full"
              >
                <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                  <span className="text-xs font-black text-primary">{(c.name?.[0] ?? "U").toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{c.name || "Unnamed"}</p>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                      {pkgName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {recent.map((wk) => (
                      <span
                        key={wk.start}
                        className={cn(
                          "h-1.5 flex-1 max-w-[16px] rounded-full",
                          wk.kept ? "bg-emerald-500" : wk.inProgress ? "bg-muted-foreground/30" : "bg-destructive/40",
                        )}
                      />
                    ))}
                    {d && (
                      <span className="text-[10px] text-muted-foreground ml-1.5">
                        {d.weeksKept}/{d.weeksTotal} weeks
                      </span>
                    )}
                  </div>
                </div>
                <span className="flex items-center gap-1 shrink-0">
                  <Flame className={cn("w-3.5 h-3.5", streak > 0 ? "text-amber-600" : "text-muted-foreground")} />
                  <span className={cn("text-xs font-bold", streak > 0 ? "text-foreground" : "text-muted-foreground")}>
                    {streak} {unit}{streak !== 1 ? "s" : ""}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <BbdoStreakDialog
          open={!!selected}
          onOpenChange={(b) => { if (!b) setSelected(null); }}
          userId={selected.user_id}
          name={selected.name ?? "User"}
        />
      )}
    </motion.div>
  );
}
