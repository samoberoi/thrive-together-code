import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Flame, ChevronRight, Loader2 } from "lucide-react";
import BbdoStreakDialog from "./BbdoStreakDialog";
import { fetchBbdoStreak, ACTIVE_DAYS_TARGET, type BbdoStreakOverview } from "@/lib/bbdoStreakService";

export interface StreakClient {
  user_id: string;
  name: string | null;
  avatar_url?: string | null;
}

export default function CoachStreakBoard({ clients }: { clients: StreakClient[] }) {
  const [data, setData] = useState<Record<string, BbdoStreakOverview | null>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StreakClient | null>(null);

  const ids = clients.map((c) => c.user_id).join(",");

  useEffect(() => {
    if (!clients.length) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const entries = await Promise.all(
        clients.map(async (c) => [c.user_id, await fetchBbdoStreak(c.user_id)] as const),
      );
      if (cancelled) return;
      setData(Object.fromEntries(entries));
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  if (!clients.length) return null;

  return (
    <motion.div
      className="liquid-glass rounded-3xl p-5"
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Flame className="w-4 h-4 text-warning" strokeWidth={2} />
        <span className="text-foreground font-bold">BBDO Streak</span>
        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-auto">
          {ACTIVE_DAYS_TARGET} of 7 active days = streak kept
        </span>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
          {clients.map((c) => {
            const d = data[c.user_id];
            const streak = d ? (d.mode === "daily" ? d.dayStreak : d.weekStreak) : 0;
            const unit = d?.mode === "daily" ? "day" : "week";
            const recent = d ? d.weeks.slice(-8) : [];
            return (
              <button
                key={c.user_id}
                onClick={() => setSelected(c)}
                className="flex items-center gap-3 rounded-2xl p-3 bg-muted/40 hover:bg-accent transition-colors text-left w-full"
              >
                <div className="w-9 h-9 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt={c.name ?? "Client"} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-black text-primary">
                      {(c.name?.[0] ?? "C").toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name ?? "Client"}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {recent.map((wk) => (
                      <span
                        key={wk.start}
                        className={[
                          "h-1.5 flex-1 max-w-[16px] rounded-full",
                          wk.kept ? "bg-success" : wk.inProgress ? "bg-muted-foreground/30" : "bg-destructive/40",
                        ].join(" ")}
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
                  <Flame className={`w-3.5 h-3.5 ${streak > 0 ? "text-warning" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-bold ${streak > 0 ? "text-foreground" : "text-muted-foreground"}`}>
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
          name={selected.name ?? "Client"}
        />
      )}
    </motion.div>
  );
}
