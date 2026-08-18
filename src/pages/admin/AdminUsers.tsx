import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlanKey as aliasPlanKey } from "@/lib/subscriptionService";
import { Search, ChevronDown, ChevronUp, Package as PackageIcon, UserCheck, Users, UserX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { motion, AnimatePresence } from "framer-motion";

import ExportCsvButton from "@/components/admin/ExportCsvButton";
import ImportCsvButton from "@/components/admin/ImportCsvButton";
import AdminUserProfileSheet from "@/components/admin/AdminUserProfileSheet";
import AdherencePill from "@/components/admin/AdherencePill";
import AdherenceNudgeDialog from "@/components/admin/AdherenceNudgeDialog";
import { useAdherence } from "@/hooks/useAdherence";




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


const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [subsByUser, setSubsByUser] = useState<Record<string, Subscription>>({});
  const [pkgNames, setPkgNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [packageFilter, setPackageFilter] = useState<string>("all");

  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [nudgeTarget, setNudgeTarget] = useState<{ userId: string; name: string } | null>(null);


  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [usersRes, subsRes, pkgsRes, rolesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("subscriptions")
        .select("user_id, plan_id, plan_name, started_at, expires_at, status")
        .eq("status", "active")
        .order("started_at", { ascending: false }),
      supabase.from("packages").select("plan_key, name"),
      supabase.from("user_roles").select("user_id, role").in("role", ["coach", "admin"]),
    ]);


    // Exclude coaches and super admins — this screen is end-users only.
    const staffIds = new Set<string>((rolesRes.data ?? []).map((r: any) => r.user_id));
    if (usersRes.data) {
      setUsers((usersRes.data as UserProfile[]).filter((u) => !staffIds.has(u.user_id)));
    }

    const map: Record<string, Subscription> = {};
    for (const s of (subsRes.data ?? []) as Subscription[]) {
      // Keep latest per user (already ordered desc).
      if (!map[s.user_id]) map[s.user_id] = s;
    }
    setSubsByUser(map);

    const names: Record<string, string> = {};
    for (const p of (pkgsRes.data ?? []) as any[]) names[p.plan_key] = p.name;
    setPkgNames(names);

    setLoading(false);
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

  const adherenceIds = useMemo(() => users.map((u) => u.user_id), [users]);
  const { map: adherence, loading: adherenceLoading } = useAdherence(adherenceIds);

  const stats = useMemo(() => {
    const counts = { none: 0, foundation: 0, active: 0, intensive: 0 };
    for (const u of users) {
      counts[userCategory(u.user_id)]++;
    }
    return { total: users.length, ...counts };
  }, [users, subsByUser]);

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

  const filtered = useMemo(
    () =>
      users.filter((u) => {
        const category = userCategory(u.user_id);
        if (packageFilter !== "all" && category !== packageFilter) return false;
        const q = search.toLowerCase().trim();
        if (!q) return true;
        return (
          u.name?.toLowerCase().includes(q) ||
          u.phone?.includes(q) ||
          u.city?.toLowerCase().includes(q) ||
          packageLabel(u.user_id).toLowerCase().includes(q) ||
          u.coach_name?.toLowerCase().includes(q)
        );
      }),
    [users, search, packageFilter, subsByUser, pkgNames]
  );



  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm">
            {filtered.length === users.length
              ? `${users.length} ${users.length === 1 ? "user" : "users"} total`
              : `${filtered.length} of ${users.length} users`}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
          <div className="relative col-span-2 w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={packageFilter} onValueChange={setPackageFilter}>
            <SelectTrigger className="col-span-2 w-full sm:w-56">
              <div className="flex items-center gap-2 min-w-0">
                <PackageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder="All packages" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="all">All packages</SelectItem>
              {packageOptions.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportCsvButton filename="users" rows={filtered as any} className="w-full justify-center sm:w-fit" />

          <ImportCsvButton table="profiles" onImported={() => window.location.reload()} className="w-full justify-center sm:w-fit" />
        </div>

      </div>


      {/* Table */}
      <div className="liquid-glass rounded-xl sm:rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_110px_24px] gap-4 items-center px-4 py-3 bg-muted/40 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <div>Name / Phone</div>
          <div>Package</div>
          <div>Start → End</div>
          <div>Coach</div>
          <div>Status</div>
          <div />
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {filtered.map((user) => {
            const isExpanded = expandedUser === user.id;
            const sub = subsByUser[user.user_id];
            const pkg = packageLabel(user.user_id);
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
                  className="w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_110px_24px] gap-3 md:gap-4 items-center px-3 sm:px-4 py-3 text-left hover:bg-muted/30 transition-colors cursor-pointer"
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
                      <div className="mt-1">
                        <AdherencePill
                          summary={adherence.get(user.user_id)}
                          loading={adherenceLoading}
                          onNudge={() => setNudgeTarget({ userId: user.user_id, name: user.name || "Member" })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:block min-w-0">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary truncate">
                      <PackageIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{pkg}</span>
                    </span>
                  </div>

                  <div className="hidden md:block text-xs text-foreground tabular-nums">
                    {fmtDate(sub?.started_at)} <span className="text-muted-foreground">→</span> {fmtDate(sub?.expires_at)}
                  </div>

                  <div className="hidden md:block min-w-0">
                    <span className={`inline-flex items-center gap-1 text-xs truncate ${user.coach_name ? "text-emerald-600 font-medium" : "text-muted-foreground"}`}>
                      <UserCheck className="w-3 h-3 shrink-0" />
                      <span className="truncate">{coach}</span>
                    </span>
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
                  <Pill label={`${fmtDate(sub?.started_at)} → ${fmtDate(sub?.expires_at)}`} tone="muted" />
                  <Pill icon={<UserCheck className="w-3 h-3" />} label={coach} tone={user.coach_name ? "green" : "muted"} />
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
              <p>No users found</p>
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
    </div>



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
