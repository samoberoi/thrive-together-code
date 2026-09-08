import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlanKey as aliasPlanKey } from "@/lib/subscriptionService";
import {
  UserCheck, CalendarClock, ChevronDown, ChevronUp, Phone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { whatsappCallUrl } from "@/lib/coachAvailability";
import CoachActivityRings from "@/components/coach/CoachActivityRings";
import TodayStepsCard from "@/components/TodayStepsCard";
import MetricTrendsSection from "@/components/MetricTrendsSection";
import CoachSelfCheckins from "@/components/coach/CoachSelfCheckins";
import AdminStreakBoard, { type AdminStreakClient } from "@/components/admin/AdminStreakBoard";
import { fetchRegionFxMap, regionOf, formatMoneyIn, type RegionFx } from "@/lib/currencyDisplay";

interface Profile { user_id: string; name: string | null; phone: string | null; region_code?: string | null; }
interface Subscription {
  id: string; user_id: string; plan_id: string; plan_name: string;
  plan_price: number; status: string;
  started_at: string; expires_at: string; created_at: string;
}
interface Package { plan_key: string; name: string; }
interface CoachRow { id: string; user_id: string | null; name: string | null; phone: string | null; is_active: boolean | null; }
interface AssignmentRow { coach_id: string; user_id: string; }

export default function AdminOverview() {
  const [loading, setLoading] = useState(true);

  const [packages, setPackages] = useState<Package[]>([]);
  const [allActiveSubs, setAllActiveSubs] = useState<Subscription[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [activeLoggerIds, setActiveLoggerIds] = useState<Set<string>>(new Set());
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);
  const navigate = useNavigate();
  const { greeting } = useLanguage();
  const [adminName, setAdminName] = useState<string>("");
  const [adminUserId, setAdminUserId] = useState<string | undefined>(undefined);
  const [adminHeightCm, setAdminHeightCm] = useState<number | null>(null);
  const [adminWeightKg, setAdminWeightKg] = useState<number | null>(null);
  const [regionFx, setRegionFx] = useState<Map<string, RegionFx>>(new Map());

  useEffect(() => { fetchRegionFxMap().then(setRegionFx).catch(() => {}); }, []);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      setAdminUserId(auth.user.id);
      const { data } = await supabase
        .from("profiles")
        .select("name, height, weight")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      setAdminName(((data as any)?.name || "").split(" ")[0]);
      setAdminHeightCm(((data as any)?.height ?? null) as number | null);
      setAdminWeightKg(((data as any)?.weight ?? null) as number | null);
    })();
  }, []);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);

    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [pkgRes, activeSubsRes, profilesAllRes, coachesRes, assignRes, logsRes] = await Promise.all([
      supabase.from("packages").select("plan_key, name"),
      supabase.from("subscriptions").select("*").eq("status", "active"),
      (supabase as any).from("profiles").select("user_id, name, phone, region_code"),
      supabase.from("coaches").select("id, user_id, name, phone, is_active").eq("is_active", true),
      supabase.from("coach_assignments").select("coach_id, user_id").eq("is_active", true),
      supabase.from("health_logs").select("user_id").gte("logged_at", since7).limit(5000),
    ]);

    setPackages((pkgRes.data ?? []) as Package[]);
    setAllActiveSubs((activeSubsRes.data ?? []) as Subscription[]);
    setCoaches((coachesRes.data ?? []) as CoachRow[]);
    setAssignments((assignRes.data ?? []) as AssignmentRow[]);
    setActiveLoggerIds(new Set(((logsRes.data ?? []) as { user_id: string }[]).map((l) => l.user_id)));

    const pmap = new Map<string, Profile>();
    const allProfiles = (profilesAllRes.data ?? []) as unknown as Profile[];
    for (const p of allProfiles) pmap.set(p.user_id, p);
    setProfileMap(pmap);

    setLoading(false);
  };

  // Currency helpers for renewal rows.
  const nativeMoney = useMemo(
    () => (s: Subscription) =>
      formatMoneyIn(s.plan_price || 0, regionOf(regionFx, profileMap.get(s.user_id)?.region_code)),
    [regionFx, profileMap]
  );

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
        // Skip orphaned assignments (user purged, profile row gone) — they used to
        // render as ghost "Unnamed / No phone" patients and inflate the counts.
        const patients = ids
          .filter((uid) => profileMap.has(uid))
          .map((uid) => ({
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

  // One row per paying user (latest active sub wins), plus every active coach,
  // used by the BBDO streak board.
  const streakClients = useMemo<AdminStreakClient[]>(() => {
    const byUser = new Map<string, AdminStreakClient>();
    for (const s of allActiveSubs) {
      const key = aliasPlanKey(s.plan_id);
      if (!key) continue;
      if (!profileMap.has(s.user_id)) continue;
      byUser.set(s.user_id, {
        user_id: s.user_id,
        name: profileMap.get(s.user_id)?.name || "Unnamed",
        planKey: key,
      });
    }
    // Coaches follow the same protocol, so they get their own streak group.
    for (const c of coaches) {
      if (!c.user_id) continue;
      byUser.set(c.user_id, {
        user_id: c.user_id,
        name: c.name || profileMap.get(c.user_id)?.name || "Unnamed coach",
        planKey: "coach",
      });
    }
    return Array.from(byUser.values());
  }, [allActiveSubs, profileMap, coaches]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-[clamp(20px,5.5vw,30px)] leading-[1.15] font-semibold tracking-[-0.03em] text-foreground break-words">
          {greeting || "Good morning"}, {adminName || "Admin"} <span className="inline-block">👋</span>
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          Rings, health & coaches
        </p>
      </div>

      {/* The admin's own daily habit rings + check-ins — same engine as coaches. */}
      <CoachActivityRings />

      {/* Admin's own step ring with manual health sync — same card users get. */}
      <TodayStepsCard />

      <CoachSelfCheckins />

      {/* Admin's own long-run trends — same component the end user sees. */}
      <MetricTrendsSection userId={adminUserId} heightCm={adminHeightCm} weightKg={adminWeightKg} />

      {/* BBDO streaks for every paying user, filterable by package. */}
      <AdminStreakBoard clients={streakClients} packages={packages.map((p) => ({ key: p.plan_key, name: p.name }))} />

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
                      {s.plan_name} · {nativeMoney(s)}
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
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] mt-0.5">
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
                            <li className="px-3 py-4 text-xs text-muted-foreground text-center">No clients assigned</li>
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
