import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, CheckCircle2, Circle } from "lucide-react";
import { ACTIVITY_META, type ActivityKey } from "@/components/coach/CoachActivityNudgeDialog";
import { ALL_ACTIVITIES, type AdherenceSummary } from "@/lib/adherenceService";
import { createNotification } from "@/lib/notificationService";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  userName: string;
  summary: AdherenceSummary | null;
}

export default function AdherenceNudgeDialog({ open, onClose, userName, summary }: Props) {
  const [sending, setSending] = useState<ActivityKey | "all" | null>(null);
  if (!open || !summary) return null;

  const pct = summary.applicableCount > 0
    ? Math.round((summary.doneCount / summary.applicableCount) * 100)
    : 0;

  const send = async (keys: ActivityKey[], tag: ActivityKey | "all") => {
    if (!keys.length) return;
    setSending(tag);
    try {
      if (keys.length === 1) {
        await createNotification({
          user_id: summary.user_id,
          title: `Reminder: ${ACTIVITY_META[keys[0]].label}`,
          body: ACTIVITY_META[keys[0]].nudge,
          type: "coach_nudge",
          icon: "👋",
        });
      } else {
        await createNotification({
          user_id: summary.user_id,
          title: "A few things still pending today",
          body: `Pending: ${keys.map((k) => ACTIVITY_META[k].label).join(", ")}. A few quick logs will keep you on track — you've got this! 💪`,
          type: "coach_nudge",
          icon: "👋",
        });
      }
      toast.success("Nudge sent");
    } catch {
      toast.error("Could not send nudge");
    } finally {
      setSending(null);
    }
  };

  const applicable = ALL_ACTIVITIES.filter((k) => summary.applicable[k]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[90] bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full sm:max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden"
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3 p-5 border-b border-border">
            <div className="flex-1 min-w-0">
              <h3 className="text-foreground font-black text-base truncate">{userName}</h3>
              <p className="text-muted-foreground text-xs">
                {summary.doneCount} of {summary.applicableCount} activities done today ·{" "}
                <span className={summary.onTrack ? "text-emerald-600 font-semibold" : "text-destructive font-semibold"}>
                  {summary.onTrack ? "On track" : "Off track"}
                </span>
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-destructive"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold tabular-nums">{pct}%</span>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>

          {summary.missed.length > 0 && (
            <div className="px-5 pt-4">
              <button
                onClick={() => send(summary.missed, "all")}
                disabled={sending === "all"}
                className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {sending === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Nudge for all {summary.missed.length} pending
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-2">
            {applicable.map((k) => {
              const done = summary.activities[k];
              const meta = ACTIVITY_META[k];
              return (
                <div key={k} className="flex items-center gap-3 p-2.5 rounded-2xl bg-muted/40">
                  <span className="text-lg">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground font-semibold text-sm truncate">{meta.label}</p>
                    {summary.progress[k]?.text && (
                      <p className="text-[11px] text-muted-foreground">{summary.progress[k]!.text}</p>
                    )}
                  </div>
                  {done ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Done
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                        <Circle className="w-3.5 h-3.5" /> Pending
                      </span>
                      <button
                        onClick={() => send([k], k)}
                        disabled={sending === k}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-primary/10 text-primary flex items-center gap-1 disabled:opacity-60"
                      >
                        {sending === k ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Nudge
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {applicable.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-8">No trackable activities for this member yet.</p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
