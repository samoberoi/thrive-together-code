import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange as RdpDateRange } from "react-day-picker";
import { format, startOfMonth, endOfMonth, subMonths, subYears, startOfDay, endOfDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type RangePreset =
  | "all_time"
  | "this_month"
  | "last_month"
  | "last_quarter"
  | "last_6_months"
  | "last_year"
  | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  preset: RangePreset;
  label: string;
}

const PRESETS: { key: Exclude<RangePreset, "custom">; label: string }[] = [
  { key: "all_time", label: "All Time" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_quarter", label: "Last Quarter" },
  { key: "last_6_months", label: "Last 6 Months" },
  { key: "last_year", label: "Last Year" },
];

export const rangeFor = (preset: Exclude<RangePreset, "custom">): DateRange => {
  const now = new Date();
  switch (preset) {
    case "all_time":
      return { preset, from: new Date(2000, 0, 1), to: endOfDay(now), label: "All Time" };
    case "this_month":
      return { preset, from: startOfMonth(now), to: endOfMonth(now), label: "This Month" };
    case "last_month": {
      const ref = subMonths(now, 1);
      return { preset, from: startOfMonth(ref), to: endOfMonth(ref), label: "Last Month" };
    }
    case "last_quarter":
      return { preset, from: startOfDay(subMonths(now, 3)), to: endOfDay(now), label: "Last Quarter" };
    case "last_6_months":
      return { preset, from: startOfDay(subMonths(now, 6)), to: endOfDay(now), label: "Last 6 Months" };
    case "last_year":
      return { preset, from: startOfDay(subYears(now, 1)), to: endOfDay(now), label: "Last Year" };
  }
};

export const defaultRange = (): DateRange => rangeFor("this_month");
export const allTimeRange = (): DateRange => rangeFor("all_time");

/** True when the row's date should be counted for this range. */
export const inRange = (r: DateRange, iso: string | null | undefined): boolean => {
  if (r.preset === "all_time") return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= r.from.getTime() && t <= r.to.getTime();
};

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
  align?: "start" | "end";
  className?: string;
}

export default function DateRangeFilter({ value, onChange, align = "end", className }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RdpDateRange | undefined>(
    value.preset === "custom" ? { from: value.from, to: value.to } : undefined
  );

  useEffect(() => {
    if (open && value.preset === "custom") setDraft({ from: value.from, to: value.to });
  }, [open, value]);

  const display = useMemo(() => {
    if (value.preset === "custom") {
      return `${format(value.from, "d MMM")} → ${format(value.to, "d MMM yyyy")}`;
    }
    return value.label;
  }, [value]);

  const applyCustom = () => {
    if (!draft?.from) return;
    const from = startOfDay(draft.from);
    const to = endOfDay(draft.to ?? draft.from);
    onChange({
      preset: "custom",
      from,
      to,
      label: `${format(from, "d MMM")} → ${format(to, "d MMM yyyy")}`,
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2 h-9", className)}>
          <CalendarIcon className="w-4 h-4" />
          <span className="text-xs font-semibold">{display}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[min(94vw,340px)] sm:w-[min(94vw,520px)] p-0 max-h-[80vh] overflow-y-auto pointer-events-auto"
      >
        <div className="flex flex-col sm:flex-row">
          <div className="p-2 sm:border-r border-b sm:border-b-0 border-border sm:min-w-[160px] grid grid-cols-2 sm:grid-cols-1 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onChange(rangeFor(p.key));
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors",
                  value.preset === p.key ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Custom range — tap start date, then end date
            </p>
            <Calendar
              mode="range"
              numberOfMonths={1}
              defaultMonth={draft?.from ?? value.from}
              selected={draft}
              onSelect={setDraft}
              className={cn("p-0 pointer-events-auto")}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {draft?.from
                  ? `${format(draft.from, "d MMM yyyy")} → ${draft.to ? format(draft.to, "d MMM yyyy") : "…"}`
                  : "No dates picked"}
              </p>
              <Button size="sm" onClick={applyCustom} disabled={!draft?.from}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
