import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlanKey as aliasPlanKey } from "@/lib/subscriptionService";
import {
  Users, UserCheck, Package as PackageIcon, IndianRupee, AlertTriangle,
  CalendarClock, TrendingUp, Activity, Heart,
} from "lucide-react";
import { motion } from "framer-motion";
import DateRangeFilter, { defaultRange, DateRange } from "@/components/admin/DateRangeFilter";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";


interface Profile { user_id: string; name: string | null; phone: string | null; }
interface Subscription {
  id: string; user_id: string; plan_id: string; plan_name: string;
  plan_price: number; status: string;
  started_at: string; expires_at: string; created_at: string;
}
interface HealthLog {
  id: string; user_id: string; logged_at: string; log_type: string;
  glucose_morning: number | null; glucose_evening: number | null;
  bp_systolic: number | null; bp_diastolic: number | null;
  weight_kg: number | null;
}
interface Package { plan_key: string; name: string; }


const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

interface AttentionItem {
  user_id: string;
  name: string;
  phone: string;
  severity: "high" | "medium";
  reason: string;
  metric: string;
  loggedAt: string;
}

export default function AdminOverview() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [loading, setLoading] = useState(true);

  const [packages, setPackages] = useState<Package[]>([]);
  const [allActiveSubs, setAllActiveSubs] = useState<Subscription[]>([]);
  const [rangeSubs, setRangeSubs] = useState<Subscription[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
  const [usersInRange, setUsersInRange] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [coachCount, setCoachCount] = useState<number>(0);
  const [activeAssignments, setActiveAssignments] = useState<number>(0);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const navigate = useNavigate();
  const { greeting } = useLanguage();
  const [adminName, setAdminName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      const { data } = await supabase.from("profiles").select("name").eq("user_id", auth.user.id).maybeSingle();
      setAdminName(((data as any)?.name || "").split(" ")[0]);
    })();
  }, []);


  useEffect(() => { load(); }, [range]);

  const load = async () => {
    setLoading(true);

    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();

    const [pkgRes, activeSubsRes, rangeSubsRes, profilesAllRes, profilesRangeRes, coachesRes, assignRes, logsRes] = await Promise.all([
      supabase.from("packages").select("plan_key, name"),
      // All active subs (used for active counts, upcoming renewals)
      supabase.from("subscriptions").select("*").eq("status", "active"),
      // Subscriptions started inside the selected date range (revenue/new sales)
      supabase.from("subscriptions").select("*").gte("started_at", fromIso).lte("started_at", toIso),
      supabase.from("profiles").select("user_id, name, phone"),
      supabase
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase.from("coaches").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("coach_assignments").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase
        .from("health_logs")
        .select("id, user_id, logged_at, log_type, glucose_morning, glucose_evening, bp_systolic, bp_diastolic, weight_kg")
        .gte("logged_at", fromIso)
        .lte("logged_at", toIso)
        .order("logged_at", { ascending: false })
        .limit(500),
    ]);

    setPackages((pkgRes.data ?? []) as Package[]);
    setAllActiveSubs((activeSubsRes.data ?? []) as Subscription[]);
    setRangeSubs((rangeSubsRes.data ?? []) as Subscription[]);
    setUsersInRange(profilesRangeRes.count ?? 0);
    setCoachCount(coachesRes.count ?? 0);
    setActiveAssignments(assignRes.count ?? 0);

    const pmap = new Map<string, Profile>();
    const allProfiles = (profilesAllRes.data ?? []) as Profile[];
    for (const p of allProfiles) pmap.set(p.user_id, p);
    setProfileMap(pmap);
    setTotalUsers(allProfiles.length);

    setAttention(computeAttention((logsRes.data ?? []) as HealthLog[], pmap));
    setLoading(false);
  };

  // --- KPI calculations ---
  const revenueInRange = useMemo(
    () => rangeSubs.reduce((s, x) => s + (x.plan_price || 0), 0),
    [rangeSubs]
  );
  const activeRevenueRunRate = useMemo(
    () => allActiveSubs.reduce((s, x) => s + (x.plan_price || 0), 0),
    [allActiveSubs]
  );
  const activeSubsCount = allActiveSubs.length;

  const packageBreakdown = useMemo(() => {
    const counts = new Map<string, { name: string; active: number; sold: number; revenue: number }>();
    for (const p of packages) counts.set(p.plan_key, { name: p.name, active: 0, sold: 0, revenue: 0 });
    for (const s of allActiveSubs) {
      const k = aliasPlanKey(s.plan_id);
      if (!k) continue;
      const row = counts.get(k);
      if (row) row.active += 1;
    }
    for (const s of rangeSubs) {
      const k = aliasPlanKey(s.plan_id);
      if (!k) continue;
      const row = counts.get(k);
      if (row) {
        row.sold += 1;
        row.revenue += s.plan_price || 0;
      }
    }
    return Array.from(counts.entries()).map(([key, v]) => ({ key, ...v }));
  }, [packages, allActiveSubs, rangeSubs]);

  const upcomingRenewals = useMemo(() => {
    const now = Date.now();
    const horizon = now + 30 * 24 * 60 * 60 * 1000;
    return allActiveSubs
      .filter((s) => {
        const t = new Date(s.expires_at).getTime();
        return t >= now && t <= horizon;
      })
      .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())
      .slice(0, 8);
  }, [allActiveSubs]);

  const expiredRecently = useMemo(() => {
    const now = Date.now();
    const back = now - 30 * 24 * 60 * 60 * 1000;
    return allActiveSubs.filter((s) => {
      const t = new Date(s.expires_at).getTime();
      return t < now && t >= back;
    }).length;
  }, [allActiveSubs]);

  // ----- KPI cards -----
  const kpis = [
    {
      label: "Revenue (range)",
      value: inr(revenueInRange),
      sub: `${rangeSubs.length} new sales`,
      icon: IndianRupee, tone: "text-emerald-600", bg: "bg-emerald-500/10",
      onClick: () => navigate("/admin-dashboard?tab=subscriptions&metric=range_revenue"),
    },
    {
      label: "Active Revenue Run-rate",
      value: inr(activeRevenueRunRate),
      sub: `${activeSubsCount} active subscriptions`,
      icon: TrendingUp, tone: "text-secondary", bg: "bg-secondary/10",
      onClick: () => navigate("/admin-dashboard?tab=subscriptions&metric=active_revenue"),
    },
    {
      label: "Upcoming Renewals (30d)",
      value: upcomingRenewals.length,
      sub: `${expiredRecently} expired last 30d`,
      icon: CalendarClock, tone: "text-amber-600", bg: "bg-amber-500/10",
      onClick: () => navigate("/admin-dashboard?tab=subscriptions&metric=renewals"),
    },
    {
      label: "Users Requiring Attention",
      value: attention.length,
      sub: `${attention.filter((a) => a.severity === "high").length} high risk`,
      icon: AlertTriangle, tone: "text-destructive", bg: "bg-destructive/10",
      onClick: () => navigate("/admin/users-insights"),
    },
    {
      label: "Total Users",
      value: totalUsers.toLocaleString("en-IN"),
      sub: `Click to view by package`,
      icon: Users, tone: "text-primary", bg: "bg-primary/10",
      onClick: () => navigate("/admin/users-insights"),
    },
    {
      label: "New Users (range)",
      value: usersInRange,
      sub: `${activeAssignments} active assignments`,
      icon: Users, tone: "text-primary", bg: "bg-primary/10",
      onClick: () => navigate("/admin-dashboard?tab=users"),
    },
    {
      label: "Active Coaches",
      value: coachCount,
      sub: `Avg ${coachCount ? (activeAssignments / coachCount).toFixed(1) : "0"} users / coach`,
      icon: UserCheck, tone: "text-cyan-600", bg: "bg-cyan-500/10",
      onClick: () => navigate("/admin-dashboard?tab=coaches"),
    },
  ];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[clamp(22px,6.5vw,32px)] leading-[1.15] font-semibold tracking-[-0.03em] text-foreground break-words">
            {greeting || "Good morning"}, {adminName || "Admin"} <span className="inline-block">👋</span>
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Revenue, renewals & risk · <span className="font-semibold text-foreground">{range.label}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter value={range} onChange={setRange} />
          <ExportCsvButton
            filename="overview-kpis"
            rows={() => kpis.map((c) => ({ label: c.label, value: c.value, sub: c.sub }))}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {kpis.map((card, i) => {
          const Icon = card.icon;
          const clickable = "onClick" in card && typeof (card as any).onClick === "function";
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.22 }}
              onClick={clickable ? (card as any).onClick : undefined}
              className={cn(
                "liquid-glass rounded-2xl p-4 sm:p-5 space-y-2.5 sm:space-y-3 min-w-0",
                clickable && "cursor-pointer hover:-translate-y-px transition-transform"
              )}
            >
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${card.tone}`} strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-black text-foreground truncate">{card.value}</p>
                <p className="text-muted-foreground text-[11px] sm:text-xs font-medium leading-tight">{card.label}</p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground/80 mt-0.5 leading-tight line-clamp-2">{card.sub}</p>
              </div>
            </motion.div>
          );
        })}
      </div>


      


      {/* Active packages breakdown */}
      <div className="liquid-glass rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h3 className="font-bold text-foreground flex items-center gap-2 text-sm sm:text-base min-w-0">
            <PackageIcon className="w-4 h-4 text-primary shrink-0" /> <span className="truncate">Active Packages</span>
          </h3>
          <p className="text-[11px] sm:text-xs text-muted-foreground shrink-0">{activeSubsCount} active</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {packageBreakdown.map((p) => {
            const share = activeSubsCount > 0 ? (p.active / activeSubsCount) * 100 : 0;
            return (
              <button
                key={p.key}
                onClick={() => navigate(`/admin-dashboard?tab=subscriptions&subscriptionTab=bbdo&view=bbdo-plan&plan=${encodeURIComponent(p.key)}`)}
                className="rounded-xl border border-border p-3 sm:p-4 space-y-2 text-left hover:bg-accent/40 hover:-translate-y-px transition-all min-w-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0">
                    {p.active}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${share}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground gap-2">
                  <span className="truncate">{p.sold} sold in range</span>
                  <span className="font-semibold text-foreground shrink-0">{inr(p.revenue)}</span>
                </div>
              </button>
            );
          })}
          {packageBreakdown.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-3">No packages defined</p>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Upcoming renewals */}
        <div className="liquid-glass rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="font-bold text-foreground flex items-center gap-2 text-sm sm:text-base min-w-0">
              <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" /> <span className="truncate">Upcoming Renewals</span>
            </h3>
            <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0">Next 30d</span>
          </div>
          <div className="space-y-2">
            {upcomingRenewals.map((s) => {
              const p = profileMap.get(s.user_id);
              const days = differenceInDays(new Date(s.expires_at), new Date());
              const urgent = days <= 7;
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/admin-dashboard?tab=subscriptions&subscriptionTab=bbdo&view=bbdo-plan&plan=${encodeURIComponent(aliasPlanKey(s.plan_id) || "foundation")}&metric=renewals`)}
                  className="w-full flex items-center justify-between gap-3 py-2 border-b border-border last:border-0 text-left hover:bg-accent/40 rounded-lg px-2 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground font-semibold text-sm truncate">{p?.name || "Unknown"}</p>
                    <p className="text-muted-foreground text-xs truncate">
                      {s.plan_name} · {inr(s.plan_price)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-foreground text-xs font-semibold">
                      {format(new Date(s.expires_at), "d MMM")}
                    </p>
                    <p className={`text-[11px] font-medium ${urgent ? "text-destructive" : "text-muted-foreground"}`}>
                      in {days}d
                    </p>
                  </div>
                </button>
              );
            })}
            {upcomingRenewals.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No renewals coming up</p>
            )}
          </div>
        </div>

        {/* Attention */}
        <div className="liquid-glass rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="font-bold text-foreground flex items-center gap-2 text-sm sm:text-base min-w-0">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" /> <span className="truncate">Users Requiring Attention</span>
            </h3>
            <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0">In range</span>
          </div>
          <div className="space-y-2">
            {attention.slice(0, 10).map((a, i) => (
              <div key={a.user_id + i} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${a.severity === "high" ? "bg-destructive" : "bg-amber-500"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground font-semibold text-sm truncate">{a.name}</p>
                    <p className="text-muted-foreground text-xs truncate">{a.reason}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-foreground text-xs font-semibold">{a.metric}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(a.loggedAt), "d MMM, HH:mm")}
                  </p>
                </div>
              </div>
            ))}
            {attention.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <Heart className="w-6 h-6 text-emerald-500 mx-auto" />
                <p className="text-sm text-muted-foreground">All clear — no risk events in range</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

// ---------- Attention algorithm ----------
// Flags risk events from health_logs in range: high BP, hypoglycaemia, hyperglycaemia,
// large sudden weight spikes. Returns deduped list ordered by severity then recency.
function computeAttention(logs: HealthLog[], profiles: Map<string, Profile>): AttentionItem[] {
  // Group per user/log_type
  const byUser = new Map<string, HealthLog[]>();
  for (const l of logs) {
    const arr = byUser.get(l.user_id) || [];
    arr.push(l);
    byUser.set(l.user_id, arr);
  }

  const items: AttentionItem[] = [];

  for (const [uid, list] of byUser) {
    const profile = profiles.get(uid);
    const name = profile?.name || "Unknown user";
    const phone = profile?.phone || "";
    const sorted = [...list].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());

    // Glucose
    for (const l of sorted) {
      const g = l.glucose_morning ?? l.glucose_evening;
      if (g == null) continue;
      if (g >= 250) {
        items.push({ user_id: uid, name, phone, severity: "high", reason: "Severe hyperglycaemia", metric: `${g} mg/dL`, loggedAt: l.logged_at });
        break;
      }
      if (g <= 60) {
        items.push({ user_id: uid, name, phone, severity: "high", reason: "Hypoglycaemia", metric: `${g} mg/dL`, loggedAt: l.logged_at });
        break;
      }
      if (g >= 180) {
        items.push({ user_id: uid, name, phone, severity: "medium", reason: "High glucose", metric: `${g} mg/dL`, loggedAt: l.logged_at });
        break;
      }
    }

    // BP
    for (const l of sorted) {
      const s = l.bp_systolic;
      const d = l.bp_diastolic;
      if (s == null && d == null) continue;
      if ((s ?? 0) >= 180 || (d ?? 0) >= 120) {
        items.push({ user_id: uid, name, phone, severity: "high", reason: "Hypertensive crisis", metric: `${s ?? "-"}/${d ?? "-"} mmHg`, loggedAt: l.logged_at });
        break;
      }
      if ((s ?? 0) >= 140 || (d ?? 0) >= 90) {
        items.push({ user_id: uid, name, phone, severity: "medium", reason: "Elevated BP", metric: `${s ?? "-"}/${d ?? "-"} mmHg`, loggedAt: l.logged_at });
        break;
      }
      if ((s ?? 999) <= 90 || (d ?? 999) <= 60) {
        items.push({ user_id: uid, name, phone, severity: "medium", reason: "Low BP", metric: `${s ?? "-"}/${d ?? "-"} mmHg`, loggedAt: l.logged_at });
        break;
      }
    }

    // Weight spike (≥2kg jump between two consecutive logs in range)
    const weights = sorted.filter((l) => l.weight_kg != null).map((l) => ({ w: l.weight_kg as number, t: l.logged_at }));
    for (let i = 0; i < weights.length - 1; i++) {
      const delta = weights[i].w - weights[i + 1].w;
      if (Math.abs(delta) >= 2) {
        items.push({
          user_id: uid, name, phone,
          severity: Math.abs(delta) >= 4 ? "high" : "medium",
          reason: delta > 0 ? "Sudden weight gain" : "Sudden weight loss",
          metric: `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`,
          loggedAt: weights[i].t,
        });
        break;
      }
    }
  }

  return items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    return new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime();
  });
}
