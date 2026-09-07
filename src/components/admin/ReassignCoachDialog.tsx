import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/auditLog";

interface CoachRow {
  id: string;
  name: string;
  coach_type: string | null;
  avg_rating: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  userName: string;
  /** Restrict the picker to coaches of this type (optional) */
  coachType?: string | null;
  onDone?: () => void;
}

export default function ReassignCoachDialog({ open, onOpenChange, userId, userName, coachType, onDone }: Props) {
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [loads, setLoads] = useState<Record<string, number>>({});
  const [currentCoachId, setCurrentCoachId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setConfirming(false);
      const [coachRes, asnRes] = await Promise.all([
        supabase.from("coaches").select("id, name, coach_type, avg_rating").eq("is_active", true).order("name"),
        supabase.from("coach_assignments").select("user_id, coach_id, is_active").eq("is_active", true),
      ]);
      if (cancelled) return;
      const rows = ((coachRes.data ?? []) as any[]) as CoachRow[];
      setCoaches(rows);
      const counts: Record<string, number> = {};
      let cur: string | null = null;
      ((asnRes.data ?? []) as any[]).forEach((a) => {
        counts[a.coach_id] = (counts[a.coach_id] ?? 0) + 1;
        if (a.user_id === userId) cur = a.coach_id;
      });
      setLoads(counts);
      setCurrentCoachId(cur);
      setSelected(cur);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const visible = useMemo(
    () => (coachType ? coaches.filter((c) => c.coach_type === coachType) : coaches),
    [coaches, coachType]
  );

  const selectedCoach = visible.find((c) => c.id === selected) ?? coaches.find((c) => c.id === selected) ?? null;
  const currentCoach = coaches.find((c) => c.id === currentCoachId) ?? null;

  const apply = async () => {
    if (!selected || selected === currentCoachId) return;
    setSaving(true);
    try {
      // Only one active assignment per user — deactivate existing first.
      const { error: deErr } = await supabase
        .from("coach_assignments")
        .update({ is_active: false } as any)
        .eq("user_id", userId)
        .eq("is_active", true);
      if (deErr) throw deErr;

      // Re-use an existing row for this coach if there is one, otherwise insert.
      const { data: existing } = await supabase
        .from("coach_assignments")
        .select("id")
        .eq("user_id", userId)
        .eq("coach_id", selected)
        .maybeSingle();

      if ((existing as any)?.id) {
        const { error } = await supabase
          .from("coach_assignments")
          .update({ is_active: true, assigned_at: new Date().toISOString() } as any)
          .eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("coach_assignments")
          .insert({ user_id: userId, coach_id: selected, is_active: true } as any);
        if (error) throw error;
      }

      await supabase
        .from("profiles")
        .update({ coach_name: selectedCoach?.name ?? null } as any)
        .eq("user_id", userId);

      logAudit({
        module: "Assignments",
        action: currentCoachId ? "reassign" : "assign",
        target_type: "user",
        target_id: userId,
        target_label: userName,
        metadata: { from_coach: currentCoachId, to_coach: selected },
      });

      toast.success(`${userName} is now with ${selectedCoach?.name}`);
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not change the coach");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{currentCoach ? "Reassign coach" : "Assign a coach"}</DialogTitle>
          <DialogDescription>
            {userName}
            {currentCoach ? ` is currently with ${currentCoach.name}.` : " has no coach yet."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : confirming && selectedCoach ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-foreground">
            <p className="font-semibold mb-1">Please confirm</p>
            <p className="text-muted-foreground">
              {currentCoach
                ? `${userName} will move from ${currentCoach.name} to ${selectedCoach.name}. ${currentCoach.name} will lose access to this member.`
                : `${userName} will be assigned to ${selectedCoach.name}.`}
            </p>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
            {visible.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No active coaches available.</p>
            )}
            {visible.map((c) => {
              const isCur = c.id === currentCoachId;
              const isSel = c.id === selected;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                    isSel ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {c.name}
                      {isCur && <span className="ml-2 text-[11px] font-medium text-muted-foreground">current</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      ★ {c.avg_rating?.toFixed(1) ?? "—"} · {loads[c.id] ?? 0} active
                    </p>
                  </div>
                  {isSel ? <Check className="w-4 h-4 text-primary shrink-0" /> : <UserCheck className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          {confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={saving}>
                Back
              </Button>
              <Button onClick={apply} disabled={saving}>
                {saving ? "Saving…" : "Confirm change"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setConfirming(true)} disabled={loading || !selected || selected === currentCoachId}>
                Continue
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
