import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Flame, ChevronRight, Loader2, Trophy } from "lucide-react";
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

  // Wall of Fame — my clients ranked by the streak they are currently holding.
  const wall = useMemo(() => {
    return clients
      .map((c) => {
        const d = data[c.user_id];
        if (!d) return null;
        const streak = d.mode === "daily" ? d.dayStreak : d.weekStreak;
        const unit = d.mode === "daily" ? "day" : "week";
        return { client: c, streak, unit, weeksKept: d.weeksKept, activeDays: d.activeDaysTotal };
      })
      .filter((r): r is NonNullable<typeof r> => !!r && r.streak > 0)
      .sort((a, b) => b.streak - a.streak || b.weeksKept - a.weeksKept || b.activeDays - a.activeDays)
      .slice(0, 10);
  }, [clients, data]);

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  if (!clients.length) return null;

  return (
    <div className="flex flex-col gap-3">
    <motion.div
      className="liquid-glass rounded-3xl p-5"
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-4 h-4 text-warning" strokeWidth={2} />
        <span className="text-foreground font-bold">My Wall of Fame</span>
        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-auto">
          Top streaks
        </span>
      </div>
      {loading ? (
        <div className="py-6 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : wall.length === 0 ? (
        <p className="text-sm text-muted-foreground py-5 text-center">No qualifying streaks yet</p>
      ) : (
        <div className="flex flex-col gap-2">
          {wall.map((r, i) => (
            <button
              key={r.client.user_id}
              onClick={() => setSelected(r.client)}
              className={`flex items-center gap-3 rounded-2xl p-2.5 text-left w-full transition-colors ${
                i < 3 ? "bg-warning/10 hover:bg-warning/20" : "bg-muted/40 hover:bg-accent"
              }`}
            >
              <span className="w-7 text-center text-sm font-black shrink-0">{medal(i)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{r.client.name ?? "Client"}</p>
                <p className="text-[10px] text-muted-foreground">
                  {r.activeDays} active day{r.activeDays !== 1 ? "s" : ""} · {r.weeksKept} week{r.weeksKept !== 1 ? "s" : ""} kept
                </p>
              </div>
              <span className="flex items-center gap-1 shrink-0">
                <Flame className="w-3.5 h-3.5 text-warning" />
                <span className="text-xs font-bold text-foreground">
                  {r.streak} {r.unit}{r.streak !== 1 ? "s" : ""}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </span>
            </button>
          ))}
        </div>
      )}
    </motion.div>

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
    </div>

  );
}
