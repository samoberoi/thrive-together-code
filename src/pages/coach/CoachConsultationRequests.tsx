import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, MessageSquareWarning, Calendar, Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchConsultationRequestsForCoach, updateConsultationRequest, type ConsultationRequest } from "@/lib/recommendationService";
import ScheduleMeetingDialog from "@/components/coach/ScheduleMeetingDialog";
import { useToast } from "@/hooks/use-toast";

export default function CoachConsultationRequests() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [reqs, setReqs] = useState<ConsultationRequest[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ConsultationRequest | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: c } = await supabase.from("coaches").select("id").eq("user_id", user.id).single();
    if (!c) { setLoading(false); return; }
    setCoachId(c.id);
    const list = await fetchConsultationRequestsForCoach(c.id);
    setReqs(list);
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, name").in("user_id", ids);
      const m: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => (m[p.user_id] = p.name ?? "Client"));
      setNames(m);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const decline = async (r: ConsultationRequest) => {
    await updateConsultationRequest(r.id, { status: "declined" });
    toast({ title: "Request declined" });
    load();
  };

  return (
    <div className="px-5 pt-14 pb-8 flex flex-col gap-4">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><MessageSquareWarning className="w-5 h-5 text-primary" /> Consultation Requests</h1>
        <p className="text-muted-foreground text-sm">From your Intensive Reversal Care clients</p>
      </motion.div>

      {loading ? <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mt-8" /> :
        reqs.length === 0 ? <p className="text-muted-foreground text-sm">No requests yet.</p> :
          reqs.map((r) => (
            <div key={r.id} className="liquid-glass rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-foreground font-bold text-sm">{names[r.user_id] ?? "Client"}</p>
                    {r.urgency === "urgent" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive uppercase">Urgent</span>}
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase">{r.status}</span>
                  </div>
                  <p className="text-foreground text-sm mt-1">{r.topic}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.requested_at).toLocaleString("en-IN")}</p>
                </div>
              </div>
              {r.status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setTarget(r); setOpen(true); }} className="flex-1 gradient-blue text-primary-foreground rounded-xl text-xs font-bold py-2 flex items-center justify-center gap-1.5 glow-blue">
                    <Calendar className="w-3.5 h-3.5" /> Schedule
                  </button>
                  <button onClick={() => decline(r)} className="px-3 rounded-xl bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-1">
                    <X className="w-3.5 h-3.5" /> Decline
                  </button>
                </div>
              )}
            </div>
          ))}

      {coachId && target && (
        <ScheduleMeetingDialog
          open={open}
          onOpenChange={(b) => { setOpen(b); if (!b) setTarget(null); }}
          coachId={coachId}
          patientId={target.user_id}
          patientName={names[target.user_id]}
          defaultType="consultation"
          onScheduled={async () => {
            await updateConsultationRequest(target.id, { status: "scheduled" });
            load();
          }}
        />
      )}
    </div>
  );
}
