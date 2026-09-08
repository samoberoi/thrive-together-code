import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlanKey as aliasPlanKey } from "@/lib/subscriptionService";
import {
  Search,
  ChevronDown,
  ChevronUp,
  Package as PackageIcon,
  UserCheck,
  Users,
  UserX,
  Globe,
  Activity,
  Droplet,
  HeartPulse,
  CalendarClock,
  UserPlus,
  ArrowUpDown,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { motion, AnimatePresence } from "framer-motion";

import DataToolsMenu from "@/components/admin/DataToolsMenu";
import AdminUserProfileSheet from "@/components/admin/AdminUserProfileSheet";
import AdherencePill from "@/components/admin/AdherencePill";
import AdherenceNudgeDialog from "@/components/admin/AdherenceNudgeDialog";
import ReassignCoachDialog from "@/components/admin/ReassignCoachDialog";
import { useAdherence } from "@/hooks/useAdherence";
import DateRangeFilter, { allTimeRange, inRange, type DateRange } from "@/components/admin/DateRangeFilter";
import {
  fetchRiskSnapshots,
  isSevereSugar,
  isHighSugar,
  isSevereBp,
  isHighBp,
  type RiskSnapshot,
} from "@/components/admin/UserRiskFilters";

interface UserProfile {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
  bmi: number | null;
  bmi_category: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  region_code: string | null;
  coach_name: string | null;
  onboarding_completed: boolean | null;
  created_at: string | null;
  clinical: any;
  lifestyle: any;
  goals: any;
  height: number | null;
  weight: number | null;
  waist: number | null;
}

interface Subscription {
  user_id: string;
  plan_id: string;
  plan_name: string;
  started_at: string;
  expires_at: string;
  status: string;
}

type RiskKey =
  | "all"
  | "offtrack"
  | "inactive"
  | "severe_sugar"
  | "severe_bp"
  | "no_coach"
  | "onboarding"
  | "expiring";

type SortKey = "recent" | "least_active" | "name" | "expiring";

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const daysLeft = (iso: string | null | undefined) => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
};

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [subsByUser, setSubsByUser] = useState<Record<string, Subscription>>({});
  const [pkgNames, setPkgNames] = useState<Record<string, string>>({});
  const [regionNames, setRegionNames] = useState<Record<string, string>>({});
  const [risk, setRisk] = useState<Map<string, RiskSnapshot>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<RiskKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [range, setRange] = useState<DateRange>(allTimeRange());

  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [nudgeTarget, setNudgeTarget] = useState<{ userId: string; name: string } | null>(null);
  const [reassignTarget, setReassignTarget] = useState<{ userId: string; name: string } | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [usersRes, subsRes, pkgsRes, rolesRes, regionsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase
        .from("subscriptions")
        .select("user_id, plan_id, plan_name, started_at, expires_at, status")
        .eq("status", "active")
        .order("started_at", { ascending: false }),
      supabase.from("packages").select("plan_key, name"),
      supabase.from("user_roles").select("user_id, role").in("role", ["coach", "admin"]),
      (supabase as any).from("pricing_regions").select("code, name, sort_order"),
    ]);

    // Exclude coaches and super admins — this screen is end-users only.
    const staffIds = new Set<string>((rolesRes.data ?? []).map((r: any) => r.user_id));
    const list = ((usersRes.data ?? []) as unknown as UserProfile[]).filter((u) => !staffIds.has(u.user_id));
    setUsers(list);

    const map: Record<string, Subscription> = {};
    for (const s of (subsRes.data ?? []) as Subscription[]) {
      if (!map[s.user_id]) map[s.user_id] = s;
    }
    setSubsByUser(map);

    const names: Record<string, string> = {};
    for (const p of (pkgsRes.data ?? []) as any[]) names[p.plan_key] = p.name;
    setPkgNames(names);

    const regions: Record<string, string> = { IN: "India" };
    for (const r of ((regionsRes as any)?.data ?? []) as any[]) regions[r.code] = r.name || r.code;
    setRegionNames(regions);

    setLoading(false);

    // Risk snapshot is a heavier read — load it after the table paints.
    fetchRiskSnapshots(list.map((u) => u.user_id)).then(setRisk).catch(() => {});
  };

  const userCategory = (userId: string): "none" | "foundation" | "active" | "intensive" => {
    const sub = subsByUser[userId];
    if (!sub) return "none";
    const key = aliasPlanKey(sub.plan_id);
    if (key === "foundation" || key === "active" || key === "intensive") return key;
    return "none";
  };

  const packageLabel = (userId: string): string => {
    const sub = subsByUser[userId];
    if (!sub) return "No package";
    const key = aliasPlanKey(sub.plan_id);
    return (key && pkgNames[key]) || sub.plan_name || "—";
  };

  const regionOf = (u: UserProfile) => u.region_code || "IN";
  const regionLabel = (code: string) => regionNames[code] || code;

  const adherenceIds = useMemo(() => users.map((u) => u.user_id), [users]);
  const { map: adherence, loading: adherenceLoading } = useAdherence(adherenceIds);

  /** Users created within the selected date range — base set for stats + table. */
  const inRangeUsers = useMemo(() => users.filter((u) => inRange(range, u.created_at)), [users, range]);

  /** Everything except the package filter, so package tiles keep live counts. */
  const scoped = useMemo(
    () =>
      inRangeUsers.filter((u) => {
        if (countryFilter !== "all" && regionOf(u) !== countryFilter) return false;
        return true;
      }),
    [inRangeUsers, countryFilter]
  );

  const matchesRisk = (u: UserProfile, key: RiskKey): boolean => {
    if (key === "all") return true;
    const a = adherence.get(u.user_id);
    const r = risk.get(u.user_id);
    const cat = userCategory(u.user_id);
    switch (key) {
      case "offtrack":
        return !!a && !a.onTrack;
      case "inactive":
        return !!a && a.doneCount === 0;
      case "severe_sugar":
        return isSevereSugar(r) || isHighSugar(r);
      case "severe_bp":
        return isSevereBp(r) || isHighBp(r);
      case "no_coach":
        return (cat === "active" || cat === "intensive") && !u.coach_name;
      case "onboarding":
        return !u.onboarding_completed;
      case "expiring": {
        const d = daysLeft(subsByUser[u.user_id]?.expires_at);
        return d !== null && d >= 0 && d <= 30;
      }
    }
  };

  const stats = useMemo(() => {
    const counts = { none: 0, foundation: 0, active: 0, intensive: 0 };
    for (const u of scoped) counts[userCategory(u.user_id)]++;
    return { total: scoped.length, ...counts };
  }, [scoped, subsByUser]);

  const riskCounts = useMemo(() => {
    const keys: RiskKey[] = ["offtrack", "inactive", "severe_sugar", "severe_bp", "no_coach", "onboarding", "expiring"];
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = scoped.filter((u) => matchesRisk(u, k)).length;
    return out;
  }, [scoped, adherence, risk, subsByUser]);

  const packageOptions = useMemo(
    () => [
      { value: "all", label: "All packages" },
      { value: "none", label: "No package" },
      { value: "foundation", label: pkgNames["foundation"] || "Foundation" },
      { value: "active", label: pkgNames["active"] || "Active" },
      { value: "intensive", label: pkgNames["intensive"] || "Intensive" },
    ],
    [pkgNames]
  );

  const countryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of inRangeUsers) {
      const c = regionOf(u);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [
      { value: "all", label: `All countries (${inRangeUsers.length})` },
      ...Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([code, n]) => ({ value: code, label: `${regionLabel(code)} (${n})` })),
    ];
  }, [inRangeUsers, regionNames]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const rows = scoped.filter((u) => {
      if (packageFilter !== "all" && userCategory(u.user_id) !== packageFilter) return false;
      if (!matchesRisk(u, riskFilter)) return false;
      if (!q) return true;
      return (
        u.name?.toLowerCase().includes(q) ||
        u.phone?.includes(q) ||
        u.city?.toLowerCase().includes(q) ||
        regionLabel(regionOf(u)).toLowerCase().includes(q) ||
        packageLabel(u.user_id).toLowerCase().includes(q) ||
        u.coach_name?.toLowerCase().includes(q)
      );
    });

    const sorted = [...rows];
    if (sortKey === "name") {
      sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortKey === "least_active") {
      const score = (u: UserProfile) => {
        const a = adherence.get(u.user_id);
        if (!a || !a.applicableCount) return -1;
        return a.doneCount / a.applicableCount;
      };
      sorted.sort((a, b) => score(a) - score(b));
    } else if (sortKey === "expiring") {
      const d = (u: UserProfile) => daysLeft(subsByUser[u.user_id]?.expires_at) ?? 99999;
      sorted.sort((a, b) => d(a) - d(b));
    }
    return sorted;
  }, [scoped, search, packageFilter, riskFilter, sortKey, adherence, risk, subsByUser, pkgNames, regionNames]);

  const activeChips = [
    packageFilter !== "all"
      ? { label: packageOptions.find((o) => o.value === packageFilter)?.label ?? "", clear: () => setPackageFilter("all") }
      : null,
    countryFilter !== "all" ? { label: regionLabel(countryFilter), clear: () => setCountryFilter("all") } : null,
    riskFilter !== "all"
      ? { label: RISK_META[riskFilter as Exclude<RiskKey, "all">].label, clear: () => setRiskFilter("all") }
      : null,
    search.trim() ? { label: `"${search.trim()}"`, clear: () => setSearch("") } : null,
  ].filter(Boolean) as { label: string; clear: () => void }[];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      {/* Title + data tools */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm">
            {filtered.length === inRangeUsers.length
              ? `${inRangeUsers.length} ${inRangeUsers.length === 1 ? "member" : "members"}`
              : `${filtered.length} of ${inRangeUsers.length} members`}{" "}
            · <span className="font-semibold text-foreground">{range.label}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} className="justify-center" />
          <DataToolsMenu
            label="Import / Export"
            csvExport={{ filename: "users", rows: () => filtered as any }}
            csvImport={{ table: "profiles" }}
            onChanged={loadAll}
          />
        </div>
      </div>

      {/* Filter bar */}
      <div className="liquid-glass rounded-2xl p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="relative lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <FilterSelect
            icon={<Globe className="w-4 h-4 text-muted-foreground shrink-0" />}
            value={countryFilter}
            onChange={setCountryFilter}
            options={countryOptions}
            placeholder="All countries"
          />

          <FilterSelect
            icon={<PackageIcon className="w-4 h-4 text-muted-foreground shrink-0" />}
            value={packageFilter}
            onChange={setPackageFilter}
            options={packageOptions}
            placeholder="All packages"
          />

          <FilterSelect
            icon={<ArrowUpDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            value={sortKey}
            onChange={(v) => setSortKey(v as SortKey)}
            options={[
              { value: "recent", label: "Newest first" },
              { value: "least_active", label: "Least active first" },
              { value: "expiring", label: "Expiring soonest" },
              { value: "name", label: "Name A–Z" },
            ]}
            placeholder="Sort"
          />
        </div>

        {/* Risk / attention chips */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RISK_META) as Exclude<RiskKey, "all">[]).map((key) => (
            <RiskChip
              key={key}
              meta={RISK_META[key]}
              count={riskCounts[key] ?? 0}
              active={riskFilter === key}
              onClick={() => setRiskFilter(riskFilter === key ? "all" : key)}
            />
          ))}
        </div>

        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Filters</span>
            {activeChips.map((c, i) => (
              <button
                key={i}
                onClick={c.clear}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20"
              >
                {c.label}
                <X className="w-3 h-3" />
              </button>
            ))}
            <button
              onClick={() => {
                setPackageFilter("all");
                setCountryFilter("all");
                setRiskFilter("all");
                setSearch("");
              }}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Package stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Total members"
          value={stats.total}
          icon={<Users className="w-5 h-5" />}
          tone="primary"
          isActive={packageFilter === "all"}
          onClick={() => setPackageFilter("all")}
        />
        <StatCard
          label="No package"
          value={stats.none}
          icon={<UserX className="w-5 h-5" />}
          tone="amber"
          isActive={packageFilter === "none"}
          onClick={() => setPackageFilter(packageFilter === "none" ? "all" : "none")}
        />
        <StatCard
          label={packageOptions[2]?.label || "Foundation"}
          value={stats.foundation}
          icon={<PackageIcon className="w-5 h-5" />}
          tone="blue"
          isActive={packageFilter === "foundation"}
          onClick={() => setPackageFilter(packageFilter === "foundation" ? "all" : "foundation")}
        />
        <StatCard
          label={packageOptions[3]?.label || "Active"}
          value={stats.active}
          icon={<PackageIcon className="w-5 h-5" />}
          tone="emerald"
          isActive={packageFilter === "active"}
          onClick={() => setPackageFilter(packageFilter === "active" ? "all" : "active")}
        />
        <StatCard
          label={packageOptions[4]?.label || "Intensive"}
          value={stats.intensive}
          icon={<PackageIcon className="w-5 h-5" />}
          tone="purple"
          isActive={packageFilter === "intensive"}
          onClick={() => setPackageFilter(packageFilter === "intensive" ? "all" : "intensive")}
        />
      </div>

      {/* Table */}
      <div className="liquid-glass rounded-xl sm:rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1.3fr)_110px_24px] gap-4 items-center px-4 py-3 bg-muted/40 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <div>Name / Phone</div>
          <div>Country</div>
          <div>Package</div>
          <div>Start → End</div>
          <div>Coach</div>
          <div>Status</div>
          <div />
        </div>

        <div className="divide-y divide-border">
          {filtered.map((user) => {
            const isExpanded = expandedUser === user.id;
            const sub = subsByUser[user.user_id];
            const pkg = packageLabel(user.user_id);
            const r = risk.get(user.user_id);
            const left = daysLeft(sub?.expires_at);
            const coach = user.coach_name || (sub && aliasPlanKey(sub.plan_id) === "foundation" ? "—" : "Unassigned");
            return (
              <motion.div key={user.id} layout>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setProfileUserId(user.user_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setProfileUserId(user.user_id);
                    }
                  }}
                  className="w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1.3fr)_110px_24px] gap-3 md:gap-4 items-center px-3 sm:px-4 py-3 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary font-bold text-sm">
                        {user.name?.charAt(0)?.toUpperCase() || "?"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground font-semibold text-sm truncate">{user.name || "Unnamed"}</p>
                      <p className="text-muted-foreground text-xs truncate">{user.phone || "No phone"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <AdherencePill
                          summary={adherence.get(user.user_id)}
                          loading={adherenceLoading}
                          onNudge={() => setNudgeTarget({ userId: user.user_id, name: user.name || "Member" })}
                        />
                        {isSevereSugar(r) ? (
                          <FlagTag label="Severe sugar" tone="red" />
                        ) : isHighSugar(r) ? (
                          <FlagTag label="High sugar" tone="amber" />
                        ) : null}
                        {isSevereBp(r) ? (
                          <FlagTag label="Severe BP" tone="red" />
                        ) : isHighBp(r) ? (
                          <FlagTag label="High BP" tone="amber" />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:block min-w-0">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate">
                      <Globe className="w-3 h-3 shrink-0" />
                      <span className="truncate">{regionLabel(regionOf(user))}</span>
                    </span>
                  </div>

                  <div className="hidden md:block min-w-0">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary truncate">
                      <PackageIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{pkg}</span>
                    </span>
                  </div>

                  <div className="hidden md:block text-xs text-foreground tabular-nums">
                    {fmtDate(sub?.started_at)} <span className="text-muted-foreground">→</span> {fmtDate(sub?.expires_at)}
                    {left !== null && left >= 0 && left <= 30 && (
                      <span className="block text-[11px] font-semibold text-amber-600">Expires in {left}d</span>
                    )}
                  </div>

                  <div className="hidden md:block min-w-0">
                    <span
                      className={`inline-flex items-center gap-1 text-xs truncate ${
                        user.coach_name ? "text-emerald-600 font-medium" : "text-muted-foreground"
                      }`}
                    >
                      <UserCheck className="w-3 h-3 shrink-0" />
                      <span className="truncate">{coach}</span>
                    </span>
                    {userCategory(user.user_id) === "active" || userCategory(user.user_id) === "intensive" ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReassignTarget({ userId: user.user_id, name: user.name || "Member" });
                        }}
                        className="mt-1 block text-[11px] font-semibold text-primary hover:underline"
                      >
                        {user.coach_name ? "Reassign" : "Assign coach"}
                      </button>
                    ) : (
                      <span className="mt-1 block text-[11px] text-muted-foreground">No coach on this plan</span>
                    )}
                  </div>

                  <div className="hidden md:block">
                    <span
                      className={`text-[11px] px-2 py-1 rounded-full font-semibold ${
                        user.onboarding_completed
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {user.onboarding_completed ? "Active" : "Onboarding"}
                    </span>
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      aria-label={isExpanded ? "Collapse details" : "Expand details"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedUser(isExpanded ? null : user.id);
                      }}
                      className="p-1 rounded-md hover:bg-muted"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Mobile pills */}
                <div className="md:hidden px-3 sm:px-4 pb-3 grid grid-cols-1 min-[430px]:grid-cols-2 gap-1.5">
                  <Pill icon={<PackageIcon className="w-3 h-3" />} label={pkg} tone="blue" />
                  <Pill icon={<Globe className="w-3 h-3" />} label={regionLabel(regionOf(user))} tone="muted" />
                  <Pill label={`${fmtDate(sub?.started_at)} → ${fmtDate(sub?.expires_at)}`} tone="muted" />
                  {userCategory(user.user_id) === "active" || userCategory(user.user_id) === "intensive" ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReassignTarget({ userId: user.user_id, name: user.name || "Member" });
                      }}
                      className="text-left"
                    >
                      <Pill
                        icon={<UserCheck className="w-3 h-3" />}
                        label={`${coach} · ${user.coach_name ? "Reassign" : "Assign"}`}
                        tone={user.coach_name ? "green" : "muted"}
                      />
                    </button>
                  ) : (
                    <Pill icon={<UserCheck className="w-3 h-3" />} label="No coach on this plan" tone="muted" />
                  )}
                  <span
                    className={`text-[11px] px-2 py-1 rounded-full font-semibold ${
                      user.onboarding_completed
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    {user.onboarding_completed ? "Active" : "Onboarding"}
                  </span>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                        <div className="grid grid-cols-1 min-[390px]:grid-cols-2 sm:grid-cols-3 gap-3">
                          <InfoCell label="Package" value={pkg} />
                          <InfoCell label="Country" value={regionLabel(regionOf(user))} />
                          <InfoCell label="Start Date" value={fmtDate(sub?.started_at)} />
                          <InfoCell label="End Date" value={fmtDate(sub?.expires_at)} />
                          <InfoCell label="Coach" value={user.coach_name || "Unassigned"} />
                          <InfoCell label="Joined" value={fmtDate(user.created_at)} />
                          <InfoCell label="Age" value={user.age ? `${user.age} yrs` : "—"} />
                          <InfoCell label="Gender" value={user.gender || "—"} />
                          <InfoCell label="City" value={user.city || "—"} />
                          <InfoCell label="State" value={user.state || "—"} />
                          <InfoCell label="Height" value={user.height ? `${user.height} cm` : "—"} />
                          <InfoCell label="Weight" value={user.weight ? `${user.weight} kg` : "—"} />
                          <InfoCell label="BMI" value={user.bmi ? Number(user.bmi).toFixed(1) : "—"} />
                          <InfoCell label="BMI Category" value={user.bmi_category || "—"} />
                          <InfoCell label="Waist" value={user.waist ? `${user.waist} cm` : "—"} />
                          <InfoCell
                            label="Worst sugar (7d)"
                            value={r?.maxGlucose ? `${r.maxGlucose} mg/dL` : "—"}
                          />
                          <InfoCell
                            label="Worst BP (7d)"
                            value={r?.maxSystolic ? `${r.maxSystolic}/${r.maxDiastolic ?? "—"}` : "—"}
                          />
                        </div>

                        {user.goals && Array.isArray(user.goals) && user.goals.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Goals</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(user.goals as string[]).map((g, i) => (
                                <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                                  {g}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {user.clinical && typeof user.clinical === "object" && Object.keys(user.clinical).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Clinical Data</p>
                            <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-2">
                              {Object.entries(user.clinical as Record<string, any>).map(([k, v]) => (
                                <InfoCell key={k} label={k.replace(/_/g, " ")} value={String(v)} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p>No members match these filters</p>
            </div>
          )}
        </div>
      </div>

      <AdminUserProfileSheet userId={profileUserId} onOpenChange={(o) => !o && setProfileUserId(null)} />
      <AdherenceNudgeDialog
        open={!!nudgeTarget}
        onClose={() => setNudgeTarget(null)}
        userName={nudgeTarget?.name ?? ""}
        summary={nudgeTarget ? adherence.get(nudgeTarget.userId) ?? null : null}
      />
      {reassignTarget && (
        <ReassignCoachDialog
          open={!!reassignTarget}
          onOpenChange={(v) => !v && setReassignTarget(null)}
          userId={reassignTarget.userId}
          userName={reassignTarget.name}
          onDone={loadAll}
        />
      )}
    </div>
  );
}

/* ---------------------------------- bits --------------------------------- */

interface RiskMeta {
  label: string;
  icon: React.ReactNode;
  tone: "red" | "amber" | "blue" | "muted";
}

const RISK_META: Record<Exclude<RiskKey, "all">, RiskMeta> = {
  offtrack: { label: "Off track today", icon: <Activity className="w-3.5 h-3.5" />, tone: "amber" },
  inactive: { label: "Least active", icon: <Activity className="w-3.5 h-3.5" />, tone: "red" },
  severe_sugar: { label: "High blood sugar", icon: <Droplet className="w-3.5 h-3.5" />, tone: "red" },
  severe_bp: { label: "High BP", icon: <HeartPulse className="w-3.5 h-3.5" />, tone: "red" },
  no_coach: { label: "No coach assigned", icon: <UserPlus className="w-3.5 h-3.5" />, tone: "blue" },
  onboarding: { label: "Onboarding pending", icon: <UserX className="w-3.5 h-3.5" />, tone: "muted" },
  expiring: { label: "Expiring in 30 days", icon: <CalendarClock className="w-3.5 h-3.5" />, tone: "blue" },
};

function RiskChip({
  meta,
  count,
  active,
  onClick,
}: {
  meta: RiskMeta;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const tones = {
    red: "text-rose-600 bg-rose-500/10 ring-rose-500/40",
    amber: "text-amber-600 bg-amber-500/10 ring-amber-500/40",
    blue: "text-primary bg-primary/10 ring-primary/40",
    muted: "text-muted-foreground bg-muted ring-border",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
        tones[meta.tone]
      } ${active ? "ring-2" : "ring-1 ring-transparent hover:brightness-105"}`}
    >
      {meta.icon}
      <span>{meta.label}</span>
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

function FilterSelect({
  icon,
  value,
  onChange,
  options,
  placeholder,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full [&>span]:truncate">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden whitespace-nowrap [&>span]:truncate">
          {icon}
          <SelectValue placeholder={placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover z-50 max-h-72">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FlagTag({ label, tone }: { label: string; tone: "red" | "amber" }) {
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
        tone === "red" ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-600"
      }`}
    >
      {label}
    </span>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 p-2.5">
      <p className="text-xs text-muted-foreground capitalize">{label}</p>
      <p className="text-sm text-foreground font-medium break-words">{value}</p>
    </div>
  );
}

function Pill({
  icon,
  label,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  tone: "blue" | "green" | "muted";
}) {
  const cls =
    tone === "blue"
      ? "bg-primary/10 text-primary"
      : tone === "green"
      ? "bg-emerald-500/10 text-emerald-600"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg ${cls}`}>
      {icon}
      <span className="break-words leading-tight">{label}</span>
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  isActive,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "primary" | "amber" | "blue" | "emerald" | "purple";
  isActive?: boolean;
  onClick?: () => void;
}) {
  const toneClasses = {
    primary: "bg-primary/10 text-primary ring-primary/30",
    amber: "bg-amber-500/10 text-amber-600 ring-amber-500/30",
    blue: "bg-blue-500/10 text-blue-600 ring-blue-500/30",
    emerald: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30",
    purple: "bg-purple-500/10 text-purple-600 ring-purple-500/30",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`liquid-glass text-left p-3 sm:p-4 rounded-xl transition-all ${
        onClick ? "cursor-pointer hover:brightness-105 active:scale-[0.98]" : "cursor-default"
      } ${isActive ? `ring-2 ${toneClasses[tone].split(" ").pop()}` : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="text-2xl sm:text-3xl font-black text-foreground mt-1">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${toneClasses[tone].split(" ").slice(0, 2).join(" ")}`}>{icon}</div>
      </div>
    </button>
  );
}
