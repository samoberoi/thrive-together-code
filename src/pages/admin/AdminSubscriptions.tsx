import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlanKey } from "@/lib/subscriptionService";
import { Search, ChevronRight, ArrowLeft, CreditCard, Sparkles, AlertCircle, Phone, Mail, Calendar, IndianRupee, Activity, MessageCircle } from "lucide-react";
import { whatsappCallUrl } from "@/lib/coachAvailability";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import DateRangeFilter, { defaultRange, allTimeRange, inRange, DateRange } from "@/components/admin/DateRangeFilter";
import AdminUserProfileSheet from "@/components/admin/AdminUserProfileSheet";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import ImportCsvButton from "@/components/admin/ImportCsvButton";

import { differenceInDays } from "date-fns";

interface Sub {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  plan_price: number;
  duration_months: number;
  status: string;
  started_at: string;
  expires_at: string;
  userName?: string;
  userPhone?: string;
  userEmail?: string;
  coachName?: string | null;
}

interface YogaSub {
  id: string;
  user_id: string;
  partner_id: string;
  package_id: string;
  package_type: string;
  price_inr: number;
  status: string;
  payment_status: string;
  starts_on: string;
  expires_on: string;
  created_at: string;
  userName?: string;
  userPhone?: string;
  partnerName?: string;
  packageName?: string;
}

interface PackageRow {
  plan_key: string;
  name: string;
  tagline: string | null;
  sort_order: number | null;
}

interface YogaPackageRow {
  id: string;
  name: string;
  partner_id: string;
  package_type: string;
  classes_per_month: number | null;
}

type ListFilter = "active" | "range" | "renewals";
type View =
  | { kind: "hub" }
  | { kind: "bbdo-plan"; planKey: string; planName: string }
  | { kind: "yoga-package"; packageId: string; packageName: string }
  | { kind: "list"; title: string; source: "all" | "bbdo" | "yoga"; filter: ListFilter };

const aliasPlanKey = (planId: string): string => normalizePlanKey(planId) ?? planId;


const planNumber = (planKey: string): string => {
  if (planKey === "foundation") return "Plan 1";
  if (planKey === "active") return "Plan 2";
  if (planKey === "intensive") return "Plan 3";
  return "Plan";
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const isYogaActive = (y: YogaSub) => y.status === "scheduled" && y.payment_status === "paid";
const isYogaPaid = (y: YogaSub) => y.payment_status === "paid";

export default function AdminSubscriptions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubs, setActiveSubs] = useState<Sub[]>([]);
  const [rangeSubs, setRangeSubs] = useState<Sub[]>([]);
  const [yogaActiveSubs, setYogaActiveSubs] = useState<YogaSub[]>([]);
  const [yogaRangeSubs, setYogaRangeSubs] = useState<YogaSub[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [yogaPackages, setYogaPackages] = useState<YogaPackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [view, setView] = useState<View>({ kind: "hub" });
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"bbdo" | "yoga">("bbdo");

  useEffect(() => { load(); }, [range]);

  useEffect(() => {
    const requestedTab = searchParams.get("subscriptionTab");
    if (requestedTab === "bbdo" || requestedTab === "yoga") setTab(requestedTab);

    const metric = searchParams.get("metric");
    const metricSource = requestedTab === "bbdo" || requestedTab === "yoga" ? requestedTab : "all";
    if (metric === "range_revenue") {
      setSearch("");
      setView({ kind: "list", title: `Revenue Sales · ${range.label}`, source: metricSource, filter: "range" });
      return;
    }
    if (metric === "active_revenue") {
      setSearch("");
      setView({ kind: "list", title: metricSource === "yoga" ? "Yoga Active Revenue" : metricSource === "bbdo" ? "BBDO Active Revenue" : "Active Revenue", source: metricSource, filter: "active" });
      return;
    }
    if (metric === "renewals") {
      setSearch("");
      setView({ kind: "list", title: "Renewals Due", source: metricSource, filter: "renewals" });
      return;
    }

    const requestedView = searchParams.get("view");
    if (requestedView === "bbdo-plan") {
      const planKey = searchParams.get("plan") || "foundation";
      const planName = packages.find((p) => p.plan_key === planKey)?.name || planKey;
      setSearch("");
      setView({ kind: "bbdo-plan", planKey, planName });
      return;
    }
    if (requestedView === "yoga-package") {
      const packageId = searchParams.get("package") || "";
      const packageName = yogaPackages.find((p) => p.id === packageId)?.name || "Yoga Package";
      setSearch("");
      setView({ kind: "yoga-package", packageId, packageName });
      return;
    }
    setView({ kind: "hub" });
  }, [searchParams, packages, yogaPackages, range.label]);

  const setRoute = (next: { subscriptionTab?: "bbdo" | "yoga"; view?: string; plan?: string; package?: string; metric?: string }) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "subscriptions");
    ["subscriptionTab", "view", "plan", "package", "metric"].forEach((key) => params.delete(key));
    if (next.subscriptionTab) params.set("subscriptionTab", next.subscriptionTab);
    if (next.view) params.set("view", next.view);
    if (next.plan) params.set("plan", next.plan);
    if (next.package) params.set("package", next.package);
    if (next.metric) params.set("metric", next.metric);
    setSearchParams(params);
  };

  const load = async () => {
    setLoading(true);
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();
    const [{ data: activeSubData }, { data: rangeSubData }, { data: yogaActiveData }, { data: yogaRangeData }, { data: pkgs }, { data: ypkgs }] = await Promise.all([
      supabase.from("subscriptions").select("*").eq("status", "active").order("expires_at", { ascending: true }),
      supabase.from("subscriptions").select("*").gte("started_at", fromIso).lte("started_at", toIso).order("started_at", { ascending: false }),
      (supabase as any).from("yoga_bookings").select("*").eq("status", "scheduled").eq("payment_status", "paid").order("expires_on", { ascending: true }),
      (supabase as any).from("yoga_bookings").select("*").eq("payment_status", "paid").gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false }),
      (supabase as any).from("packages").select("plan_key, name, tagline, sort_order").order("sort_order", { ascending: true }),
      (supabase as any).from("channel_partner_packages").select("id, name, partner_id, package_type, classes_per_month").eq("is_active", true),
    ]);

    const subRows = [...((activeSubData || []) as any[]), ...((rangeSubData || []) as any[])];
    const yogaRows = [...((yogaActiveData || []) as any[]), ...((yogaRangeData || []) as any[])];
    const userIds = [...new Set([...subRows.map((s) => s.user_id), ...yogaRows.map((y) => y.user_id)].filter(Boolean))];
    const partnerIds = [...new Set(yogaRows.map((y) => y.partner_id).filter(Boolean))];

    const [{ data: profiles }, { data: assignments }, { data: partners }] = await Promise.all([
      userIds.length ? supabase.from("profiles").select("user_id, name, phone, email").in("user_id", userIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? (supabase as any).from("coach_assignments").select("user_id, coach_id, is_active, coaches(name)").in("user_id", userIds).eq("is_active", true) : Promise.resolve({ data: [] as any[] }),
      partnerIds.length ? (supabase as any).from("channel_partners").select("id, business_name, name").in("id", partnerIds) : Promise.resolve({ data: [] as any[] }),
    ]);

    const pMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    const cMap = new Map((assignments || []).map((a: any) => [a.user_id, a.coaches?.name || null]));
    const partnerMap = new Map((partners || []).map((p: any) => [p.id, p.business_name || p.name]));
    const ypkgMap = new Map(((ypkgs as any[]) || []).map((p: any) => [p.id, p.name]));

    const enrichSub = (s: any): Sub => ({
      ...s,
      userName: pMap.get(s.user_id)?.name || "Unknown",
      userPhone: pMap.get(s.user_id)?.phone || "",
      userEmail: pMap.get(s.user_id)?.email || "",
      coachName: cMap.get(s.user_id) || null,
    });
    const enrichYoga = (y: any): YogaSub => ({
      ...y,
      userName: pMap.get(y.user_id)?.name || "Unknown",
      userPhone: pMap.get(y.user_id)?.phone || "",
      partnerName: partnerMap.get(y.partner_id) || "Instructor",
      packageName: ypkgMap.get(y.package_id) || "Yoga Package",
    });

    setActiveSubs(((activeSubData || []) as any[]).map(enrichSub));
    setRangeSubs(((rangeSubData || []) as any[]).map(enrichSub));
    setYogaActiveSubs(((yogaActiveData || []) as any[]).map(enrichYoga).filter(isYogaActive));
    setYogaRangeSubs(((yogaRangeData || []) as any[]).map(enrichYoga).filter(isYogaPaid));
    setPackages(((pkgs as any[]) || []) as PackageRow[]);
    setYogaPackages(((ypkgs as any[]) || []) as YogaPackageRow[]);
    setLoading(false);
  };

  const perPlan = useMemo(() => {
    const map = new Map<string, Sub[]>();
    for (const s of activeSubs) {
      const key = aliasPlanKey(s.plan_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [activeSubs]);

  const perYogaPkg = useMemo(() => {
    const map = new Map<string, YogaSub[]>();
    for (const y of yogaActiveSubs) {
      if (!map.has(y.package_id)) map.set(y.package_id, []);
      map.get(y.package_id)!.push(y);
    }
    return map;
  }, [yogaActiveSubs]);

  const bbdoActiveRevenue = activeSubs.reduce((s, x) => s + (x.plan_price || 0), 0);
  const bbdoRangeRevenue = rangeSubs.reduce((s, x) => s + (x.plan_price || 0), 0);
  const yogaActiveRevenue = yogaActiveSubs.reduce((s, y) => s + (y.price_inr || 0), 0);
  const yogaRangeRevenue = yogaRangeSubs.reduce((s, y) => s + (y.price_inr || 0), 0);
  const bbdoRenewals = activeSubs.filter((s) => {
    const days = differenceInDays(new Date(s.expires_at), new Date());
    return days >= 0 && days <= 30;
  });
  const yogaRenewals = yogaActiveSubs.filter((y) => {
    const days = differenceInDays(new Date(y.expires_on), new Date());
    return days >= 0 && days <= 15;
  });

  if (loading) {
    return <div className="p-6 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  const backToHub = () => setRoute({ subscriptionTab: tab });

  if (view.kind === "bbdo-plan") {
    const list = (perPlan.get(view.planKey) || []).filter((s) => {
      const q = search.toLowerCase();
      return !q || s.userName?.toLowerCase().includes(q) || s.userPhone?.includes(q) || s.coachName?.toLowerCase().includes(q);
    });
    const totalRev = list.reduce((sum, s) => sum + s.plan_price, 0);
    const withCoach = list.filter((s) => s.coachName).length;
    const renewingSoon = list.filter((s) => {
      const days = differenceInDays(new Date(s.expires_at), new Date());
      return days >= 0 && days <= 30;
    }).length;

    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <HeaderBack onBack={backToHub} title={`${planNumber(view.planKey)} · ${view.planName}`} subtitle={`${list.length} active subscriber${list.length === 1 ? "" : "s"} · ${inr(totalRev)} active revenue`} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Users" value={list.length} tone="primary" />
          <StatCard label="With Coach" value={withCoach} tone="emerald" />
          <StatCard label="Renewing ≤30d" value={renewingSoon} tone="amber" />
          <StatCard label="Active Revenue" value={inr(totalRev)} tone="purple" />
        </div>

        <SearchExport search={search} setSearch={setSearch} placeholder="Search user, phone, coach..." filename={`${view.planKey}-subscribers`} rows={list as any} />
        <div className="space-y-3">
          {list.map((s, i) => <BBDORow key={s.id} sub={s} index={i} />)}
          {list.length === 0 && <EmptyState label="No active subscribers in this plan" />}
        </div>
      </div>
    );
  }

  if (view.kind === "yoga-package") {
    const list = (perYogaPkg.get(view.packageId) || []).filter((y) => {
      const q = search.toLowerCase();
      return !q || y.userName?.toLowerCase().includes(q) || y.userPhone?.includes(q) || y.partnerName?.toLowerCase().includes(q);
    });
    const totalRev = list.reduce((s, y) => s + (y.price_inr || 0), 0);
    const renewingSoon = list.filter((y) => {
      const days = differenceInDays(new Date(y.expires_on), new Date());
      return days >= 0 && days <= 15;
    }).length;

    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <HeaderBack onBack={backToHub} title={view.packageName} subtitle={`${list.length} active yoga subscriber${list.length === 1 ? "" : "s"} · ${inr(totalRev)} active revenue`} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Active" value={list.length} tone="primary" />
          <StatCard label="Renewing ≤15d" value={renewingSoon} tone="amber" />
          <StatCard label="Active Revenue" value={inr(totalRev)} tone="purple" />
        </div>
        <SearchExport search={search} setSearch={setSearch} placeholder="Search user, phone, instructor..." filename={`yoga-${view.packageId}-subscribers`} rows={list as any} />
        <div className="space-y-3">
          {list.map((y, i) => <YogaRow key={y.id} sub={y} index={i} />)}
          {list.length === 0 && <EmptyState label="No active subscribers in this yoga package" />}
        </div>
      </div>
    );
  }

  if (view.kind === "list") {
    const list = getListRows(view, activeSubs, rangeSubs, yogaActiveSubs, yogaRangeSubs).filter((r) => {
      const q = search.toLowerCase();
      return !q || r.userName.toLowerCase().includes(q) || r.userPhone.includes(q) || r.owner.toLowerCase().includes(q) || r.product.toLowerCase().includes(q);
    });
    const total = list.reduce((sum, row) => sum + row.amount, 0);
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <HeaderBack onBack={backToHub} title={view.title} subtitle={`${list.length} record${list.length === 1 ? "" : "s"} · ${inr(total)}`} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Records" value={list.length} tone="primary" />
          <StatCard label="BBDO" value={list.filter((r) => r.type === "BBDO").length} tone="emerald" />
          <StatCard label="Value" value={inr(total)} tone="purple" />
        </div>
        <SearchExport search={search} setSearch={setSearch} placeholder="Search user, phone, coach, instructor, package..." filename={view.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")} rows={list as any} />
        <div className="space-y-3">
          {list.map((row, i) => <ListRow key={row.id} row={row} index={i} />)}
          {list.length === 0 && <EmptyState label="No matching subscription records" />}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">Subscriptions</h1>
          <p className="text-muted-foreground text-sm">
            {activeSubs.length + yogaActiveSubs.length} total active · {inr(bbdoActiveRevenue + yogaActiveRevenue)} active revenue · {range.label} sales: {inr(bbdoRangeRevenue + yogaRangeRevenue)}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-1 min-[430px]:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="BBDO Active" value={activeSubs.length} tone="primary" onClick={() => setRoute({ subscriptionTab: "bbdo" })} />
        <StatCard label="Yoga Active" value={yogaActiveSubs.length} tone="emerald" onClick={() => setRoute({ subscriptionTab: "yoga" })} />
        <StatCard label="Renewals Due" value={bbdoRenewals.length + yogaRenewals.length} tone="amber" onClick={() => setRoute({ metric: "renewals" })} />
        <StatCard label="Active Revenue" value={inr(bbdoActiveRevenue + yogaActiveRevenue)} tone="purple" onClick={() => setRoute({ metric: "active_revenue" })} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
        <MetricButton icon={IndianRupee} label="Range Revenue" value={inr(bbdoRangeRevenue + yogaRangeRevenue)} sub={`${rangeSubs.length + yogaRangeSubs.length} paid sale${rangeSubs.length + yogaRangeSubs.length === 1 ? "" : "s"}`} onClick={() => setRoute({ metric: "range_revenue" })} />
        <MetricButton icon={Activity} label="BBDO Active Revenue" value={inr(bbdoActiveRevenue)} sub={`${activeSubs.length} active BBDO subscription${activeSubs.length === 1 ? "" : "s"}`} onClick={() => setRoute({ metric: "active_revenue", subscriptionTab: "bbdo" })} />
        <MetricButton icon={Sparkles} label="Yoga Active Revenue" value={inr(yogaActiveRevenue)} sub={`${yogaActiveSubs.length} active yoga subscription${yogaActiveSubs.length === 1 ? "" : "s"}`} onClick={() => setRoute({ metric: "active_revenue", subscriptionTab: "yoga" })} />
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {[
          { id: "bbdo", label: "BBDO Plans", count: activeSubs.length },
          { id: "yoga", label: "Yoga Packages", count: yogaActiveSubs.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id as "bbdo" | "yoga"); setRoute({ subscriptionTab: t.id as "bbdo" | "yoga" }); }}
            className={`min-w-0 px-2 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-colors ${tab === t.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label} <span className="ml-1 text-xs opacity-70">({t.count})</span>
          </button>
        ))}
      </div>

      {tab === "bbdo" && (
        <div className="space-y-3">
          {packages.map((pkg, i) => {
            const list = perPlan.get(pkg.plan_key) || [];
            const hasCoach = pkg.plan_key !== "foundation";
            const withCoach = list.filter((s) => s.coachName).length;
            const renewing = list.filter((s) => {
              const days = differenceInDays(new Date(s.expires_at), new Date());
              return days >= 0 && days <= 30;
            }).length;
            const rev = list.reduce((s, x) => s + x.plan_price, 0);
            return (
              <motion.button
                key={pkg.plan_key}
                onClick={() => setRoute({ subscriptionTab: "bbdo", view: "bbdo-plan", plan: pkg.plan_key })}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="w-full liquid-glass rounded-xl sm:rounded-2xl p-4 sm:p-5 text-left hover:bg-accent/40 hover:-translate-y-px transition-all"
              >
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <CreditCard className="w-6 h-6 text-primary" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-foreground leading-tight">{planNumber(pkg.plan_key)} · {pkg.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">{pkg.tagline || (hasCoach ? "Coach-supported plan" : "Self-guided plan · no coach")}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{list.length} users</span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${hasCoach ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{hasCoach ? `${withCoach} with coach` : "No coach"}</span>
                      {renewing > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">{renewing} renewing</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border">
                  <div className="text-left">
                    <p className="font-bold">{inr(rev)}</p>
                    <p className="text-xs text-muted-foreground">active revenue</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </motion.button>
            );
          })}
          {packages.length === 0 && <EmptyState label="No BBDO packages configured" />}
        </div>
      )}

      {tab === "yoga" && (
        <div className="space-y-3">
          {yogaPackages.map((pkg, i) => {
            const list = perYogaPkg.get(pkg.id) || [];
            const rev = list.reduce((s, y) => s + (y.price_inr || 0), 0);
            const renewing = list.filter((y) => {
              const days = differenceInDays(new Date(y.expires_on), new Date());
              return days >= 0 && days <= 15;
            }).length;
            return (
              <motion.button
                key={pkg.id}
                onClick={() => setRoute({ subscriptionTab: "yoga", view: "yoga-package", package: pkg.id })}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="w-full liquid-glass rounded-xl sm:rounded-2xl p-4 sm:p-5 text-left hover:bg-accent/40 hover:-translate-y-px transition-all"
              >
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Sparkles className="w-6 h-6 text-emerald-500" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black leading-tight">{pkg.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{pkg.package_type} · {pkg.classes_per_month ?? 8} classes/mo</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{list.length} subscribers</span>
                      {renewing > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">{renewing} renewing</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border">
                  <div className="text-left">
                    <p className="font-bold">{inr(rev)}</p>
                    <p className="text-xs text-muted-foreground">active revenue</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </motion.button>
            );
          })}
          {yogaPackages.length === 0 && <EmptyState label="No yoga packages configured" />}
        </div>
      )}
    </div>
  );
}

function HeaderBack({ onBack, title, subtitle }: { onBack: () => void; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <button onClick={onBack} className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center hover:bg-accent transition-colors" aria-label="Back to subscriptions">
        <ArrowLeft className="w-4 h-4" />
      </button>
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-black leading-tight break-words">{title}</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1 leading-snug">{subtitle}</p>
      </div>
    </div>
  );
}

function SearchExport({ search, setSearch, placeholder, filename, rows }: { search: string; setSearch: (v: string) => void; placeholder: string; filename: string; rows: any[] }) {
  return (
    <div className="grid grid-cols-2 sm:flex gap-2">
      <div className="relative col-span-2 sm:flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>
      <ExportCsvButton filename={filename} rows={rows} className="w-full justify-center sm:w-fit" />
      <ImportCsvButton table="subscriptions" onImported={() => window.location.reload()} className="w-full justify-center sm:w-fit" />
    </div>
  );
}

function BBDORow({ sub, index }: { sub: Sub; index: number }) {
  const daysLeft = differenceInDays(new Date(sub.expires_at), new Date());
  const renewSoon = daysLeft >= 0 && daysLeft <= 30;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }} className="liquid-glass rounded-xl sm:rounded-2xl p-4">
      <div className="grid grid-cols-1 sm:flex sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-bold text-foreground truncate flex-1">{sub.userName}</p>
            {sub.userPhone && (
              <a
                href={whatsappCallUrl(sub.userPhone)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp ${sub.userName}`}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white"
                style={{ background: "#25D366" }}
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2.2} />
              </a>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
            {sub.userPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{sub.userPhone}</span>}
            {sub.userEmail && !sub.userEmail.endsWith("@bbd.app") && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{sub.userEmail}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {sub.coachName ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">Coach: {sub.coachName}</span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">No coach</span>
            )}
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{sub.duration_months}mo · {inr(sub.plan_price)}</span>
          </div>
        </div>
        <div className="pt-3 border-t border-border sm:pt-0 sm:border-0"><RenewalBlock expiresAt={sub.expires_at} daysLeft={daysLeft} renewSoon={renewSoon} /></div>
      </div>
    </motion.div>
  );
}

function YogaRow({ sub, index }: { sub: YogaSub; index: number }) {
  const daysLeft = differenceInDays(new Date(sub.expires_on), new Date());
  const renewSoon = daysLeft >= 0 && daysLeft <= 15;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }} className="liquid-glass rounded-2xl p-4 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-bold truncate">{sub.userName}</p>
        {sub.userPhone && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Phone className="w-3 h-3" />{sub.userPhone}</p>}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">Instructor: {sub.partnerName}</span>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{sub.package_type} · {inr(sub.price_inr)}</span>
        </div>
      </div>
      <RenewalBlock expiresAt={sub.expires_on} daysLeft={daysLeft} renewSoon={renewSoon} />
    </motion.div>
  );
}

function RenewalBlock({ expiresAt, daysLeft, renewSoon }: { expiresAt: string; daysLeft: number; renewSoon: boolean }) {
  return (
    <div className="flex items-end justify-between gap-3 sm:block sm:text-right shrink-0">
      <div>
      <p className={`text-xs flex items-center gap-1 justify-end ${renewSoon ? "text-destructive font-bold" : "text-muted-foreground"}`}>
        <Calendar className="w-3 h-3" />{daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "today" : "expired"}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">exp {fmtDate(expiresAt)}</p>
      </div>{renewSoon && (
        <span className="inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold"><AlertCircle className="w-3 h-3" />Renewal due</span>
      )}
    </div>
  );
}

interface ListRowData {
  id: string;
  type: "BBDO" | "Yoga";
  userName: string;
  userPhone: string;
  product: string;
  owner: string;
  amount: number;
  startedAt: string;
  expiresAt: string;
}

function getListRows(view: Extract<View, { kind: "list" }>, activeSubs: Sub[], rangeSubs: Sub[], yogaActiveSubs: YogaSub[], yogaRangeSubs: YogaSub[]): ListRowData[] {
  const includeBBDO = view.source === "all" || view.source === "bbdo";
  const includeYoga = view.source === "all" || view.source === "yoga";
  const bbdos = view.filter === "range" ? rangeSubs : activeSubs;
  const yogas = view.filter === "range" ? yogaRangeSubs : yogaActiveSubs;

  const bbdRows = includeBBDO ? bbdos
    .filter((s) => view.filter !== "renewals" || betweenRenewalDays(s.expires_at, 30))
    .map((s) => ({
      id: `bbdo-${s.id}`,
      type: "BBDO" as const,
      userName: s.userName || "Unknown",
      userPhone: s.userPhone || "",
      product: `${planNumber(aliasPlanKey(s.plan_id))} · ${s.plan_name}`,
      owner: s.coachName ? `Coach: ${s.coachName}` : "No coach",
      amount: s.plan_price || 0,
      startedAt: s.started_at,
      expiresAt: s.expires_at,
    })) : [];

  const yogaRows = includeYoga ? yogas
    .filter((y) => view.filter !== "renewals" || betweenRenewalDays(y.expires_on, 15))
    .map((y) => ({
      id: `yoga-${y.id}`,
      type: "Yoga" as const,
      userName: y.userName || "Unknown",
      userPhone: y.userPhone || "",
      product: y.packageName || "Yoga Package",
      owner: `Instructor: ${y.partnerName || "Instructor"}`,
      amount: y.price_inr || 0,
      startedAt: y.starts_on || y.created_at,
      expiresAt: y.expires_on,
    })) : [];

  return [...bbdRows, ...yogaRows].sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
}

function betweenRenewalDays(date: string, days: number) {
  const left = differenceInDays(new Date(date), new Date());
  return left >= 0 && left <= days;
}

function ListRow({ row, index }: { row: ListRowData; index: number }) {
  const daysLeft = differenceInDays(new Date(row.expiresAt), new Date());
  const renewSoon = row.type === "BBDO" ? betweenRenewalDays(row.expiresAt, 30) : betweenRenewalDays(row.expiresAt, 15);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }} className="liquid-glass rounded-2xl p-4 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.type === "BBDO" ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-600"}`}>{row.type}</span>
          <p className="font-bold truncate">{row.userName}</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
          {row.userPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{row.userPhone}</span>}
          <span>{row.product}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{row.owner}</span>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{inr(row.amount)}</span>
        </div>
      </div>
      <RenewalBlock expiresAt={row.expiresAt} daysLeft={daysLeft} renewSoon={renewSoon} />
    </motion.div>
  );
}

function MetricButton({ icon: Icon, label, value, sub, onClick }: { icon: React.ElementType; label: string; value: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="liquid-glass rounded-2xl p-4 text-left hover:bg-accent/40 hover:-translate-y-px transition-all flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="text-xl font-black text-foreground mt-1">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </div>
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" strokeWidth={1.8} />
      </div>
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="text-center py-12 text-muted-foreground liquid-glass rounded-2xl">{label}</div>;
}

function StatCard({ label, value, tone, onClick }: { label: string; value: number | string; tone: "primary" | "emerald" | "amber" | "purple"; onClick?: () => void }) {
  const toneClass = {
    primary: "text-primary",
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    purple: "text-purple-500",
  }[tone];
  const className = `liquid-glass rounded-xl sm:rounded-2xl p-2.5 sm:p-4 text-left min-w-0 ${onClick ? "hover:bg-accent/40 hover:-translate-y-px transition-all" : ""}`;
  const content = (
    <>
      <p className={`text-[17px] sm:text-2xl font-black truncate ${toneClass}`}>{value}</p>
      <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">{label}</p>
    </>
  );
  return onClick ? <button onClick={onClick} className={className}>{content}</button> : <div className={className}>{content}</div>;
}
