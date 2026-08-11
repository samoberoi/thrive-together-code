import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Apple, Users, Search, Check, AlertTriangle, ChevronDown, ChevronRight, Utensils, Bell, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateConversation, sendMessage } from "@/lib/chatService";
import QuickFoodReference from "@/components/diet/QuickFoodReference";

import Diet from "@/pages/tabs/Diet";
import { UtensilsCrossed } from "lucide-react";

type View = "patients" | "reference" | "mine";


interface PatientRow {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
}

interface DayCheckin {
  fmod: string | null;
  lmod: string | null;
}

interface Plate {
  meal_slot: string;
  plate_data: any;
  calories: number | null;
}

const SLOT_LABEL: Record<string, string> = {
  first_meal: "First meal (FMOD)",
  mid_bite: "Mid bite",
  last_meal: "Last meal (LMOD)",
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const suffix = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${m ?? "00"} ${suffix}`;
}

export default function CoachFood() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("patients");
  const [date, setDate] = useState<string>(todayKey());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [checkins, setCheckins] = useState<Record<string, DayCheckin>>({});
  const [photoSlots, setPhotoSlots] = useState<Record<string, Set<string>>>({});
  const [plates, setPlates] = useState<Record<string, Plate[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [nudgeTarget, setNudgeTarget] = useState<PatientRow | "all" | null>(null);
  const [nudgeText, setNudgeText] = useState("");
  const [sending, setSending] = useState(false);
  const [nudged, setNudged] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, date]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: coach } = await supabase.from("coaches" as any).select("id").eq("user_id", user.id).maybeSingle();
      if (!coach) { setPatients([]); setLoading(false); return; }
      setCoachId((coach as any).id);


      const { data: assignments } = await supabase
        .from("coach_assignments" as any)
        .select("user_id")
        .eq("coach_id", (coach as any).id)
        .eq("is_active", true);
      const userIds = ((assignments as any[]) ?? []).map((a) => a.user_id);
      if (userIds.length === 0) { setPatients([]); setLoading(false); return; }

      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;

      const [{ data: profiles }, { data: tracking }, { data: photos }, { data: platingRows }] = await Promise.all([
        supabase.from("profiles").select("user_id, name, avatar_url").in("user_id", userIds),
        supabase.from("fasting_tracking" as any)
          .select("user_id, fmod_actual_time, lmod_actual_time")
          .in("user_id", userIds)
          .eq("date", date),
        supabase.from("meal_photos" as any)
          .select("user_id, meal_type")
          .in("user_id", userIds)
          .gte("logged_at", dayStart)
          .lte("logged_at", dayEnd),
        supabase.from("diet_platings" as any)
          .select("user_id, plan_start_date, day_index, meal_slot, plate_data, calories")
          .in("user_id", userIds),
      ]);

      setPatients(((profiles as any[]) ?? []) as PatientRow[]);

      const ci: Record<string, DayCheckin> = {};
      for (const t of ((tracking as any[]) ?? [])) {
        ci[t.user_id] = { fmod: t.fmod_actual_time ?? null, lmod: t.lmod_actual_time ?? null };
      }
      setCheckins(ci);

      const ps: Record<string, Set<string>> = {};
      for (const p of ((photos as any[]) ?? [])) {
        (ps[p.user_id] ||= new Set()).add(String(p.meal_type ?? "").toLowerCase());
      }
      setPhotoSlots(ps);

      // Pick each user's latest plan and the plates for the selected date.
      const byUser: Record<string, any[]> = {};
      for (const r of ((platingRows as any[]) ?? [])) (byUser[r.user_id] ||= []).push(r);
      const plateMap: Record<string, Plate[]> = {};
      const target = new Date(date + "T00:00:00").getTime();
      for (const [uid, rows] of Object.entries(byUser)) {
        const latestStart = rows
          .map((r) => r.plan_start_date)
          .sort()
          .reverse()[0];
        if (!latestStart) continue;
        const startMs = new Date(latestStart + "T00:00:00").getTime();
        const dayIndex = Math.floor((target - startMs) / 86400000);
        if (dayIndex < 0) continue;
        const dayPlates = rows
          .filter((r) => r.plan_start_date === latestStart && r.day_index === dayIndex)
          .map((r) => ({ meal_slot: r.meal_slot, plate_data: r.plate_data, calories: r.calories }));
        if (dayPlates.length) plateMap[uid] = dayPlates;
      }
      setPlates(plateMap);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load patient food data");
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => (p.name ?? "").toLowerCase().includes(q));
  }, [patients, search]);

  const isToday = date === todayKey();

  const hasFmod = (uid: string) =>
    Boolean(checkins[uid]?.fmod) || photoSlots[uid]?.has("fmod") || photoSlots[uid]?.has("first_meal");
  const hasLmod = (uid: string) =>
    Boolean(checkins[uid]?.lmod) || photoSlots[uid]?.has("lmod") || photoSlots[uid]?.has("last_meal");

  const pending = filtered.filter((p) => !hasFmod(p.user_id) || !hasLmod(p.user_id));
  const noCheckinCount = filtered.filter((p) => !hasFmod(p.user_id) && !hasLmod(p.user_id)).length;

  const defaultNudge = (p: PatientRow | "all") => {
    const missing = (uid: string) =>
      !hasFmod(uid) && !hasLmod(uid) ? "your first and last meal" : !hasFmod(uid) ? "your first meal (FMOD)" : "your last meal (LMOD)";
    if (p === "all") {
      return `Hi! I noticed you haven't logged your meals for ${isToday ? "today" : date} yet. Please take a moment to check in — it really helps me guide you better. 🙂`;
    }
    const first = (p.name ?? "").split(" ")[0];
    return `Hi${first ? " " + first : ""}! I noticed ${missing(p.user_id)} isn't logged for ${isToday ? "today" : date} yet. Please check in when you can — it helps me track your progress. 🙂`;
  };

  const openNudge = (target: PatientRow | "all") => {
    setNudgeTarget(target);
    setNudgeText(defaultNudge(target));
  };

  const sendNudge = async () => {
    if (!user || !coachId || !nudgeTarget) return;
    const text = nudgeText.trim();
    if (!text) { toast.error("Write a message first"); return; }
    const targets = nudgeTarget === "all" ? pending : [nudgeTarget];
    if (targets.length === 0) { toast.info("Everyone has checked in"); setNudgeTarget(null); return; }
    setSending(true);
    let ok = 0;
    for (const p of targets) {
      try {
        const convo = await getOrCreateConversation(p.user_id, coachId);
        if (!convo) continue;
        const msg = nudgeTarget === "all" ? defaultNudge(p) : text;
        const sent = await sendMessage(convo.id, user.id, "coach", msg);
        if (sent) { ok++; setNudged((prev) => ({ ...prev, [p.user_id]: true })); }
      } catch { /* keep going */ }
    }
    setSending(false);
    setNudgeTarget(null);
    if (ok === 0) toast.error("Could not send the nudge");
    else toast.success(ok === 1 ? "Nudge sent" : `Nudge sent to ${ok} patients`);
  };


  return (
    <div className="theme-diet px-4 pt-2 pb-28 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <TabBtn active={view === "patients"} onClick={() => setView("patients")} icon={Users} label="Patient check-ins" />
        <TabBtn active={view === "reference"} onClick={() => setView("reference")} icon={Apple} label="Food library" />
        <TabBtn active={view === "mine"} onClick={() => setView("mine")} icon={UtensilsCrossed} label="My Plates" />
      </div>

      {view === "mine" ? (
        <Diet planOverride="intensive" />
      ) : view === "reference" ? (
        <QuickFoodReference embedded />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patients"
                className="pl-9"
              />
            </div>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayKey())}
              className="sm:w-44"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground px-1">
            <span>{isToday ? "Today" : date} · {filtered.length} patients</span>
            <div className="flex items-center gap-2">
              {noCheckinCount > 0 && (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                  <AlertTriangle className="w-3.5 h-3.5" /> {noCheckinCount} not checked in
                </span>
              )}
              {pending.length > 0 && (
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1" onClick={() => openNudge("all")}>
                  <Bell className="w-3.5 h-3.5" /> Nudge all ({pending.length})
                </Button>
              )}
            </div>
          </div>


          {loading ? (
            <p className="text-sm text-muted-foreground px-1 py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1 py-8">No patients assigned yet.</p>
          ) : (
            filtered.map((p, i) => {
              const fm = hasFmod(p.user_id);
              const lm = hasLmod(p.user_id);
              const open = expanded === p.user_id;
              const dayPlates = plates[p.user_id] ?? [];
              return (
                <motion.div
                  key={p.user_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2) }}
                  className="liquid-glass rounded-2xl overflow-hidden"
                >
                  <button
                    onClick={() => setExpanded(open ? null : p.user_id)}
                    className="no-pill w-full flex items-start gap-3 p-4 text-left"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-black text-sm text-muted-foreground">
                          {(p.name?.[0] ?? "?").toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{p.name ?? "Unnamed"}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <Pill ok={fm} label={fm ? `FMOD ${fmtTime(checkins[p.user_id]?.fmod ?? null) ?? "logged"}` : "FMOD missing"} />
                        <Pill ok={lm} label={lm ? `LMOD ${fmtTime(checkins[p.user_id]?.lmod ?? null) ?? "logged"}` : "LMOD missing"} />
                        <span className="text-[11px] text-muted-foreground">
                          {dayPlates.length ? `${dayPlates.length} plates` : "no plan plates"}
                        </span>
                      </div>
                    </div>
                    {open ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    )}
                  </button>


                  {(!fm || !lm) && (
                    <div className="px-4 pb-3 -mt-1 flex items-center justify-end gap-2">
                      {nudged[p.user_id] && (
                        <span className="text-[11px] text-emerald-600 font-semibold inline-flex items-center gap-1">
                          <Check className="w-3 h-3" /> Nudged
                        </span>
                      )}
                      <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1" onClick={() => openNudge(p)}>
                        <Bell className="w-3.5 h-3.5" /> Nudge
                      </Button>
                    </div>
                  )}

                  {open && (
                    <div className="px-4 pb-4 space-y-2">
                      {!fm && !lm && (
                        <div className="flex items-start gap-2 rounded-xl p-3 bg-amber-500/10 text-amber-700 text-xs">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>No check-in for {isToday ? "today" : date}. Nudge them to log their first and last meal.</span>
                        </div>
                      )}

                      {dayPlates.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No plated meals scheduled for this day.</p>
                      ) : (
                        dayPlates.map((pl, idx) => {
                          const items: string[] = Array.isArray(pl.plate_data?.items) ? pl.plate_data.items : [];
                          return (
                            <div key={idx} className="rounded-xl p-3 bg-muted/50">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                  <Utensils className="w-3.5 h-3.5" style={{ color: "var(--pillar-diet)" }} />
                                  {SLOT_LABEL[pl.meal_slot] ?? pl.meal_slot}
                                </p>
                                {pl.calories != null && (
                                  <span className="text-[11px] text-muted-foreground">{pl.calories} kcal</span>
                                )}
                              </div>
                              {pl.plate_data?.title && (
                                <p className="text-xs text-foreground mt-1 font-medium">{pl.plate_data.title}</p>
                              )}
                              {items.length > 0 && (
                                <ul className="mt-1.5 space-y-0.5">
                                  {items.map((it, k) => (
                                    <li key={k} className="text-xs text-muted-foreground">• {String(it)}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      )}

      <Dialog open={!!nudgeTarget} onOpenChange={(o) => !o && setNudgeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {nudgeTarget === "all"
                ? `Nudge ${pending.length} patients`
                : `Nudge ${(nudgeTarget as PatientRow | null)?.name ?? "patient"}`}
            </DialogTitle>
            <DialogDescription>
              {nudgeTarget === "all"
                ? "Each patient gets a personalised message in their chat about the meals they haven't logged."
                : "This goes straight into your chat with the patient."}
            </DialogDescription>
          </DialogHeader>

          {nudgeTarget !== "all" && (
            <>
              <Textarea
                value={nudgeText}
                onChange={(e) => setNudgeText(e.target.value)}
                rows={4}
                className="text-sm"
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Quick reminder — please log your meal photo when you eat 🙂",
                  "How did your fasting window go today? Let me know.",
                  "Missing your check-in. Everything okay?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setNudgeText(q)}
                    className="no-pill text-[11px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setNudgeTarget(null)} disabled={sending}>Cancel</Button>
            <Button onClick={sendNudge} disabled={sending} className="gap-1.5">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              Send nudge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        ok ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"
      }`}
    >
      {ok ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {label}
    </span>
  );
}

function TabBtn({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`no-pill flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
