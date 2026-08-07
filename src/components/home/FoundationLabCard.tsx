import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FlaskConical, ChevronRight, X, Activity, Heart, Droplet, Beaker } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import LabHistorySection from "@/components/lab/LabHistorySection";
import ThyrocarePoweredBy from "@/components/lab/ThyrocarePoweredBy";
import LabBookingDialog from "@/components/lab/LabBookingDialog";
import { LabTestParametersDialog } from "@/components/lab/LabTestParametersDialog";
import { patientPriceFor, useLabTestMarkup } from "@/lib/labTestMarkup";

interface Props {
  userId: string;
}

type KeyMarker = { code: string; label: string; value: number; unit: string; status: string; icon: any };

/**
 * Foundation-tier "Day-1 lab" card shown on Home.
 *
 * • Before any results exist  → urges the user to book BBDO Basic (their baseline).
 * • Once at least one result exists → shows a tap-through to the full Body
 *   Investigation Map + marker deltas so month-over-month improvements are visible.
 */
export default function FoundationLabCard({ userId }: Props) {
  const [hasResults, setHasResults] = useState<boolean | null>(null);
  const [hasCompletedOrder, setHasCompletedOrder] = useState(false);
  const [markers, setMarkers] = useState<KeyMarker[]>([]);
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [basicCode, setBasicCode] = useState<string | null>(null);
  const [basicPrice, setBasicPrice] = useState<{ price: number; original: number } | null>(null);
  const [basicId, setBasicId] = useState<string | null>(null);
  const [basicName, setBasicName] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [booking, setBooking] = useState(false);
  const markupPct = useLabTestMarkup();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [resultsRes, ordersRes] = await Promise.all([
        supabase
          .from("lab_results" as any)
          .select("parameter_code, parameter_name, value_numeric, unit, status, observed_at")
          .eq("user_id", userId)
          .order("observed_at", { ascending: false }),
        supabase
          .from("thyrocare_orders" as any)
          .select("status, collection_date, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      const rows = ((resultsRes.data as any) || []) as any[];
      const orders = ((ordersRes.data as any) || []) as any[];
      const doneStatuses = new Set(["done", "completed", "report_ready", "reports_ready", "partially_ready", "ready", "in_lab", "processing", "sample_collected", "sample_received"]);
      const completed = orders.find((o) => doneStatuses.has((o.status || "").toLowerCase()));
      setHasCompletedOrder(!!completed);
      setHasResults(rows.length > 0);
      if (rows.length > 0) {
        setReportDate(rows[0].observed_at);
        // Pick 4 key markers for the home tile
        const priority = ["FBS", "HBA1C", "LDL", "SCRE"];
        const iconMap: Record<string, any> = { FBS: Droplet, HBA1C: Activity, LDL: Heart, SCRE: Beaker };
        const labelMap: Record<string, string> = { FBS: "Blood Sugar", HBA1C: "HbA1c", LDL: "LDL", SCRE: "Creatinine" };
        const pick: KeyMarker[] = [];
        for (const code of priority) {
          const r = rows.find((x) => x.parameter_code === code);
          if (r && r.value_numeric != null) {
            pick.push({
              code,
              label: labelMap[code] || r.parameter_name,
              value: Number(r.value_numeric),
              unit: r.unit || "",
              status: r.status || "normal",
              icon: iconMap[code] || Activity,
            });
          }
        }
        setMarkers(pick);
      } else if (completed) {
        setReportDate(completed.collection_date || completed.created_at);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);


  // Resolve the BBDO Basic product_code so we can open the booking dialog on Home.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("thyrocare_tests" as any)
        .select("id, product_code, product_name, offer_rate, rate, markup_pct, foundation_default")
        .eq("is_active", true);
      const list = ((data as any) || []) as { id: string; product_code: string; product_name: string; offer_rate: number | null; rate: number | null; markup_pct: number | null; foundation_default?: boolean | null }[];
      // Pin the BBDO package explicitly — never fuzzy-match "BASIC", which also
      // hits unrelated Thyrocare products (e.g. "WOMEN BASIC PROFILE").
      const basic =
        list.find((t) => t.foundation_default === true) ||
        list.find((t) => t.product_code === "PROJ1062518") ||
        list.find((t) => (t.product_name || "").toUpperCase().startsWith("BYE BYE BASIC"));
      if (!cancelled && basic) {
        setBasicCode(basic.product_code);
        setBasicId(basic.id);
        setBasicName(basic.product_name);
        const price = patientPriceFor(basic.offer_rate ?? basic.rate, basic.markup_pct, markupPct) ?? 0;
        const original = Number(basic.rate || 0);
        setBasicPrice({ price, original });
      }
    })();
    return () => { cancelled = true; };
  }, [markupPct]);

  const openBooking = () => {
    if (!basicCode) return;
    setBooking(true);
  };

  if (hasResults === null) return null;


  return (
    <>
      {hasResults ? (
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="w-full text-left rounded-2xl p-4 text-white shadow-card relative overflow-hidden active:scale-[0.99] transition-transform"
          style={{ background: "var(--bbdo-gradient)" }}
        >
          <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/80">
                Your health profile
              </p>
              <h3 className="text-sm font-black leading-tight mt-0.5">
                Baseline report ready
              </h3>
              {reportDate && (
                <p className="text-[10px] text-white/75 mt-0.5">
                  {new Date(reportDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-white/90 shrink-0 mt-1" />
          </div>
          {markers.length > 0 && (
            <div className="relative grid grid-cols-2 gap-1.5">
              {markers.map((m) => {
                const Icon = m.icon;
                const bad = m.status === "high" || m.status === "low";
                return (
                  <div key={m.code} className="rounded-xl bg-white/15 backdrop-blur px-2 py-1.5 ring-1 ring-white/20 min-w-0">
                    <div className="flex items-center gap-1 text-white/80 text-[9px] font-bold uppercase tracking-wider">
                      <Icon className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-sm font-black leading-none">{m.value}</span>
                      <span className="text-[9px] text-white/70 truncate">{m.unit}</span>
                      <span className={`ml-auto text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${bad ? "bg-amber-300 text-amber-900" : "bg-emerald-300 text-emerald-900"}`}>
                        {bad ? m.status : "OK"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="relative mt-3 flex items-center gap-1.5 text-[11px] font-bold text-white/95">
            Tap for body map & trends
            <ChevronRight className="w-3 h-3" />
          </div>
        </motion.button>
      ) : hasCompletedOrder ? (
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="w-full text-left rounded-2xl p-4 text-white shadow-card relative overflow-hidden active:scale-[0.99] transition-transform"
          style={{ background: "var(--bbdo-gradient)" }}
        >
          <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/80">
                Your health profile
              </p>
              <h3 className="text-sm font-black leading-tight mt-0.5">
                Your BBDO Basic test is done
              </h3>
              {reportDate && (
                <p className="text-[10px] text-white/75 mt-0.5">
                  Collected {new Date(reportDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
              <p className="text-[11px] text-white/85 mt-2 leading-snug">
                Your report is syncing. Health markers will unlock automatically once the lab publishes the PDF.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-white/90 shrink-0 mt-1" />
          </div>
          <div className="relative mt-3 flex items-center gap-1.5 text-[11px] font-bold text-white/95">
            View booking & report status
            <ChevronRight className="w-3 h-3" />
          </div>
        </motion.button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="liquid-glass rounded-3xl p-5 ring-1 ring-[var(--bbdo-red)]/30"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--bbdo-red)" }}>
                <FlaskConical className="w-4 h-4 text-white" strokeWidth={2} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] truncate" style={{ color: "var(--bbdo-red)" }}>
                Day-1 essential
              </p>
            </div>
            <ThyrocarePoweredBy variant="dark" />
          </div>
          <h3 className="text-lg font-black text-foreground leading-tight">
            Book your BBDO Basic lab test
          </h3>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            This first test helps personalise your plan. Once your report is ready, your Health Profile and body map will unlock on Home.
          </p>
          {basicPrice && basicPrice.price > 0 && (
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Your price</p>
              <p className="text-lg font-black text-foreground tabular-nums">
                ₹{basicPrice.price.toLocaleString("en-IN")}
              </p>
              {basicPrice.original > basicPrice.price && (
                <p className="text-xs text-muted-foreground line-through">
                  ₹{basicPrice.original.toLocaleString("en-IN")}
                </p>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openBooking}
              disabled={!basicCode}
              className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-60"
              style={{ background: "var(--bbdo-red)" }}
            >
              {basicPrice && basicPrice.price > 0
                ? `Book for ₹${basicPrice.price.toLocaleString("en-IN")}`
                : "Book lab test"}
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              disabled={!basicId}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold border border-border bg-background text-foreground active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              View details
            </button>
          </div>
        </motion.div>
      )}


      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 bg-background overflow-y-auto"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="max-w-3xl mx-auto px-4 md:px-6 pt-[max(env(safe-area-inset-top),0.75rem)] pb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Health Profile</p>
                  <h2 className="text-xl font-black">Your body map</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <LabHistorySection userId={userId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <LabBookingDialog
        open={booking}
        onClose={() => setBooking(false)}
        productCodes={basicCode ? [basicCode] : []}
        onBooked={() => setHasResults((v) => v)}
      />

      <LabTestParametersDialog
        open={showDetails}
        onOpenChange={setShowDetails}
        testId={basicId}
        testName={basicName}
        productCode={basicCode}
      />
    </>
  );
}

