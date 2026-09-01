import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getGlobalStreak, getWeekDays, tickGlobalStreak, getUnviewedBadge, type BbdoBadge, type StreakWeekDay } from "@/lib/globalStreak";
import WeeklyBadgeCelebration from "@/components/badges/WeeklyBadgeCelebration";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function GlobalStreakCard() {
  const [streak, setStreak] = useState<number>(0);
  const [weekDays, setWeekDays] = useState<StreakWeekDay[]>([]);
  const [weekNumber, setWeekNumber] = useState(1);
  const [pendingBadge, setPendingBadge] = useState<BbdoBadge | null>(null);

  const load = async (recompute = false) => {
    if (recompute) await tickGlobalStreak();
    const s = await getGlobalStreak();
    setStreak(s?.current_streak ?? 0);
    const week = await getWeekDays();
    setWeekDays(week.days);
    setWeekNumber(week.week_number);
    const b = await getUnviewedBadge();
    if (b) setPendingBadge(b);
  };

  useEffect(() => {
    load(true);
    const onRefresh = () => load(false);
    window.addEventListener("bbdo:streak-refresh", onRefresh);
    return () => window.removeEventListener("bbdo:streak-refresh", onRefresh);
  }, []);

  const todayIso = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const doneCount = weekDays.filter((d) => d.all_complete).length;
  const totalActive = Math.max(1, weekDays.filter((d) => !d.is_future).length);
  const pct = Math.min(100, Math.round((doneCount / 7) * 100));

  // Donut ring math
  const R = 34;
  const C = 2 * Math.PI * R;
  const offset = C - (pct / 100) * C;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: EASE }}
        className="relative overflow-hidden rounded-[24px] p-6 text-white"
        style={{ background: "#248CCB", boxShadow: "0 15px 30px -5px rgba(30,58,138,0.30)" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium tracking-wide text-white/70">Weekly progress</div>
            <div
              className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.03em]"
              style={{ fontFamily: "'Urbanist', 'Helvetica Neue', Inter, sans-serif" }}
            >
              Your consistency<br />streak
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E00101]" />
              <span className="text-[11px] font-semibold tracking-wide">Week {weekNumber}</span>
            </div>
          </div>

          {/* Donut ring */}
          <div className="relative h-24 w-24 flex-shrink-0">
            <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
              <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
              <motion.circle
                cx="40"
                cy="40"
                r={R}
                fill="none"
                stroke="#ffffff"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={C}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 0.8, ease: EASE }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span
                className="text-[26px] font-extrabold tracking-[-0.03em]"
                style={{ fontFamily: "'Urbanist', 'Helvetica Neue', Inter, sans-serif" }}
              >
                {streak}
              </span>
              <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/70">
                {streak === 1 ? "day" : "days"}
              </span>
            </div>
          </div>
        </div>

        {/* Week strip */}
        <div className="mt-5 flex items-center justify-between gap-1.5">
          {weekDays.map((d, i) => {
            const [year, month, date] = d.day.split("-").map(Number);
            const dt = new Date(year, month - 1, date);
            const isToday = d.day === todayIso;
            const done = d.all_complete;
            return (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className={`text-[9px] font-bold uppercase ${isToday ? "text-white" : "text-white/40"}`}>
                  {dt.toLocaleDateString("en-IN", { weekday: "narrow" })}
                </span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-[12px] text-[11px] font-bold transition-colors ${
                    isToday
                      ? "bg-[#E00101] text-white shadow-[0_6px_16px_-4px_rgba(230,57,70,0.55)]"
                      : done
                        ? "bg-white/95 text-[#248CCB]"
                        : d.is_future
                          ? "bg-white/5 text-white/30"
                          : "bg-white/10 text-white/70"
                  }`}
                >
                  {dt.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* subtle brand accent blob */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #E00101 0%, transparent 70%)" }}
        />
      </motion.div>

      {pendingBadge && (
        <WeeklyBadgeCelebration
          badge={pendingBadge}
          open={!!pendingBadge}
          onClose={() => {
            // Dismiss for good — remaining badges stay in the profile's
            // achievements/weekly updates section instead of re-popping.
            setPendingBadge(null);
          }}
        />
      )}

    </>
  );
}
