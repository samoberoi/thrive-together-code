import { Activity, Send } from "lucide-react";
import type { AdherenceSummary } from "@/lib/adherenceService";

interface Props {
  summary?: AdherenceSummary | null;
  loading?: boolean;
  onNudge: () => void;
}

/** Compact "on track / off track" chip with a nudge shortcut. */
export default function AdherencePill({ summary, loading, onNudge }: Props) {
  if (!summary) {
    return (
      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium">
        {loading ? "Checking activity…" : "No activity data"}
      </span>
    );
  }

  const onTrack = summary.onTrack;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
          onTrack ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
        }`}
      >
        <Activity className="w-3 h-3" />
        {onTrack ? "On track" : "Off track"} · {summary.doneCount}/{summary.applicableCount}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onNudge(); }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20 transition-colors"
        aria-label="Nudge member"
      >
        <Send className="w-3 h-3" />
        Nudge
      </button>
    </span>
  );
}
