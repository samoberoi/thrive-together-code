import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FlaskConical, Check, Home, Clock, Eye, Upload, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { patientPriceFor, useLabTestMarkup } from "@/lib/labTestMarkup";
import LabOrderDetails from "@/components/lab/LabOrderDetails";
import ThyrocarePoweredBy from "@/components/lab/ThyrocarePoweredBy";
import LabBookingDialog from "@/components/lab/LabBookingDialog";
import ExternalTestDialog from "@/components/lab/ExternalTestDialog";
import LabHistorySection from "@/components/lab/LabHistorySection";
import {
  fetchExternalReportsForUser,
  externalReportUrl,
  type ExternalLabReport,
} from "@/lib/externalLabService";


type Rec = {
  id: string;
  product_codes: string[];
  notes: string | null;
  status: string;
  recommended_at: string;
  external_intent?: boolean | null;
  external_note?: string | null;
};


type Order = {
  id: string;
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


type IncludedTest = { code?: string; name?: string; groupName?: string };
type Test = { product_code: string; product_name: string; offer_rate: number | null; rate: number | null; markup_pct: number | null; fasting_required?: boolean | null; parameters_count?: number | null; description?: string | null; raw_data?: any };

function titleCaseStatus(value?: string | null) {
  if (!value) return "Not yet booked";
  const normalized = value.replace(/_/g, " ").trim().toLowerCase();
  if (["pending", "viewed", "recommended"].includes(normalized)) return "Not yet booked";
  if (normalized === "booked" || normalized === "created") return "Booked";
  if (["done", "completed", "report ready", "reports ready"].includes(normalized)) return "Results ready";
  return normalized.replace(/\b\w/g, (m) => m.toUpperCase());
}

function orderDisplayStatus(order?: Order, recStatus?: string) {
  if (!order) return titleCaseStatus(recStatus);
  const raw = order.raw_response?.data || order.raw_response || {};
  return titleCaseStatus(raw.statusText || raw.statusDescription || raw.status || order.status || recStatus);
}

export default function PatientLabTests({ alwaysShow = false, foundationMode = false }: { alwaysShow?: boolean; foundationMode?: boolean } = {}) {
  const { user } = useAuth();
  const markupPct = useLabTestMarkup();
  const [recs, setRecs] = useState<Rec[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersByRec, setOrdersByRec] = useState<Record<string, Order>>({});
  const [testsByCode, setTestsByCode] = useState<Record<string, Test>>({});
  const [reports, setReports] = useState<any[]>([]);
  const [foundationTests, setFoundationTests] = useState<Test[]>([]);
  const [detailsTest, setDetailsTest] = useState<Test | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookingRec, setBookingRec] = useState<Rec | null>(null);
  const [extReports, setExtReports] = useState<ExternalLabReport[]>([]);
  const [externalRec, setExternalRec] = useState<{ rec: Rec; startAtUpload: boolean } | null>(null);

  const reloadExternal = async () => {
    if (!user) return;
    setExtReports(await fetchExternalReportsForUser(user.id));
  };

  const reloadRecs = async () => {
    if (!user) return;
    const { data } = await supabase.from("thyrocare_recommendations" as any)
      .select("id, product_codes, notes, status, recommended_at, external_intent, external_note")
      .eq("user_id", user.id).order("recommended_at", { ascending: false });
    setRecs(((data as any) || []) as Rec[]);
  };

  const openExternalReport = async (r: ExternalLabReport) => {
    const url = await externalReportUrl(r.file_path);
    if (!url) { toast.error("Couldn't open the report"); return; }
    window.open(url, "_blank", "noopener");
  };

  useEffect(() => {
    if (!user) {
      setLoadError(null);
      setLoading(false);
      return;
    }
    void reloadExternal();
    (async () => {
      try {
        setLoadError(null);
        const [r, rep, ord, prof] = await Promise.all([
          supabase.from("thyrocare_recommendations" as any)
            .select("id, product_codes, notes, status, recommended_at, external_intent, external_note")
            .eq("user_id", user.id).order("recommended_at", { ascending: false }),

          supabase.from("thyrocare_reports" as any)
            .select("id, report_url, report_type, delivered_at, order_id, parameters")
            .eq("user_id", user.id).order("delivered_at", { ascending: false }),
          supabase.from("thyrocare_orders" as any)
            .select("id, recommendation_id, product_codes, thyrocare_order_id, thyrocare_lead_id, status, status_detail, beneficiary_name, beneficiary_age, beneficiary_gender, mobile, email, pincode, address, collection_date, collection_slot, amount, raw_response, created_at")
            .eq("user_id", user.id).order("created_at", { ascending: false }),

          supabase.from("profiles")
            .select("name, phone, age, gender, birth_date, pincode, address_line1, address_line2, city, state")
            .eq("user_id", user.id).maybeSingle(),
        ]);
        const firstError = r.error || rep.error || ord.error || prof.error;
        if (firstError) throw firstError;
        const list = ((r.data as any) || []) as Rec[];
        const rawOrders = (((ord.data as any) || []) as Order[]);
        // Only show real, active orders (hide failed/cancelled and orders that never got a Thyrocare ID)
        const orderList = rawOrders.filter(
          (o) => !!o.thyrocare_order_id && !["failed", "cancelled"].includes((o.status || "").toLowerCase()),
        );
        setRecs(list);
        setOrders(orderList);
        setReports((rep.data as any) || []);
        const orderMap: Record<string, Order> = {};
        for (const o of orderList) {
          if (o.recommendation_id && !orderMap[o.recommendation_id]) orderMap[o.recommendation_id] = o;
        }
        setOrdersByRec(orderMap);

        // Refresh live status, then auto-fetch reports for any "done" orders
        const liveOrders = orderList.filter((o) => o.thyrocare_order_id);
        if (liveOrders.length) {
          Promise.all(
            liveOrders.map((o) =>
              supabase.functions.invoke("thyrocare-api", {
                body: { action: "order_status", thyrocare_order_id: o.thyrocare_order_id },
              }).catch(() => null),
            ),
          ).then(async () => {
            const { data: o2 } = await supabase.from("thyrocare_orders" as any)
              .select("id, recommendation_id, product_codes, thyrocare_order_id, thyrocare_lead_id, status, status_detail, beneficiary_name, beneficiary_age, beneficiary_gender, mobile, email, pincode, address, collection_date, collection_slot, amount, raw_response, created_at")
              .eq("user_id", user.id).order("created_at", { ascending: false });
            const refreshedRaw = (((o2 as any) || []) as Order[]);
            const refreshedOrders = refreshedRaw.filter(
              (o) => !!o.thyrocare_order_id && !["failed", "cancelled"].includes((o.status || "").toLowerCase()),
            );
            const map2: Record<string, Order> = {};
            for (const o of refreshedOrders) {
              if (o.recommendation_id && !map2[o.recommendation_id]) map2[o.recommendation_id] = o;
            }
            setOrders(refreshedOrders);
            setOrdersByRec(map2);

            const doneOrders = refreshedOrders.filter((o) => {
              const raw = o.raw_response || {};
              const rawStatus = String(raw.orderStatus || raw.status || "").toLowerCase();
              const reportReady = raw?.orderOptions?.isReportReady === true || raw?.patients?.some?.((p: any) => p?.isReportAvailable === true);
              return reportReady || ["done", "completed", "report_ready", "reports_ready"].includes((o.status || rawStatus).toLowerCase());
            });
            if (doneOrders.length) {
              await Promise.all(
                doneOrders.map((o) =>
                  supabase.functions.invoke("thyrocare-api", {
                    body: {
                      action: "fetch_report",
                      thyrocare_order_id: o.thyrocare_order_id,
                      thyrocare_lead_id: o.thyrocare_lead_id,
                    },
                  }).catch(() => null),
                ),
              );
              const { data: rep2 } = await supabase.from("thyrocare_reports" as any)
                .select("id, report_url, report_type, delivered_at, order_id, parameters")
                .eq("user_id", user.id).order("delivered_at", { ascending: false });
              setReports((rep2 as any) || []);
            }
          }).catch(() => {});
        }


        const codes = Array.from(new Set([
          ...list.flatMap((x) => x.product_codes || []),
          ...orderList.flatMap((x) => x.product_codes || []),
        ]));
        if (codes.length) {
          const { data: tt } = await supabase
            .from("thyrocare_tests" as any)
            .select("product_code, product_name, offer_rate, rate, markup_pct, fasting_required, parameters_count, description, raw_data")
            .in("product_code", codes);
          const map: Record<string, Test> = {};
          for (const t of ((tt as any) || []) as Test[]) map[t.product_code] = t;
          setTestsByCode(map);
        }
        // Profile prefill is handled inside LabBookingDialog.

      } catch (e) {
        console.error("[PatientLabTests] load failed", e);
        setLoadError(e instanceof Error ? e.message : "Couldn't load lab tests.");
        toast.error("Couldn't load lab tests. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Load Foundation Essentials (3 default tests) when in foundationMode
  useEffect(() => {
    if (!foundationMode) return;
    (async () => {
      const { data } = await supabase
        .from("thyrocare_tests" as any)
        .select("product_code, product_name, offer_rate, rate, markup_pct, fasting_required, parameters_count, description, raw_data")
        .eq("is_active", true);
      const raw = ((data as any) || []) as Test[];
      // Order: BASIC → PLUS → ADVANCED
      const rank = (n: string) => {
        const s = (n || "").toUpperCase();
        if (s.includes("BASIC")) return 0;
        if (s.includes("PLUS")) return 1;
        if (s.includes("ADVANCED")) return 2;
        return 99;
      };
      const list = [...raw].sort((a, b) => rank(a.product_name) - rank(b.product_name));
      setFoundationTests(list);
      setTestsByCode((prev) => {
        const next = { ...prev };
        for (const t of list) next[t.product_code] = t;
        return next;
      });
    })();
  }, [foundationMode]);


  // Booking / pincode / slot / submit logic lives in LabBookingDialog.


  if (loading) return <div className="p-4 text-muted-foreground text-sm">Loading…</div>;

  if (!user) {
    return alwaysShow ? (
      <div className="liquid-glass rounded-2xl p-6 text-center space-y-2">
        <FlaskConical className="w-8 h-8 text-primary mx-auto" />
        <h3 className="text-base font-black">Sign in to view lab tests</h3>
        <p className="text-sm text-muted-foreground">Your bookings, OTP, technician details and reports will appear here.</p>
      </div>
    ) : null;
  }

  if (loadError) {
    return (
      <div className="liquid-glass rounded-2xl p-6 text-center space-y-2">
        <FlaskConical className="w-8 h-8 text-primary mx-auto" />
        <h3 className="text-base font-black">Lab tests could not load</h3>
        <p className="text-sm text-muted-foreground">{loadError}</p>
      </div>
    );
  }

  const orphanOrdersAll = orders.filter((order) => !order.recommendation_id || !recs.some((rec) => rec.id === order.recommendation_id));
  // In foundationMode, the BBDO Basic done state is already surfaced in the hero above.
  // Hide the duplicate raw order card to keep the Labs screen clean.


  const startFoundationBooking = (test: Test) => {
    setBookingRec({
      id: "",
      product_codes: [test.product_code],
      notes: null,
      status: "pending",
      recommended_at: new Date().toISOString(),
    } as Rec);
  };

  const tierBadge = (name: string) => {
    const s = (name || "").toUpperCase();
    if (s.includes("BASIC")) return { label: "Starter", tone: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" };
    if (s.includes("PLUS")) return { label: "Most Popular", tone: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" };
    if (s.includes("ADVANCED")) return { label: "Comprehensive", tone: "bg-primary/10 text-primary ring-1 ring-primary/20" };
    return { label: "Panel", tone: "bg-muted text-muted-foreground ring-1 ring-border" };
  };

  const basicTest = foundationTests.find((t) => (t.product_name || "").toUpperCase().includes("BASIC"));
  const otherTests = foundationTests.filter((t) => t !== basicTest);

  const doneStatuses = new Set(["done", "completed", "report_ready", "reports_ready", "partially_ready", "ready", "in_lab", "processing", "sample_collected", "sample_received"]);
  const basicOrder = basicTest
    ? orders.find((o) => (o.product_codes || []).includes(basicTest.product_code) && doneStatuses.has((o.status || "").toLowerCase()))
    : undefined;
  const basicReports = basicOrder ? reports.filter((r: any) => r.order_id === basicOrder.id) : [];
  const basicReportReady = basicReports.some((r: any) => !!r.report_url);

  const renderPriceRow = (t: Test) => {
    const price = patientPriceFor(t.offer_rate ?? t.rate, t.markup_pct, markupPct) ?? 0;
    const original = Number(t.rate || 0);
    const showStrike = original > price && price > 0;
    return { price, original, showStrike };
  };


  const FoundationStrip = foundationMode && foundationTests.length > 0 ? (
    <div className="space-y-5">


      {basicTest && basicOrder ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-3xl p-5 md:p-6 pt-6 text-white shadow-lift overflow-hidden"
          style={{ background: "var(--bbdo-gradient)" }}
        >
          <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide text-[var(--bbdo-red)] bg-white shadow">
              <Check className="w-3 h-3" /> TEST DONE
            </div>
            <ThyrocarePoweredBy variant="light" />
          </div>
          <div className="relative mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">Your baseline</p>
            <h4 className="text-lg md:text-xl font-black leading-tight mt-1">Your BBDO Basic test is done</h4>
            <p className="text-[12px] text-white/85 mt-1.5 leading-snug">
              {basicReportReady
                ? "Your report is ready. Tap View report to open the PDF."
                : "Your sample has been processed. The report PDF is syncing from the lab — usually within a few hours."}
            </p>
          </div>
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
              <FlaskConical className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h5 className="text-base font-black leading-tight truncate">{basicTest.product_name}</h5>
              <p className="text-[11px] text-white/85 mt-0.5 font-mono truncate">
                Order · {basicOrder.thyrocare_order_id || basicOrder.id.slice(0, 8)}
              </p>
            </div>
            {basicReportReady && basicReports[0]?.report_url && (
              <Button size="sm" className="h-9 font-bold bg-white text-[var(--bbdo-red)] hover:bg-white/90 shrink-0" asChild>
                <a href={basicReports[0].report_url!} target="_blank" rel="noreferrer">
                  <Eye className="w-3.5 h-3.5 mr-1" /> View report
                </a>
              </Button>
            )}
          </div>
        </motion.div>
      ) : basicTest && (() => {
        const { price, original, showStrike } = renderPriceRow(basicTest);
        const count = basicTest.parameters_count || (Array.isArray(basicTest?.raw_data?.testsIncluded) ? basicTest.raw_data.testsIncluded.length : 0);
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-3xl p-5 md:p-6 pt-6 text-white shadow-lift overflow-hidden"
            style={{ background: "var(--bbdo-gradient)" }}
          >
            <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
            <div className="relative flex items-start justify-between gap-3 flex-wrap mb-3">
              <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide text-[var(--bbdo-red)] bg-white shadow">
                RECOMMENDED · START HERE
              </div>
              <ThyrocarePoweredBy variant="light" />
            </div>
            <div className="relative mb-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">Day-1 essential</p>
              <h4 className="text-lg md:text-xl font-black leading-tight mt-1">Book your BBDO Basic lab test</h4>
            </div>
            <div className="relative flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                  <FlaskConical className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">Recommended test</p>
                  <h5 className="text-base md:text-lg font-black leading-tight">{basicTest.product_name}</h5>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-white/85">
                    {count > 0 && <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> {count} parameters</span>}
                    <span className="inline-flex items-center gap-1"><Home className="w-3 h-3" /> Free home collection</span>
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {basicTest.fasting_required ? "8–10 hr fasting" : "No fasting"}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl md:text-3xl font-black">{price > 0 ? `₹${price.toLocaleString("en-IN")}` : "—"}</span>
                  {showStrike && <span className="text-xs text-white/70 line-through">₹{original.toLocaleString("en-IN")}</span>}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" className="h-9 bg-white/15 text-white border-white/30 hover:bg-white/25" onClick={() => setDetailsTest(basicTest)}>
                    <Eye className="w-3.5 h-3.5 mr-1" /> Details
                  </Button>
                  <Button size="sm" className="h-9 font-bold bg-white text-[var(--bbdo-red)] hover:bg-white/90" onClick={() => startFoundationBooking(basicTest)}>
                    Book now
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })()}


      {otherTests.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground px-1">
            {basicOrder ? "Other tests available" : "Also available (for later)"}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {otherTests.map((t, idx) => {
              const { price, original, showStrike } = renderPriceRow(t);
              const count = t.parameters_count || (Array.isArray(t?.raw_data?.testsIncluded) ? t.raw_data.testsIncluded.length : 0);
              return (
                <motion.div
                  key={t.product_code}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-2xl p-4 bg-card/60 ring-1 ring-border flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black tracking-tight leading-tight break-words">{t.product_name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {count > 0 ? `${count} parameters` : "Curated panel"} · {t.fasting_required ? "fasting" : "no fasting"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-black tabular-nums">{price > 0 ? `₹${price.toLocaleString("en-IN")}` : "—"}</p>
                      {showStrike && <p className="text-[10px] text-muted-foreground line-through">₹{original.toLocaleString("en-IN")}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDetailsTest(t)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> Details
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => startFoundationBooking(t)}>
                      Book
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  ) : null;

  const orphanOrders = foundationMode
    ? orphanOrdersAll.filter((o) => !(basicTest && (o.product_codes || []).includes(basicTest.product_code)))
    : orphanOrdersAll;

  if (recs.length === 0 && reports.length === 0 && orphanOrders.length === 0 && !foundationMode) {

    if (!alwaysShow) return null;
    return (
      <div className="liquid-glass rounded-2xl p-6 text-center space-y-2">
        <FlaskConical className="w-8 h-8 text-primary mx-auto" />
        <h3 className="text-base font-black">Awaiting your coach</h3>
        <p className="text-sm text-muted-foreground">
          Your coach will review your health assessment and recommend the right lab panels for your plan. You'll see them here as soon as they're assigned.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {FoundationStrip}
      {recs.length > 0 && !foundationMode && (
        <div className="flex items-center gap-2 px-1">
          <FlaskConical className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-wide">Recommended Lab Tests</h3>
        </div>
      )}

      {recs.map((r) => {
        const items = (r.product_codes || []).map((c) => testsByCode[c]).filter(Boolean);
        const priceOf = (t: Test) => patientPriceFor(t.offer_rate ?? t.rate, t.markup_pct, markupPct) ?? 0;
        const total = items.reduce((s, t) => s + priceOf(t), 0);
        const order = ordersByRec[r.id];
        const displayStatus = !order && r.external_intent ? "Doing it outside" : orderDisplayStatus(order, r.status);
        return (

          <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="liquid-glass rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {new Date(r.recommended_at).toLocaleDateString()}
              </div>
              <Badge variant={order || r.status === "booked" ? "default" : "secondary"} className="text-[10px]">
                {displayStatus}
              </Badge>
            </div>
            <ul className="space-y-2">
              {items.map((t, i) => {
                const count = t.parameters_count || (Array.isArray(t?.raw_data?.testsIncluded) ? t.raw_data.testsIncluded.length : 0);
                return (
                  <li key={i} className="rounded-xl bg-muted/40 ring-1 ring-border p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-tight break-words">{t.product_name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {count > 0 ? `${count} parameters` : "Curated panel"} · {t.fasting_required ? "fasting" : "no fasting"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-black tabular-nums">{priceOf(t) > 0 ? `₹${priceOf(t).toLocaleString("en-IN")}` : "-"}</span>
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDetailsTest(t)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Details
                      </Button>
                    </div>
                  </li>
                );
              })}
              {(r.product_codes || []).filter((c) => !testsByCode[c]).map((c) => (
                <li key={c} className="text-sm text-muted-foreground">{c}</li>
              ))}
            </ul>
            {r.notes && (
              <div className="text-xs text-muted-foreground italic border-l-2 border-primary pl-2">
                {r.notes}
              </div>
            )}
            {order && (
              <LabOrderDetails
                order={order}
                fastingRequired={items.some((t) => t.fasting_required)}
                reports={reports.filter((rep: any) => rep.order_id === order.id)}
                userId={user?.id}
              />
            )}

            {(() => {
              const recExt = extReports.filter((x) => x.recommendation_id === r.id);
              if (!r.external_intent && recExt.length === 0) return null;
              return (
                <div className="rounded-2xl bg-[var(--bbdo-blue,#2563eb)]/5 ring-1 ring-primary/15 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4 text-primary shrink-0" />
                    <p className="text-xs font-black">Getting this done outside</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {recExt.length === 0
                      ? "Your coach knows you're using your own lab. Upload the report here once you have it and we'll turn it into your charts."
                      : recExt.some((x) => x.status === "reviewed")
                        ? "Your report values are in — scroll down to your markers and body map to see the graphs."
                        : "Report received. Your coach is reviewing it and will add the values shortly."}
                  </p>
                  {recExt.map((x) => (
                    <button
                      key={x.id}
                      onClick={() => openExternalReport(x)}
                      className="w-full flex items-center gap-2 rounded-xl bg-background/70 ring-1 ring-border p-2.5 text-left"
                    >
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold truncate">{x.file_name || "Report"}</span>
                        <span className="block text-[10px] text-muted-foreground truncate">
                          {x.lab_name ? `${x.lab_name} · ` : ""}
                          {x.status === "reviewed" ? "Values added" : "Awaiting coach review"}
                        </span>
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-9 text-xs font-bold"
                    onClick={() => setExternalRec({ rec: r, startAtUpload: true })}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload report
                  </Button>
                </div>
              );
            })()}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-sm font-black">Total ₹{total.toFixed(0)}</div>
              {r.status !== "booked" && !order && (
                <div className="flex items-center gap-2">
                  {!r.external_intent && (
                    <Button size="sm" variant="outline" onClick={() => setExternalRec({ rec: r, startAtUpload: false })}>
                      <Home className="w-3.5 h-3.5 mr-1.5" /> Doing it outside
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setBookingRec(r)}>Book this test</Button>
                </div>
              )}
            </div>

          </motion.div>
        );
      })}

      {orphanOrders.map((order) => {
        const codes = order.product_codes || [];
        const items = codes.map((c) => testsByCode[c]).filter(Boolean);
        const priceOf = (t: Test) => patientPriceFor(t.offer_rate ?? t.rate, t.markup_pct, markupPct) ?? 0;
        const total = order.amount ?? items.reduce((s, t) => s + priceOf(t), 0);
        return (
          <motion.div key={order.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="liquid-glass rounded-2xl p-4 space-y-3">
            <ul className="space-y-1">
              {items.map((t, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span>{t.product_name}</span>
                  <span className="text-muted-foreground">{priceOf(t) > 0 ? `₹${priceOf(t).toLocaleString("en-IN")}` : "-"}</span>
                </li>
              ))}
              {codes.filter((c) => !testsByCode[c]).map((c) => (
                <li key={c} className="text-sm text-muted-foreground">{c}</li>
              ))}
            </ul>
            <LabOrderDetails
              order={order}
              fastingRequired={items.some((t) => t.fasting_required)}
              reports={reports.filter((rep: any) => rep.order_id === order.id)}
              userId={user?.id}
            />
            <div className="text-sm font-black">Total ₹{Number(total || 0).toFixed(0)}</div>
          </motion.div>
        );
      })}


      {user && (() => {
        const markerCodes = Array.from(new Set([
          ...recs.flatMap((r) => r.product_codes || []),
          ...orders.flatMap((o) => o.product_codes || []),
          ...extReports.flatMap((x) => x.product_codes || []),
        ]));
        if (!markerCodes.length && reports.length === 0) return null;
        return (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 px-1">
              <FlaskConical className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-black uppercase tracking-wide">Your markers</h3>
            </div>
            <LabHistorySection userId={user.id} expectedProductCodes={markerCodes} />
          </div>
        );
      })()}

      <LabBookingDialog
        open={!!bookingRec}
        onClose={() => setBookingRec(null)}
        productCodes={bookingRec?.product_codes || []}
        recommendationId={bookingRec?.id || null}
        onBooked={async () => {
          if (!user) return;
          const [{ data: r }, { data: o }] = await Promise.all([
            supabase.from("thyrocare_recommendations" as any)
              .select("id, product_codes, notes, status, recommended_at, external_intent, external_note")
              .eq("user_id", user.id).order("recommended_at", { ascending: false }),
            supabase.from("thyrocare_orders" as any)
              .select("id, recommendation_id, product_codes, thyrocare_order_id, thyrocare_lead_id, status, status_detail, beneficiary_name, beneficiary_age, beneficiary_gender, mobile, email, pincode, address, collection_date, collection_slot, amount, raw_response, created_at")
              .eq("user_id", user.id).order("created_at", { ascending: false }),
          ]);
          setRecs(((r as any) || []) as Rec[]);
          setOrders(((o as any) || []) as Order[]);
          const orderMap: Record<string, Order> = {};
          for (const ox of (((o as any) || []) as Order[])) {
            if (ox.recommendation_id && !orderMap[ox.recommendation_id]) orderMap[ox.recommendation_id] = ox;
          }
          setOrdersByRec(orderMap);
        }}
      />

      {user && externalRec && (
        <ExternalTestDialog
          open
          onClose={() => setExternalRec(null)}
          userId={user.id}
          recommendationId={externalRec.rec.id || null}
          productCodes={externalRec.rec.product_codes || []}
          startAtUpload={externalRec.startAtUpload}
          onDone={async () => { await Promise.all([reloadRecs(), reloadExternal()]); }}
        />
      )}




      <Dialog open={!!detailsTest} onOpenChange={(o) => !o && setDetailsTest(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-primary" />
              {detailsTest?.product_name}
            </DialogTitle>
            <DialogDescription>
              {detailsTest?.fasting_required ? "Fasting required (8–10 hours). " : "No fasting required. "}
              Home sample collection included.
            </DialogDescription>
          </DialogHeader>
          {detailsTest && (() => {
            const price = patientPriceFor(detailsTest.offer_rate ?? detailsTest.rate, detailsTest.markup_pct, markupPct) ?? 0;
            const original = Number(detailsTest.rate || 0);
            const included: IncludedTest[] = Array.isArray(detailsTest?.raw_data?.testsIncluded) ? detailsTest.raw_data.testsIncluded : [];
            const groups: Record<string, IncludedTest[]> = {};
            for (const it of included) {
              const g = it.groupName || "Others";
              (groups[g] ||= []).push(it);
            }
            return (
              <div className="space-y-4">
                <div className="rounded-2xl p-4 text-white" style={{ background: "var(--bbdo-gradient)" }}>
                  <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/80">Your price</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-black">₹{price.toLocaleString("en-IN")}</p>
                    {original > price && (
                      <p className="text-sm line-through text-white/70">₹{original.toLocaleString("en-IN")}</p>
                    )}
                  </div>
                  <p className="text-xs text-white/85 mt-1">
                    {(detailsTest.parameters_count || included.length) > 0
                      ? `${detailsTest.parameters_count || included.length} parameters included`
                      : "Curated panel"}
                  </p>
                </div>

                {included.length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(groups).map(([g, items]) => (
                      <div key={g}>
                        <p className="text-[11px] font-black uppercase tracking-wide text-muted-foreground mb-1.5">{g}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((it, i) => (
                            <Badge key={i} variant="secondary" className="text-[11px] font-medium">
                              {it.name || it.code}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Detailed parameter list will appear here after the next sync.</p>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsTest(null)}>Close</Button>
            <Button onClick={() => { if (detailsTest) { startFoundationBooking(detailsTest); setDetailsTest(null); } }}>
              Buy now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
