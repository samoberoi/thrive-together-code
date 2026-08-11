import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Pill, Check, Clock, AlertTriangle, Droplets,
  Coffee, Sun, Moon, Loader2, Flame, Trophy, Plus, Search, Sparkles, Minus, Lock, Leaf, Zap, Drumstick
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchUserPlan, fetchPlanItems, fetchSupplements, createUserPlan, addPlanItem, removePlanItem,
  fetchTodayTracking, toggleTracking, fetchTrackingHistory,
  CATEGORY_COLORS, CATEGORY_BG,
  type UserSupplementPlan, type PlanItem, type Supplement, type SupplementTracking, type VegType
} from "@/lib/supplementService";

import {
  fetchSupplementBadgeDefinitions, fetchUserSupplementBadges,
  getSupplementBadgeLevel, calculateSupplementStreak,
  checkAndAwardSupplementBadges,
  type SupplementBadge, type UserSupplementBadge
} from "@/lib/supplementBadgeService";

export default function UserSupplements({ simpleMode = false }: { simpleMode?: boolean } = {}) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<UserSupplementPlan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [todayTracking, setTodayTracking] = useState<SupplementTracking[]>([]);
  const [weekHistory, setWeekHistory] = useState<SupplementTracking[]>([]);
  const [loading, setLoading] = useState(true);

  // Foundation-kit filtering
  const [dietSlug, setDietSlug] = useState<string | null>(null);
  const [foundationalKit, setFoundationalKit] = useState<{ supplement_id: string; duration_weeks: number }[]>([]);

  // Badge/streak state
  const [allBadges, setAllBadges] = useState<SupplementBadge[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<UserSupplementBadge[]>([]);
  const [streak, setStreak] = useState({ currentStreak: 0, longestStreak: 0 });

  const today = new Date().toISOString().split("T")[0];

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [p, supps, badgeDefs, userBadges, dietRes, kitRes] = await Promise.all([
        fetchUserPlan(user.id),
        fetchSupplements(),
        fetchSupplementBadgeDefinitions(),
        fetchUserSupplementBadges(user.id),
        supabase.from("user_diet_profiles" as any).select("diet_preference").eq("user_id", user.id).maybeSingle(),
        supabase.from("supplement_condition_rules" as any).select("supplement_id, duration_weeks").eq("condition", "foundational").eq("is_active", true),
      ]);
      setPlan(p);
      setSupplements(supps);
      setAllBadges(badgeDefs);
      setEarnedBadges(userBadges);
      setDietSlug(((dietRes as any).data?.diet_preference as string | undefined) ?? null);
      setFoundationalKit(((kitRes as any).data ?? []) as { supplement_id: string; duration_weeks: number }[]);

      if (p) {
        const [planItems, todayT, weekT] = await Promise.all([
          fetchPlanItems(p.id),
          fetchTodayTracking(user.id, today),
          fetchTrackingHistory(user.id, 30), // 30 days for streak calc
        ]);
        setItems(planItems);
        setTodayTracking(todayT);
        setWeekHistory(weekT);

        // Calculate streak
        const activeItems = planItems.filter(i => i.is_active);
        const trackingData = weekT.map(t => ({ date: t.date, plan_item_id: t.plan_item_id, taken: t.taken }));
        const s = calculateSupplementStreak(trackingData, activeItems.length);
        setStreak(s);

        // Check and award badges
        const newBadges = await checkAndAwardSupplementBadges(user.id, s.currentStreak, s.longestStreak);
        if (newBadges.length > 0) {
          for (const b of newBadges) {
            toast.success(`New badge: ${b.badge_name}`, { duration: 5000 });
          }
          const updated = await fetchUserSupplementBadges(user.id);
          setEarnedBadges(updated);
        }
      }
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [user, today]);


  useEffect(() => { load(); }, [load]);

  const handleToggle = async (planItemId: string) => {
    if (!user) return;
    const existing = todayTracking.find((t) => t.plan_item_id === planItemId);
    const newVal = !existing?.taken;
    try {
      await toggleTracking(user.id, planItemId, today, newVal);
      if (existing) {
        setTodayTracking((prev) => prev.map((t) => t.plan_item_id === planItemId ? { ...t, taken: newVal } : t));
      } else {
        setTodayTracking((prev) => [...prev, { id: "", user_id: user.id, plan_item_id: planItemId, date: today, taken: newVal, notes: null }]);
      }
      if (newVal) toast.success("Supplement taken");
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading…</div>;

  if (!plan || items.length === 0) {
    if (simpleMode) {
      return <FoundationSupplementBrowser supplements={supplements} userId={user?.id ?? null} onChanged={load} planItems={items} plan={plan} dietSlug={dietSlug} foundationalKit={foundationalKit} />;
    }
    return (
      <div className="p-6">
        <div className="liquid-glass rounded-3xl p-8 text-center space-y-3">
          <Pill className="w-12 h-12 text-muted-foreground mx-auto" />
          <h3 className="text-lg font-bold text-foreground">No Supplement Plan</h3>
          <p className="text-sm text-muted-foreground">Your coach will assign supplements based on your health assessment.</p>
        </div>
      </div>
    );
  }

  // Foundation users with an existing self-built plan: show the plan AND let them keep browsing/adding.
  if (simpleMode) {
    return (
      <div className="space-y-6">
        <FoundationPlanSummary
          items={items}
          supplements={supplements}
          todayTracking={todayTracking}
          onToggle={handleToggle}
          onRemove={async (planItemId) => {
            try {
              await removePlanItem(planItemId);
              toast.success("Removed from your list");
              await load();
            } catch (e: any) { toast.error(e.message); }
          }}
        />
        <FoundationSupplementBrowser
          supplements={supplements}
          userId={user?.id ?? null}
          onChanged={load}
          planItems={items}
          plan={plan}
          dietSlug={dietSlug}
          foundationalKit={foundationalKit}
        />

      </div>
    );
  }


  const suppMap = Object.fromEntries(supplements.map((s) => [s.id, s]));
  const takenCount = todayTracking.filter((t) => t.taken).length;
  const totalItems = items.length;
  const compliance = Math.round((takenCount / totalItems) * 100);
  const badgeLevel = getSupplementBadgeLevel(earnedBadges, allBadges);

  // Group items by timing
  const timingGroups: Record<string, { item: PlanItem; supp: Supplement | undefined }[]> = {};
  for (const item of items) {
    const timing = item.timing ?? "with meal";
    if (!timingGroups[timing]) timingGroups[timing] = [];
    timingGroups[timing].push({ item, supp: suppMap[item.supplement_id] });
  }

  // Weekly compliance (last 7 days)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const ds = d.toISOString().split("T")[0];
    const dayTracking = weekHistory.filter((t) => t.date === ds);
    const taken = dayTracking.filter((t) => t.taken).length;
    const pct = totalItems > 0 ? Math.round((taken / totalItems) * 100) : 0;
    return { day: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()], pct, date: ds };
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground">Today's Supplements</h2>
          <p className="text-xs text-muted-foreground">{plan.plan_name} · {items.length} supplements</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black ${compliance >= 80 ? "text-primary" : compliance >= 50 ? "text-amber-500" : "text-destructive"}`}>
            {compliance}%
          </p>
          <p className="text-[10px] text-muted-foreground">{takenCount}/{totalItems} taken</p>
        </div>
      </div>

      {/* Progress ring */}
      <motion.div
        className="liquid-glass rounded-3xl p-5"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 relative">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" stroke="hsl(var(--muted))" strokeWidth="4" fill="none" />
                <circle
                  cx="28" cy="28" r="24"
                  stroke="hsl(var(--primary))"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${compliance * 1.508} 150.8`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-foreground">
                {takenCount}/{totalItems}
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {compliance === 100 ? "All done" : compliance >= 50 ? "Keep going" : "Start your day right"}
              </p>
              <p className="text-[10px] text-muted-foreground">{totalItems - takenCount} remaining</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Streak + Badge Level Card */}
      {!simpleMode && allBadges.length > 0 && (
        <motion.div
          className="liquid-glass rounded-3xl p-4"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Pill className="w-6 h-6 text-primary" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {badgeLevel.currentLevel > 0 ? `Level ${badgeLevel.currentLevel}` : "Getting Started"}
                </p>
                <p className="text-sm font-black text-foreground">
                  {badgeLevel.currentBadge?.badge_name ?? "Start your streak!"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1">
                <Flame className="w-4 h-4 text-primary" />
                <span className="text-xl font-black text-foreground">{streak.currentStreak}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">day streak</p>
            </div>
          </div>
          {badgeLevel.nextBadge && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>Next: {badgeLevel.nextBadge.badge_name}</span>
                <span>{streak.longestStreak}/{badgeLevel.nextBadge.required_streak_days} days</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <motion.div className="h-full bg-primary rounded-full" initial={{ width: 0 }} animate={{ width: `${badgeLevel.progress}%` }} />
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Supplement list by timing */}
      {Object.entries(timingGroups).map(([timing, groupItems], gi) => (
        <motion.div
          key={timing}
          className="liquid-glass rounded-3xl p-4"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: gi * 0.05 }}
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <TimingIcon timing={timing} /> {timing}
          </h3>
          <div className="space-y-2">
            {groupItems.map(({ item, supp }) => {
              const taken = todayTracking.find((t) => t.plan_item_id === item.id)?.taken ?? false;
              return (
                <motion.button
                  key={item.id}
                  onClick={() => handleToggle(item.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-colors text-left ${
                    taken ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted/50 hover:bg-muted"
                  }`}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    taken ? "bg-primary text-primary-foreground" : `${CATEGORY_BG[supp?.category ?? ""] ?? "bg-muted"}`
                  }`}>
                    {taken ? <Check className="w-4 h-4" /> : <Pill className={`w-4 h-4 ${CATEGORY_COLORS[supp?.category ?? ""] ?? "text-muted-foreground"}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${taken ? "text-primary line-through" : "text-foreground"}`}>
                      {supp?.name ?? "Supplement"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{item.dosage} · {item.frequency}</p>
                  </div>
                    {item.remarks && (
                    <span className="text-[9px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md shrink-0 max-w-[100px] truncate">
                      {item.remarks}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      ))}

      {/* Weekly compliance */}
      <div className="liquid-glass rounded-3xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">This Week</h3>
        <div className="flex justify-between">
          {last7.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground">{d.day}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                d.pct >= 80 ? "bg-primary/20 text-primary" :
                d.pct >= 50 ? "bg-amber-500/20 text-amber-500" :
                d.pct > 0 ? "bg-destructive/20 text-destructive" :
                "bg-muted text-muted-foreground"
              }`}>
                {d.pct > 0 ? `${d.pct}%` : "·"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Badge Collection */}
      {!simpleMode && allBadges.length > 0 && (
        <div className="liquid-glass rounded-3xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" /> Supplement Badges
            </h3>
            <span className="text-[10px] text-muted-foreground">
              {earnedBadges.length}/{allBadges.length} earned
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {allBadges.map((badge) => {
              const earned = new Set(earnedBadges.map((b) => b.badge_id)).has(badge.id);
              return (
                <motion.div
                  key={badge.id}
                  className={`rounded-2xl p-3 text-center transition-colors ${
                    earned ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted/50 opacity-40"
                  }`}
                  whileHover={{ y: -1 }}
                >
                  <span className={`w-10 h-10 rounded-xl mx-auto mb-1 flex items-center justify-center ${earned ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {earned ? <Pill className="w-5 h-5" strokeWidth={1.75} /> : <Lock className="w-5 h-5" strokeWidth={1.75} />}
                  </span>
                  <p className={`text-[10px] font-bold ${earned ? "text-foreground" : "text-muted-foreground"}`}>
                    {badge.badge_name}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    {earned ? "Earned" : `${badge.required_streak_days}d streak`}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Why section (hidden in simpleMode) */}
      {!simpleMode && (
        <div className="liquid-glass rounded-3xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1">
            📖 Why These Supplements?
          </h3>
          <div className="space-y-2">
            {items.slice(0, 4).map((item) => {
              const supp = suppMap[item.supplement_id];
              if (!supp?.description) return null;
              return (
                <div key={item.id} className="py-2 border-b border-border/30 last:border-0">
                  <p className="text-xs font-semibold text-foreground">{supp.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{supp.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Foundation-care: pretty browseable catalog with filters + add-to-list flow
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_FILTERS = [
  { id: "all", label: "All", Icon: Sparkles },
  { id: "vitamin", label: "Vitamins", Icon: Pill },
  { id: "metabolic", label: "Metabolic", Icon: Flame },
  { id: "herbal", label: "Herbal", Icon: Leaf },
  { id: "booster", label: "Boosters", Icon: Zap },
];

const TIMING_FILTERS = [
  { id: "all", label: "Any time", Icon: Clock },
  { id: "morning", label: "Morning", Icon: Sun },
  { id: "with meal", label: "With meal", Icon: Coffee },
  { id: "evening", label: "Evening", Icon: Moon },
  { id: "empty stomach", label: "Empty stomach", Icon: Clock },
];

function TimingIcon({ timing, className = "w-3.5 h-3.5" }: { timing: string; className?: string }) {
  const t = timing.toLowerCase();
  const Icon = t.includes("morning") ? Sun : t.includes("evening") || t.includes("night") ? Moon : t.includes("meal") ? Coffee : Clock;
  return <Icon className={className} strokeWidth={1.75} />;
}

function FoundationSupplementBrowser({
  supplements,
  userId,
  onChanged,
  planItems,
  plan,
  dietSlug,
  foundationalKit,
}: {
  supplements: Supplement[];
  userId: string | null;
  onChanged: () => Promise<void> | void;
  planItems: PlanItem[];
  plan: UserSupplementPlan | null;
  dietSlug: string | null;
  foundationalKit: { supplement_id: string; duration_weeks: number }[];
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // Diet → allowed veg_types on supplements.
  // Vegetarian-family diets (veg, vegan, jain, eggitarian) only see veg + both.
  // Non-vegetarian sees non_veg + both. If no diet on file, show all.
  const isVegDiet = dietSlug ? ["veg", "vegetarian", "vegan", "jain", "eggitarian"].includes(dietSlug) : false;
  const isNonVegDiet = dietSlug === "non_veg" || dietSlug === "non-vegetarian";
  const [vegFilter, setVegFilter] = useState<"auto" | "veg" | "non_veg" | "all">("auto");

  const kitMap = useMemo(() => {
    const m = new Map<string, number>();
    foundationalKit.forEach((r) => m.set(r.supplement_id, r.duration_weeks || 8));
    return m;
  }, [foundationalKit]);

  const inPlan = useMemo(() => new Set(planItems.map((i) => i.supplement_id)), [planItems]);
  const planItemBySuppId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of planItems) {
      map.set(item.supplement_id, item.id);
    }
    return map;
  }, [planItems]);

  const allowedVegTypes = useMemo<Set<VegType>>(() => {
    if (vegFilter === "veg") return new Set(["veg", "both"]);
    if (vegFilter === "non_veg") return new Set(["non_veg", "both"]);
    if (vegFilter === "all") return new Set(["veg", "non_veg", "both"]);
    // auto — follow the user's diet
    if (isNonVegDiet) return new Set(["non_veg", "both"]);
    if (isVegDiet) return new Set(["veg", "both"]);
    return new Set(["veg", "non_veg", "both"]);
  }, [vegFilter, isVegDiet, isNonVegDiet]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return supplements.filter((s) => {
      // Foundation Care = only the 7-item foundational kit
      if (!kitMap.has(s.id)) return false;
      if (!allowedVegTypes.has((s.veg_type ?? "both") as VegType)) return false;
      if (q && !`${s.name} ${s.category} ${s.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [supplements, kitMap, allowedVegTypes, query]);

  const availableList = useMemo(() => filtered.filter((s) => !inPlan.has(s.id)), [filtered, inPlan]);
  const addedList = useMemo(() => filtered.filter((s) => inPlan.has(s.id)), [filtered, inPlan]);

  const dietLabel = isVegDiet ? "vegetarian" : isNonVegDiet ? "non-vegetarian" : null;

  const handleAdd = async (s: Supplement) => {
    if (!userId) return toast.error("Please sign in");
    setAdding(s.id);
    try {
      let planId = plan?.id;
      const weeks = kitMap.get(s.id) ?? 8;
      if (!planId) {
        planId = await createUserPlan({
          user_id: userId,
          plan_name: "My Foundation Plan",
          start_date: new Date().toISOString().slice(0, 10),
          duration_weeks: weeks,
          status: "active",
        });
      }
      await addPlanItem({
        plan_id: planId,
        supplement_id: s.id,
        dosage: s.default_dosage || "1 serving",
        frequency: s.default_frequency || "Daily",
        timing: s.default_timing || "with meal",
        is_active: true,
        duration_weeks: weeks,
      });
      toast.success(`${s.name} added for ${weeks} weeks`);
      await onChanged();
    } catch (e: any) {
      toast.error(e.message || "Couldn't add supplement");
    } finally {
      setAdding(null);
    }
  };



  const handleRemove = async (s: Supplement) => {
    if (!userId) return toast.error("Please sign in");
    const planItemId = planItemBySuppId.get(s.id);
    if (!planItemId) return toast.error("Not in your list");
    setRemoving(s.id);
    try {
      await removePlanItem(planItemId);
      toast.success(`${s.name} removed from your list`);
      await onChanged();
    } catch (e: any) {
      toast.error(e.message || "Couldn't remove supplement");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="px-5 pt-5 pb-2 space-y-5">
      {/* Hero */}
      <div
        className="rounded-3xl p-5 text-white shadow-card relative overflow-hidden"
        style={{ background: "var(--bbdo-gradient)" }}
      >
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
        <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/80">Foundational Kit</p>
        <h2 className="text-2xl font-black tracking-tight mt-1">Your Foundation Care supplements</h2>
        <p className="text-sm text-white/85 mt-1 max-w-xl">
          {dietLabel
            ? <>Being <span className="font-black">{dietLabel}</span>, these are the supplements we recommend. Tap <span className="font-black">Add</span> to start taking them for the recommended weeks.</>
            : <>Tap <span className="font-black">Add</span> to start taking a supplement for the recommended weeks.</>}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search supplements…"
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Veg / Non-veg filter */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {[
          { id: "auto" as const, label: dietLabel ? `For ${dietLabel}` : "Recommended", Icon: Sparkles },
          { id: "veg" as const, label: "Vegetarian", Icon: Leaf },
          { id: "non_veg" as const, label: "Non-vegetarian", Icon: Drumstick },
          { id: "all" as const, label: "Show all", Icon: Pill },
        ].map((c) => {
          const Icon = c.Icon;
          const active = vegFilter === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setVegFilter(c.id)}
              className={`no-pill shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                active
                  ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                  : "bg-muted/40 text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.75} /> {c.label}
            </button>
          );
        })}
      </div>


      {/* Results */}
      {(() => {
        const renderCard = (s: Supplement) => {
          const added = inPlan.has(s.id);
          const isAdding = adding === s.id;
          const isRemoving = removing === s.id;
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={`rounded-2xl p-4 ring-1 shadow-card flex flex-col gap-3 ${
                added ? "bg-primary/5 ring-primary/30" : "bg-card ring-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${CATEGORY_BG[s.category ?? ""] ?? "bg-muted"}`}>
                  <Pill className={`w-5 h-5 ${CATEGORY_COLORS[s.category ?? ""] ?? "text-muted-foreground"}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-black text-foreground leading-tight">{s.name}</p>
                    {added && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                        <Check className="w-2.5 h-2.5" /> Added
                      </span>
                    )}
                  </div>
                  {s.category && (
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{s.category}</p>
                  )}
                </div>
              </div>
              {s.description && (
                <p className="text-xs text-muted-foreground line-clamp-3">{s.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {s.default_dosage && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted/70 text-foreground">
                    {s.default_dosage}
                  </span>
                )}
                {s.default_timing && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary inline-flex items-center gap-1">
                    <TimingIcon timing={s.default_timing} className="w-3 h-3" /> {s.default_timing}
                  </span>
                )}
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary/10 text-secondary inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {kitMap.get(s.id) ?? 8} weeks
                </span>
                {(s.veg_type ?? "both") !== "both" && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                    s.veg_type === "veg" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                  }`}>
                    {s.veg_type === "veg" ? <><Leaf className="w-3 h-3" /> Veg</> : <><Drumstick className="w-3 h-3" /> Non-veg</>}
                  </span>
                )}
              </div>

              <button
                onClick={() => (added ? handleRemove(s) : handleAdd(s))}
                disabled={isAdding || isRemoving}
                className={`mt-auto h-9 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  added
                    ? "bg-muted/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive ring-1 ring-border"
                    : "bg-[var(--bbdo-red)] text-white hover:opacity-90"
                }`}
              >
                {added ? (
                  isRemoving ? <><Loader2 className="w-4 h-4 animate-spin" /> Removing…</> :
                  <><Minus className="w-4 h-4" /> Remove from list</>
                ) : isAdding ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</>
                ) : (
                  <><Plus className="w-4 h-4" /> Add to my list</>
                )}
              </button>
            </motion.div>
          );
        };

        return (
          <div className="space-y-6">
            {addedList.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xs font-black uppercase tracking-[0.18em] text-primary flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> On your list
                  </h3>
                  <span className="text-[10px] font-semibold text-muted-foreground">{addedList.length} added</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">{addedList.map(renderCard)}</div>
              </section>
            )}

            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Available to add
                </h3>
                <span className="text-[10px] font-semibold text-muted-foreground">{availableList.length} options</span>
              </div>
              {availableList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {filtered.length === 0
                    ? "No supplements match these filters."
                    : "You've added everything in this filter. Great stack!"}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">{availableList.map(renderCard)}</div>
              )}
            </section>
          </div>
        );
      })()}
    </div>
  );
}

function FoundationPlanSummary({
  items,
  supplements,
  todayTracking,
  onToggle,
  onRemove,
}: {
  items: PlanItem[];
  supplements: Supplement[];
  todayTracking: SupplementTracking[];
  onToggle: (planItemId: string) => void;
  onRemove: (planItemId: string) => Promise<void>;
}) {
  const suppMap = Object.fromEntries(supplements.map((s) => [s.id, s]));
  const taken = todayTracking.filter((t) => t.taken).length;

  return (
    <div className="px-5 pt-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">My Supplements</p>
          <h2 className="text-xl font-black text-foreground">Today's Stack</h2>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-primary">{taken}/{items.length}</p>
          <p className="text-[10px] text-muted-foreground">taken today</p>
        </div>
      </div>

      <div className="grid gap-2">
        {items.map((item) => {
          const supp = suppMap[item.supplement_id];
          const isTaken = todayTracking.find((t) => t.plan_item_id === item.id)?.taken ?? false;
          return (
            <div
              key={item.id}
              className={`rounded-2xl p-3 flex items-center gap-3 ${
                isTaken ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/40"
              }`}
            >
              <button
                onClick={() => onToggle(item.id)}
                className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center transition-colors ${
                  isTaken ? "bg-primary text-primary-foreground" : `${CATEGORY_BG[supp?.category ?? ""] ?? "bg-muted"}`
                }`}
              >
                {isTaken
                  ? <Check className="w-4 h-4" />
                  : <Pill className={`w-4 h-4 ${CATEGORY_COLORS[supp?.category ?? ""] ?? "text-muted-foreground"}`} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${isTaken ? "line-through text-primary/70" : "text-foreground"}`}>
                  {supp?.name ?? "Supplement"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {item.dosage} · {item.timing || "with meal"}
                </p>
              </div>
              <button
                onClick={() => onRemove(item.id)}
                className="text-[10px] font-semibold text-muted-foreground hover:text-destructive px-2 py-1 rounded-lg"
                title="Remove from list"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
