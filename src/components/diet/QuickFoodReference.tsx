import { useEffect, useMemo, useState } from "react";
import { useDietTypes } from "@/hooks/useDietTypes";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, X, SlidersHorizontal, Check, Sparkles, Leaf, Zap, Flame, AlertTriangle, ShieldAlert, Eye, EyeOff, HeartPulse, FlaskConical, Droplet, Flower2, Activity, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { toast } from "sonner";
import { getFoodImageUrl, primeFoodImages, getCachedFoodImageUrl, subscribeFoodImages } from "@/lib/foodImageService";
import FoodItemDetail from "./FoodItemDetail";
import {
  type FoodCategory, type FoodFilter, type FoodItem, type DietType, type Recommendation,
  giLabel, giClass, recLabel, recClass, range, avgOf, portionLabel, scaleCalories, scaleMacro, scaleRange,
  dietAllowsItem,
} from "./dietTypes";
import {
  type ActiveCondition, type FoodRuleHit, type ConditionRuleRow, type ConditionKey,
  deriveActiveConditions, fetchConditionRules, buildFoodRuleMap, fetchFoodConditions,
} from "@/lib/foodConditionRules";
import { useUserDietProfile, isFoodBlockedByDietProfile } from "@/hooks/useUserDietProfile";



const EASE = [0.22, 1, 0.36, 1] as const;

type DietKey = string;
type SortKey = "recommended" | "protein_high" | "carbs_low" | "gi_low" | "cal_low";
type PresetKey = "best" | "low_carb" | "low_gi" | "high_protein";

const REC_SCORE: Record<Recommendation, number> = { encourage: 3, moderate: 2, limit: 1, avoid: 0 };

const CONDITION_ICONS: Record<string, LucideIcon> = {
  hypothyroid: HeartPulse,
  hyperthyroid: HeartPulse,
  pcos: Flower2,
  ckd: Activity,
  kidney_stone: Activity,
  uric_acid: FlaskConical,
  fatty_liver: HeartPulse,
  iron_deficiency: Droplet,
};

type ActionKey = "avoid" | "limit" | "encourage";
const ACTION_META: Record<ActionKey, { label: string; textCls: string; bgCls: string; activeCls: string; dot: string }> = {
  avoid:     { label: "Avoid",     textCls: "text-rose-700",    bgCls: "bg-rose-500/10 border-rose-500/30",       activeCls: "bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-600/30",       dot: "bg-rose-600" },
  limit:     { label: "Limit",     textCls: "text-amber-700",   bgCls: "bg-amber-500/10 border-amber-500/30",     activeCls: "bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/30",   dot: "bg-amber-500" },
  encourage: { label: "Encourage", textCls: "text-emerald-700", bgCls: "bg-emerald-500/10 border-emerald-500/30", activeCls: "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/30", dot: "bg-emerald-600" },
};

const PRESETS: { key: PresetKey; label: string; Icon: typeof Sparkles; tint: string }[] = [
  { key: "best",          label: "Best for you",  Icon: Sparkles, tint: "text-emerald-700 bg-emerald-500/10 border-emerald-500/30" },
  { key: "low_carb",      label: "Low carb",      Icon: Leaf,     tint: "text-teal-700 bg-teal-500/10 border-teal-500/30" },
  { key: "low_gi",        label: "Low GI",        Icon: Flame,    tint: "text-blue-700 bg-blue-500/10 border-blue-500/30" },
  { key: "high_protein",  label: "High protein",  Icon: Zap,      tint: "text-purple-700 bg-purple-500/10 border-purple-500/30" },
];

const filterNumberFromLabel = (label: string | null | undefined) => {
  const match = label?.match(/\d+/);
  return match ? Number(match[0]) : null;
};
const filterAlphaFromLabel = (label: string | null | undefined) => label?.match(/[a-z]+$/i)?.[0].toLowerCase() || "";
const filterOrder = (filter: FoodFilter) => filter.order_number ?? filterNumberFromLabel(filter.number_label) ?? filter.display_order ?? 9999;
const filterLabel = (filter: FoodFilter | null | undefined) => filter ? filter.number_label || `F${filterOrder(filter)}` : null;
const sortFilters = (a: FoodFilter, b: FoodFilter) =>
  filterOrder(a) - filterOrder(b) ||
  filterAlphaFromLabel(filterLabel(a)).localeCompare(filterAlphaFromLabel(filterLabel(b))) ||
  (a.display_order ?? 9999) - (b.display_order ?? 9999) ||
  a.name.localeCompare(b.name);


const SORT_OPTIONS: { key: SortKey; label: string; short: string }[] = [
  { key: "recommended", label: "Recommended", short: "Recommended" },
  { key: "protein_high", label: "Highest protein", short: "High protein" },
  { key: "carbs_low",    label: "Lowest carbs",    short: "Low carb" },
  { key: "gi_low",       label: "Lowest GI",       short: "Low GI" },
  { key: "cal_low",      label: "Lowest calories", short: "Low cal" },
];

function normalizePref(p: string | null | undefined): DietKey | null {
  const v = (p || "").toLowerCase().replace(/[-\s]/g, "_");
  if (!v) return null;
  if (v === "vegetarian") return "veg";
  if (v === "nonveg" || v === "non_vegetarian") return "non_veg";
  return v;
}

export default function QuickFoodReference({ onClose, embedded = false }: { onClose?: () => void; embedded?: boolean }) {
  const { user } = useAuth();
  const { subPreferences, allergenFoodIds } = useUserDietProfile(user?.id);

  const confirm = useConfirm();
  const { types: dietTypeRows } = useDietTypes();
  const DIET_CHIPS = useMemo(
    () => dietTypeRows.map(dt => ({
      key: dt.slug as DietKey,
      label: dt.label.replace(/^Non-vegetarian$/i, "Non-veg").replace(/^Vegetarian$/i, "Veg"),
      dot: dt.dot_color || "bg-emerald-500",
    })),
    [dietTypeRows],
  );
  const DIET_PREF_LABEL = useMemo(
    () => Object.fromEntries(dietTypeRows.map(dt => [dt.slug, dt.label])) as Record<string, string>,
    [dietTypeRows],
  );
  const [cats, setCats] = useState<FoodCategory[]>([]);
  const [filters, setFilters] = useState<FoodFilter[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [rulesReloadTick, setRulesReloadTick] = useState(0);

  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  // Single-value diet view, mirrors profile by default. null = show all.
  const [profilePref, setProfilePref] = useState<DietKey | null>(null);
  const [diet, setDiet] = useState<DietKey | null>(null);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [search, setSearch] = useState("");
  const [openItem, setOpenItem] = useState<FoodItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterSheet, setFilterSheet] = useState(false);
  // Quick preset chip. Defaults to "best" so users land on recommended foods first,
  // never on high-carb staples.
  const [preset, setPreset] = useState<PresetKey | null>("best");
  // Sub-category chip inside a preset. null = grouped by category.
  const [presetCategory, setPresetCategory] = useState<string | null>(null);

  // Master list of conditions from public.food_conditions (admin-managed).
  // Drives the chip row + label/icon map so UI never drifts from backend.
  const [conditionCatalog, setConditionCatalog] = useState<
    { key: string; label: string; emoji: string; icon_url: string | null; sort_order: number }[]
  >([]);
  const conditionMetaMap = useMemo(
    () =>
      Object.fromEntries(
        conditionCatalog.map((c) => [c.key, { label: c.label, emoji: c.emoji, icon_url: c.icon_url }]),
      ) as Record<string, { label: string; emoji: string; icon_url: string | null }>,
    [conditionCatalog],
  );

  // Manually-selected condition keys. Auto-populated from profile deep_profiling
  // on first load; the user can then toggle any chip on/off.
  const [conditionKeys, setConditionKeys] = useState<Set<ConditionKey>>(new Set());
  const [conditionsSynced, setConditionsSynced] = useState(false);
  // Keys of conditions the user actually has (from profile). Only these show as chips.
  const [profileConditionKeys, setProfileConditionKeys] = useState<Set<string>>(new Set());
  const activeConditions: ActiveCondition[] = useMemo(
    () =>
      Array.from(conditionKeys).map((k) => {
        const meta = conditionMetaMap[k] ?? { label: k, emoji: "", icon_url: null };
        return { key: k, label: meta.label, emoji: meta.emoji, icon_url: meta.icon_url };
      }),
    [conditionKeys, conditionMetaMap],
  );

  const [ruleMap, setRuleMap] = useState<Map<string, FoodRuleHit>>(new Map());
  // Show flagged foods by default in Browse-all views, with a "Skip · <condition>"
  // chip on each, so users can see WHY a food is being called out for them.
  // "Best for you" preset still hard-filters avoid+limit regardless of this.
  const [hideSkipped, setHideSkipped] = useState(false);
  const [showAllDiets, setShowAllDiets] = useState(false);

  // Load user's diet preference + auto-select conditions from profile.
  // Re-runs whenever the profiles row changes (realtime), so toggling a
  // condition in Edit Profile lights up the chip immediately.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const syncFromProfile = async () => {
      const [dietRes, profRes, catalog] = await Promise.all([
        supabase.from("user_diet_profiles").select("diet_preference, diet_preferences").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("deep_profiling, lifestyle, clinical").eq("user_id", user.id).maybeSingle(),
        fetchFoodConditions(),
      ]);
      if (cancelled) return;
      setConditionCatalog(catalog);
      const metaMap = Object.fromEntries(catalog.map((c) => [c.key, { label: c.label, emoji: c.emoji, icon_url: c.icon_url }]));
      const profRow: any = profRes.data;
      const lifestyleDiet = profRow?.lifestyle?.diet as string | undefined;
      // Multi-select preferences: default the chip to the most permissive one the
      // user actually eats, so an eggitarian/non-veg member is never shown veg-only.
      const RANK = ["non_veg", "eggitarian", "veg", "vegan", "jain"];
      const arr = ((dietRes.data as any)?.diet_preferences as string[] | null) || [];
      const normalized = arr.map(normalizePref).filter(Boolean) as DietKey[];
      normalized.sort((a, b) => {
        const ra = RANK.indexOf(a); const rb = RANK.indexOf(b);
        return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
      });
      const pref =
        normalized[0] ??
        normalizePref(dietRes.data?.diet_preference as string) ??
        normalizePref(lifestyleDiet);
      if (pref) { setProfilePref(pref); setDiet(pref); }
      const conds = deriveActiveConditions(profRow?.deep_profiling, metaMap, 7.0, profRow?.clinical);
      const profileKeys = new Set(conds.map((c) => c.key));
      // BBDO product rule: insulin resistance is a platform-wide baseline —
      // every user is treated as insulin-resistant regardless of profile flags.
      // It never appears as a user-facing chip (see profileConditionKeys filter
      // below) but it drives the food rule map for everyone.
      if (metaMap["insulin_resistance"]) profileKeys.add("insulin_resistance");
      setProfileConditionKeys(profileKeys);
      // Preserve any manual toggles the user has made this session; add newly-enabled keys.
      setConditionKeys((prev) => {
        if (!conditionsSynced) return new Set(profileKeys);
        const next = new Set(prev);
        profileKeys.forEach((k) => next.add(k));
        // Drop keys the user no longer has flagged in profile.
        Array.from(next).forEach((k) => { if (!profileKeys.has(k)) next.delete(k); });
        return next;
      });
      setConditionsSynced(true);
    };

    void syncFromProfile();

    const channel = supabase
      .channel(`qfr-profile-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        () => { void syncFromProfile(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const toggleCondition = (key: ConditionKey) => {
    setConditionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Load reference data
  useEffect(() => {
    (async () => {
      const [c, f, i] = await Promise.all([
        supabase.from("food_categories").select("*").order("display_order"),
        supabase.from("food_filters").select("*").eq("is_active", true),
        supabase.from("food_items").select("*").eq("is_active", true),
      ]);
      const itemsData = ((i.data as FoodItem[]) || []);
      const rawFilters = ((f.data as FoodFilter[]) || []);
      const fSorted = rawFilters.slice().sort(sortFilters);
      setCats((c.data as any) || []);
      setFilters(fSorted);
      setItems(itemsData);
      primeFoodImages(itemsData);
      if (fSorted.length && !activeFilter) setActiveFilter(fSorted[0].id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesReloadTick]);

  // Raw rules for the currently-active conditions (used for the breakdown card).
  const [conditionRules, setConditionRules] = useState<ConditionRuleRow[]>([]);

  // Rebuild the food → rule map whenever conditions/items change, AND live-subscribe
  // to admin edits on food_condition_rules / food_conditions / food_items so users
  // see new rules (e.g. "Encourage broccoli for hypertension") appear immediately
  // without a hard refresh.
  
  useEffect(() => {
    (async () => {
      if (!activeConditions.length || !items.length) {
        setRuleMap(new Map());
        setConditionRules([]);
        return;
      }
      const rules = await fetchConditionRules(activeConditions.map((c) => c.key));
      setConditionRules(rules);
      setRuleMap(buildFoodRuleMap(items, rules, activeConditions));
    })();
  }, [activeConditions, items, rulesReloadTick]);

  useEffect(() => {
    const bump = () => setRulesReloadTick((t) => t + 1);
    const channel = supabase
      .channel("qfr-condition-rules")
      .on("postgres_changes", { event: "*", schema: "public", table: "food_condition_rules" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "food_conditions" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "food_items" }, bump)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Per-condition breakdown: for each active condition, group matched foods by action.
  // Used by the "For your <condition>: avoid / limit / encourage" card.
  const conditionBreakdown = useMemo(() => {
    if (!activeConditions.length || !conditionRules.length || !items.length) {
      return [] as {
        condition: ActiveCondition;
        avoid: { item: FoodItem; reason: string }[];
        limit: { item: FoodItem; reason: string }[];
        encourage: { item: FoodItem; reason: string }[];
      }[];
    }
    return activeConditions.map((cond) => {
      const rulesForCond = conditionRules.filter((r) => r.condition_key === cond.key);
      const buckets: Record<
        ConditionAction,
        { item: FoodItem; reason: string }[]
      > = { avoid: [], limit: [], encourage: [] };
      const seen: Record<ConditionAction, Set<string>> = {
        avoid: new Set(), limit: new Set(), encourage: new Set(),
      };
      for (const item of items) {
        const hay = `${item.name} ${item.alt_name || ""}`.toLowerCase();
        // Strongest action for THIS condition on this item.
        let best: { action: ConditionAction; reason: string; priority: number } | null = null;
        for (const rule of rulesForCond) {
          if (rule.filter_id && rule.filter_id !== item.filter_id) continue;
          if (!hay.includes(rule.name_pattern.toLowerCase())) continue;
          const rank = { avoid: 3, limit: 2, encourage: 1 }[rule.action];
          const bestRank = best ? { avoid: 3, limit: 2, encourage: 1 }[best.action] : -1;
          if (rank > bestRank || (rank === bestRank && rule.priority > (best?.priority ?? -1))) {
            best = { action: rule.action, reason: rule.reason, priority: rule.priority };
          }
        }
        if (best && !seen[best.action].has(item.id)) {
          seen[best.action].add(item.id);
          buckets[best.action].push({ item, reason: best.reason });
        }
      }
      return { condition: cond, ...buckets };
    });
  }, [activeConditions, conditionRules, items]);

  // Import ConditionAction type locally for the memo above.
  type ConditionAction = "avoid" | "limit" | "encourage";



  const activeFilterObj = useMemo(
    () => filters.find((f) => f.id === activeFilter) || null,
    [filters, activeFilter],
  );

  // Diet filter logic (single-mode):
  // - null      → show everything
  // - non_veg   → show everything (omnivore sees all)
  // - veg       → veg + vegan
  // - vegan     → vegan only
  // - jain      → jain-friendly only
  const dietMatches = (it: FoodItem): boolean =>
    dietAllowsItem(diet ? [diet] : [], it as any);

  // A preset takes over the whole surface (cross-category), same effect as global sort.
  const isGlobalSort = preset !== null || sort !== "recommended" || search.trim().length > 0;

  // Effective sort key — presets imply a natural sort.
  const effectiveSort: SortKey =
    preset === "low_carb"     ? "carbs_low"    :
    preset === "low_gi"       ? "gi_low"       :
    preset === "high_protein" ? "protein_high" :
    preset === "best"         ? "recommended"  :
    sort;

  const visibleItems = useMemo(() => {
    let list = items.filter(dietMatches);
    list = list.filter((it) => !isFoodBlockedByDietProfile(it as any, subPreferences, allergenFoodIds));
    if (!isGlobalSort) list = list.filter((it) => it.filter_id === activeFilter);

    // Preset filters (cross-category)
    if (preset === "best") {
      list = list.filter((it) => it.recommendation === "encourage" || it.recommendation === "moderate");
    } else if (preset === "low_carb") {
      list = list.filter((it) => {
        const c = avgOf(it.carbs_min, it.carbs_max);
        return c != null && c < 20;
      });
    } else if (preset === "low_gi") {
      list = list.filter((it) => it.gi_band === "low" || it.gi_band === "low_med");
    } else if (preset === "high_protein") {
      list = list.filter((it) => (it.protein_g ?? 0) >= 8);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((it) =>
        it.name.toLowerCase().includes(q) ||
        (it.alt_name || "").toLowerCase().includes(q),
      );
    }
    // Health-condition filter.
    // - "Best for you" is stricter: never show avoid OR limit for the active conditions.
    // - Other views: hide only avoid when hideSkipped is on; limits still appear so
    //   users can see them (they will be dimmed / labelled by the row itself).
    if (ruleMap.size) {
      if (preset === "best") {
        list = list.filter((it) => {
          const a = ruleMap.get(it.id)?.action;
          return a !== "avoid" && a !== "limit";
        });
      } else if (hideSkipped) {
        list = list.filter((it) => ruleMap.get(it.id)?.action !== "avoid");
      }
    }
    const giScore = (it: FoodItem) => avgOf(it.gi_min, it.gi_max) ?? 999;
    const carbScore = (it: FoodItem) => avgOf(it.carbs_min, it.carbs_max) ?? 999;
    const num = (n: number | null | undefined, fallback: number) => (n == null ? fallback : n);
    const sorted = list.slice();
    switch (effectiveSort) {
      case "protein_high": sorted.sort((a, b) => num(b.protein_g, -1) - num(a.protein_g, -1)); break;
      case "carbs_low":    sorted.sort((a, b) => carbScore(a) - carbScore(b)); break;
      case "gi_low":       sorted.sort((a, b) => giScore(a) - giScore(b)); break;
      case "cal_low":      sorted.sort((a, b) => num(a.calories_kcal, 9999) - num(b.calories_kcal, 9999)); break;
      default:
        // Recommended: encouraged first, condition-encouraged bubble up further,
        // condition-limited sink; then display order.
        sorted.sort((a, b) => {
          const ra = ruleMap.get(a.id)?.action;
          const rb = ruleMap.get(b.id)?.action;
          const bonus = (r: typeof ra) => (r === "encourage" ? 1 : r === "limit" ? -1 : 0);
          return (
            (REC_SCORE[b.recommendation] + bonus(rb)) -
            (REC_SCORE[a.recommendation] + bonus(ra))
          ) || ((a.display_order ?? 0) - (b.display_order ?? 0));
        });
    }
    return sorted;
  }, [items, activeFilter, diet, search, sort, preset, effectiveSort, isGlobalSort, ruleMap, hideSkipped, subPreferences, allergenFoodIds]);

  // Categories present in the current preset result (before sub-category filter).
  const presetCategories = useMemo(() => {
    if (!isGlobalSort) return [] as { filter: FoodFilter; count: number }[];
    const counts = new Map<string, number>();
    for (const it of visibleItems) counts.set(it.filter_id, (counts.get(it.filter_id) ?? 0) + 1);
    // Hide categories with zero matching items in the current preset — an empty
    // "Select All" would frustrate users. Newly added taxonomy categories still
    // appear as soon as they contain at least one matching food.
    return filters
      .map((f) => ({ filter: f, count: counts.get(f.id) ?? 0 }))
      .filter((g) => g.count > 0);
  }, [visibleItems, filters, isGlobalSort]);

  // Apply sub-category filter, if picked.
  const displayItems = useMemo(() => {
    if (!isGlobalSort || !presetCategory) return visibleItems;
    return visibleItems.filter((it) => it.filter_id === presetCategory);
  }, [visibleItems, presetCategory, isGlobalSort]);

  // Grouped view (when in preset + no sub-category picked + no search).
  const groupedByCategory = useMemo(() => {
    if (!isGlobalSort || presetCategory || search.trim()) return null;
    const groups = new Map<string, FoodItem[]>();
    for (const it of visibleItems) {
      if (!groups.has(it.filter_id)) groups.set(it.filter_id, []);
      groups.get(it.filter_id)!.push(it);
    }
    // Only include categories that actually have matching foods — empty groups
    // are dropped so users never tap into an empty "Select All" list.
    return filters
      .map((f) => ({ filter: f, items: groups.get(f.id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [visibleItems, filters, isGlobalSort, presetCategory, search]);

  // If the current category is dominated by avoid/limit items, show a redirect banner.
  const categoryWarning = useMemo(() => {
    if (isGlobalSort || !activeFilter) return null;
    const its = items.filter((it) => it.filter_id === activeFilter);
    if (!its.length) return null;
    const avoidish = its.filter((it) => it.recommendation === "avoid" || it.recommendation === "limit").length;
    return avoidish / its.length >= 0.6 ? { total: its.length, avoidish } : null;
  }, [items, activeFilter, isGlobalSort]);


  // Tap a diet chip → if it differs from saved profile, confirm and update profile.
  const onDietChipTap = async (key: DietKey) => {
    if (diet === key) return;
    if (!user || profilePref === key) { setDiet(key); return; }

    const label = DIET_CHIPS.find((d) => d.key === key)?.label || key;
    const ok = await confirm({
      title: `Switch to ${label}?`,
      description: `This will update your profile diet preference to ${label} and use it everywhere — your plate, recommendations and reference filters.`,
      confirmText: `Set as ${label}`,
      cancelText: "Just browse",
    });
    if (ok) {
      const { error } = await supabase
        .from("user_diet_profiles")
        .upsert({ user_id: user.id, diet_preference: key, diet_preferences: [key] } as any, { onConflict: "user_id" });
      if (error) {
        toast.error("Couldn't update preference");
      } else {
        setProfilePref(key);
        toast.success(`Diet preference set to ${label}`);
      }
    }
    setDiet(key);
  };

  const activeSort = SORT_OPTIONS.find((s) => s.key === sort)!;
  const dietChanged = diet !== profilePref;
  const hasFiltersApplied = sort !== "recommended" || dietChanged;

  // Count "avoid" items being hidden right now, for the health-filter banner.
  const skippedCount = useMemo(() => {
    if (!ruleMap.size) return 0;
    let n = 0;
    for (const it of items) {
      if (ruleMap.get(it.id)?.action === "avoid") n++;
    }
    return n;
  }, [items, ruleMap]);

  return (
    <div className={embedded
      ? "flex flex-col min-h-[calc(100vh-140px)]"
      : "fixed inset-0 z-50 bg-[#FCFCFD] overflow-hidden flex flex-col"}>
      {/* Header */}
      <header className={embedded ? "bg-transparent" : "bg-white border-b border-border/60"}>
        <div className={embedded ? "px-1 pt-1 pb-2 max-w-3xl mx-auto" : "px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 max-w-3xl mx-auto"}>
          <div className="flex items-center gap-2">
            {!embedded && (
              <button onClick={onClose} className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center active:scale-95 transition-transform">
                <ArrowLeft className="w-5 h-5" strokeWidth={2.2} />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--bbdo-blue)]">Diet · Reference</p>
              <h1 className="text-base font-black text-foreground leading-tight truncate">Quick Food Reference</h1>
            </div>
          </div>

          {/* Search */}
          <div className="mt-2.5 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={2} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 200+ foods…"
              className="w-full h-11 pl-10 pr-10 rounded-2xl bg-muted/70 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--bbdo-blue)]/30"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center active:scale-95"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* Quick presets row — the entry point for what to eat right now. */}
        <div className="px-4 pb-2 pt-1 max-w-3xl mx-auto overflow-x-auto scrollbar-hide">
          <div className="flex gap-1.5 min-w-max items-center">
            {PRESETS.map((p) => {
              const active = preset === p.key;
              const Icon = p.Icon;
              return (
                <button
                  key={p.key}
                  onClick={() => { setPreset(active ? null : p.key); setPresetCategory(null); }}
                  className={`shrink-0 h-9 px-3 rounded-full text-[12px] font-bold border flex items-center gap-1.5 active:scale-[0.98] transition-colors ${
                    active
                      ? "bg-foreground text-background border-foreground"
                      : `bg-white border-border ${p.tint.split(" ").filter((c) => c.startsWith("text-")).join(" ") || "text-foreground"}`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                  {p.label}
                </button>
              );
            })}
            <button
              onClick={() => { setPreset(null); setPresetCategory(null); }}
              className={`shrink-0 h-9 px-3 rounded-full text-[12px] font-bold border active:scale-[0.98] transition-colors ${
                preset === null
                  ? "bg-foreground text-background border-foreground"
                  : "bg-white text-foreground border-border"
              }`}
            >
              Browse all
            </button>
          </div>
        </div>

        {/* Sub-category chips inside an active preset — lets users drill into e.g. Nuts */}
        {isGlobalSort && preset !== null && presetCategories.length > 1 && (
          <div className="px-4 pb-2 pt-0 max-w-3xl mx-auto overflow-x-auto scrollbar-hide">
            <div className="flex gap-1.5 min-w-max items-center">
              <button
                onClick={() => setPresetCategory(null)}
                className={`shrink-0 h-9 px-3.5 rounded-full text-[11.5px] font-bold border transition-colors ${
                  presetCategory === null
                    ? "bg-foreground text-background border-foreground"
                    : "bg-white text-foreground border-border"
                }`}
              >
                All categories
              </button>
              {presetCategories.map(({ filter: f, count }) => {
                const active = presetCategory === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setPresetCategory(active ? null : f.id)}
                    className={`shrink-0 h-9 px-3.5 rounded-full text-[11.5px] font-bold border transition-colors flex items-center gap-1.5 ${
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-white text-foreground border-border"
                    }`}
                  >
                    {shortName(f.name)}
                    <span className={`text-[9px] ${active ? "opacity-70" : "text-muted-foreground"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Diet preference — read-only display. Users change it in Profile → Settings. */}
        <div className="px-4 pb-2 pt-0 max-w-3xl mx-auto">
          {profilePref !== null ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[11.5px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
                <span className={`w-2 h-2 rounded-sm ${DIET_CHIPS.find((d) => d.key === profilePref)?.dot ?? "bg-emerald-600"}`} />
                Your preference: {DIET_PREF_LABEL[profilePref]}
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                Change it in Profile → Settings.
              </span>
            </div>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide items-center">
              {DIET_CHIPS.map((d) => {
                const active = diet === d.key;
                return (
                  <button
                    key={d.key}
                    onClick={() => onDietChipTap(d.key)}
                    className={`shrink-0 h-9 px-3.5 rounded-full text-[11.5px] font-bold border transition-colors active:scale-[0.98] flex items-center gap-1.5 ${
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-white text-foreground border-border"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-sm ${d.dot}`} />
                    {d.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>











        {/* Category tabs (hidden when a preset / global sort / search is active) */}
        {!isGlobalSort && (
          <div className="px-4 pb-2 max-w-3xl mx-auto -mx-0 overflow-x-auto scrollbar-hide border-t border-border/40 pt-2">
            <div className="flex gap-2 min-w-max">
              {filters.map((f) => {
                const isActive = f.id === activeFilter;
                return (
                  <button
                    key={f.id}
                    onClick={() => { setPreset(null); setActiveFilter(f.id); }}
                    className={`shrink-0 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
                      isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <span className="opacity-50 mr-1.5">{filterLabel(f)}</span>
                    {shortName(f.name)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>


      {/* Body */}
      <div className={embedded ? "flex-1 pb-6" : "flex-1 overflow-y-auto pb-24"}>
        <div className={embedded ? "max-w-3xl mx-auto px-1 py-3" : "max-w-3xl mx-auto px-4 py-4"}>
          {!loading && activeConditions.length > 0 && (
            <div className="mb-3 rounded-2xl border border-[var(--bbdo-blue)]/25 bg-gradient-to-br from-[var(--bbdo-blue)]/[0.06] to-white p-3">
              {/* Header row */}
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--bbdo-blue)]/12 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-4 h-4 text-[var(--bbdo-blue)]" strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--bbdo-blue)]">
                    Personalised for your health
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Your conditions from Profile. See what to avoid, limit and encourage below.
                  </p>
                </div>
                {skippedCount > 0 && (
                  <button
                    onClick={() => setHideSkipped((v) => !v)}
                    className="shrink-0 h-8 px-2.5 rounded-xl bg-white border border-border text-[10.5px] font-bold text-foreground flex items-center gap-1 active:scale-95"
                  >
                    {hideSkipped ? <Eye className="w-3.5 h-3.5" strokeWidth={2.2} /> : <EyeOff className="w-3.5 h-3.5" strokeWidth={2.2} />}
                    {hideSkipped ? "Show all" : "Hide"}
                  </button>
                )}
              </div>

              {/* Condition chips — read-only. These reflect the user's saved
                  profile conditions. To change them, edit Profile. */}
              <div className="mt-2.5 overflow-x-auto scrollbar-hide">
                <div className="flex gap-1.5 min-w-max">
                  {conditionCatalog
                    .filter((c) => profileConditionKeys.has(c.key))
                    .map((c) => {
                      return (
                        <div
                          key={c.key}
                          title="Managed in your profile"
                          className="shrink-0 h-8 pl-1.5 pr-3 rounded-full text-[11.5px] font-bold border flex items-center gap-1.5 bg-[var(--bbdo-blue)] text-white border-[var(--bbdo-blue)] shadow-sm shadow-[var(--bbdo-blue)]/25"
                        >
                          <ConditionChipIcon iconUrl={c.icon_url} emoji={c.emoji} />
                          {c.label}
                        </div>
                      );
                    })}


                </div>
              </div>


              {skippedCount > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
                  {hideSkipped
                    ? `${skippedCount} food${skippedCount === 1 ? "" : "s"} auto-hidden from the list below. Tap a food to see why.`
                    : `${skippedCount} food${skippedCount === 1 ? "" : "s"} flagged — shown with a red "Skip" badge.`}
                </p>
              )}
            </div>
          )}

          {/* Per-condition avoid/limit/encourage breakdown was removed:
              with insulin resistance now on by default for every user, that
              card ballooned to hundreds of rows and drowned the screen. The
              condition chips above tell users which conditions are guiding
              recommendations, and each food row below carries a "Skip · <cond>"
              tag so Browse-all still explains WHY a food is being flagged. */}


          {/* Section heading — suppressed during initial load so users don't
              see a stale "0 foods · encouraged + moderate" placeholder before
              the real data arrives. */}
          {loading ? null : !isGlobalSort && activeFilterObj ? (
            <motion.div
              key={activeFilterObj.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="mb-4"
            >
              <p className="text-xs font-bold tracking-wider uppercase text-muted-foreground">{filterLabel(activeFilterObj)}</p>
              <h2 className="text-2xl font-black text-foreground leading-tight mt-1">{activeFilterObj.name}</h2>
              {activeFilterObj.description && (
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{activeFilterObj.description}</p>
              )}
              {activeFilterObj.cautionary_note && (
                <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                  <p className="text-xs text-amber-700 font-medium">{activeFilterObj.cautionary_note}</p>
                </div>
              )}
              {categoryWarning && (
                <button
                  onClick={() => setPreset("best")}
                  className="mt-3 w-full rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                >
                  <div className="w-9 h-9 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-rose-600" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-black text-rose-700 leading-tight">Most items here are best avoided</p>
                    <p className="text-[11px] text-rose-600/80 mt-0.5">Tap for recommended alternatives across categories.</p>
                  </div>
                  <span className="text-[11px] font-black text-rose-700 shrink-0">See Best for you →</span>
                </button>
              )}
            </motion.div>
          ) : (
            <div className="mb-4">
              <p className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                {preset ? "Cross-category" : "All categories"}
              </p>
              <h2 className="text-2xl font-black text-foreground leading-tight mt-1">
                {search.trim()
                  ? `"${search}"`
                  : preset
                    ? PRESETS.find((p) => p.key === preset)!.label
                    : activeSort.label}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {displayItems.length} foods
                {preset === "best" && " · encouraged + moderate"}
                {preset === "low_carb" && " · under 20g carbs per serving"}
                {preset === "low_gi" && " · low glycemic index only"}
                {preset === "high_protein" && " · at least 8g protein"}
                {presetCategory && ` · ${shortName(filters.find((f) => f.id === presetCategory)?.name || "")}`}
              </p>
            </div>
          )}


          {/* List */}
          {loading ? (
            <div className="space-y-3">
              <div className="flex gap-2 mb-4 overflow-hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 w-24 rounded-full bg-muted animate-pulse shrink-0" />
                ))}
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-white border border-border/50 p-3 flex gap-3">
                  <div className="w-[88px] h-[88px] rounded-xl bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                    <div className="flex gap-1.5 pt-1">
                      <div className="h-4 w-14 rounded bg-muted animate-pulse" />
                      <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                    </div>
                    <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : displayItems.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-muted-foreground">No foods match your filters.</p>
              <button onClick={() => { setDiet(profilePref); setSort("recommended"); setSearch(""); setPreset("best"); setPresetCategory(null); }}
                      className="mt-3 h-9 px-4 rounded-full bg-[var(--bbdo-blue)] text-white text-xs font-bold">
                Reset to Best for you
              </button>
            </div>
          ) : groupedByCategory ? (
            <motion.div
              key={`grouped-${preset}-${diet || "all"}-${sort}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="space-y-6"
            >
              {groupedByCategory.map((group) => (
                <section key={group.filter.id}>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground shrink-0">
                        {filterLabel(group.filter)}
                      </span>
                      <h3 className="text-sm font-black text-foreground truncate">{shortName(group.filter.name)}</h3>
                      <span className="text-[10px] text-muted-foreground shrink-0">{group.items.length}</span>
                    </div>
                    <button
                      onClick={() => setPresetCategory(group.filter.id)}
                      className="text-[10px] font-bold text-[var(--bbdo-blue)] active:opacity-70 shrink-0"
                    >
                      See all →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {group.items.slice(0, 4).map((it, idx) => (
                      <FoodRow
                        key={it.id}
                        item={it}
                        categoryLabel={null}
                        sort={effectiveSort}
                        rule={ruleMap.get(it.id) || null}
                        onClick={() => setOpenItem(it)}
                        delay={Math.min(idx * 0.015, 0.1)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key={`${activeFilter}-${diet || "all"}-${sort}-${preset || "none"}-${presetCategory || "all"}-${search}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="space-y-3"
            >
              {displayItems.map((it, idx) => (
                <FoodRow
                  key={it.id}
                  item={it}
                  categoryLabel={isGlobalSort && !presetCategory ? filterLabel(filters.find((f) => f.id === it.filter_id)) : null}
                  sort={effectiveSort}
                  rule={ruleMap.get(it.id) || null}
                  onClick={() => setOpenItem(it)}
                  delay={Math.min(idx * 0.015, 0.15)}
                />
              ))}
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {openItem && (
          <FoodItemDetail
            item={openItem}
            filter={filters.find((f) => f.id === openItem.filter_id) || null}
            onClose={() => setOpenItem(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {filterSheet && (
          <FilterSheet
            sort={sort}
            setSort={setSort}
            onClose={() => setFilterSheet(false)}
            onClear={() => setSort("recommended")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Pill({
  active, onClick, label,
}: { active: boolean; onClick: () => void; label: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 h-9 px-3 rounded-full text-[12px] font-bold border transition-colors active:scale-[0.98] ${
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-white text-foreground border-border"
      }`}
    >
      {label}
    </button>
  );
}

function FoodRow({
  item, categoryLabel, sort, rule, onClick, delay,
}: {
  item: FoodItem;
  categoryLabel: string | null;
  sort: SortKey;
  rule: FoodRuleHit | null;
  onClick: () => void;
  delay: number;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(() => getCachedFoodImageUrl(item.id));
  useEffect(() => {
    // Re-read cache when the batch prime signals new URLs.
    const sync = () => {
      const u = getCachedFoodImageUrl(item.id);
      if (u) setImgUrl(u);
    };
    sync();
    const unsub = subscribeFoodImages(sync);
    // Fallback: if still nothing after batch (e.g. row missing image_url), lazily generate.
    let alive = true;
    if (!getCachedFoodImageUrl(item.id)) {
      getFoodImageUrl(item.id).then((u) => { if (alive && u) setImgUrl(u); });
    }
    return () => { alive = false; unsub(); };
  }, [item.id]);

  const dietDotCls =
    item.diet_type === "non_veg" ? "border-rose-600" :
    item.diet_type === "vegan"   ? "border-emerald-500" :
                                   "border-emerald-600";
  const dietDotFill =
    item.diet_type === "non_veg" ? "bg-rose-600" :
    item.diet_type === "vegan"   ? "bg-emerald-500" :
                                   "bg-emerald-600";

  const highlight = (() => {
    switch (sort) {
      case "protein_high": return { label: "Protein", value: scaleMacro(item.protein_g, item) != null ? `${scaleMacro(item.protein_g, item)}g` : "—" };
      case "carbs_low":    return { label: "Carbs",   value: scaleRange(item.carbs_min, item.carbs_max, item, "g") };
      case "gi_low":       return { label: "GI",      value: item.gi_band ? giLabel[item.gi_band] : "—" };
      case "cal_low":      return { label: "Calories", value: scaleCalories(item.calories_kcal, item) != null ? `${scaleCalories(item.calories_kcal, item)} kcal` : "—" };
      default:             return null;
    }
  })();

  // Ring color communicates the strongest condition-rule verdict for this food.
  const ringCls =
    rule?.action === "avoid"     ? "border-rose-400/60 ring-1 ring-rose-300/40" :
    rule?.action === "limit"     ? "border-amber-400/60" :
    rule?.action === "encourage" ? "border-emerald-400/60" :
                                   "border-border/60";
  const dimmed = rule?.action === "avoid";

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE, delay }}
      whileTap={{ scale: 0.985 }}
      className={`w-full text-left rounded-2xl bg-white border p-3 flex gap-3 hover:border-border shadow-card transition-colors ${ringCls} ${dimmed ? "opacity-75" : ""}`}
    >
      {/* Thumb */}
      <div className="relative w-[88px] h-[88px] rounded-xl overflow-hidden bg-muted shrink-0">
        {imgUrl ? (
          <img src={imgUrl} alt={item.name} loading="lazy" decoding="async" width={88} height={88}
               className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/60">
            <span className="text-xl font-black text-muted-foreground/40">{item.name[0]}</span>
          </div>
        )}
        {/* Veg / non-veg square */}
        <div className={`absolute top-1.5 left-1.5 w-3.5 h-3.5 border-[1.5px] ${dietDotCls} bg-white rounded-[3px] flex items-center justify-center`}>
          <div className={`w-1.5 h-1.5 rounded-full ${dietDotFill}`} />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-black text-foreground leading-tight truncate">{item.name}</h3>
            {item.alt_name && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.alt_name}</p>
            )}
          </div>
          {categoryLabel && (
            <span className="text-[9px] font-bold tracking-wider text-muted-foreground/70 shrink-0">{categoryLabel}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1 mt-1.5">
          {item.gi_band && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${giClass[item.gi_band]}`}>
              {giLabel[item.gi_band]}
            </span>
          )}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${recClass[item.recommendation]}`}>
            {recLabel[item.recommendation]}
          </span>
          {rule && (
            <span
              title={rule.reason}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${
                rule.action === "avoid"     ? "bg-rose-500/15 text-rose-700" :
                rule.action === "limit"     ? "bg-amber-500/15 text-amber-700" :
                                              "bg-emerald-500/15 text-emerald-700"
              }`}
            >
              {(() => {
                const ConditionIcon = CONDITION_ICONS[rule.condition.key] ?? ShieldAlert;
                return <ConditionIcon className="w-3 h-3" strokeWidth={1.75} aria-hidden />;
              })()}
              {rule.action === "avoid" ? "Skip" : rule.action === "limit" ? "Limit" : "Great for"} · {rule.condition.label}
            </span>
          )}
        </div>

        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <div className="flex gap-3 text-[10.5px] text-muted-foreground">
            <span><b className="text-foreground">{scaleRange(item.carbs_min, item.carbs_max, item, "g")}</b> carbs</span>
            <span><b className="text-foreground">{scaleMacro(item.protein_g, item) != null ? `${scaleMacro(item.protein_g, item)}g` : "—"}</b> protein</span>
            <span className="hidden sm:inline"><b className="text-foreground">{portionLabel(item)}</b></span>
          </div>
          {highlight && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[var(--bbdo-blue)]/10 text-[var(--bbdo-blue)] whitespace-nowrap">
              {highlight.label}: {highlight.value}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

function FilterSheet({
  sort, setSort, onClose, onClear,
}: {
  sort: SortKey;
  setSort: (s: SortKey) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-black/40 flex items-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        transition={{ duration: 0.22, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl mx-auto bg-white rounded-t-3xl p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto"
      >
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-black">Sort foods</h3>
          <button onClick={onClear} className="text-xs font-bold text-rose-600 active:opacity-70">Reset</button>
        </div>
        <p className="text-[12px] text-muted-foreground mb-3">
          Sort applies across every category. Diet is set from your profile — tap a diet chip on the previous screen to change it.
        </p>

        <div className="grid grid-cols-1 gap-1.5">
          {SORT_OPTIONS.map((o) => {
            const active = sort === o.key;
            return (
              <button
                key={o.key}
                onClick={() => setSort(o.key)}
                className={`h-12 px-4 rounded-xl flex items-center justify-between transition-colors text-sm font-bold ${
                  active ? "bg-foreground text-background" : "bg-muted text-foreground"
                }`}
              >
                <span>{o.label}</span>
                {active && <Check className="w-4 h-4" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full h-12 rounded-2xl bg-[var(--bbdo-blue)] text-white text-sm font-black active:opacity-90"
        >
          Show results
        </button>
      </motion.div>
    </motion.div>
  );
}

function shortName(name: string): string {
  return name
    .replace("High-Carb Staple Foods", "Staples")
    .replace("Sweets & Sweet Products", "Sweets")
    .replace("Pulses & Legumes", "Pulses")
    .replace("Milk & Milk Sugars", "Milk")
    .replace("Fruits & Fruit Sugars", "Fruits")
    .replace("Lean Protein – Non Vegetarians", "Lean Protein")
    .replace("High Protein Foods – Vegetarian / Vegan", "Veg Protein")
    .replace("Healthy Fats", "Fats")
    .replace("Rice & Wheat Alternatives", "Carb Alternatives")
    .replace("Nuts & Seeds", "Nuts & Seeds")
    .replace("Dairy Products", "Dairy")
    .replace("Other Add-ons", "Add-ons");
}

function ConditionBreakdownCard({
  condition,
  avoid,
  limit,
  encourage,
  onOpen,
}: {
  condition: ActiveCondition;
  avoid: { item: FoodItem; reason: string }[];
  limit: { item: FoodItem; reason: string }[];
  encourage: { item: FoodItem; reason: string }[];
  onOpen: (item: FoodItem) => void;
}) {
  const sections = [
    { key: "avoid" as const,     label: "Avoid",     items: avoid,     chip: "bg-rose-500/10 text-rose-700 border-rose-500/30",       dot: "bg-rose-600",    header: "text-rose-700" },
    { key: "limit" as const,     label: "Limit",     items: limit,     chip: "bg-amber-500/10 text-amber-700 border-amber-500/30",   dot: "bg-amber-500",   header: "text-amber-700" },
    { key: "encourage" as const, label: "Encourage", items: encourage, chip: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", dot: "bg-emerald-600", header: "text-emerald-700" },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="px-3.5 py-2.5 bg-muted/40 border-b border-border flex items-center gap-2">
        {condition.icon_url && (
          <img src={condition.icon_url} alt="" className="w-7 h-7 rounded-lg bg-white object-contain p-0.5 border border-border" loading="lazy" />
        )}


        <div className="flex-1 min-w-0">
          <p className="text-[9.5px] font-bold tracking-[0.14em] uppercase text-muted-foreground">
            For your condition
          </p>
          <p className="text-sm font-black text-foreground truncate">{condition.label}</p>
        </div>
      </div>
      <div className="px-3.5 py-3 space-y-3">
        {sections.map((s) => (
          <div key={s.key}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              <p className={`text-[10px] font-black tracking-[0.14em] uppercase ${s.header}`}>
                {s.label}
              </p>
              <span className="text-[10px] font-bold text-muted-foreground">{s.items.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.items.slice(0, 40).map(({ item, reason }) => (
                <button
                  key={item.id}
                  onClick={() => onOpen(item)}
                  title={reason}
                  className={`h-7 px-2.5 rounded-full text-[11px] font-bold border transition-colors active:scale-[0.98] ${s.chip}`}
                >
                  {item.name}
                </button>
              ))}
              {s.items.length > 40 && (
                <span className="h-7 px-2 flex items-center text-[10.5px] font-bold text-muted-foreground">
                  +{s.items.length - 40} more
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

