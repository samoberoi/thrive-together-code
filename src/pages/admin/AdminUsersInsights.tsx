import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Users as UsersIcon, AlertTriangle, Heart, UserCheck, Search,
  Sparkles, Activity, ShieldCheck, Crown, Leaf, Phone, ChevronRight, MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { whatsappCallUrl } from "@/lib/coachAvailability";
import { cn } from "@/lib/utils";


type PlanKey = "foundation" | "active" | "intensive";
type Severity = "high" | "medium" | "ok";

interface Profile { user_id: string; name: string | null; phone: string | null; }
interface Subscription { user_id: string; plan_id: string; status: string; started_at: string; expires_at: string; }
interface Coach { id: string; name: string | null; }
interface Assignment { user_id: string; coach_id: string; is_active: boolean; }
interface HealthLog {
  user_id: string; logged_at: string;
  glucose_morning: number | null; glucose_evening: number | null;
  bp_systolic: number | null; bp_diastolic: number | null;
  weight_kg: number | null;
}

interface Row {
  user_id: string;
  name: string;
  phone: string;
  plan: PlanKey;
  coachName: string | null;
  severity: Severity;
  reason: string;
  lastSeen: string | null;
}

const aliasPlanKey = (planId: string | null | undefined): PlanKey | null => {
  if (!planId) return null;
  if (planId === "starter" || planId === "foundation") return "foundation";
  if (planId === "active") return "active";
  if (planId === "pro" || planId === "intensive") return "intensive";
  return null;
};

const PLAN_META: Record<PlanKey, {
  label: string; tagline: string; icon: any;
  accent: string; accentBg: string; ring: string; gradient: string;
}> = {
  foundation: {
    label: "Foundation Care",
    tagline: "Self-paced · no coach assigned",
    icon: Leaf,
    accent: "text-amber-700 dark:text-amber-400",
    accentBg: "bg-amber-500/10",
    ring: "ring-amber-500/20",
    gradient: "from-amber-500/15 via-amber-500/5 to-transparent",
  },
  active: {
    label: "Active Health Tracker",
    tagline: "Coach-supported tracking",
    icon: Activity,
    accent: "text-secondary",
    accentBg: "bg-secondary/10",
    ring: "ring-secondary/20",
    gradient: "from-secondary/15 via-secondary/5 to-transparent",
  },
  intensive: {
    label: "Intensive Reversal Care",
    tagline: "1:1 coach-led reversal protocol",
    icon: Crown,
    accent: "text-destructive",
    accentBg: "bg-destructive/10",
    ring: "ring-destructive/20",
    gradient: "from-destructive/15 via-destructive/5 to-transparent",
  },
};

function severityFromLogs(logs: HealthLog[]): { severity: Severity; reason: string; lastSeen: string | null } {
  let best: Severity = "ok";
  let reason = "All metrics in safe range";
  const bump = (s: Severity, r: string) => {
    if (s === "high" || (s === "medium" && best === "ok")) { best = s; reason = r; }
  };
  let lastSeen: string | null = null;
  for (const l of logs) {
    if (!lastSeen || new Date(l.logged_at) > new Date(lastSeen)) lastSeen = l.logged_at;
    const g = l.glucose_morning ?? l.glucose_evening;
    if (g != null) {
      if (g >= 250) bump("high", `Severe hyperglycaemia · ${g} mg/dL`);
      else if (g <= 60) bump("high", `Hypoglycaemia · ${g} mg/dL`);
      else if (g >= 180) bump("medium", `Elevated glucose · ${g} mg/dL`);
    }
    const s = l.bp_systolic, d = l.bp_diastolic;
    if (s != null || d != null) {
      if ((s ?? 0) >= 180 || (d ?? 0) >= 120) bump("high", `Hypertensive crisis · ${s ?? "-"}/${d ?? "-"}`);
      else if ((s ?? 0) >= 140 || (d ?? 0) >= 90) bump("medium", `Elevated BP · ${s ?? "-"}/${d ?? "-"}`);
      else if ((s ?? 999) <= 90 || (d ?? 999) <= 60) bump("medium", `Low BP · ${s ?? "-"}/${d ?? "-"}`);
    }
  }
  if (!lastSeen && best === "ok") reason = "No recent logs — gentle nudge suggested";
  return { severity: best, reason, lastSeen };
}

const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, ok: 2 };

export default function AdminUsersInsights() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeTab, setActiveTab] = useState<PlanKey>("foundation");
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [profilesRes, subsRes, coachesRes, assignsRes, logsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, name, phone"),
        supabase.from("subscriptions").select("user_id, plan_id, status, started_at, expires_at").eq("status", "active"),
        supabase.from("coaches").select("id, name"),
        supabase.from("coach_assignments").select("user_id, coach_id, is_active").eq("is_active", true),
        supabase.from("health_logs")
          .select("user_id, logged_at, glucose_morning, glucose_evening, bp_systolic, bp_diastolic, weight_kg")
          .gte("logged_at", since).limit(5000),
      ]);

      const profiles = (profilesRes.data ?? []) as Profile[];
      const subs = (subsRes.data ?? []) as Subscription[];
      const coaches = (coachesRes.data ?? []) as Coach[];
      const assigns = (assignsRes.data ?? []) as Assignment[];
      const logs = (logsRes.data ?? []) as HealthLog[];

      setTotalUsers(profiles.length);
      const coachMap = new Map(coaches.map((c) => [c.id, c.name]));
      const assignMap = new Map<string, string>();
      for (const a of assigns) assignMap.set(a.user_id, a.coach_id);

      const planByUser = new Map<string, PlanKey>();
      for (const s of subs) {
        const k = aliasPlanKey(s.plan_id);
        if (!k) continue;
        if (!planByUser.has(s.user_id)) planByUser.set(s.user_id, k);
      }

      const logsByUser = new Map<string, HealthLog[]>();
      for (const l of logs) {
        const arr = logsByUser.get(l.user_id) || [];
        arr.push(l); logsByUser.set(l.user_id, arr);
      }

      const out: Row[] = [];
      for (const p of profiles) {
        const plan = planByUser.get(p.user_id);
        if (!plan) continue;
        const coachId = assignMap.get(p.user_id);
        const { severity, reason, lastSeen } = severityFromLogs(logsByUser.get(p.user_id) || []);
        out.push({
          user_id: p.user_id,
          name: p.name || "Unnamed",
          phone: p.phone || "",
          plan,
          coachName: coachId ? coachMap.get(coachId) ?? null : null,
          severity,
          reason,
          lastSeen,
        });
      }
      setRows(out);
      setLoading(false);
    })();
  }, []);

  const counts = useMemo(() => {
    const c: Record<PlanKey, { total: number; high: number; medium: number; ok: number; withCoach: number }> = {
      foundation: { total: 0, high: 0, medium: 0, ok: 0, withCoach: 0 },
      active: { total: 0, high: 0, medium: 0, ok: 0, withCoach: 0 },
      intensive: { total: 0, high: 0, medium: 0, ok: 0, withCoach: 0 },
    };
    for (const r of rows) {
      c[r.plan].total += 1;
      c[r.plan][r.severity] += 1;
      if (r.coachName) c[r.plan].withCoach += 1;
    }
    return c;
  }, [rows]);

  const totals = useMemo(() => {
    const enrolled = rows.length;
    const high = rows.filter((r) => r.severity === "high").length;
    const medium = rows.filter((r) => r.severity === "medium").length;
    const healthy = rows.filter((r) => r.severity === "ok").length;
    const coached = rows.filter((r) => r.coachName).length;
    return { enrolled, high, medium, healthy, coached };
  }, [rows]);

  // Coach load summary across all coach-served plans
  const coachLoad = useMemo(() => {
    const map = new Map<string, { coach: string; total: number; high: number; medium: number }>();
    for (const r of rows) {
      if (!r.coachName) continue;
      const entry = map.get(r.coachName) || { coach: r.coachName, total: 0, high: 0, medium: 0 };
      entry.total += 1;
      if (r.severity === "high") entry.high += 1;
      if (r.severity === "medium") entry.medium += 1;
      map.set(r.coachName, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.high - a.high || b.total - a.total);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => r.plan === activeTab)
      .filter((r) => severityFilter === "all" || r.severity === severityFilter)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.phone.includes(q) || (r.coachName ?? "").toLowerCase().includes(q))
      .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.name.localeCompare(b.name));
  }, [rows, activeTab, severityFilter, query]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[100svh] max-h-[100svh] overflow-y-auto overscroll-y-contain bg-background">
      {/* Ambient hero background */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent pointer-events-none" />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-secondary/10 blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-[calc(env(safe-area-inset-top)+1rem)] sm:pt-8 pb-6 sm:pb-10">
          <button
            onClick={() => navigate("/admin-dashboard")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
          >
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </button>

          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-3">
                <Sparkles className="w-3.5 h-3.5" /> Member Intelligence
              </div>
              <h1 className="text-[clamp(24px,7vw,44px)] font-black text-foreground leading-[1.05] tracking-tight">
                Total Users <span className="text-primary">·</span>{" "}
                <CountUp value={totalUsers} />
              </h1>
              <p className="text-muted-foreground text-sm mt-2 max-w-xl">
                Every enrolled member, the package they're on, the coach they're with and how their health is trending — at a glance.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full sm:w-auto">
              <HeroStat icon={AlertTriangle} label="Need attention" value={totals.high + totals.medium} tone="text-destructive" bg="bg-destructive/10" />
              <HeroStat icon={Heart} label="Healthy" value={totals.healthy} tone="text-emerald-600" bg="bg-emerald-500/10" />
              <HeroStat icon={UserCheck} label="With coach" value={totals.coached} tone="text-secondary" bg="bg-secondary/10" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-[calc(env(safe-area-inset-bottom)+4rem)] space-y-6 sm:space-y-8">

        {/* Plan category cards */}
        <div className="grid md:grid-cols-3 gap-4">
          {(Object.keys(PLAN_META) as PlanKey[]).map((k, idx) => {
            const meta = PLAN_META[k];
            const c = counts[k];
            const Icon = meta.icon;
            const active = activeTab === k;
            const share = totals.enrolled > 0 ? (c.total / totals.enrolled) * 100 : 0;
            return (
              <motion.button
                key={k}
                onClick={() => setActiveTab(k)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                whileTap={{ scale: 0.99 }}
                className={cn(
                  "relative text-left rounded-3xl p-5 overflow-hidden transition-all",
                  "border bg-card",
                  active ? `border-transparent ring-2 ${meta.ring} shadow-card` : "border-border hover:border-foreground/20"
                )}
              >
                <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none opacity-80", meta.gradient)} />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center", meta.accentBg)}>
                      <Icon className={cn("w-5 h-5", meta.accent)} strokeWidth={2} />
                    </div>
                    <div className="text-right">
                      <p className="text-2xl sm:text-3xl font-black text-foreground leading-none"><CountUp value={c.total} /></p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">members</p>
                    </div>
                  </div>

                  <p className="font-bold text-foreground text-base mt-4">{meta.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{meta.tagline}</p>

                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-4">
                    <div className={cn("h-full rounded-full", meta.accent.replace("text-", "bg-"))} style={{ width: `${share}%` }} />
                  </div>

                  <div className="flex items-center gap-3 mt-3 text-[11px] font-semibold">
                    <span className="text-destructive">⚠ {c.high}</span>
                    <span className="text-amber-600">• {c.medium} watch</span>
                    <span className="text-emerald-600 ml-auto">✓ {c.ok} healthy</span>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                    {k === "foundation"
                      ? <>No coach mapping · self-paced journey</>
                      : <><UserCheck className="w-3 h-3" /> {c.withCoach}/{c.total} mapped to a coach</>}
                  </div>

                  {active && (
                    <motion.div
                      layoutId="plan-active"
                      className={cn("absolute -bottom-1 left-5 right-5 h-0.5 rounded-full", meta.accent.replace("text-", "bg-"))}
                    />
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${PLAN_META[activeTab].label} by name, phone or coach…`}
              className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-border bg-card text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-1.5 rounded-2xl bg-muted p-1">
            {([
              { id: "all", label: "All", count: counts[activeTab].total },
              { id: "high", label: "High risk", count: counts[activeTab].high },
              { id: "medium", label: "Watch", count: counts[activeTab].medium },
              { id: "ok", label: "Healthy", count: counts[activeTab].ok },
            ] as const).map((f) => (
              <button
                key={f.id}
                onClick={() => setSeverityFilter(f.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5",
                  severityFilter === f.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
                <span className={cn(
                  "px-1.5 rounded-full text-[10px] font-bold",
                  severityFilter === f.id ? "bg-primary/10 text-primary" : "bg-muted-foreground/10"
                )}>{f.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* User list */}
        <motion.div
          key={activeTab + severityFilter}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="rounded-3xl bg-card border border-border overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-foreground">{PLAN_META[activeTab].label} members</h3>
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} showing</span>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No members match these filters</div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r, idx) => (
                <motion.li
                  key={r.user_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(idx, 6) * 0.02, duration: 0.18 }}
                  className="px-5 py-4 hover:bg-accent/40 transition-colors flex items-center gap-4"
                >
                  <Avatar name={r.name} severity={r.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                      <SeverityChip severity={r.severity} />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                      {r.phone && (<span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</span>)}
                      <span>
                        {r.plan === "foundation"
                          ? "Self-paced (no coach)"
                          : r.coachName ? `Coach ${r.coachName}` : "Awaiting coach"}
                      </span>
                      {r.lastSeen && <span>· Last log {timeAgo(r.lastSeen)}</span>}
                    </div>
                  </div>
                  <div className="text-right hidden lg:block max-w-[260px]">
                    <p className={cn(
                      "text-xs font-semibold",
                      r.severity === "high" ? "text-destructive" : r.severity === "medium" ? "text-amber-600" : "text-emerald-600"
                    )}>
                      {r.reason}
                    </p>
                  </div>
                  {r.phone ? (
                    <a
                      href={whatsappCallUrl(r.phone, `Hi ${r.name}, this is the BBDO team checking in on your progress.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> Chat
                    </a>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}

                </motion.li>
              ))}
            </ul>
          )}
        </motion.div>

        {/* Coach load (only meaningful for plans with coaches) */}
        {coachLoad.length > 0 && (
          <div className="rounded-3xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <UserCheck className="w-4 h-4 text-secondary" />
              <h3 className="font-bold text-foreground">Coach load · who's carrying what</h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {coachLoad.map((c) => (
                <div key={c.coach} className="rounded-2xl border border-border p-4 hover:border-foreground/20 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground text-sm truncate">{c.coach}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/10 text-secondary font-bold">{c.total}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px]">
                    {c.high > 0 ? <span className="text-destructive font-semibold">⚠ {c.high} high</span> : <span className="text-emerald-600 font-semibold">✓ none high</span>}
                    {c.medium > 0 && <span className="text-amber-600 font-semibold">• {c.medium} watch</span>}
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
                    <div className="h-full bg-destructive" style={{ width: `${(c.high / Math.max(c.total, 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HeroStat({ icon: Icon, label, value, tone, bg }: { icon: any; label: string; value: number; tone: string; bg: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-3 min-w-0">
      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-2", bg)}>
        <Icon className={cn("w-4 h-4", tone)} strokeWidth={2} />
      </div>
      <p className="text-xl font-black text-foreground leading-none"><CountUp value={value} /></p>
      <p className="text-[10px] text-muted-foreground mt-1 font-medium">{label}</p>
    </div>
  );
}

function SeverityChip({ severity }: { severity: Severity }) {
  if (severity === "high") {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive uppercase tracking-wider">High risk</span>;
  }
  if (severity === "medium") {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 uppercase tracking-wider">Watch</span>;
  }
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 uppercase tracking-wider">Healthy</span>;
}

function Avatar({ name, severity }: { name: string; severity: Severity }) {
  const initials = name.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const ring = severity === "high" ? "ring-destructive/40" : severity === "medium" ? "ring-amber-500/40" : "ring-emerald-500/40";
  return (
    <div className={cn("w-10 h-10 rounded-2xl bg-muted flex items-center justify-center font-bold text-sm text-foreground ring-2 shrink-0", ring)}>
      {initials}
    </div>
  );
}

function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n.toLocaleString("en-IN")}</>;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
