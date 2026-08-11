import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, CheckCircle2 } from "lucide-react";
import { createNotification } from "@/lib/notificationService";
import { toast } from "sonner";

export type ActivityKey =
  | "glucose" | "bp" | "weight" | "fasting" | "supplements"
  | "exercise" | "yoga" | "diet" | "water" | "soleus" | "breath";

export const ACTIVITY_META: Record<ActivityKey, { label: string; nudge: string; emoji: string }> = {
  glucose:     { label: "Fasting glucose",     nudge: "Please log your fasting glucose today — even a quick reading helps us stay on top of your progress.", emoji: "🩸" },
  bp:          { label: "Blood pressure",      nudge: "Quick reminder to log your blood pressure today. It only takes a minute!", emoji: "❤️" },
  weight:      { label: "Weight",              nudge: "Please log today's weight so we can track your progress accurately.", emoji: "⚖️" },
  fasting:     { label: "Fasting window",      nudge: "Stay strong on your fasting window today — you've got this! 💪", emoji: "⏳" },
  supplements: { label: "Supplements",         nudge: "Reminder: take today's supplements as per your plan.", emoji: "💊" },
  exercise:    { label: "Exercise",            nudge: "A short workout today keeps momentum going. Even 10 minutes counts!", emoji: "🏋️" },
  yoga:        { label: "Yoga & stress",       nudge: "Take a few minutes for your yoga / stress practice today. It compounds.", emoji: "🧘" },
  diet:        { label: "Diet log",            nudge: "Please log today's meals so we can review your plate quality.", emoji: "🍽️" },
  water:       { label: "Water",               nudge: "Hydration check — please finish your 8 glasses of water today.", emoji: "💧" },
  soleus:      { label: "Soleus push-ups",     nudge: "Don't miss your soleus push-ups today — 3 rounds after meals blunts glucose spikes.", emoji: "🦵" },
  breath:      { label: "4-7-8 breathing",     nudge: "Complete your 4-7-8 breathing rounds today — 76 seconds is all it takes.", emoji: "🌬️" },
};

export interface PendingPatient {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  progress?: string | null;
  ratio?: number | null;
}


interface Props {
  open: boolean;
  onClose: () => void;
  activity: ActivityKey;
  pending: PendingPatient[];
  doneCount: number;
  totalApplicable: number;
  coachName?: string | null;
}

export default function CoachActivityNudgeDialog({
  open, onClose, activity, pending, doneCount, totalApplicable, coachName,
}: Props) {
  const [nudging, setNudging] = useState<string | "all" | null>(null);
  if (!open) return null;
  const meta = ACTIVITY_META[activity];

  const nudgeOne = async (p: PendingPatient) => {
    setNudging(p.user_id);
    try {
      await createNotification({
        user_id: p.user_id,
        title: `Reminder from ${coachName ?? "your coach"}`,
        body: meta.nudge,
        type: "coach_nudge",
        icon: "👋",
      });
      toast.success(`Nudge sent to ${p.name ?? "patient"}`);
    } catch {
      toast.error("Could not send nudge");
    } finally {
      setNudging(null);
    }
  };

  const nudgeAll = async () => {
    if (!pending.length) return;
    setNudging("all");
    try {
      await Promise.all(pending.map((p) =>
        createNotification({
          user_id: p.user_id,
          title: `Reminder from ${coachName ?? "your coach"}`,
          body: meta.nudge,
          type: "coach_nudge",
          icon: "👋",
        })
      ));
      toast.success(`Nudge sent to ${pending.length} patient${pending.length > 1 ? "s" : ""}`);
    } catch {
      toast.error("Some nudges could not be sent");
    } finally {
      setNudging(null);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full sm:max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col overflow-hidden"
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 p-5 border-b border-border">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-xl">
              <span>{meta.emoji}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-foreground font-black text-base truncate">{meta.label}</h3>
              <p className="text-muted-foreground text-xs">
                {doneCount} of {totalApplicable} completed today · {pending.length} pending
              </p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>

          {pending.length > 0 && (
            <div className="px-5 pt-4">
              <button
                onClick={nudgeAll}
                disabled={nudging === "all"}
                className="w-full gradient-blue text-primary-foreground rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {nudging === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Nudge all {pending.length} pending
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5">
            {pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <div className="w-14 h-14 rounded-2xl bg-success/15 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-success" />
                </div>
                <p className="text-foreground font-bold text-sm">All caught up</p>
                <p className="text-muted-foreground text-xs">Every applicable patient logged {meta.label.toLowerCase()} today.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pending.map((p) => (
                  <div key={p.user_id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-muted/40">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
                      ) : (
                        <span className="text-primary font-bold text-xs">{(p.name ?? "?")[0].toUpperCase()}</span>
                      )}
                    </div>
                    <p className="flex-1 min-w-0 text-foreground font-semibold text-sm truncate">
                      {p.name ?? "Patient"}
                    </p>
                    <button
                      onClick={() => nudgeOne(p)}
                      disabled={nudging === p.user_id}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-primary/10 text-primary flex items-center gap-1 disabled:opacity-60"
                    >
                      {nudging === p.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Nudge
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
