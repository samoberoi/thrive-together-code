import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Timer, Play, Pause, Check, AlertTriangle, Calendar, User, Search,
  ChevronDown, ChevronRight, ChevronUp, Flame, Eye, Award, Zap, Users, FileText, X, Minus
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  fetchProtocols, fetchWeeklyPlans, assignProtocolToUser,
  updateUserProtocolStatus, fetchTrackingForUser,
  getCurrentWeek, getCurrentDay, formatTime24to12,
  type FastingProtocol, type WeeklyPlan, type UserProtocol, type FastingTracking
} from "@/lib/fastingService";
import { calculateStreak, fetchBadgeDefinitions, fetchUserBadges, type FastingBadge } from "@/lib/streakService";

type View = "protocols" | "patients";

export default function CoachFasting() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("patients");
  const [patients, setPatients] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, { plan_id: string | null; started_at: string | null; expires_at: string | null }>>({});
  const [protocols, setProtocols] = useState<FastingProtocol[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<Record<string, WeeklyPlan[]>>({});
  const [expandedProto, setExpandedProto] = useState<string | null>(null);
  const [patientProtocols, setPatientProtocols] = useState<Record<string, UserProtocol | null>>({});
  const [patientTracking, setPatientTracking] = useState<Record<string, FastingTracking[]>>({});
  const [patientStreaks, setPatientStreaks] = useState<Record<string, { currentStreak: number; longestStreak: number }>>({});
  const [assignForm, setAssignForm] = useState<{ userId: string; protocolId: string; startDate: string } | null>(null);
  const [badges, setBadges] = useState<FastingBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [patientSearch, setPatientSearch] = useState("");
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: coach } = await supabase.from("coaches" as any).select("id").eq("user_id", user.id).single();
      if (!coach) return;

      const { data: assignments } = await supabase
        .from("coach_assignments" as any).select("user_id").eq("coach_id", (coach as any).id).eq("is_active", true);
      if (!assignments) return;

      const userIds = (assignments as any[]).map((a: any) => a.user_id);
      const [{ data: profiles }, { data: subRows }] = await Promise.all([
        supabase.from("profiles").select("user_id, name, phone, avatar_url").in("user_id", userIds),
        supabase.from("subscriptions" as any).select("user_id, plan_id, started_at, expires_at, status").in("user_id", userIds).eq("status", "active"),
      ]);
      setPatients((profiles as any) ?? []);
      const subMap: Record<string, any> = {};
      for (const s of ((subRows as any[]) || [])) subMap[s.user_id] = { plan_id: s.plan_id, started_at: s.started_at, expires_at: s.expires_at };
      setSubscriptions(subMap);

      const p = await fetchProtocols();
      setProtocols(p);

      const badgeDefs = await fetchBadgeDefinitions();
      setBadges(badgeDefs);

      const protocolMap: Record<string, UserProtocol | null> = {};
      const trackingMap: Record<string, FastingTracking[]> = {};
      const streakMap: Record<string, { currentStreak: number; longestStreak: number }> = {};

      for (const uid of userIds) {
        const { data: up } = await supabase
          .from("user_protocols" as any).select("*").eq("user_id", uid)
          .eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
        protocolMap[uid] = (up as any) ?? null;

        const tracking = await fetchTrackingForUser(uid, 60);
        trackingMap[uid] = tracking;
        streakMap[uid] = calculateStreak(tracking);
      }
      setPatientProtocols(protocolMap);
      setPatientTracking(trackingMap);
      setPatientStreaks(streakMap);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  const loadWeeklyPlans = async (protoId: string) => {
    if (weeklyPlans[protoId]) return;
    const plans = await fetchWeeklyPlans(protoId);
    setWeeklyPlans((prev) => ({ ...prev, [protoId]: plans }));
  };

  const handleAssign = async () => {
    if (!assignForm || !user) return;
    try {
      await assignProtocolToUser(assignForm.userId, assignForm.protocolId, user.id, assignForm.startDate);
      toast.success("Protocol assigned!");
      setAssignForm(null);
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleStatusChange = async (up: UserProtocol, newStatus: string) => {
    try {
      await updateUserProtocolStatus(up.id, newStatus);
      toast.success(`Protocol ${newStatus}`);
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Timer className="w-6 h-6 text-primary" /> Fasting Management
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Protocols, assignments & compliance</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {(["protocols", "patients"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-colors ${
              view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {v === "protocols" ? <FileText className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              {v === "protocols" ? "Protocols" : `Patients (${patients.length})`}
            </span>
          </button>
        ))}
      </div>

      {/* Protocols View */}
      {view === "protocols" && (
        <div className="space-y-3">
          {protocols.filter((p) => p.is_active).map((proto) => (
            <motion.div
              key={proto.id}
              className="liquid-glass rounded-3xl overflow-hidden"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            >
              <button
                onClick={() => {
                  const next = expandedProto === proto.id ? null : proto.id;
                  setExpandedProto(next);
                  if (next) loadWeeklyPlans(next);
                }}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                    proto.protocol_type === "basic" ? "bg-primary/10" :
                    proto.protocol_type === "moderate" ? "bg-amber-500/10" : "bg-destructive/10"
                  }`}>
                    <Flame className={`w-5 h-5 ${
                      proto.protocol_type === "basic" ? "text-primary" :
                      proto.protocol_type === "moderate" ? "text-amber-500" : "text-destructive"
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-sm">{proto.protocol_name}</h3>
                    <p className="text-[10px] text-muted-foreground capitalize">{proto.protocol_type} · {proto.total_weeks} weeks</p>
                  </div>
                </div>
                {expandedProto === proto.id ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
              </button>

              <AnimatePresence>
                {expandedProto === proto.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-5 pb-5"
                  >
                    {proto.remarks && (
                      <p className="text-xs text-muted-foreground mb-3 italic">{proto.remarks}</p>
                    )}
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {(weeklyPlans[proto.id] ?? []).map((w) => (
                        <div key={w.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/50 text-xs">
                          <span className="font-semibold text-foreground">Week {w.week_number}</span>
                          <span className="text-primary font-bold">{w.fasting_pattern}</span>
                          <span className="text-muted-foreground">{formatTime24to12(w.lmod_time)} → {formatTime24to12(w.fmod_time)}</span>
                          {w.metabolic_push && (
                            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500">
                              <Zap className="w-2.5 h-2.5 mr-0.5" /> Push
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      {/* Patients View — compact rows with search; expand for detail */}
      {view === "patients" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={`Search ${patients.length} patient${patients.length === 1 ? "" : "s"}…`} value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} className="pl-9 h-11 rounded-2xl" />
          </div>
          {(() => {
            const q = patientSearch.trim().toLowerCase();
            const filtered = q ? patients.filter((p: any) => (p.name || "").toLowerCase().includes(q) || (p.phone || "").toLowerCase().includes(q)) : patients;
            if (patients.length === 0) return <div className="liquid-glass rounded-3xl p-10 text-center text-muted-foreground">No patients assigned.</div>;
            if (filtered.length === 0) return <div className="liquid-glass rounded-3xl p-8 text-center text-sm text-muted-foreground">No patients match "{patientSearch}".</div>;
            return filtered.map((patient: any) => {
              const up = patientProtocols[patient.user_id];
              const tracking = patientTracking[patient.user_id] ?? [];
              const streak = patientStreaks[patient.user_id] ?? { currentStreak: 0, longestStreak: 0 };
              const proto = up ? protocols.find((p) => p.id === up.protocol_id) : null;
              const currentWeek = up ? getCurrentWeek(up.start_date) : 0;
              const missedCount = tracking.filter((t) => t.compliance_status === "missed").length;
              const symptomCount = tracking.filter((t) => t.symptoms_flag).length;
              const completedCount = tracking.filter((t) => t.compliance_status === "completed" || t.compliance_status === "partial").length;
              const sub = subscriptions[patient.user_id];
              const planLabel = sub?.plan_id ? sub.plan_id.charAt(0).toUpperCase() + sub.plan_id.slice(1) : null;
              const isAssigning = assignForm?.userId === patient.user_id;
              const isExpanded = expandedPatient === patient.user_id || isAssigning;
              const statusChip = up
                ? (missedCount > 2 ? { text: "⚠️ At Risk", cls: "bg-destructive/15 text-destructive border-destructive/20" }
                  : symptomCount > 0 ? { text: "🔶 Attention", cls: "bg-amber-500/15 text-amber-500 border-amber-500/20" }
                  : { text: "✅ On Track", cls: "bg-primary/15 text-primary border-primary/20" })
                : { text: "Unassigned", cls: "border-muted-foreground/30 text-muted-foreground" };

              return (
                <motion.div key={patient.user_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass rounded-3xl">
                  <button
                    type="button"
                    onClick={() => setExpandedPatient(isExpanded && !isAssigning ? null : patient.user_id)}
                    className="w-full text-left p-4 sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                          {patient.avatar_url ? <img src={patient.avatar_url} alt="" className="w-10 h-10 rounded-2xl object-cover" /> : <span className="text-primary font-bold text-sm">{(patient.name ?? "?")[0].toUpperCase()}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-foreground text-sm truncate">{patient.name || "Unnamed"}</h3>
                            {planLabel && <Badge variant="outline" className="text-[9px] border-primary/30 text-primary bg-primary/5">{planLabel}</Badge>}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {patient.phone || "No phone"}
                            {up && proto && <> · {proto.protocol_name} · Wk {currentWeek}/{proto.total_weeks}</>}
                            {up && <> · <Flame className="inline w-2.5 h-2.5" /> {streak.currentStreak}d</>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={`text-[10px] ${statusChip.cls}`}>{statusChip.text}</Badge>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 sm:px-5 pb-5 -mt-1">
                      {up && proto ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{proto.protocol_name}</span>
                            <span className="font-semibold text-primary">Week {currentWeek} / {proto.total_weeks}</span>
                          </div>

                          <div className="flex gap-2 flex-wrap">
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-full font-semibold flex items-center gap-1">
                              <Flame className="w-3 h-3" /> {streak.currentStreak}d streak
                            </span>
                            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-1 rounded-full font-semibold">
                              Best: {streak.longestStreak}d
                            </span>
                            {completedCount > 0 && (
                              <span className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-full font-semibold flex items-center gap-1">
                                <Check className="w-3 h-3" /> {completedCount} fasts
                              </span>
                            )}
                            {missedCount > 0 && (
                              <span className="text-[10px] bg-destructive/10 text-destructive px-2 py-1 rounded-full font-semibold">
                                {missedCount} missed
                              </span>
                            )}
                            {symptomCount > 0 && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-1 rounded-full font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> {symptomCount} symptoms
                              </span>
                            )}
                          </div>

                          <div className="flex gap-1">
                            {Array.from({ length: 7 }, (_, i) => {
                              const d = new Date();
                              d.setDate(d.getDate() - (6 - i));
                              const ds = d.toISOString().split("T")[0];
                              const t = tracking.find((tr) => tr.date === ds);
                              const s = t?.compliance_status;
                              return (
                                <div
                                  key={i}
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold ${
                                    s === "completed" ? "bg-primary/20 text-primary" :
                                    s === "partial" ? "bg-amber-500/20 text-amber-500" :
                                    s === "missed" ? "bg-destructive/20 text-destructive" :
                                    "bg-muted text-muted-foreground"
                                  }`}
                                  title={ds}
                                >
                                  {s === "completed" ? <Check className="w-3 h-3" strokeWidth={2.4} /> : s === "partial" ? <Minus className="w-3 h-3" strokeWidth={2.4} /> : s === "missed" ? <X className="w-3 h-3" strokeWidth={2.4} /> : "·"}
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex gap-2">
                            {up.status === "active" && (
                              <button onClick={() => handleStatusChange(up, "paused")}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors">
                                <Pause className="w-3.5 h-3.5" /> Pause
                              </button>
                            )}
                            {up.status === "paused" && (
                              <button onClick={() => handleStatusChange(up, "active")}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                                <Play className="w-3.5 h-3.5" /> Resume
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          {isAssigning && assignForm ? (
                            <div className="flex flex-wrap gap-2 items-end">
                              <Select
                                value={assignForm.protocolId}
                                onValueChange={(val) => setAssignForm({ ...assignForm, protocolId: val })}
                              >
                                <SelectTrigger className="rounded-xl flex-1 min-w-[180px] bg-background border-border">
                                  <SelectValue placeholder="Select protocol" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  {protocols.filter((p) => p.is_active).map((p) => (
                                    <SelectItem key={p.id} value={p.id} className="rounded-lg">{p.protocol_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <input
                                type="date"
                                className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                value={assignForm.startDate}
                                onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })}
                              />
                              <button
                                onClick={handleAssign}
                                disabled={!assignForm.protocolId}
                                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                              >
                                Assign
                              </button>
                              <button
                                onClick={() => setAssignForm(null)}
                                className="px-3 py-2 rounded-xl bg-accent text-muted-foreground text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAssignForm({
                                userId: patient.user_id,
                                protocolId: "",
                                startDate: new Date().toISOString().split("T")[0],
                              })}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
                            >
                              <Calendar className="w-4 h-4" /> Assign Fasting Protocol
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
