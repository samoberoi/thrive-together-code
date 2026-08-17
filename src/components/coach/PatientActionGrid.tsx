import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, FlaskConical, Pill, Timer, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ScheduleMeetingDialog from "@/components/coach/ScheduleMeetingDialog";
import RecommendTestsDialog from "@/components/coach/RecommendTestsDialog";
import RecommendSupplementsDialog from "@/components/coach/RecommendSupplementsDialog";
import AssignFastingDialog from "@/components/coach/AssignFastingDialog";
import { openCoachPatientModule, type CoachModuleTab } from "@/lib/coachNav";


type Dlg = "meeting" | "tests" | "supps" | "fasting" | null;

interface Props {
  coachId: string;
  patientId: string;
  patientName?: string | null;
}

interface Status {
  meeting: string | null;
  meetingDone: boolean;
  tests: string | null;
  testItems: string[];
  supps: string | null;
  suppItems: string[];
  fasting: string | null;
}

const EMPTY: Status = { meeting: null, meetingDone: false, tests: null, testItems: [], supps: null, suppItems: [], fasting: null };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const meetingLabel = (type?: string | null) =>
  ({
    onboarding: "Onboarding",
    weekly_checkpoint: "Weekly check-in",
    quarterly_review: "Quarterly review",
    consultation: "Consultation",
    followup: "Follow-up",
  }[(type ?? "") as string] ?? "Meeting");

/**
 * Coach action tiles for a patient. Each tile reflects whether the item is
 * already assigned — showing what's in place and switching the CTA to "Manage".
 */
export default function PatientActionGrid({ coachId, patientId, patientName }: Props) {
  const [dlg, setDlg] = useState<Dlg>(null);
  const [loading, setLoading] = useState(true);
  const [s, setS] = useState<Status>(EMPTY);

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const [meetRes, doneRes, testRes, planRes, suppRecRes, protoRes] = await Promise.all([
      supabase
        .from("coach_meetings" as any)
        .select("scheduled_at, status, meeting_type")
        .eq("user_id", patientId)
        .eq("status", "scheduled")
        .gte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(1),
      supabase
        .from("coach_meetings" as any)
        .select("scheduled_at, meeting_type")
        .eq("user_id", patientId)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false })
        .limit(1),
      // Tests are assigned through thyrocare_recommendations (same table the
      // assign dialog writes to) — reading anything else showed "Not assigned".
      supabase
        .from("thyrocare_recommendations" as any)
        .select("status, product_codes, created_at")
        .eq("user_id", patientId)
        .in("status", ["pending", "viewed", "booked"])
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("user_supplement_plans" as any)
        .select("id")
        .eq("user_id", patientId)
        .eq("status", "active"),
      supabase
        .from("coach_supplement_recommendations" as any)
        .select("items, status, created_at")
        .eq("user_id", patientId)
        .in("status", ["recommended", "accepted"])
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("user_protocols" as any)
        .select("start_date, protocol_id, fasting_protocols(protocol_name)")
        .eq("user_id", patientId)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1),
    ]);

    const next: Status = { ...EMPTY };

    const m = (meetRes.data as any[])?.[0];
    const done = (doneRes.data as any[])?.[0];
    if (m) {
      next.meeting = `${meetingLabel(m.meeting_type)} • ${fmtDate(m.scheduled_at)}`;
      next.meetingDone = true;
    } else if (done) {
      next.meeting = `${meetingLabel(done.meeting_type)} complete`;
      next.meetingDone = true;
    }

    const t = (testRes.data as any[])?.[0];
    if (t) {
      const codes: string[] = t.product_codes ?? [];
      let names: string[] = [];
      if (codes.length) {
        const { data } = await supabase
          .from("thyrocare_tests" as any)
          .select("product_code, product_name")
          .in("product_code", codes);
        names = ((data as any[]) ?? []).map((x) => x.product_name as string).filter(Boolean);
      }
      next.testItems = names;
      next.tests = names[0] ?? `${codes.length || 1} test${codes.length === 1 || !codes.length ? "" : "s"} assigned`;
    }

    const planIds = ((planRes.data as any[]) ?? []).map((p) => p.id);
    if (planIds.length) {
      const { data: items } = await supabase
        .from("user_supplement_plan_items" as any)
        .select("id, is_active, supplement_master(name)")
        .in("plan_id", planIds)
        .eq("is_active", true);
      const names = ((items as any[]) ?? []).map((i) => i.supplement_master?.name).filter(Boolean) as string[];
      next.suppItems = names;
      if (names.length) next.supps = `${names.length} active`;
    }
    if (!next.supps) {
      const rec = (suppRecRes.data as any[])?.[0];
      const recItems = Array.isArray(rec?.items) ? rec.items : [];
      const names = recItems
        .map((i: any) => i?.name ?? i?.supplement_name ?? null)
        .filter(Boolean) as string[];
      if (recItems.length) {
        next.suppItems = names;
        next.supps = `${recItems.length} recommended`;
      }
    }

    const p = (protoRes.data as any[])?.[0];
    if (p) next.fasting = p.fasting_protocols?.protocol_name ?? "Active protocol";

    setS(next);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    setLoading(true);
    setS(EMPTY);
    load();
  }, [load]);


  const closeDlg = (open: boolean) => {
    if (!open) {
      setDlg(null);
      load();
    }
  };

  // Already assigned → jump into that module on this patient's detail row
  // (pencil / pause / detail live there). Nothing assigned → assign dialog.
  const MODULE_FOR: Partial<Record<Exclude<Dlg, null>, CoachModuleTab>> = {
    tests: "labtests",
    supps: "supplements",
    fasting: "fasting",
  };

  const Tile = ({
    id, icon: Icon, label, value,
  }: { id: Exclude<Dlg, null>; icon: typeof Pill; label: string; value: string | null }) => {
    const done = !!value;
    const target = MODULE_FOR[id];
    return (
      <button
        onClick={() => (done && target ? openCoachPatientModule(target, patientId) : setDlg(id))}

        className={`liquid-glass rounded-2xl py-3 px-2.5 flex flex-col items-center gap-1 text-center hover:bg-primary/5 ${
          done ? "ring-1 ring-success/40" : ""
        }`}
      >
        <div className="relative">
          <Icon className={`w-4.5 h-4.5 ${done ? "text-success" : "text-primary"}`} />
          {done && (
            <CheckCircle2 className="w-3 h-3 text-success absolute -right-1.5 -top-1.5" strokeWidth={2.5} />
          )}
        </div>
        <span className="text-[11px] font-bold text-foreground leading-tight">{label}</span>
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <>
            <span className="text-[10px] font-semibold text-muted-foreground leading-tight break-words w-full">
              {value ?? "Not assigned"}
            </span>
            <span className={`text-[10px] font-bold ${done ? "text-success" : "text-primary"}`}>
              {done ? "Manage" : "Assign"}
            </span>
          </>
        )}
      </button>
    );
  };

  return (
    <>
      <motion.div
        className="grid grid-cols-2 gap-2"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        <Tile id="meeting" icon={Calendar} label="Meeting" value={s.meeting} />
        <Tile id="tests" icon={FlaskConical} label="Tests" value={s.tests} />
        <Tile id="supps" icon={Pill} label="Supplements" value={s.supps} />
        <Tile id="fasting" icon={Timer} label="Fasting" value={s.fasting} />
      </motion.div>

      {(s.suppItems.length > 0 || s.testItems.length > 0) && !loading && (
        <div className="liquid-glass rounded-2xl p-4 space-y-3">
          {s.testItems.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Assigned tests
              </p>
              <div className="flex flex-wrap gap-1.5">
                {s.testItems.map((n) => (
                  <span key={n} className="text-[10px] font-bold px-2 py-1 rounded-full bg-primary/10 text-primary break-words">
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
          {s.suppItems.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Active supplements
              </p>
              <div className="flex flex-wrap gap-1.5">
                {s.suppItems.map((n, i) => (
                  <span key={`${n}-${i}`} className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted text-foreground break-words">
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ScheduleMeetingDialog
        open={dlg === "meeting"} onOpenChange={closeDlg}
        coachId={coachId} patientId={patientId} patientName={patientName ?? undefined}
      />
      <RecommendTestsDialog
        open={dlg === "tests"} onOpenChange={closeDlg}
        coachId={coachId} patientId={patientId} patientName={patientName ?? undefined}
      />
      <RecommendSupplementsDialog
        open={dlg === "supps"} onOpenChange={closeDlg}
        coachId={coachId} patientId={patientId} patientName={patientName ?? undefined}
      />
      <AssignFastingDialog
        open={dlg === "fasting"} onOpenChange={closeDlg}
        coachId={coachId} patientId={patientId} patientName={patientName ?? undefined}
      />
    </>
  );
}
