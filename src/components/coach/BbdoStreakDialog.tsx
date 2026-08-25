import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Flame, Loader2, CalendarDays, Trophy } from "lucide-react";
import {
  fetchBbdoStreak,
  formatDayShort,
  ACTIVE_DAYS_TARGET,
  type BbdoStreakOverview,
} from "@/lib/bbdoStreakService";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  userId: string;
  name: string;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function DayDot({ active, future, title }: { active: boolean; future: boolean; title: string }) {
  return (
    <span
      title={title}
      className={[
        "w-6 h-6 rounded-lg shrink-0 border transition-colors",
        future
          ? "border-dashed border-border bg-transparent"
          : active
            ? "border-transparent bg-success"
            : "border-transparent bg-muted",
      ].join(" ")}
    />
  );
}

export function BbdoStreakBody({ userId }: { userId: string }) {
  const [data, setData] = useState<BbdoStreakOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBbdoStreak(userId)
      .then((d) => { if (!cancelled) setData(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No streak data available yet.</p>;
  }

  const weeksToShow = [...data.weeks].reverse();

  return (
    <div className="flex flex-col gap-4">
      {/* Headline stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-success/10 p-3 text-center">
          <p className="text-xl font-black text-success leading-none">
            {data.mode === "daily" ? data.dayStreak : data.weekStreak}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground mt-1 uppercase tracking-wide">
            {data.mode === "daily" ? "Day streak" : "Week streak"}
          </p>
        </div>
        <div className="rounded-2xl bg-primary/10 p-3 text-center">
          <p className="text-xl font-black text-primary leading-none">{data.weeksKept}/{data.weeksTotal}</p>
          <p className="text-[10px] font-semibold text-muted-foreground mt-1 uppercase tracking-wide">Weeks kept</p>
        </div>
        <div className="rounded-2xl bg-warning/10 p-3 text-center">
          <p className="text-xl font-black text-warning leading-none">{data.activeDaysTotal}</p>
          <p className="text-[10px] font-semibold text-muted-foreground mt-1 uppercase tracking-wide">Active days</p>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5 shrink-0" />
        On platform since {formatDayShort(data.startDate)} · a week counts when there are {ACTIVE_DAYS_TARGET}+ active days
      </p>

      {/* Week rows */}
      <div className="flex flex-col gap-2 max-h-[46vh] overflow-y-auto pr-1">
        {weeksToShow.map((wk) => (
          <div
            key={wk.start}
            className={[
              "rounded-2xl p-3 border",
              wk.kept ? "border-success/40 bg-success/5" : wk.inProgress ? "border-border bg-muted/40" : "border-border bg-transparent",
            ].join(" ")}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-foreground">Week {wk.weekNumber}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatDayShort(wk.start)} – {formatDayShort(wk.end)}
              </span>
              <span
                className={[
                  "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full",
                  wk.kept
                    ? "text-success bg-success/15"
                    : wk.inProgress
                      ? "text-muted-foreground bg-muted"
                      : "text-destructive bg-destructive/10",
                ].join(" ")}
              >
                {wk.kept ? "Streak kept" : wk.inProgress ? `${wk.activeDays}/${ACTIVE_DAYS_TARGET} so far` : "Missed"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {wk.days.map((d, i) => (
                <div key={d.day} className="flex flex-col items-center gap-1">
                  <DayDot
                    active={d.active}
                    future={d.isFuture}
                    title={`${formatDayShort(d.day)}${d.activities.length ? `: ${d.activities.join(", ")}` : ": no activity"}`}
                  />
                  <span className="text-[9px] text-muted-foreground">{DAY_LABELS[(new Date(d.day).getDay() + 7) % 7] ?? DAY_LABELS[i]}</span>
                </div>
              ))}
              <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
                {wk.activeDays} active
              </span>
            </div>
          </div>
        ))}
      </div>

      {data.bestWeekStreak > 0 && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-warning shrink-0" />
          Best run: {data.bestWeekStreak} week{data.bestWeekStreak !== 1 ? "s" : ""} in a row
        </p>
      )}
    </div>
  );
}

export default function BbdoStreakDialog({ open, onOpenChange, userId, name }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-warning" />
            BBDO Streak — {name}
          </DialogTitle>
          <DialogDescription>
            Platform-wide consistency since day one, not just one pillar.
          </DialogDescription>
        </DialogHeader>
        {open && <BbdoStreakBody userId={userId} />}
      </DialogContent>
    </Dialog>
  );
}
