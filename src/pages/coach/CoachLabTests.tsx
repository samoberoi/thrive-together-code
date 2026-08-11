import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FlaskConical, Search, Send, Check, ListChecks, User as UserIcon, X, Plus, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LabTestParametersDialog } from "@/components/lab/LabTestParametersDialog";
import { patientPriceFor, useLabTestMarkup } from "@/lib/labTestMarkup";
import { createNotification } from "@/lib/notificationService";
import LabOrderDetails from "@/components/lab/LabOrderDetails";
import LabHistorySection from "@/components/lab/LabHistorySection";
import { Activity, ChevronDown, ChevronUp, Home, FileText, ExternalLink, Upload, ClipboardEdit } from "lucide-react";
import LabResultsEntry from "@/components/lab/LabResultsEntry";
import ExternalTestDialog from "@/components/lab/ExternalTestDialog";
import { fetchExternalReportsForUsers, externalReportUrl, parseExternalReport, type ExternalLabReport } from "@/lib/externalLabService";

import PatientLabTests from "@/components/PatientLabTests";

type View = "patients" | "tests" | "mine";

type Test = {
  id: string;
  product_code: string;
  product_name: string;
  category: string | null;
  rate: number | null;
  offer_rate: number | null;
  markup_pct: number | null;
  fasting_required: boolean | null;
  parameters_count: number | null;
};

type Patient = { user_id: string; name: string; phone: string | null; avatar_url: string | null; plan_id: string | null; started_at: string | null; expires_at: string | null };

type Recommendation = {
  id: string;
  user_id: string;
  coach_id: string | null;
  test_ids: string[];
  product_codes: string[];
  notes: string | null;
  status: string;
  recommended_at: string;
  external_intent?: boolean | null;
  external_note?: string | null;
};

type Order = {
  id: string;
  user_id: string;
  recommendation_id: string | null;
  product_codes?: string[] | null;
  thyrocare_order_id: string | null;
  thyrocare_lead_id: string | null;
  status: string | null;
  status_detail: string | null;
  beneficiary_name: string | null;
  beneficiary_age: number | null;
  beneficiary_gender: string | null;
  mobile: string | null;
  email: string | null;
  pincode: string | null;
  address: string | null;
  collection_date: string | null;
  collection_slot: string | null;
  amount: number | null;
  raw_response: any;
  created_at: string;
};

type Report = { id: string; order_id: string; user_id: string; report_url: string | null; report_type: string | null; delivered_at: string | null; parameters: any };

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function labelStatus(value?: string | null) {
  if (!value) return "Not yet booked";
  const normalized = value.replace(/_/g, " ").trim().toLowerCase();
  if (["pending", "viewed", "recommended"].includes(normalized)) return "Not yet booked";
  if (normalized === "created" || normalized === "booked") return "Booked";
  if (["done", "completed", "report ready", "reports ready"].includes(normalized)) return "Results ready";
  return normalized.replace(/\b\w/g, (m) => m.toUpperCase());
}

function orderStatus(order?: Order, recStatus?: string) {
  if (!order) return labelStatus(recStatus);
  const raw = order.raw_response?.data || order.raw_response || {};
  return labelStatus(raw.statusText || raw.statusDescription || raw.status || order.status || recStatus);
}

function statusClass(label: string) {
  const s = label.toLowerCase();
  if (s.includes("processing")) return "bg-amber-500/15 text-amber-600 border-amber-500/20";
  if (s.includes("result") || s.includes("done") || s.includes("complete") || s.includes("received")) return "bg-primary/15 text-primary border-primary/20";

  if (s.includes("book") || s.includes("collect") || s.includes("lab") || s.includes("process")) return "bg-amber-500/15 text-amber-600 border-amber-500/20";
  if (s.includes("not yet") || s.includes("awaiting")) return "border-muted-foreground/30 text-muted-foreground";
  if (s.includes("fail") || s.includes("cancel")) return "bg-destructive/15 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground border-border";
}

export default function CoachLabTests() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("patients");
  const [tests, setTests] = useState<Test[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation[]>>({});
  const [orders, setOrders] = useState<Record<string, Order[]>>({});
  const [reports, setReports] = useState<Record<string, Report[]>>({});
  const [loading, setLoading] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paramsTest, setParamsTest] = useState<Test | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [assigningPatient, setAssigningPatient] = useState<string | null>(null);
  const [openInvestigation, setOpenInvestigation] = useState<Record<string, boolean>>({});
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);
  const markupPct = useLabTestMarkup();

  // "Manage" from a patient profile lands directly on that patient's detail.
  useCoachPatientFocus("labtests", (patientId) => {
    setView("patients");
    setPatientSearch("");
    setExpandedPatient(patientId);
  });



  const [extReports, setExtReports] = useState<Record<string, ExternalLabReport[]>>({});
  const [markerRevision, setMarkerRevision] = useState(0);
  const [entryTarget, setEntryTarget] = useState<{ userId: string; report: ExternalLabReport } | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ userId: string; recommendationId: string | null; productCodes: string[] } | null>(null);

  const loadExternal = async (userIds: string[]) => {
    let rows = await fetchExternalReportsForUsers(userIds);
    const pending = rows.filter((report) => report.status === "uploaded");
    if (pending.length) {
      await Promise.allSettled(pending.map((report) => parseExternalReport(report.id)));
      rows = await fetchExternalReportsForUsers(userIds);
      setMarkerRevision((value) => value + 1);
    }
    const map: Record<string, ExternalLabReport[]> = {};
    for (const r of rows) (map[r.user_id] ||= []).push(r);
    setExtReports(map);
  };

  const openExternalReport = async (r: ExternalLabReport) => {
    const url = await externalReportUrl(r.file_path);
    if (!url) { toast.error("Couldn't open the report"); return; }
    window.open(url, "_blank", "noopener");
  };

  const testsByCode = useMemo(() => Object.fromEntries(tests.map((t) => [t.product_code, t])), [tests]);
  const chosenTests = useMemo(() => tests.filter((t) => selectedTests.has(t.id)), [tests, selectedTests]);
  const priceFor = (t: Test) => patientPriceFor(t.offer_rate ?? t.rate, t.markup_pct, markupPct) ?? 0;
  const totalPrice = useMemo(() => chosenTests.reduce((sum, t) => sum + priceFor(t), 0), [chosenTests, markupPct]);

  useEffect(() => {
    if (!user) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: coach } = await supabase.from("coaches" as any).select("id").eq("user_id", user.id).maybeSingle();
      if (!coach) { setLoading(false); return; }

      const [{ data: t, error: testsError }, { data: assigns }] = await Promise.all([
        supabase.from("thyrocare_tests" as any).select("id, product_code, product_name, category, rate, offer_rate, markup_pct, fasting_required, parameters_count").eq("is_active", true).order("product_name"),
        supabase.from("coach_assignments" as any).select("user_id").eq("coach_id", (coach as any).id).eq("is_active", true),
      ]);

      if (testsError) toast.error(testsError.message || "Unable to load active lab tests");
      const testRank = (name?: string) => {
        const n = (name || "").toUpperCase();
        if (n.includes("BASIC")) return 0;
        if (n.includes("PLUS")) return 1;
        if (n.includes("ADVANCED")) return 2;
        return 3;
      };
      setTests(([...(((t as any) || []) as Test[])]).sort((a, b) => testRank(a.product_name) - testRank(b.product_name) || (a.product_name || "").localeCompare(b.product_name || "")));

      const userIds = ((assigns as any[]) || []).map((a) => a.user_id);
      if (!userIds.length) {
        setPatients([]); setRecommendations({}); setOrders({}); setReports({}); setLoading(false); return;
      }

      const [{ data: profs }, { data: recRows }, { data: orderRows }, { data: reportRows }, { data: subRows }] = await Promise.all([
        supabase.from("profiles").select("user_id, name, phone, avatar_url").in("user_id", userIds),
        supabase.from("thyrocare_recommendations" as any).select("id, user_id, coach_id, test_ids, product_codes, notes, status, recommended_at, external_intent, external_note").in("user_id", userIds).order("recommended_at", { ascending: false }),
        supabase.from("thyrocare_orders" as any).select("id, user_id, recommendation_id, product_codes, thyrocare_order_id, thyrocare_lead_id, status, status_detail, beneficiary_name, beneficiary_age, beneficiary_gender, mobile, email, pincode, address, collection_date, collection_slot, amount, raw_response, created_at").in("user_id", userIds).order("created_at", { ascending: false }),
        supabase.from("thyrocare_reports" as any).select("id, order_id, user_id, report_url, report_type, delivered_at, parameters").in("user_id", userIds).order("delivered_at", { ascending: false }),
        supabase.from("subscriptions" as any).select("user_id, plan_id, started_at, expires_at, status").in("user_id", userIds).eq("status", "active"),
      ]);

      let activeOrders = (((orderRows as any) || []) as Order[]).filter((o) => !["failed", "cancelled"].includes((o.status || "").toLowerCase()));
      const liveOrders = activeOrders.filter((o) => !!o.thyrocare_order_id && !["done", "completed", "report_ready", "reports_ready"].includes((o.status || "").toLowerCase()));
      if (liveOrders.length) {
        await Promise.all(liveOrders.map((o) => supabase.functions.invoke("thyrocare-api", { body: { action: "order_status", thyrocare_order_id: o.thyrocare_order_id } }).catch(() => null)));
        const { data: refreshedOrders } = await supabase.from("thyrocare_orders" as any).select("id, user_id, recommendation_id, product_codes, thyrocare_order_id, thyrocare_lead_id, status, status_detail, beneficiary_name, beneficiary_age, beneficiary_gender, mobile, email, pincode, address, collection_date, collection_slot, amount, raw_response, created_at").in("user_id", userIds).order("created_at", { ascending: false });
        activeOrders = (((refreshedOrders as any) || []) as Order[]).filter((o) => !["failed", "cancelled"].includes((o.status || "").toLowerCase()));
      }

      const subMap = new Map<string, any>();
      for (const s of ((subRows as any[]) || [])) subMap.set(s.user_id, s);
      setPatients(((profs as any[]) || []).map((p) => {
        const s = subMap.get(p.user_id);
        return { user_id: p.user_id, name: p.name || "Patient", phone: p.phone || null, avatar_url: p.avatar_url || null, plan_id: s?.plan_id ?? null, started_at: s?.started_at ?? null, expires_at: s?.expires_at ?? null };
      }).sort((a, b) => a.name.localeCompare(b.name)));

      const recMap: Record<string, Recommendation[]> = {};
      for (const rec of (((recRows as any) || []) as Recommendation[])) {
        if (!recMap[rec.user_id]) recMap[rec.user_id] = [];
        recMap[rec.user_id].push(rec);
      }
      const orderMap: Record<string, Order[]> = {};
      for (const order of activeOrders) {
        if (!orderMap[order.user_id]) orderMap[order.user_id] = [];
        orderMap[order.user_id].push(order);
      }
      const reportMap: Record<string, Report[]> = {};
      for (const report of (((reportRows as any) || []) as Report[])) {
        if (!reportMap[report.user_id]) reportMap[report.user_id] = [];
        reportMap[report.user_id].push(report);
      }
      setRecommendations(recMap); setOrders(orderMap); setReports(reportMap);
      await loadExternal(userIds);
    } catch (e: any) {
      toast.error(e.message || "Unable to load lab test assignments");
    } finally {
      setLoading(false);
    }
  };

  const filteredTests = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) => t.product_name.toLowerCase().includes(q) || t.product_code.toLowerCase().includes(q) || (t.category || "").toLowerCase().includes(q));
  }, [tests, catalogSearch]);

  const assignableTests = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) => t.product_name.toLowerCase().includes(q) || t.product_code.toLowerCase().includes(q) || (t.category || "").toLowerCase().includes(q));
  }, [tests, assignSearch]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.name.toLowerCase().includes(q));
  }, [patients, patientSearch]);

  // Only one test/package can be recommended at a time.
  const toggleTest = (id: string) => {
    setSelectedTests((prev) => (prev.has(id) ? new Set<string>() : new Set<string>([id])));
  };

  const OPEN_REC_STATUSES = ["pending", "viewed", "booked"];
  const isOpenRec = (rec?: Recommendation | null) => !!rec && OPEN_REC_STATUSES.includes((rec.status || "pending").toLowerCase());
  const openRecFor = (userId: string) => (recommendations[userId] ?? []).find((r) => isOpenRec(r)) ?? null;

  async function withdrawRec(recId: string) {
    try {
      const { error } = await supabase.from("thyrocare_recommendations" as any).update({ status: "dismissed" }).eq("id", recId);
      if (error) throw error;
      toast.success("Test withdrawn — you can now assign a new one");
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Could not withdraw the test");
    }
  }

  async function sendTo(patient: Patient) {
    if (selectedTests.size === 0) return;
    const existing = openRecFor(patient.user_id);
    if (existing) {
      toast.error(`${patient.name} already has an active lab test. Withdraw it before assigning another.`);
      return;
    }
    setSubmitting(true);
    try {
      const { data: coach } = await supabase.from("coaches" as any).select("id").eq("user_id", user!.id).maybeSingle();
      if (!coach) throw new Error("Coach profile not found");

      const { error } = await supabase.from("thyrocare_recommendations" as any).insert({
        user_id: patient.user_id,
        coach_id: (coach as any).id,
        test_ids: chosenTests.map((t) => t.id),
        product_codes: chosenTests.map((t) => t.product_code),
        notes: notes.trim() || null,
      });
      if (error) {
        if ((error as any).code === "23505") throw new Error(`${patient.name} already has an active lab test. Withdraw it before assigning another.`);
        throw error;
      }

      await createNotification({
        user_id: patient.user_id,
        title: "🧪 Lab tests recommended",
        body: `Your coach recommended ${chosenTests.length} lab test${chosenTests.length > 1 ? "s" : ""}. Tap to review.`,
        type: "lab_test",
        icon: "🧪",
        action_url: "/dashboard?tab=profile&section=lab-tests",
      });

      toast.success(`Sent to ${patient.name}`);
      setSelectedTests(new Set()); setNotes(""); setPickerOpen(false); setPatientSearch(""); setAssigningPatient(null); setAssignSearch("");
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  const beginAssign = (patientId: string) => { setAssigningPatient(patientId); setSelectedTests(new Set()); setNotes(""); setAssignSearch(""); };


  const renderTestSelector = () => (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search tests to assign…" value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} className="pl-9 h-11 rounded-xl" />
      </div>
      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {assignableTests.map((t) => {
          const checked = selectedTests.has(t.id);
          return (
            <button key={t.id} onClick={() => toggleTest(t.id)} className={`w-full flex items-start gap-2.5 p-3 rounded-xl text-left text-xs transition-colors ${checked ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted/40 hover:bg-muted/70"}`}>
              <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>{checked && <Check className="w-3 h-3 text-primary-foreground" />}</span>
              <span className="flex-1 min-w-0"><span className="block font-semibold text-foreground">{t.product_name}</span><span className="block text-muted-foreground mt-0.5">Free home collection · 10–11 hrs fasting</span></span>
              {priceFor(t) > 0 && <span className="font-black text-foreground">₹{priceFor(t).toLocaleString("en-IN")}</span>}
            </button>
          );
        })}
      </div>
      <Textarea placeholder="Notes for the patient (optional)…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none rounded-xl" />
    </div>
  );

  if (loading) return <div className="p-6 text-muted-foreground">Loading lab tests…</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 pb-40">
      <div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2"><FlaskConical className="w-7 h-7 text-primary" /> Lab Tests</h1>
        <p className="text-muted-foreground text-sm mt-1">Assign tests by patient and track booking, collection and result status.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:-mx-6 md:px-6 pb-1 no-scrollbar">
        {([{ id: "patients" as const, label: `👥 Patients (${patients.length})` }, { id: "mine" as const, label: "🩺 My Tests" }, { id: "tests" as const, label: `🧪 Catalog (${tests.length})` }]).map((item) => (
          <button key={item.id} onClick={() => setView(item.id)} className={`shrink-0 px-3.5 py-2 rounded-2xl text-[13px] font-semibold whitespace-nowrap transition-colors ${view === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{item.label}</button>
        ))}
      </div>

      {view === "mine" && (
        <div className="space-y-4">
          <div className="liquid-glass rounded-2xl p-4">
            <p className="text-sm font-black text-foreground">Book your own test</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Same panels your patients get — book at home collection and your report lands here.
            </p>
          </div>
          <PatientLabTests alwaysShow foundationMode />
        </div>
      )}

      {view === "patients" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={`Search ${patients.length} patient${patients.length === 1 ? "" : "s"}…`} value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} className="pl-9 h-11 rounded-2xl" />
          </div>
          {patients.length === 0 ? <div className="liquid-glass rounded-3xl p-10 text-center text-muted-foreground">No patients assigned.</div> : filteredPatients.length === 0 ? <div className="liquid-glass rounded-3xl p-8 text-center text-sm text-muted-foreground">No patients match "{patientSearch}".</div> : filteredPatients.map((patient) => {
            const recs = recommendations[patient.user_id] ?? [];
            const patientOrders = orders[patient.user_id] ?? [];
            const patientReports = reports[patient.user_id] ?? [];
            const patientExternal = extReports[patient.user_id] ?? [];
            const latestRec = recs[0];
            const latestOrder = latestRec ? patientOrders.find((o) => o.recommendation_id === latestRec.id) || patientOrders[0] : patientOrders[0];
            const latestRecExternal = latestRec ? patientExternal.filter((x) => x.recommendation_id === latestRec.id) : [];
            const externalDone = latestRecExternal.length > 0;
            const externalProcessing = externalDone && latestRecExternal.every((x) => (x.status ?? "") === "processing" || (x.status ?? "") === "uploaded");
            const statusLabel = recs.length === 0 && !latestOrder && patientExternal.length === 0
              ? "Awaiting assignment"
              : externalDone
                ? (externalProcessing ? "Processing report" : "Report received")
                : !latestOrder && latestRec?.external_intent
                  ? "Doing it outside"
                  : orderStatus(latestOrder, latestRec?.status);

            const assignedCodes = Array.from(new Set(recs.flatMap((r) => r.product_codes || [])));
            const isAssigning = assigningPatient === patient.user_id;
            const isExpanded = expandedPatient === patient.user_id || isAssigning;
            const planLabel = patient.plan_id ? patient.plan_id.charAt(0).toUpperCase() + patient.plan_id.slice(1) : null;

            return (
              <motion.div key={patient.user_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass rounded-3xl">
                <button
                  type="button"
                  onClick={() => setExpandedPatient(isExpanded && !isAssigning ? null : patient.user_id)}
                  className="w-full text-left p-4 sm:p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">{patient.avatar_url ? <img src={patient.avatar_url} alt="" className="w-11 h-11 rounded-2xl object-cover" /> : <span className="text-primary font-bold text-sm">{(patient.name ?? "?")[0].toUpperCase()}</span>}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground text-[15px] leading-tight truncate">{patient.name || "Unnamed"}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {patient.phone || "No phone"}
                        {recs.length > 0 && <> · {assignedCodes.length} test{assignedCodes.length === 1 ? "" : "s"}</>}
                        {patientReports.length > 0 && <> · {patientReports.length} report{patientReports.length === 1 ? "" : "s"}</>}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {planLabel && <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 text-primary text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap">{planLabel}</span>}
                    <span className={`inline-flex items-center rounded-full border text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap normal-case tracking-normal ${statusClass(statusLabel)}`}>{statusLabel}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-5 -mt-1">
                    {recs.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{assignedCodes.length} assigned test{assignedCodes.length === 1 ? "" : "s"}</span><span className="font-semibold text-primary">Current status: {statusLabel}</span></div>
                        <div className="space-y-2">
                          {recs.map((rec) => {
                            const recOrder = patientOrders.find((o) => o.recommendation_id === rec.id);
                            const recExtAll = patientExternal.filter((x) => x.recommendation_id === rec.id);
                            const recExtProcessing = recExtAll.length > 0 && recExtAll.every((x) => (x.status ?? "") === "processing" || (x.status ?? "") === "uploaded");
                            const recStatus = recExtAll.length > 0
                              ? (recExtProcessing ? "Processing report" : "Report received")
                              : orderStatus(recOrder, rec.status);

                            const items = (rec.product_codes || []).map((code) => testsByCode[code]).filter(Boolean);
                            return (
                              <div key={rec.id} className="rounded-2xl bg-muted/40 p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold"><Clock className="w-3 h-3" /> {new Date(rec.recommended_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div><Badge variant="outline" className={`text-[9px] ${statusClass(recStatus)}`}>{recStatus}</Badge></div>
                                <div className="space-y-1">
                                  {items.map((t) => <div key={t.product_code} className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-foreground truncate">{t.product_name}</span><span className="text-muted-foreground shrink-0">₹{priceFor(t).toLocaleString("en-IN")}</span></div>)}
                                  {(rec.product_codes || []).filter((code) => !testsByCode[code]).map((code) => <div key={code} className="text-xs text-muted-foreground">{code}</div>)}
                                </div>
                                {rec.notes && <p className="text-[11px] text-muted-foreground border-l-2 border-primary pl-2 italic">{rec.notes}</p>}
                                {!recOrder && <p className="text-[11px] text-muted-foreground">Current status: {recStatus}</p>}
                                {isOpenRec(rec) && !recOrder && (
                                  <Button variant="outline" size="sm" className="h-8 w-full text-[11px]" onClick={() => withdrawRec(rec.id)}>
                                    <X className="w-3.5 h-3.5 mr-1.5" /> Withdraw this test
                                  </Button>
                                )}

                                {recOrder && <LabOrderDetails order={recOrder} fastingRequired={items.some((t) => t.fasting_required)} reports={patientReports.filter((report) => report.order_id === recOrder.id)} userId={patient.user_id} />}
                                {(rec.external_intent || (extReports[patient.user_id] || []).some((x) => x.recommendation_id === rec.id)) && (() => {
                                  const recExt = (extReports[patient.user_id] || []).filter((x) => x.recommendation_id === rec.id);
                                  return (
                                    <div className="rounded-xl bg-background/70 ring-1 ring-primary/20 p-2.5 space-y-2">
                                      <div className="flex items-center gap-1.5">
                                        <Home className="w-3.5 h-3.5 text-primary shrink-0" />
                                        <span className="text-[11px] font-black">Patient is getting this done outside</span>
                                      </div>
                                      {rec.external_note && <p className="text-[11px] text-muted-foreground italic">{rec.external_note}</p>}
                                      {recExt.length === 0 ? (
                                        <p className="text-[11px] text-muted-foreground">No report uploaded yet. Nudge the patient, or upload it yourself.</p>
                                      ) : recExt.map((x) => (
                                        <div key={x.id} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                                          <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                                          <div className="min-w-0 flex-1">
                                            <p className="text-[11px] font-bold truncate">{x.file_name || "Report"}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">
                                              {x.lab_name ? `${x.lab_name} · ` : ""}{x.status === "reviewed" ? "Values processed" : x.status === "processing" ? "Reading values…" : x.status === "parse_failed" ? "Automatic reading failed" : "Uploaded"}
                                            </p>
                                          </div>
                                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openExternalReport(x)} aria-label="Open report"><ExternalLink className="w-3.5 h-3.5" /></Button>
                                          <Button size="sm" className="h-7 text-[10px] px-2" onClick={() => setEntryTarget({ userId: patient.user_id, report: x })}>
                                            <ClipboardEdit className="w-3 h-3 mr-1" /> {x.status === "reviewed" ? "Edit values" : "Review values"}
                                          </Button>
                                        </div>
                                      ))}
                                      <Button variant="outline" size="sm" className="h-8 w-full text-[11px]" onClick={() => setUploadTarget({ userId: patient.user_id, recommendationId: rec.id, productCodes: rec.product_codes || [] })}>
                                        <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload report for patient
                                      </Button>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(patientReports.length > 0 || patientExternal.length > 0) && (
                      <div className="mt-4">
                        <button
                          onClick={() => setOpenInvestigation((s) => ({ ...s, [patient.user_id]: !s[patient.user_id] }))}
                          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--bbdo-blue)]/10 text-[var(--bbdo-blue)] text-sm font-bold hover:bg-[var(--bbdo-blue)]/15 transition-colors"
                        >
                          <Activity className="w-4 h-4" strokeWidth={2} />
                          <span className="flex-1 text-left">
                            {openInvestigation[patient.user_id] ? "Hide" : "View"} body investigation
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider bg-white/70 dark:bg-black/30 px-2 py-0.5 rounded-full">
                            {patientReports.length + patientExternal.length} report{patientReports.length + patientExternal.length === 1 ? "" : "s"}
                          </span>
                          {openInvestigation[patient.user_id] ? (
                            <ChevronUp className="w-4 h-4" strokeWidth={2} />
                          ) : (
                            <ChevronDown className="w-4 h-4" strokeWidth={2} />
                          )}
                        </button>
                        {openInvestigation[patient.user_id] && (
                          <div className="mt-3">
                            <LabHistorySection key={`${patient.user_id}-${markerRevision}`} userId={patient.user_id} patientName={patient.name} expectedProductCodes={Array.from(new Set([...recs.flatMap((rc: any) => rc.product_codes || []), ...patientExternal.flatMap((report) => report.product_codes || [])]))} />
                          </div>
                        )}
                      </div>
                    )}

                    {!isAssigning && (openRecFor(patient.user_id) ? (
                      <div className="mt-4 rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground">
                        This patient already has an active lab test. Withdraw it above before assigning a new one — only one test can be active per patient.
                      </div>
                    ) : (
                      <div className="mt-4"><button onClick={() => beginAssign(patient.user_id)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors">{recs.length > 0 ? <Plus className="w-4 h-4" /> : <FlaskConical className="w-4 h-4" />}{recs.length > 0 ? "Assign New Lab Test" : "Assign Lab Test"}</button></div>
                    ))}


                    {isAssigning && (
                      <div className="mt-4 space-y-3">
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 text-primary" /> Select one lab test to assign</h4>
                        {renderTestSelector()}
                        <div className="flex items-center justify-between pt-2"><span className="text-[11px] text-muted-foreground">{selectedTests.size === 1 ? "1 test selected" : "No test selected"}</span><div className="flex gap-2"><button onClick={() => sendTo(patient)} disabled={selectedTests.size === 0 || submitting} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"><Check className="w-3.5 h-3.5 inline mr-1" /> Assign</button><button onClick={() => { setAssigningPatient(null); setSelectedTests(new Set()); setNotes(""); }} className="px-3 py-2 rounded-xl bg-muted text-muted-foreground text-sm">Cancel</button></div></div>

                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {view === "tests" && (
        <div className="space-y-4">
          {tests.length === 0 && <div className="liquid-glass rounded-2xl p-6 text-center text-sm text-muted-foreground">No lab tests are currently available for recommendation.</div>}
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search tests by name, code, or category…" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} className="pl-9 h-12 rounded-2xl" /></div>
          <div className="space-y-2">
            {filteredTests.map((t) => {
              const checked = selectedTests.has(t.id);
              return (
                <motion.div key={t.id} onClick={() => toggleTest(t.id)} whileTap={{ scale: 0.98 }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTest(t.id); } }} className={`w-full text-left liquid-glass rounded-2xl p-4 flex items-start gap-3 transition cursor-pointer ${checked ? "ring-2 ring-primary" : ""}`}>
                  <div className={`w-5 h-5 rounded-md border-2 mt-0.5 flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>{checked && <Check className="w-3.5 h-3.5 text-primary-foreground" />}</div>
                  <div className="flex-1 min-w-0"><div className="font-semibold text-sm">{t.product_name}</div><div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1"><span>Code: {t.product_code}</span>{t.category && <span>{t.category}</span>}{t.parameters_count ? <button type="button" onClick={(e) => { e.stopPropagation(); setParamsTest(t); }} className="inline-flex items-center gap-1 text-primary hover:underline"><ListChecks className="w-3 h-3" />View {t.parameters_count} parameters</button> : null}{t.fasting_required && <Badge variant="secondary" className="text-[10px]">Fasting</Badge>}</div></div>
                  <div className="text-right shrink-0">{priceFor(t) > 0 ? <div className="font-black">₹{priceFor(t).toLocaleString("en-IN")}</div> : null}</div>
                </motion.div>
              );
            })}
            {filteredTests.length === 0 && tests.length > 0 && <div className="text-center text-sm text-muted-foreground py-10">No tests match "{catalogSearch}".</div>}
          </div>
        </div>
      )}

      {view === "tests" && selectedTests.size > 0 && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed left-0 right-0 bottom-0 md:left-64 z-40 px-4 pb-4 pointer-events-none"><div className="liquid-glass rounded-2xl p-4 shadow-2xl border border-border pointer-events-auto max-w-2xl mx-auto"><div className="flex items-center justify-between mb-3"><div><div className="text-sm font-semibold">{selectedTests.size} test{selectedTests.size > 1 ? "s" : ""} selected</div><div className="text-xs text-muted-foreground">Total ₹{totalPrice.toLocaleString("en-IN")}</div></div><button onClick={() => setSelectedTests(new Set())} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> Clear</button></div><Button onClick={() => setPickerOpen(true)} disabled={submitting} className="w-full h-12 rounded-xl" size="lg"><Send className="w-4 h-4 mr-2" /> Recommend to patient</Button></div></motion.div>
      )}

      <Sheet open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (!o) setPatientSearch(""); }}>
        <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[85vh] flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 text-left"><SheetTitle>Recommend to patient</SheetTitle><p className="text-xs text-muted-foreground">{chosenTests.length} test{chosenTests.length > 1 ? "s" : ""} · ₹{totalPrice.toLocaleString("en-IN")}</p></SheetHeader>
          <div className="px-4 pb-2"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder={`Search ${patients.length} patient${patients.length === 1 ? "" : "s"}…`} value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} className="pl-9 h-11 rounded-xl" /></div></div>
          <div className="px-4 pb-2"><Textarea placeholder="Notes for the patient (optional)…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none rounded-xl" /></div>
          <div className="flex-1 overflow-y-auto px-2 pb-4">{patients.length === 0 ? <div className="text-center text-sm text-muted-foreground py-10">No assigned patients yet.</div> : filteredPatients.length === 0 ? <div className="text-center text-sm text-muted-foreground py-10">No patients match "{patientSearch}".</div> : <ul className="divide-y divide-border">{filteredPatients.map((p) => { const blocked = !!openRecFor(p.user_id); return (<li key={p.user_id}><button disabled={submitting || blocked} onClick={() => sendTo(p)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-accent disabled:opacity-50 transition-colors text-left"><div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">{initials(p.name) || <UserIcon className="w-4 h-4" />}</div><div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{p.name}</div>{blocked && <div className="text-[10px] text-muted-foreground truncate">Already has an active test</div>}</div>{blocked ? <span className="text-[10px] font-semibold text-muted-foreground shrink-0">Blocked</span> : <Send className="w-4 h-4 text-muted-foreground shrink-0" />}</button></li>); })}</ul>}</div>
        </SheetContent>
      </Sheet>

      {entryTarget && (
        <LabResultsEntry
          open
          onClose={() => setEntryTarget(null)}
          userId={entryTarget.userId}
          orderId={null}
          reportId={null}
          externalReportId={entryTarget.report.id}
          productCodes={entryTarget.report.product_codes || []}
          collectionDate={entryTarget.report.collected_on}
          onSaved={() => { setEntryTarget(null); void loadData(); }}
        />
      )}

      {uploadTarget && user && (
        <ExternalTestDialog
          open
          onClose={() => setUploadTarget(null)}
          userId={uploadTarget.userId}
          recommendationId={uploadTarget.recommendationId}
          productCodes={uploadTarget.productCodes}
          startAtUpload
          uploadedBy={user.id}
          onDone={() => { void loadData(); }}
        />
      )}

      <LabTestParametersDialog open={!!paramsTest} onOpenChange={(o) => !o && setParamsTest(null)} testId={paramsTest?.id ?? null} testName={paramsTest?.product_name ?? null} productCode={paramsTest?.product_code ?? null} />
    </div>
  );
}
