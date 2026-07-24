import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, Phone, Plus, CheckCircle2, XCircle, Loader2, Users } from "lucide-react";
import { whatsappCallUrl, isMeetingCallable } from "@/lib/coachAvailability";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMeetingsForCoach, updateMeetingStatus, meetingTypeLabel, type CoachMeeting } from "@/lib/meetingService";
import ScheduleMeetingDialog from "@/components/coach/ScheduleMeetingDialog";
import { useToast } from "@/hooks/use-toast";

interface PatientLite { user_id: string; name: string | null; phone: string | null; }

export default function CoachMeetings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<CoachMeeting[]>([]);
  const [patients, setPatients] = useState<Record<string, PatientLite>>({});
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [presetPatient, setPresetPatient] = useState<PatientLite | null>(null);
  const [patientList, setPatientList] = useState<PatientLite[]>([]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: c } = await supabase.from("coaches").select("id").eq("user_id", user.id).single();
    if (!c) { setLoading(false); return; }
    setCoachId(c.id);

    const m = await fetchMeetingsForCoach(c.id);
    setMeetings(m);

    const { data: assigns } = await supabase
      .from("coach_assignments").select("user_id").eq("coach_id", c.id).eq("is_active", true);
    const ids = (assigns ?? []).map((a: any) => a.user_id);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, name, phone").in("user_id", ids);
      const map: Record<string, PatientLite> = {};
      (profs ?? []).forEach((p: any) => (map[p.user_id] = p));
      setPatients(map);
      setPatientList((profs ?? []) as PatientLite[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  // All scheduled meetings show as "Upcoming" (even if the start time has just passed but the
  // coach hasn't marked it complete yet). History = everything already completed/cancelled/no-show.
  const upcoming = useMemo(
    () =>
      meetings
        .filter((m) => m.status === "scheduled")
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [meetings],
  );
  const past = useMemo(() => meetings.filter((m) => m.status !== "scheduled"), [meetings]);

  const markStatus = async (m: CoachMeeting, status: "completed" | "cancelled" | "no_show") => {
    try { await updateMeetingStatus(m.id, status); toast({ title: `Marked ${status.replace("_", " ")}` }); load(); }
    catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="px-5 pt-14 pb-8 flex flex-col gap-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground">Meetings</h1>
          <p className="text-muted-foreground text-sm">Onboarding, check-ins, quarterly reviews</p>
        </div>
        <button
          onClick={() => { setPresetPatient(null); setDlgOpen(true); }}
          className="gradient-blue text-primary-foreground rounded-2xl px-4 py-2.5 text-sm font-bold flex items-center gap-2 glow-blue"
        >
          <Plus className="w-4 h-4" /> Schedule
        </button>
      </motion.div>

      {/* Quick-schedule: vertical list of patients (chips overflow horizontally on small phones) */}
      {patientList.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground no-break">
            Quick schedule
          </p>
          <div className="flex flex-col gap-1.5">
            {patientList.map((p) => (
              <button
                key={p.user_id}
                onClick={() => { setPresetPatient(p); setDlgOpen(true); }}
                className="liquid-glass rounded-2xl px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-primary/5 text-left"
              >
                <Users className="w-4 h-4 text-primary shrink-0" />
                <span className="flex-1 min-w-0 truncate no-break text-foreground font-medium">
                  {p.name ?? "—"}
                </span>
                <Plus className="w-4 h-4 text-primary shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mt-8" />
      ) : (
        <>
          <section>
            <h2 className="text-foreground font-bold text-sm mb-2 mt-2">Upcoming ({upcoming.length})</h2>
            <div className="space-y-2">
              {upcoming.length === 0 && <p className="text-muted-foreground text-sm">No upcoming meetings. Schedule one above.</p>}
              {upcoming.map((m) => {
                const p = patients[m.user_id];
                const d = new Date(m.scheduled_at);
                return (
                  <div key={m.id} className="liquid-glass rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground font-bold text-sm">{p?.name ?? "Patient"}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <Calendar className="w-3 h-3" /> {d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          <Clock className="w-3 h-3 ml-1" /> {d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          <span className="ml-1">• {m.duration_min} min</span>
                        </p>
                        <p className="text-[10px] font-bold text-primary mt-1 uppercase tracking-wide">{meetingTypeLabel(m.meeting_type)}</p>
                        {m.agenda && <p className="text-xs text-muted-foreground mt-1.5">{m.agenda}</p>}
                      </div>
                      {(() => {
                        const callable = isMeetingCallable(m.scheduled_at, m.duration_min ?? 30);
                        if (callable && p?.phone) {
                          return (
                            <a
                              href={whatsappCallUrl(p.phone, `Hi ${p.name ?? ""}, joining our scheduled call now.`)}
                              target="_blank"
                              rel="noreferrer"
                              className="bg-emerald-500 text-white rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-lift"
                            >
                              <Phone className="w-3.5 h-3.5" /> Call Now
                            </a>
                          );
                        }
                        return (
                          <span className="text-[10px] font-semibold text-muted-foreground shrink-0 text-right">
                            WhatsApp video<br />Call Now at start
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => markStatus(m, "completed")} className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                      </button>
                      <button onClick={() => markStatus(m, "no_show")} className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20">
                        No-show
                      </button>
                      <button onClick={() => markStatus(m, "cancelled")} className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-foreground font-bold text-sm mb-2 mt-4">History ({past.length})</h2>
            <div className="space-y-1.5">
              {past.slice(0, 30).map((m) => {
                const p = patients[m.user_id];
                const d = new Date(m.scheduled_at);
                return (
                  <div key={m.id} className="rounded-xl bg-muted/40 p-3 flex items-center justify-between text-xs">
                    <span className="text-foreground font-medium">{p?.name ?? "Patient"} • {meetingTypeLabel(m.meeting_type)}</span>
                    <span className="text-muted-foreground">{d.toLocaleDateString()} • <span className="capitalize">{m.status.replace("_", " ")}</span></span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {coachId && (
        <ScheduleMeetingDialog
          open={dlgOpen}
          onOpenChange={setDlgOpen}
          coachId={coachId}
          patientId={presetPatient?.user_id}
          patientName={presetPatient?.name ?? undefined}
          patients={presetPatient ? undefined : patientList}
          onScheduled={load}
        />
      )}
    </div>
  );
}
