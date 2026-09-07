import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlanKey } from "@/lib/subscriptionService";
import { Users, UserCheck, UserX, Sparkles, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { logAudit } from "@/lib/auditLog";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import ImportCsvButton from "@/components/admin/ImportCsvButton";
import ReassignCoachDialog from "@/components/admin/ReassignCoachDialog";

interface Package {
  plan_key: string;
  name: string;
  tagline: string | null;
  sort_order: number;
  assigns_coach: boolean;
}

interface Coach {
  id: string;
  name: string;
  coach_type: "starter_reset" | "active_reset" | "pro_transformation";
  is_active: boolean;
  avg_rating: number | null;
}

interface Profile {
  user_id: string;
  name: string | null;
  phone: string | null;
  coach_name: string | null;
}

interface Subscription {
  user_id: string;
  plan_id: string;
  started_at: string;
  expires_at: string;
  status: string;
}

interface Assignment {
  id: string;
  user_id: string;
  coach_id: string;
  is_active: boolean;
  assigned_at: string;
}

const aliasPlanKey = (planId: string): string => normalizePlanKey(planId) ?? planId;

// Map package plan_key → coach_type used in the coaches table.
const coachTypeForPackage = (key: string): Coach["coach_type"] | null => {
  if (key === "active") return "active_reset";
  if (key === "intensive") return "pro_transformation";
  return null;
};

export default function AdminAssignments() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [reassign, setReassign] = useState<{ userId: string; name: string; coachType: string | null } | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [pkgRes, coachRes, profRes, subRes, asnRes] = await Promise.all([
      supabase.from("packages").select("plan_key, name, tagline, sort_order, assigns_coach").eq("enabled", true).order("sort_order"),
      supabase.from("coaches").select("id, name, coach_type, is_active, avg_rating").eq("is_active", true),
      supabase.from("profiles").select("user_id, name, phone, coach_name"),
      supabase.from("subscriptions").select("user_id, plan_id, started_at, expires_at, status").eq("status", "active"),
      supabase.from("coach_assignments").select("id, user_id, coach_id, is_active, assigned_at"),
    ]);
    setPackages((pkgRes.data ?? []) as Package[]);
    setCoaches((coachRes.data ?? []) as Coach[]);
    setProfiles((profRes.data ?? []) as Profile[]);
    setSubs((subRes.data ?? []) as Subscription[]);
    setAssignments((asnRes.data ?? []) as Assignment[]);
    setLoading(false);
  };

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);

  // Users grouped by package_key (aliased).
  const usersByPackage = useMemo(() => {
    const m: Record<string, Subscription[]> = {};
    // Keep latest per user
    const latestByUser = new Map<string, Subscription>();
    for (const s of [...subs].sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at))) {
      if (!latestByUser.has(s.user_id)) latestByUser.set(s.user_id, s);
    }
    for (const s of latestByUser.values()) {
      const k = aliasPlanKey(s.plan_id);
      (m[k] ||= []).push(s);
    }
    return m;
  }, [subs]);

  // For each coach: list of active assignments to users in the matching package.
  const activeByCoach = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (!a.is_active) continue;
      const arr = m.get(a.coach_id) ?? [];
      arr.push(a);
      m.set(a.coach_id, arr);
    }
    return m;
  }, [assignments]);

  /** Run round-robin assignment for every unassigned user in this package. */
  const runRoundRobin = async (pkg: Package) => {
    const ct = coachTypeForPackage(pkg.plan_key);
    if (!ct) {
      toast.info("Foundation Care does not get a coach assigned.");
      return;
    }
    const pkgCoaches = coaches.filter((c) => c.coach_type === ct);
    if (pkgCoaches.length === 0) {
      toast.error(`No coaches mapped to ${pkg.name}. Add coaches first.`);
      return;
    }
    const pkgUsers = usersByPackage[pkg.plan_key] ?? [];
    // Pick users with no active assignment.
    const assignedUserIds = new Set(assignments.filter((a) => a.is_active).map((a) => a.user_id));
    const targets = pkgUsers.filter((u) => !assignedUserIds.has(u.user_id));
    if (targets.length === 0) {
      toast.info("Every user on this package already has a coach.");
      return;
    }
    setRunning(pkg.plan_key);
    let ok = 0;
    let fail = 0;
    for (const u of targets) {
      const { error } = await supabase.rpc("assign_coach_for_plan" as any, {
        _user_id: u.user_id,
        _plan_id: pkg.plan_key,
      });
      if (error) fail += 1;
      else ok += 1;
    }
    await loadAll();
    setRunning(null);
    toast.success(`Assigned ${ok} user${ok === 1 ? "" : "s"}${fail ? ` · ${fail} failed` : ""}`);
    logAudit({ module: "Assignments", action: "rebalance", target_type: "package", target_id: pkg.plan_key, target_label: pkg.name, metadata: { assigned: ok, failed: fail } });
  };

  const toggleAssignment = async (a: Assignment) => {
    await supabase.from("coach_assignments").update({ is_active: !a.is_active } as any).eq("id", a.id);
    toast.success(a.is_active ? "Assignment deactivated" : "Assignment activated");
    logAudit({ module: "Assignments", action: a.is_active ? "unassign" : "assign", target_type: "coach_assignment", target_id: a.id, metadata: { coach_id: a.coach_id, user_id: a.user_id } });
    await loadAll();
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground">Coach Assignments</h1>
          <p className="text-muted-foreground text-sm">
            Round-robin assignment by package — each user goes to the coach with the fewest active patients.
          </p>
        </div>
        <ExportCsvButton filename="coach-assignments" rows={assignments as any} />
<ImportCsvButton table="coach_assignments" onImported={() => window.location.reload()} />
      </div>

      {packages.map((pkg) => {
        const ct = coachTypeForPackage(pkg.plan_key);
        const pkgCoaches = ct ? coaches.filter((c) => c.coach_type === ct) : [];
        const pkgUsers = usersByPackage[pkg.plan_key] ?? [];
        const assignedUserIds = new Set(assignments.filter((a) => a.is_active).map((a) => a.user_id));
        const unassigned = pkgUsers.filter((u) => !assignedUserIds.has(u.user_id));
        const isOpen = open[pkg.plan_key] ?? true;
        const noCoach = !pkg.assigns_coach || !ct;

        return (
          <div key={pkg.plan_key} className="liquid-glass rounded-2xl overflow-hidden">
            <button
              onClick={() => setOpen((o) => ({ ...o, [pkg.plan_key]: !isOpen }))}
              className="w-full flex items-center justify-between gap-4 p-4 text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-foreground">{pkg.name}</h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {pkgUsers.length} user{pkgUsers.length === 1 ? "" : "s"}
                  </span>
                  {!noCoach && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                      {pkgCoaches.length} coach{pkgCoaches.length === 1 ? "" : "es"}
                    </span>
                  )}
                  {noCoach && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      No coach assigned
                    </span>
                  )}
                </div>
                {pkg.tagline && <p className="text-xs text-muted-foreground mt-0.5">{pkg.tagline}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!noCoach && (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      runRoundRobin(pkg);
                    }}
                    disabled={running === pkg.plan_key || unassigned.length === 0 || pkgCoaches.length === 0}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {running === pkg.plan_key
                      ? "Assigning…"
                      : unassigned.length === 0
                      ? "All assigned"
                      : `Round-robin ${unassigned.length}`}
                  </Button>
                )}
                {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-4">
                    {noCoach ? (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/40 text-sm text-muted-foreground">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        <p>
                          <strong>{pkg.name}</strong> users are self-guided — the system never assigns a coach. Showing{" "}
                          {pkgUsers.length} member{pkgUsers.length === 1 ? "" : "s"} for visibility.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Coaches & load
                        </div>
                        {pkgCoaches.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No coaches mapped to this package yet. Add coaches in the Coaches tab.
                          </p>
                        ) : (
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {pkgCoaches
                              .slice()
                              .sort(
                                (a, b) =>
                                  (activeByCoach.get(a.id)?.length ?? 0) - (activeByCoach.get(b.id)?.length ?? 0)
                              )
                              .map((c) => {
                                const load = activeByCoach.get(c.id)?.length ?? 0;
                                return (
                                  <div
                                    key={c.id}
                                    className="flex items-center justify-between rounded-xl bg-white border border-border p-3"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                                      <p className="text-[11px] text-muted-foreground">
                                        ★ {c.avg_rating?.toFixed(1) ?? "—"}
                                      </p>
                                    </div>
                                    <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary shrink-0">
                                      {load} active
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </>
                    )}

                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pt-2">
                      Members
                    </div>
                    {pkgUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No members on this package yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {pkgUsers.map((u) => {
                          const prof = profileMap.get(u.user_id);
                          const a = assignments.find((x) => x.user_id === u.user_id && x.is_active);
                          const coach = a ? coaches.find((c) => c.id === a.coach_id) : null;
                          return (
                            <div
                              key={u.user_id}
                              className="flex items-center justify-between gap-3 rounded-xl bg-white border border-border p-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <Users className="w-4 h-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">
                                    {prof?.name || "Unnamed"}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">{prof?.phone || "—"}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {noCoach ? (
                                  <span className="text-[11px] text-muted-foreground">Self-guided</span>
                                ) : coach ? (
                                  <>
                                    <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600">
                                      → {coach.name}
                                    </span>
                                    {a && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleAssignment(a)}
                                        className="h-7 w-7 p-0"
                                        title="Deactivate assignment"
                                      >
                                        <UserX className="w-4 h-4 text-destructive" />
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-500/10 text-amber-600">
                                    <UserCheck className="w-3 h-3" />
                                    Unassigned
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
