import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlanKey as aliasPlanKey } from "@/lib/subscriptionService";
import {
  Users, UserCheck, Package as PackageIcon, IndianRupee,
  CalendarClock, TrendingUp, ChevronDown, ChevronUp, Phone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import DateRangeFilter, { defaultRange, DateRange } from "@/components/admin/DateRangeFilter";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { whatsappCallUrl } from "@/lib/coachAvailability";

interface Profile { user_id: string; name: string | null; phone: string | null; }
interface Subscription {
  id: string; user_id: string; plan_id: string; plan_name: string;
  plan_price: number; status: string;
  started_at: string; expires_at: string; created_at: string;
}
interface Package { plan_key: string; name: string; }
interface CoachRow { id: string; name: string | null; phone: string | null; is_active: boolean | null; }
interface AssignmentRow { coach_id: string; user_id: string; }

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function AdminOverview() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [loading, setLoading] = useState(true);

  const [packages, setPackages] = useState<Package[]>([]);
  const [allActiveSubs, setAllActiveSubs] = useState<Subscription[]>([]);
  const [rangeSubs, setRangeSubs] = useState<Subscription[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
  const [usersInRange, setUsersInRange] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [activeLoggerIds, setActiveLoggerIds] = useState<Set<string>>(new Set());
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);
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
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [pkgRes, activeSubsRes, rangeSubsRes, profilesAllRes, profilesRangeRes, coachesRes, assignRes, logsRes] = await Promise.all([
      supabase.from("packages").select("plan_key, name"),
      supabase.from("subscriptions").select("*").eq("status", "active"),
      supabase.from("subscriptions").select("*").gte("started_at", fromIso).lte("started_at", toIso),
      supabase.from("profiles").select("user_id, name, phone"),
      supabase
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase.from("coaches").select("id, name, phone, is_active").eq("is_active", true),
      supabase.from("coach_assignments").select("coach_id, user_id").eq("is_active", true),
      supabase.from("health_logs").select("user_id").gte("logged_at", since7).limit(5000),
    ]);

    setPackages((pkgRes.data ?? []) as Package[]);
    setAllActiveSubs((activeSubsRes.data ?? []) as Subscription[]);
    setRangeSubs((rangeSubsRes.data ?? []) as Subscription[]);
    setUsersInRange(profilesRangeRes.count ?? 0);
    setCoaches((coachesRes.data ?? []) as CoachRow[]);
    setAssignments((assignRes.data ?? []) as AssignmentRow[]);
    setActiveLoggerIds(new Set(((logsRes.data ?? []) as { user_id: string }[]).map((l) => l.user_id)));

    const pmap = new Map<string, Profile>();
    const allProfiles = (profilesAllRes.data ?? []) as Profile[];
    for (const p of allProfiles) pmap.set(p.user_id, p);
    setProfileMap(pmap);
    setTotalUsers(allProfiles.length);

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
  const activeAssignments = assignments.length;
  const coachCount = coaches.length;

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

  // --- Coach roster: load + on-track split + patient list ---
  const coachRoster = useMemo(() => {
    const byCoach = new Map<string, string[]>();
    for (const a of assignments) {
      const arr = byCoach.get(a.coach_id) || [];
      arr.push(a.user_id);
      byCoach.set(a.coach_id, arr);
    }
    return coaches
      .map((c) => {
        const ids = byCoach.get(c.id) ?? [];
        const patients = ids.map((uid) => ({
          user_id: uid,
          name: profileMap.get(uid)?.name || "Unnamed",
          phone: profileMap.get(uid)?.phone || "",
          onTrack: activeLoggerIds.has(uid),
        }));
        const onTrack = patients.filter((p) => p.onTrack).length;
        return {
          id: c.id,
          name: c.name || "Unnamed coach",
          total: patients.length,
          onTrack,
          offTrack: patients.length - onTrack,
          patients: patients.sort((a, b) => Number(a.onTrack) - Number(b.onTrack) || a.name.localeCompare(b.name)),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [coaches, assignments, profileMap, activeLoggerIds]);

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
      label: "Run-rate",
      value: inr(activeRevenueRunRate),
      sub: `${activeSubsCount} active subs`,
      icon: TrendingUp, tone: "text-secondary", bg: "bg-secondary/10",
      onClick: () => navigate("/admin-dashboard?tab=subscriptions&metric=active_revenue"),
    },
    {
      label: "Renewals (30d)",
      value: upcomingRenewals.length,
      sub: `${expiredRecently} expired 30d`,
      icon: CalendarClock, tone: "text-amber-600", bg: "bg-amber-500/10",
      onClick: () => navigate("/admin-dashboard?tab=subscriptions&metric=renewals"),
    },
    {
      label: "Total Users",
      value: totalUsers.toLocaleString("en-IN"),
      sub: "View by package",
      icon: Users, tone: "text-primary", bg: "bg-primary/10",
      onClick: () => navigate("/admin/users-insights"),
    },
    {
      label: "New Users (range)",
      value: usersInRange,
      sub: `${activeAssignments} assignments`,
      icon: Users, tone: "text-primary", bg: "bg-primary/10",
      onClick: () => navigate("/admin-dashboard?tab=users"),
    },
    {
      label: "Active Coaches",
      value: coachCount,
      sub: `Avg ${coachCount ? (activeAssignments / coachCount).toFixed(1) : "0"}/coach`,
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
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[clamp(20px,5.5vw,30px)] leading-[1.15] font-semibold tracking-[-0.03em] text-foreground break-words">
            {greeting || "Good morning"}, {adminName || "Admin"} <span className="inline-block">👋</span>
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Revenue, renewals & coaches · <span className="font-semibold text-foreground">{range.label}</span>
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

      {/* Mobile-first KPI list; expands into a grid only when space allows. */}
      <div className="grid grid-cols-1 min-[430px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
        {kpis.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
              onClick={card.onClick}
              className="liquid-glass rounded-xl sm:rounded-2xl p-3 text-left min-w-0 hover:-translate-y-px transition-transform"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-3.5 h-3.5 ${card.tone}`} strokeWidth={1.9} />
                </span>
                <p className="text-base sm:text-lg font-black text-foreground break-words min-w-0">{card.value}</p>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1.5 min-[430px]:block">
                <p className="text-[11px] font-medium text-muted-foreground leading-tight">{card.label}</p>
                <p className="text-[10px] text-muted-foreground/80 text-right min-[430px]:text-left leading-tight">{card.sub}</p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Active package cards stack on phones for readable names and values. */}
      <div className="liquid-glass rounded-2xl p-3 sm:p-5">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h3 className="font-bold text-foreground flex items-center gap-2 text-sm sm:text-base min-w-0">
            <PackageIcon className="w-4 h-4 text-primary shrink-0" /> <span className="truncate">Active Packages</span>
          </h3>
          <p className="text-[11px] sm:text-xs text-muted-foreground shrink-0">{activeSubsCount} active</p>
        </div>
        <div className="grid grid-cols-1 min-[520px]:grid-cols-3 gap-2 sm:gap-3">
          {packageBreakdown.map((p) => {
            const share = activeSubsCount > 0 ? (p.active / activeSubsCount) * 100 : 0;
            return (
              <button
                key={p.key}
                onClick={() => navigate(`/admin-dashboard?tab=subscriptions&subscriptionTab=bbdo&view=bbdo-plan&plan=${encodeURIComponent(p.key)}`)}
                className="rounded-xl border border-border p-3 sm:p-4 space-y-2 text-left hover:bg-accent/40 hover:-translate-y-px transition-all min-w-0"
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="text-sm font-semibold text-foreground leading-tight">{p.name}</p>
                  <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0">
                    {p.active}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${share}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground leading-tight">
                  <span>{p.sold} sold</span>
                  <span className="font-semibold text-foreground">{inr(p.revenue)}</span>
                </div>
              </button>
            );
          })}
          {packageBreakdown.length === 0 && (
            <p className="text-sm text-muted-foreground min-[520px]:col-span-3">No packages defined</p>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Upcoming renewals */}
        <div className="liquid-glass rounded-2xl p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 gap-2">
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

        {/* Coaches — load, on-track split and patient list */}
        <div className="liquid-glass rounded-2xl p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="font-bold text-foreground flex items-center gap-2 text-sm sm:text-base min-w-0">
              <UserCheck className="w-4 h-4 text-cyan-600 shrink-0" /> <span className="truncate">Coaches</span>
            </h3>
            <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0">On track = logged in last 7d</span>
          </div>

          <div className="space-y-2">
            {coachRoster.map((c) => {
              const open = expandedCoach === c.id;
              const pct = c.total ? Math.round((c.onTrack / c.total) * 100) : 0;
              return (
                <div key={c.id} className="rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => setExpandedCoach(open ? null : c.id)}
                    className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-accent/40 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                      <div className="flex items-center gap-2 text-[11px] mt-0.5">
                        <span className="text-muted-foreground">{c.total} patients</span>
                        <span className="text-emerald-600 font-semibold">✓ {c.onTrack} on track</span>
                        {c.offTrack > 0 && <span className="text-amber-600 font-semibold">• {c.offTrack} idle</span>}
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>

                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <ul className="divide-y divide-border border-t border-border">
                          {c.patients.map((p) => (
                            <li key={p.user_id} className="px-3 py-2 flex items-center gap-2">
                              <span className={cn("w-2 h-2 rounded-full shrink-0", p.onTrack ? "bg-emerald-500" : "bg-amber-500")} />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{p.phone || "No phone"}</p>
                              </div>
                              {p.phone && (
                                <a
                                  href={whatsappCallUrl(p.phone, `Hi ${p.name}, checking in from BBDO.`)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600"
                                >
                                  <Phone className="w-3 h-3" /> WhatsApp
                                </a>
                              )}
                            </li>
                          ))}
                          {c.patients.length === 0 && (
                            <li className="px-3 py-4 text-xs text-muted-foreground text-center">No patients assigned</li>
                          )}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {coachRoster.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No active coaches</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
