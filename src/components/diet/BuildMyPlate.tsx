import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, Minus, Plus, Save, Sparkles, Edit3,
  Wheat, Beef, Droplets, Leaf, Flame, X, ImageIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { toast } from "sonner";
import FoodItemDetail from "./FoodItemDetail";
import { getFoodImageUrl, primeFoodImages, getCachedFoodImageUrl } from "@/lib/foodImageService";
import { renderPlate } from "@/lib/plateRenderer";
import {
  type FoodFilter, type FoodItem, type DietType,
  giLabel, giClass, avgOf, sugarSpikeRisk, portionFactor, portionLabel, scaleCalories, scaleMacro,
} from "./dietTypes";
import { useUserDietProfile, isFoodBlockedByDietProfile } from "@/hooks/useUserDietProfile";



const EASE = [0.22, 1, 0.36, 1] as const;

type DietPref = string;

interface SectionDef {
  id: string;
  filterSlugs: string[];        // one or more filters merged into a single step
  header: string;
  hook: string;
  recMin: number;               // recommended minimum picks across this step
  recMax: number;               // recommended maximum — going beyond shows a warning
  optional?: boolean;
  groupLabels?: Record<string, string>; // labels per filter slug when merged
}

// Recommended portion logic comes from BBDO Build-My-Plate spec
const BASE_AFTER_PROTEIN: SectionDef[] = [
  { id: "veggies", filterSlugs: ["vegetables"],              header: "Vegetables & Greens", hook: "Bulk up the plate with fibre and key nutrients.",  recMin: 2, recMax: 3 },
  { id: "fats",    filterSlugs: ["healthy_fats"],            header: "Healthy Fats",        hook: "Improves satiety and metabolic stability.",         recMin: 1, recMax: 2 },
  { id: "nuts",    filterSlugs: ["nuts_and_seeds"],          header: "Nuts & Seeds",        hook: "Nutrient boost for balance and recovery.",          recMin: 2, recMax: 3 },
  { id: "dairy",   filterSlugs: ["dairy"],                    header: "Dairy",               hook: "Optional — boost protein & fats with fermentation benefits.", recMin: 1, recMax: 2, optional: true },
  { id: "carbs",   filterSlugs: ["rice_wheat_alternatives"], header: "Carb Alternatives",   hook: "Optional — use a controlled portion during reversal.", recMin: 1, recMax: 1, optional: true },
];

function buildSections(prefs: DietPref[]): SectionDef[] {
  const norm = prefs.map(normalizeDietPref).filter(Boolean) as string[];
  const isNonVeg = norm.includes("non_veg");
  const isEgg = norm.includes("eggitarian");
  // Anyone who eats animal protein (meat/fish or eggs) gets a SINGLE merged
  // protein step: animal + plant lists together, recommended total stays 1–2.
  const proteinStep: SectionDef = (isNonVeg || isEgg)
    ? {
        id: "protein",
        filterSlugs: ["lean_proteins", "veg_vegan_proteins"],
        header: "Protein",
        hook: isNonVeg
          ? "Anchor your plate. Pick from animal or plant proteins — or mix both. Total 1–2 works best."
          : "Anchor your plate. Pick eggs or plant proteins — or mix both. Total 1–2 works best.",
        recMin: 1, recMax: 2,
        groupLabels: {
          lean_proteins: isNonVeg ? "Lean (Non-veg)" : "Eggs",
          veg_vegan_proteins: "Plant-based",
        },
      }
    : {
        id: "protein",
        filterSlugs: ["veg_vegan_proteins"],
        header: "Veg / Vegan Protein",
        hook: "Anchor your plate with 1–2 plant proteins.",
        recMin: 1, recMax: 2,
      };

  return [proteinStep, ...BASE_AFTER_PROTEIN];
}

interface PlateSelection {
  itemId: string;
  servings: number; // multiplier on base serving (e.g. 1 katori, 2 tbsp)
}

const normalizePref = normalizeDietPref;


function servingText(servings: number) {
  return servings % 1 === 0 ? String(servings) : servings.toFixed(1);
}

// Only the columns the plate builder actually renders — `select("*")` pulled
// long text/array blobs that made the first paint take seconds.
const FOOD_ITEM_COLUMNS =
  "id,filter_id,name,alt_name,diet_type,serving_basis,serving_size_qty,serving_size_unit,serving_label,household_measure,household_grams,carbs_min,carbs_max,gi_min,gi_max,gi_band,protein_g,fat_g,fiber_g,calories_kcal,recommendation,is_jain_friendly,is_dairy_free,is_active,display_order,health_benefits,notes,image_url,updated_at";

// Session-level catalogue cache — re-opening the builder is instant.
let catalogueCache: { filters: any[]; items: any[] } | null = null;



export default function BuildMyPlate({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void | Promise<void> }) {
  const { user } = useAuth();
  const { subPreferences, allergenFoodIds } = useUserDietProfile(user?.id);
  const confirm = useConfirm();

  const [filters, setFilters] = useState<FoodFilter[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<DietPref[]>([]);
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<PlateSelection[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});
  const [openItem, setOpenItem] = useState<FoodItem | null>(null);
  const [mode, setMode] = useState<"build" | "review">("build");
  const [saving, setSaving] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const plateCanvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Warm start: reuse the catalogue fetched earlier in this session so
    // re-opening Build My Plate is instant instead of a 5s cold fetch.
    if (catalogueCache) {
      setFilters(catalogueCache.filters);
      setItems(catalogueCache.items);
      setLoading(false);
      primeFoodImages(catalogueCache.items as any);
    }
    (async () => {
      const [f, i, p] = await Promise.all([
        supabase.from("food_filters").select("*").eq("is_active", true),
        supabase
          .from("food_items")
          .select(FOOD_ITEM_COLUMNS)
          .eq("is_active", true)
          .order("display_order"),
        user
          ? supabase.from("user_diet_profiles").select("diet_preference, diet_preferences").eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      if (cancelled) return;
      const filtersData = (f.data as any) || [];
      const itemsData = (i.data as any) || [];
      setFilters(filtersData);
      setItems(itemsData);
      catalogueCache = { filters: filtersData, items: itemsData };
      primeFoodImages(itemsData);
      const data = (p as any)?.data;
      if (data) {
        const arr = (data.diet_preferences as string[] | null) || [];
        const mapped = arr.map(normalizePref).filter(Boolean) as DietPref[];
        const single = normalizePref(data.diet_preference);
        const finalPrefs = single && mapped.length > 0 && !mapped.includes(single) ? [single] : (mapped.length ? mapped : single ? [single] : []);
        setPrefs(finalPrefs);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);


  // Adapt sections based on prefs (multi-select).
  const sections = useMemo(() => buildSections(prefs), [prefs]);
  const currentSection = sections[step];

  // Filter rows that back the current step (one or more)
  const currentFilters = useMemo(() => {
    if (!currentSection) return [];
    return currentSection.filterSlugs
      .map((slug) => filters.find((f) => f.slug === slug))
      .filter(Boolean) as FoodFilter[];
  }, [currentSection, filters]);
  const currentFilterIds = useMemo(() => new Set(currentFilters.map((f) => f.id)), [currentFilters]);

  // Items visible in current section, filtered by prefs (union when multiple)
  // Grouped per filter so we can show "Lean (Non-veg)" / "Plant-based" subheaders.
  const sectionGroups = useMemo(() => {
    return currentFilters.map((f) => {
      const list = items
        .filter((it) => it.filter_id === f.id)
        .filter((it) => !isFoodBlockedByDietProfile(it as any, subPreferences, allergenFoodIds))
        .filter((it) => {
          if (prefs.length === 0) return true; // skip → show everything
          if (prefs.includes("vegan") && it.diet_type === "vegan") return true;
          if (prefs.includes("veg") && it.diet_type !== "non_veg") return true;
          if (prefs.includes("jain") && it.is_jain_friendly) return true;
          if (prefs.includes("non_veg")) return true;
          return false;
        });
      return {
        filterId: f.id,
        filterSlug: f.slug,
        label: currentSection?.groupLabels?.[f.slug] || null,
        items: list,
      };
    }).filter((g) => g.items.length > 0);
  }, [items, currentFilters, prefs, currentSection, subPreferences, allergenFoodIds]);


  const sectionItems = useMemo(() => sectionGroups.flatMap((g) => g.items), [sectionGroups]);

  // Picks in the CURRENT step (across all merged filters)
  const sectionPickCount = useMemo(
    () => selections.filter((s) => {
      const it = items.find((i) => i.id === s.itemId);
      return it && currentFilterIds.has(it.filter_id);
    }).length,
    [selections, items, currentFilterIds]
  );
  const overRec = !!currentSection && sectionPickCount > currentSection.recMax;
  const atRec = !!currentSection && sectionPickCount >= currentSection.recMax;

  // Prefetch food images for visible section
  useEffect(() => {
    const pending = sectionItems.filter((it) => imageUrls[it.id] === undefined);
    if (!pending.length) return;
    // Batch-sign the whole visible section in one pass (avoids one query per item),
    // then only fall back to the per-item resolver for rows with no image yet.
    const next: Record<string, string | null> = {};
    pending.forEach((it) => { next[it.id] = getCachedFoodImageUrl(it.id) ?? null; });
    setImageUrls((prev) => ({ ...prev, ...next }));
    void primeFoodImages(pending as any).then(() => {
      const primed: Record<string, string | null> = {};
      pending.forEach((it) => {
        const url = getCachedFoodImageUrl(it.id);
        if (url) primed[it.id] = url;
      });
      if (Object.keys(primed).length) setImageUrls((prev) => ({ ...prev, ...primed }));
      pending
        .filter((it) => !getCachedFoodImageUrl(it.id) && !(it as any).image_url)
        .forEach((it) => {
          getFoodImageUrl(it.id).then((url) => setImageUrls((prev) => ({ ...prev, [it.id]: url })));
        });
    });
  }, [sectionItems]); // eslint-disable-line react-hooks/exhaustive-deps


  // Helpers
  const selectionMap = useMemo(() => {
    const m = new Map<string, PlateSelection>();
    selections.forEach((s) => m.set(s.itemId, s));
    return m;
  }, [selections]);

  const addItem = (itemId: string) => {
    setSelections((prev) => {
      if (prev.find((s) => s.itemId === itemId)) return prev;
      // Warn (but don't block) when going beyond recommended max for this step
      if (currentSection) {
        const itemBeingAdded = items.find((i) => i.id === itemId);
        const inSection = itemBeingAdded && currentFilterIds.has(itemBeingAdded.filter_id);
        if (inSection && sectionPickCount >= currentSection.recMax) {
          toast(`Recommended max is ${currentSection.recMax} for ${currentSection.header}. More won't help.`, { duration: 2500 });
        }
      }
      return [...prev, { itemId, servings: 1 }];
    });
  };
  const removeItem = (itemId: string) => setSelections((prev) => prev.filter((s) => s.itemId !== itemId));
  const setServings = (itemId: string, servings: number) => {
    const s = Math.max(1, Math.min(12, Math.round(servings)));
    setSelections((prev) => prev.map((p) => p.itemId === itemId ? { ...p, servings: s } : p));
  };

  // Totals
  const selectedFoodItems = useMemo(() => selections
    .map((s) => ({ sel: s, item: items.find((it) => it.id === s.itemId) }))
    .filter((x) => x.item) as { sel: PlateSelection; item: FoodItem }[],
    [selections, items]);

  const totals = useMemo(() => {
    let carbs = 0, protein = 0, fat = 0, fiber = 0, kcal = 0, giSum = 0, giCount = 0;
    selectedFoodItems.forEach(({ sel, item }) => {
      // Nutrition is stored per 100g of basis. Real portion = household_grams (e.g. 50g),
      // multiplied by how many servings the user picked.
      const factor = portionFactor(item) * sel.servings;
      carbs += (avgOf(item.carbs_min, item.carbs_max) || 0) * factor;
      protein += (item.protein_g || 0) * factor;
      fat += (item.fat_g || 0) * factor;
      fiber += (item.fiber_g || 0) * factor;
      kcal += (item.calories_kcal || 0) * factor;
      const g = avgOf(item.gi_min, item.gi_max);
      if (g != null) { giSum += g; giCount++; }
    });
    const avgGi = giCount ? Math.round(giSum / giCount) : null;
    return {
      carbs: Math.round(carbs * 10) / 10,
      protein: Math.round(protein * 10) / 10,
      fat: Math.round(fat * 10) / 10,
      fiber: Math.round(fiber * 10) / 10,
      kcal: Math.round(kcal),
      avgGi,
      risk: sugarSpikeRisk(avgGi, carbs),
    };
  }, [selectedFoodItems]);

  const next = () => {
    if (step < sections.length - 1) setStep((s) => s + 1);
    else setMode("review");
  };
  const back = () => {
    if (mode === "review") setMode("build");
    else if (step > 0) setStep((s) => s - 1);
    else onClose();
  };

  const handleSave = async () => {
    if (saving) return;
    if (!user) { toast.error("Please sign in to save"); return; }
    if (selectedFoodItems.length === 0) { toast.error("Add at least one food to your plate"); return; }
    // No confirmation dialog here: saving is non-destructive, and a modal on top
    // of this full-screen portal previously locked the screen.
    setSaving(true);

    const giBand = totals.avgGi == null ? null
      : totals.avgGi < 55 ? "low"
      : totals.avgGi < 65 ? "medium"
      : totals.avgGi < 75 ? "med_high" : "high";

    const plateItems = selectedFoodItems.map(({ sel, item }) => ({
      id: item.id, name: item.name, alt_name: item.alt_name, diet_type: item.diet_type,
      filter_id: item.filter_id, servings: sel.servings,
      serving_label: item.serving_label, household_measure: item.household_measure,
      carbs_min: item.carbs_min, carbs_max: item.carbs_max, protein_g: item.protein_g,
      fat_g: item.fat_g, fiber_g: item.fiber_g, calories_kcal: item.calories_kcal,
      gi_band: item.gi_band, image_url: imageUrls[item.id] || null,
    }));

    // Save the record first — the plate snapshot is cosmetic and is rendered +
    // uploaded in the background afterwards, so the user never waits for it.
    const { data: inserted, error } = await supabase.from("user_plates").insert({
      user_id: user.id,
      name: `Plate · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      items: plateItems,
      total_carbs_g: totals.carbs,
      total_protein_g: totals.protein,
      total_fat_g: totals.fat,
      total_fiber_g: totals.fiber,
      total_calories_kcal: totals.kcal,
      avg_gi: totals.avgGi,
      gi_band: giBand,
      sugar_spike_risk: totals.risk,
      snapshot_url: null,
    } as any).select("id").maybeSingle();

    if (!error && inserted) {
      const plateId = (inserted as any).id as string;
      const snapItems = selectedFoodItems.map(({ item }) => ({ name: item.name, imageUrl: imageUrls[item.id] || null }));
      void (async () => {
        try {
          const blob = await Promise.race([
            renderPlate(snapItems, 720),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
          ]);
          if (!blob) return;
          const path = `${user.id}/${crypto.randomUUID()}.jpg`;
          const up = await supabase.storage.from("plate-snapshots").upload(path, blob, { contentType: "image/jpeg", upsert: true });
          if (up.error) return;
          await supabase.from("user_plates").update({ snapshot_url: path } as any).eq("id", plateId);
        } catch (e) {
          console.error("plate snapshot failed", e);
        }
      })();
    }

    setSaving(false);
    if (error) {
      console.error("[plate] save failed", error);
      toast.error(error.message || "Couldn't save plate");
      return;
    }
    toast.success("Plate saved! 🍽️");
    try { await onSaved?.(); } catch (e) { console.error(e); }
    onClose();
  };

  const progress = sections.length ? ((step + 1) / sections.length) * 100 : 0;
  const riskColor = totals.risk === "low" ? "bg-emerald-500/15 text-emerald-700"
    : totals.risk === "moderate" ? "bg-amber-500/15 text-amber-700"
    : "bg-rose-500/15 text-rose-700";

  // ────────── REVIEW MODE ──────────
  if (mode === "review") {
    return createPortal(
      <div className="fixed inset-0 z-[1000] bg-background overflow-y-auto">
        <header className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center gap-2 max-w-3xl mx-auto">
          <button onClick={back} className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center active:scale-95">
            <ArrowLeft className="w-5 h-5" strokeWidth={2} />
          </button>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--bbdo-blue)]">My Plate · Preview</p>
        </header>
        <div className="max-w-2xl mx-auto px-5 pt-2 pb-40">
          <h1 className="text-3xl font-black text-foreground leading-tight">Your plate is ready.</h1>
          <p className="text-sm text-muted-foreground mt-2">Here's the snapshot we'll save.</p>

          {/* Visual plate */}
          <div className="mt-5">
            <VisualPlate items={selectedFoodItems.map(({ item }) => ({ name: item.name, imageUrl: imageUrls[item.id] || null }))} />
          </div>

          {/* Risk + macros */}
          <div className="mt-4 rounded-3xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(217 83% 28%), hsl(217 91% 50%))" }}>
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <p className="text-[11px] font-bold tracking-wider uppercase text-white/80">Sugar spike risk</p>
              <p className="text-3xl font-black mt-1 capitalize">{totals.risk}</p>
              <p className="text-xs text-white/85 mt-1">
                {totals.avgGi != null && <>Avg GI {totals.avgGi} · </>}
                {totals.carbs}g carbs total
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <MacroStat icon={Wheat} label="Carbs" value={`${totals.carbs}g`} tint="bg-amber-500/10 text-amber-700" />
            <MacroStat icon={Beef} label="Protein" value={`${totals.protein}g`} tint="bg-rose-500/10 text-rose-700" />
            <MacroStat icon={Droplets} label="Fat" value={`${totals.fat}g`} tint="bg-blue-500/10 text-blue-700" />
            <MacroStat icon={Leaf} label="Fibre" value={`${totals.fiber}g`} tint="bg-emerald-500/10 text-emerald-700" />
          </div>
          <div className="mt-3 rounded-2xl bg-card border border-border/60 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Flame className="w-4 h-4 text-orange-700" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Total Calories</p>
              <p className="text-lg font-black text-foreground">{totals.kcal} kcal</p>
            </div>
          </div>

          {/* Item list with portions */}
          <div className="mt-6 space-y-2">
            <p className="text-xs font-bold tracking-wider uppercase text-muted-foreground">On the plate</p>
            {selectedFoodItems.map(({ sel, item }) => (
              <div key={item.id} className="rounded-2xl bg-card border border-border/60 p-3 flex items-center gap-3">
                <Thumb url={imageUrls[item.id] || null} name={item.name} size={48} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-foreground truncate">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {servingText(sel.servings)}× {portionLabel(item)}
                  </p>
                </div>
                <button onClick={() => removeItem(item.id)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground active:scale-95">
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background/95 to-transparent">
          <div className="max-w-2xl mx-auto flex gap-2">
            <button onClick={() => setMode("build")} className="h-14 px-5 rounded-2xl bg-muted text-foreground font-bold flex items-center justify-center gap-2 active:scale-[0.98]">
              <Edit3 className="w-4 h-4" strokeWidth={2} /> Edit
            </button>
            <button onClick={handleSave} disabled={saving} className="flex-1 h-14 rounded-2xl bg-[var(--bbdo-red)] text-white font-black flex items-center justify-center gap-2 active:scale-[0.99] shadow-lift disabled:opacity-60">
              <Save className="w-5 h-5" strokeWidth={2} /> {saving ? "Saving…" : "Save plate"}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {openItem && <FoodItemDetail item={openItem} filter={filters.find((f) => f.id === openItem.filter_id) || null} onClose={() => setOpenItem(null)} />}
        </AnimatePresence>
      </div>,
      document.body,
    );
  }

  // ────────── BUILD MODE ──────────
  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-background overflow-hidden flex flex-col">
      {/* Header */}
      <header className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-border/60 bg-background">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <button onClick={back} className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center active:scale-95">
            <ArrowLeft className="w-5 h-5" strokeWidth={2} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--bbdo-blue)]">Step {step + 1} of {sections.length}</p>
            <p className="text-sm font-black text-foreground leading-tight truncate">{currentSection?.header}</p>
          </div>
          <button onClick={() => setShowCart(true)} className="relative w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95">
            <ImageIcon className="w-4 h-4" strokeWidth={2} />
            {selections.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[var(--bbdo-red)] text-white text-[10px] font-black flex items-center justify-center px-1">
                {selections.length}
              </span>
            )}
          </button>
        </div>
        <div className="max-w-3xl mx-auto mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div className="h-full bg-[var(--bbdo-blue)]" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.3, ease: EASE }} />
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-6">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black px-2 py-1 rounded-full bg-[var(--bbdo-blue)]/10 text-[var(--bbdo-blue)] uppercase tracking-wider">
                Choose {currentSection?.recMin === currentSection?.recMax
                  ? currentSection?.recMax
                  : `${currentSection?.recMin}–${currentSection?.recMax}`}
              </span>
              {currentSection?.optional && (
                <span className="text-[10px] font-black px-2 py-1 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                  Optional
                </span>
              )}
              <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider ${
                overRec ? "bg-amber-500/15 text-amber-700"
                : sectionPickCount >= (currentSection?.recMin || 0) ? "bg-emerald-500/15 text-emerald-700"
                : "bg-muted text-muted-foreground"
              }`}>
                {sectionPickCount} selected
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mt-3">{currentSection?.hook}</p>
            {overRec && (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 leading-snug">
                Heads up — you've picked {sectionPickCount}. Recommended is up to {currentSection?.recMax}.
                Extra portions here won't help reversal; they only add carbs/calories.
              </div>
            )}
          </motion.div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 mt-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : sectionGroups.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No options match your preferences here.</p>
              <button onClick={next} className="mt-4 text-xs font-bold text-[var(--bbdo-blue)] underline">Skip this section</button>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {sectionGroups.map((group) => (
                <div key={group.filterId}>
                  {group.label && sectionGroups.length > 1 && (
                    <p className="text-[10px] font-black tracking-[0.18em] uppercase text-muted-foreground mb-2 px-1">
                      {group.label} · {group.items.length}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2">
                    {group.items.map((it) => {
                      const sel = selectionMap.get(it.id);
                      return (
                        <FoodTile
                          key={it.id}
                          item={it}
                          imageUrl={imageUrls[it.id] || null}
                          selection={sel}
                          atRecommendedMax={atRec && !sel}
                          onAdd={() => addItem(it.id)}
                          onIncrement={() => setServings(it.id, (sel?.servings || 1) + 1)}
                          onDecrement={() => {
                            if (!sel) return;
                            if (sel.servings <= 1) removeItem(it.id);
                            else setServings(it.id, sel.servings - 1);
                          }}
                          onOpen={() => setOpenItem(it)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticky live macro bar + nav */}
      <div className="shrink-0 relative z-20 bg-background border-t border-border shadow-[0_-8px_24px_hsl(var(--foreground)/0.08)]">
        {selections.length > 0 && (
          <div className="px-4 pt-2 pb-1 max-w-3xl mx-auto flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <span className={`text-[10px] font-black px-2 py-1 rounded-full whitespace-nowrap capitalize ${riskColor}`}>
              {totals.risk} risk
            </span>
            <MiniMacro label="C" value={`${totals.carbs}g`} />
            <MiniMacro label="P" value={`${totals.protein}g`} />
            <MiniMacro label="F" value={`${totals.fat}g`} />
            <MiniMacro label="Fb" value={`${totals.fiber}g`} />
            <MiniMacro label="kcal" value={`${totals.kcal}`} />
          </div>
        )}
        <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] max-w-3xl mx-auto flex gap-2">
          <button type="button" onClick={next} className="h-12 px-5 rounded-2xl border border-border bg-muted text-foreground font-bold text-sm flex items-center gap-1 active:scale-[0.98]">
            Skip
          </button>
          <button type="button" onClick={next} className="flex-1 h-12 rounded-2xl bg-[var(--bbdo-red)] text-white font-black flex items-center justify-center gap-2 active:scale-[0.99] shadow-lift">
            {step === sections.length - 1 ? "Preview plate" : "Continue"}
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Cart drawer */}
      <AnimatePresence>
        {showCart && (
          <motion.div
            className="fixed inset-0 z-[70] bg-background/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={() => setShowCart(false)}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.28, ease: EASE }}
              className="absolute bottom-0 inset-x-0 bg-background rounded-t-3xl shadow-lift max-h-[88vh] flex flex-col"
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <p className="text-base font-black text-foreground">Your plate ({selections.length})</p>
                <button onClick={() => setShowCart(false)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95">
                  <X className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
              <div className="px-5 pb-2">
                <VisualPlate items={selectedFoodItems.map(({ item }) => ({ name: item.name, imageUrl: imageUrls[item.id] || null }))} compact />
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
                {selectedFoodItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Nothing on the plate yet.</p>
                ) : selectedFoodItems.map(({ sel, item }) => (
                  <div key={item.id} className="rounded-2xl bg-card border border-border/60 p-3 flex items-center gap-3">
                    <Thumb url={imageUrls[item.id] || null} name={item.name} size={44} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-foreground truncate">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {servingText(sel.servings)}× {portionLabel(item)}
                      </p>
                    </div>
                      <ServingStepper
                      value={sel.servings}
                        onDec={() => sel.servings <= 1 ? removeItem(item.id) : setServings(item.id, sel.servings - 1)}
                        onInc={() => setServings(item.id, sel.servings + 1)}
                      onRemove={() => removeItem(item.id)}
                    />
                  </div>
                ))}
              </div>
              <div className="px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border/60">
                <button
                  onClick={() => { setShowCart(false); setMode("review"); }}
                  disabled={selections.length === 0}
                  className="w-full h-12 rounded-2xl bg-[var(--bbdo-red)] text-white font-black flex items-center justify-center gap-2 active:scale-[0.99] shadow-lift disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" strokeWidth={2} /> Preview & Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openItem && <FoodItemDetail item={openItem} filter={filters.find((f) => f.id === openItem.filter_id) || null} onClose={() => setOpenItem(null)} />}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FoodTile({
  item, imageUrl, selection, atRecommendedMax, onAdd, onIncrement, onDecrement, onOpen,
}: {
  item: FoodItem;
  imageUrl: string | null;
  selection: PlateSelection | undefined;
  atRecommendedMax?: boolean;
  onAdd: () => void; onIncrement: () => void; onDecrement: () => void; onOpen: () => void;
}) {
  const label = portionLabel(item);
  const kcal = scaleCalories(item.calories_kcal, item);
  const protein = scaleMacro(item.protein_g, item);
  const isSel = !!selection;
  return (
    <motion.div
      layout
      className={`rounded-2xl border transition-colors ${isSel ? "border-[var(--bbdo-blue)] bg-[var(--bbdo-blue)]/5" : atRecommendedMax ? "border-amber-500/40 bg-amber-500/[0.03]" : "border-border/60 bg-card"}`}
    >
      <div className="flex items-center gap-3 p-3">
        <Thumb url={imageUrl} name={item.name} size={52} />
        <button onClick={onOpen} className="flex-1 min-w-0 text-left active:opacity-80">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-black text-foreground leading-tight truncate">{item.name}</p>
            {item.gi_band && (
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${giClass[item.gi_band]}`}>
                {giLabel[item.gi_band]}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {label}
            {kcal != null ? ` · ${kcal} kcal` : ""}
            {protein != null ? ` · ${protein}g P` : ""}
          </p>
        </button>
        {isSel ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={onDecrement} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:scale-95">
              <Minus className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <div className="min-w-[44px] h-9 px-2 rounded-xl bg-foreground text-background text-xs font-black flex items-center justify-center">
              {servingText(selection!.servings)}×
            </div>
            <button onClick={onIncrement} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:scale-95">
              <Plus className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button
            onClick={onAdd}
            className="shrink-0 h-9 px-4 rounded-xl bg-foreground text-background text-xs font-black flex items-center justify-center gap-1 active:scale-[0.97]"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> Add
          </button>
        )}
      </div>
    </motion.div>
  );
}

function ServingStepper({
  value, onDec, onInc, onRemove,
}: { value: number; onDec: () => void; onInc: () => void; onRemove?: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <button onClick={onDec} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center active:scale-95">
        <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
      <div className="flex-1 h-8 rounded-xl bg-foreground text-background text-xs font-black flex items-center justify-center">
        {servingText(value)}×
      </div>
      <button onClick={onInc} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center active:scale-95">
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
      {onRemove && (
        <button onClick={onRemove} className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center active:scale-95">
          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

function Thumb({ url, name, size }: { url: string | null; name: string; size: number }) {
  return (
    <div className="rounded-xl overflow-hidden bg-muted shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-foreground/70 font-black" style={{ background: "linear-gradient(135deg,#FBF6EE,#F2E9D8)" }}>
          {name.charAt(0)}
        </div>
      )}
    </div>
  );
}

function VisualPlate({ items, compact = false }: { items: { name: string; imageUrl: string | null }[]; compact?: boolean }) {
  const size = compact ? 200 : 320;
  if (items.length === 0) {
    return (
      <div className="mx-auto rounded-full bg-gradient-to-br from-[#FBF6EE] to-[#F2E9D8] flex items-center justify-center text-muted-foreground text-xs" style={{ width: size, height: size }}>
        Empty plate
      </div>
    );
  }
  const n = items.length;
  const ringR = size * 0.28;
  const thumbR = n === 1 ? size * 0.32 : Math.max(28, Math.min(size * 0.16, (Math.PI * 2 * ringR) / (n * 2.6)));

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full shadow-lift" style={{ background: "linear-gradient(135deg,#FFFFFF,#FBF6EE)" }} />
      <div className="absolute rounded-full border border-[var(--bbdo-blue)]/10" style={{ inset: size * 0.06 }} />
      {items.map((it, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = size / 2 + (n === 1 ? 0 : Math.cos(a) * ringR);
        const y = size / 2 + (n === 1 ? 0 : Math.sin(a) * ringR);
        const r = n === 1 ? size * 0.32 : thumbR;
        return (
          <motion.div
            key={i}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="absolute rounded-full overflow-hidden shadow-card bg-muted"
            style={{ left: x - r, top: y - r, width: r * 2, height: r * 2 }}
          >
            {it.imageUrl ? (
              <img src={it.imageUrl} alt={it.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-foreground/70 font-black text-lg" style={{ background: "linear-gradient(135deg,#FBF6EE,#F2E9D8)" }}>
                {it.name.charAt(0)}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function MacroStat({ icon: Icon, label, value, tint }: { icon: any; label: string; value: string; tint: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tint}`}>
        <Icon className="w-4 h-4" strokeWidth={2} />
      </div>
      <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mt-3">{label}</p>
      <p className="text-lg font-black text-foreground mt-0.5 leading-tight">{value}</p>
    </div>
  );
}

function MiniMacro({ label, value }: { label: string; value: string }) {
  return (
    <div className="shrink-0 rounded-full bg-muted px-2.5 py-1 flex items-center gap-1">
      <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
      <span className="text-[11px] font-black text-foreground">{value}</span>
    </div>
  );
}
