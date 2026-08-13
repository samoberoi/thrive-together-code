import { useEffect, useMemo, useRef, useState } from "react";
import { useDietTypes } from "@/hooks/useDietTypes";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import { logAudit } from "@/lib/auditLog";
import DataToolsMenu from "@/components/admin/DataToolsMenu";
import TaxonomyImageUploader from "@/components/admin/TaxonomyImageUploader";
import { uploadCategoryImage, uploadFilterImage } from "@/lib/foodTaxonomyImageService";
import {
  Plus, Pencil, Trash2, AlertTriangle, Sparkles, Search, Leaf, Wheat, Candy, Bean, Milk, Apple,
  Beef, Drumstick, Droplets, Salad, EggFried, Sprout, Nut, FlaskConical, Image as ImageIcon,
} from "lucide-react";

// ---------- Types ----------
type CategorySlug = "sugar_spike" | "metabolic_essential" | "power_addon";
type Recommendation = "avoid" | "limit" | "moderate" | "encourage";
type GiBand = "low" | "low_med" | "medium" | "med_high" | "high";
type DietType = string;
type ServingBasis = "per_100g" | "per_100ml" | "cooked" | "raw";

interface Category { id: string; slug: CategorySlug; name: string; description: string | null; display_order: number; image_url: string | null; }
interface Filter { id: string; category_id: string; slug: string; name: string; description: string | null; icon: string | null; display_order: number; order_number: number | null; number_label: string | null; key_takeaways: string[]; cautionary_note: string | null; is_active: boolean; image_url: string | null; }
interface Item {
  id: string; filter_id: string; name: string; alt_name: string | null; image_url: string | null;
  diet_type: DietType; serving_basis: ServingBasis;
  serving_size_qty: number | null; serving_size_unit: string | null;
  serving_label: string | null; household_measure: string | null;
  carbs_min: number | null; carbs_max: number | null;
  gi_min: number | null; gi_max: number | null; gi_band: GiBand | null;
  protein_g: number | null; fat_g: number | null; fiber_g: number | null; calories_kcal: number | null;
  recommendation: Recommendation;
  health_benefits: string[]; notes: string | null;
  extra: Record<string, any>;
  is_jain_friendly: boolean;
  is_dairy_free: boolean;
  is_active: boolean; display_order: number;
}

const FILTER_ICONS: Record<string, any> = {
  high_carb_staples: Wheat,
  sweets_and_sweeteners: Candy,
  pulses_and_legumes: Bean,
  milk_and_milk_sugars: Milk,
  fruits_and_fruit_sugars: Apple,
  lean_proteins_non_veg: Drumstick,
  vegetarian_vegan_proteins: EggFried,
  healthy_fats: Droplets,
  vegetables: Salad,
  dairy_products: Milk,
  rice_wheat_alternatives: Sprout,
  nuts_and_seeds: Nut,
  metabolic_support_addons: FlaskConical,
};

const recColor: Record<Recommendation, string> = {
  avoid: "bg-destructive/10 text-destructive border-destructive/30",
  limit: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  moderate: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  encourage: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
};
const recDot: Record<Recommendation, string> = {
  avoid: "bg-destructive",
  limit: "bg-amber-500",
  moderate: "bg-blue-500",
  encourage: "bg-emerald-500",
};
const giColor: Record<GiBand, string> = {
  low: "bg-emerald-500/10 text-emerald-700",
  low_med: "bg-emerald-500/10 text-emerald-700",
  medium: "bg-amber-500/10 text-amber-700",
  med_high: "bg-orange-500/10 text-orange-700",
  high: "bg-destructive/10 text-destructive",
};
const giLabel: Record<GiBand, string> = { low: "Low", low_med: "Low–Med", medium: "Medium", med_high: "Med–High", high: "High" };

const DIET_BADGE: Record<DietType, { label: string; cls: string; title: string }> = {
  vegan:   { label: "VG", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", title: "Vegan" },
  veg:     { label: "V",  cls: "bg-green-500/10  text-green-700   border-green-500/30",   title: "Vegetarian" },
  eggitarian: { label: "EG", cls: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30", title: "Eggetarian" },
  non_veg: { label: "NV", cls: "bg-rose-500/10   text-rose-700    border-rose-500/30",    title: "Non-vegetarian" },
  jain:    { label: "JN", cls: "bg-amber-500/10  text-amber-700   border-amber-500/30",   title: "Strictly Jain" },
};

function getAdminDietBadge(dietType: DietType | null | undefined) {
  const key = dietType || "";
  if (DIET_BADGE[key]) return DIET_BADGE[key];
  const title = key
    ? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Diet type";
  return { label: title.slice(0, 3).toUpperCase(), cls: "bg-muted text-muted-foreground border-border", title };
}

// Color themes per category — visual reinforcement for admins.
// sugar_spike = red (never touch), metabolic_essential + power_addon = green (encourage).
const CAT_THEME: Record<string, {
  tileActive: string;
  tileInactive: string;
  title: string;
  chip: string;
  filterActive: string;
  filterInactive: string;
  filterIconBox: string;
  filterCount: string;
}> = {
  sugar_spike: {
    tileActive: "border-destructive bg-gradient-to-br from-destructive/15 via-destructive/5 to-transparent shadow-lift",
    tileInactive: "border-destructive/30 bg-destructive/5 hover:border-destructive/60",
    title: "text-destructive",
    chip: "bg-destructive text-destructive-foreground",
    filterActive: "bg-destructive text-destructive-foreground border-destructive shadow-card",
    filterInactive: "bg-destructive/5 text-destructive border-destructive/30 hover:border-destructive/60",
    filterIconBox: "bg-destructive-foreground/15",
    filterCount: "bg-destructive-foreground/15",
  },
  metabolic_essential: {
    tileActive: "border-emerald-600 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent shadow-lift",
    tileInactive: "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60",
    title: "text-emerald-700",
    chip: "bg-emerald-600 text-white",
    filterActive: "bg-emerald-600 text-white border-emerald-600 shadow-card",
    filterInactive: "bg-emerald-500/5 text-emerald-700 border-emerald-500/30 hover:border-emerald-500/60",
    filterIconBox: "bg-white/15",
    filterCount: "bg-white/15",
  },
  power_addon: {
    tileActive: "border-green-600 bg-gradient-to-br from-green-500/15 via-green-500/5 to-transparent shadow-lift",
    tileInactive: "border-green-500/30 bg-green-500/5 hover:border-green-500/60",
    title: "text-green-700",
    chip: "bg-green-600 text-white",
    filterActive: "bg-green-600 text-white border-green-600 shadow-card",
    filterInactive: "bg-green-500/5 text-green-700 border-green-500/30 hover:border-green-500/60",
    filterIconBox: "bg-white/15",
    filterCount: "bg-white/15",
  },
};
const themeFor = (slug?: string) => CAT_THEME[slug || ""] || CAT_THEME.metabolic_essential;

const filterNumberFromLabel = (label: string | null | undefined) => {
  const match = label?.match(/\d+/);
  return match ? Number(match[0]) : null;
};
const filterAlphaFromLabel = (label: string | null | undefined) => label?.match(/[a-z]+$/i)?.[0].toLowerCase() || "";
const filterOrder = (filter: Filter) => filter.order_number ?? filterNumberFromLabel(filter.number_label) ?? filter.display_order ?? 9999;
const filterLabel = (filter: Filter) => filter.number_label || `F${filterOrder(filter)}`;
const sortFilters = (a: Filter, b: Filter) =>
  filterOrder(a) - filterOrder(b) ||
  filterAlphaFromLabel(filterLabel(a)).localeCompare(filterAlphaFromLabel(filterLabel(b))) ||
  (a.display_order ?? 9999) - (b.display_order ?? 9999) ||
  a.name.localeCompare(b.name);

export default function AdminDiet() {
  const { types: dietTypes } = useDietTypes(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingFilter, setEditingFilter] = useState<Filter | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [recFilter, setRecFilter] = useState<"all" | Recommendation>("all");
  const [dietFilter, setDietFilter] = useState<"all" | DietType | "jain_only" | "dairy_free">("all");
  const confirm = useConfirm();

  useEffect(() => { reload(); }, []);
  async function reload() {
    setLoading(true);
    const [c, f, i] = await Promise.all([
      supabase.from("food_categories").select("*").order("display_order"),
      supabase.from("food_filters").select("*").order("order_number", { ascending: true, nullsFirst: false }).order("display_order"),
      supabase.from("food_items").select("*").order("display_order"),
    ]);
    if (c.data) { setCategories(c.data as any); if (!activeCat && c.data[0]) setActiveCat(c.data[0].id); }
    if (f.data) setFilters(((f.data as any) || []).slice().sort(sortFilters));
    if (i.data) setItems(i.data as any);
    setLoading(false);
  }

  const catFilters = useMemo(() => filters.filter(f => f.category_id === activeCat).slice().sort(sortFilters), [filters, activeCat]);
  useEffect(() => {
    if (catFilters.length && !catFilters.some(f => f.id === activeFilter)) setActiveFilter(catFilters[0].id);
  }, [catFilters, activeFilter]);

  const activeFilterObj = filters.find(f => f.id === activeFilter) || null;
  const activeCatObj = categories.find(c => c.id === activeCat) || null;

  const filterItems = useMemo(() => {
    let arr = items.filter(i => i.filter_id === activeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(i => i.name.toLowerCase().includes(q) || (i.alt_name || "").toLowerCase().includes(q));
    }
    if (recFilter !== "all") arr = arr.filter(i => i.recommendation === recFilter);
    if (dietFilter === "jain_only") arr = arr.filter(i => i.is_jain_friendly);
    else if (dietFilter === "dairy_free") arr = arr.filter(i => i.is_dairy_free);
    else if (dietFilter === "eggitarian") arr = arr.filter(i => i.diet_type === "eggitarian" || i.diet_type === "veg" || i.diet_type === "vegan");
    else if (dietFilter === "veg") arr = arr.filter(i => i.diet_type === "veg" || i.diet_type === "vegan");
    else if (dietFilter !== "all") arr = arr.filter(i => i.diet_type === dietFilter);
    return arr;
  }, [items, activeFilter, search, recFilter, dietFilter]);

  const stats = useMemo(() => {
    const all = items.filter(i => i.filter_id === activeFilter);
    const proteinVals = all.map(i => i.protein_g).filter((v): v is number => v != null);
    const avgProtein = proteinVals.length ? proteinVals.reduce((a, b) => a + b, 0) / proteinVals.length : 0;
    return {
      total: all.length,
      avoid: all.filter(i => i.recommendation === "avoid").length,
      limit: all.filter(i => i.recommendation === "limit").length,
      moderate: all.filter(i => i.recommendation === "moderate").length,
      encourage: all.filter(i => i.recommendation === "encourage").length,
      avgProtein: Math.round(avgProtein * 10) / 10,
    };
  }, [items, activeFilter]);

  async function deleteItem(id: string) {
    const ok = await confirm({
      title: "Delete this food item?",
      description: "This will permanently remove the item from the library. This action cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("food_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    logAudit({ module: "Diet", action: "delete", target_type: "food_item", target_id: id });
    toast.success("Deleted"); reload();
  }
  async function toggleActive(item: Item) {
    const ok = await confirm({
      title: item.is_active ? "Deactivate this item?" : "Activate this item?",
      description: `Are you sure you want to ${item.is_active ? "deactivate" : "activate"} "${item.name}"?`,
      confirmText: item.is_active ? "Deactivate" : "Activate",
    });
    if (!ok) return;
    const { error } = await supabase.from("food_items").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) return toast.error(error.message);
    logAudit({ module: "Diet", action: item.is_active ? "disable" : "enable", target_type: "food_item", target_id: item.id, target_label: item.name });
    reload();
  }

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1">Super Admin · Library</p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-foreground tracking-tight">Diet Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">Three-tier food taxonomy powering the reversal programme. Curate categories, filters and items — diet flags travel with every food.</p>
        </div>
        <div className="shrink-0 self-start">
          <DataToolsMenu
            useDietBackup
            csvExport={{ filename: "diet-items", rows: items as any }}
            csvImport={{ table: "food_items" }}
            onChanged={() => window.location.reload()}
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {categories.map((c, idx) => {
          const active = c.id === activeCat;
          const th = themeFor(c.slug);
          const count = items.filter(i => filters.some(f => f.id === i.filter_id && f.category_id === c.id)).length;
          return (
            <motion.div
              key={c.id}
              whileTap={{ scale: 0.99 }}
              className={`relative text-left p-5 pb-12 rounded-2xl border transition-all cursor-pointer ${active ? th.tileActive : th.tileInactive}`}
              onClick={() => setActiveCat(c.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${active ? th.chip : "bg-muted text-muted-foreground"}`}>
                  CAT.{String(idx + 1).padStart(2, "0")}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">{count} items</span>
              </div>
              <div className="flex items-start gap-3">
                {c.image_url && (
                  <img src={c.image_url} alt={c.name} className="w-14 h-14 rounded-xl object-cover border border-border shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className={`text-base font-bold leading-tight ${active ? th.title : "text-foreground"}`}>{c.name}</h3>
                  {c.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{c.description}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEditingCategory(c); }}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-background/80 backdrop-blur border border-border hover:bg-background"
                title="Edit category image"
              >
                <Pencil className="w-3 h-3" /> Image
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Horizontal filter rail */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {activeCatObj?.name || ""} · Filters
          </p>
          <span className="text-[10px] text-muted-foreground font-mono">{catFilters.length} filters</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
          {catFilters.map((f) => {
            const active = f.id === activeFilter;
            const Icon = FILTER_ICONS[f.slug] || Leaf;
            const num = filterLabel(f);
            const count = items.filter(i => i.filter_id === f.id).length;
            const th = themeFor(activeCatObj?.slug);
            return (
              <motion.button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                whileTap={{ scale: 0.98 }}
                className={`shrink-0 flex items-center gap-2.5 pl-2.5 pr-3.5 py-2 rounded-xl border transition-all ${
                  active ? th.filterActive : th.filterInactive
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden ${active ? th.filterIconBox : "bg-muted"}`}>
                  {f.image_url ? (
                    <img src={f.image_url} alt={f.name} className="w-full h-full object-cover" />
                  ) : (
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  )}
                </div>
                <div className="text-left">
                  <p className={`text-[9px] font-mono font-bold leading-none ${active ? "opacity-80" : "opacity-70"}`}>{num}</p>
                  <p className="text-xs font-semibold leading-tight whitespace-nowrap mt-0.5">{f.name}</p>
                </div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${active ? th.filterCount : "bg-muted text-muted-foreground"}`}>{count}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeFilterObj && (
          <motion.div
            key={activeFilterObj.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Filter hero */}
            <div className="mb-5 p-6 rounded-2xl bg-gradient-to-br from-primary/5 via-card to-card border border-border shadow-card">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {activeFilterObj.image_url ? (
                      <img src={activeFilterObj.image_url} alt={activeFilterObj.name} className="w-full h-full object-cover" />
                    ) : (
                      (() => { const Icon = FILTER_ICONS[activeFilterObj.slug] || Leaf; return <Icon className="w-7 h-7 text-primary" strokeWidth={2} />; })()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono font-bold text-primary tracking-wider mb-0.5">{filterLabel(activeFilterObj)}</p>
                    <h2 className="text-2xl font-black text-foreground leading-tight">{activeFilterObj.name}</h2>
                    {activeFilterObj.description && <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{activeFilterObj.description}</p>}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditingFilter(activeFilterObj)}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                </Button>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
                <Stat label="Total" value={stats.total} />
                <Stat label="Avoid" value={stats.avoid} dot="bg-destructive" />
                <Stat label="Limit" value={stats.limit} dot="bg-amber-500" />
                <Stat label="Moderate" value={stats.moderate} dot="bg-blue-500" />
                <Stat label="Encourage" value={stats.encourage} dot="bg-emerald-500" />
                <Stat label="Avg Protein" value={stats.avgProtein} suffix="g" dot="bg-violet-500" />
              </div>

              {activeFilterObj.key_takeaways?.length > 0 && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <Sparkles className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <ul className="text-xs text-foreground/90 space-y-1">
                    {activeFilterObj.key_takeaways.map((k, idx) => <li key={idx}><span className="font-semibold text-emerald-700">·</span> {k}</li>)}
                  </ul>
                </div>
              )}
              {activeFilterObj.cautionary_note && (
                <div className="flex items-start gap-2.5 mt-2 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground/90">{activeFilterObj.cautionary_note}</p>
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center gap-2.5 mb-4">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={recFilter} onValueChange={(v: any) => setRecFilter(v)}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    <SelectItem value="avoid">Avoid</SelectItem>
                    <SelectItem value="limit">Limit</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="encourage">Encourage</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dietFilter} onValueChange={(v: any) => setDietFilter(v)}>
                  <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All diets</SelectItem>
                    {dietTypes.map(dt => (
                      <SelectItem key={dt.slug} value={dt.slug}>{dt.label}</SelectItem>
                    ))}
                    <SelectItem value="jain_only">Jain-friendly</SelectItem>
                    <SelectItem value="dairy_free">Dairy-free</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="w-4 h-4 mr-1.5" /> Add food
                </Button>
              </div>
            </div>

            {/* Items table */}
            <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold w-20">Code</th>
                      <th className="px-3 py-3 font-semibold">Food</th>
                      <th className="px-3 py-3 font-semibold">Serving</th>
                      <th className="px-3 py-3 font-semibold">Diet flags</th>
                      <th className="px-3 py-3 font-semibold">Carbs</th>
                      <th className="px-3 py-3 font-semibold">Protein</th>
                      <th className="px-3 py-3 font-semibold">GI</th>
                      <th className="px-3 py-3 font-semibold">Action</th>
                      <th className="px-3 py-3 font-semibold">On</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterItems.map((it, idx) => {
                      const currentFilterLabel = filterLabel(activeFilterObj);
                      const dt = getAdminDietBadge(it.diet_type);
                      return (
                        <tr key={it.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {currentFilterLabel}.{String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${recDot[it.recommendation]}`} />
                              <div>
                                <div className="font-semibold text-foreground leading-tight">{it.name}</div>
                                {it.alt_name && <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{it.alt_name}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs whitespace-nowrap">
                            <div className="inline-flex flex-col gap-0.5">
                              <span className="font-mono font-semibold text-foreground">
                                {it.serving_size_qty ?? 100}<span className="opacity-70"> {it.serving_size_unit || "g"}</span>
                              </span>
                              {it.household_measure && (
                                <span className="text-[10px] text-muted-foreground italic">{it.household_measure}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1 flex-wrap">
                              <span title={dt.title} className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border ${dt.cls}`}>{dt.label}</span>
                              {it.is_jain_friendly && <FlagBadge label="J" title="Jain-friendly" tone="amber" />}
                              {it.is_dairy_free && <FlagBadge label="DF" title="Dairy-free" tone="sky" />}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs whitespace-nowrap">
                            {it.carbs_min != null ? <>
                              <span className="font-mono font-semibold text-foreground">{it.carbs_min}{it.carbs_max && it.carbs_max !== it.carbs_min ? `–${it.carbs_max}` : ""}</span>
                              <span className="text-muted-foreground"> {it.serving_basis === "per_100ml" ? "g/100ml" : it.serving_basis === "per_100g" ? "g/100g" : "%"}</span>
                            </> : "—"}
                          </td>
                          <td className="px-3 py-3 text-xs whitespace-nowrap">
                            {it.protein_g != null ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-700 font-mono font-semibold">
                                {it.protein_g}<span className="text-[10px] opacity-70">g</span>
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            {it.gi_band ? (
                              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${giColor[it.gi_band]}`}>
                                {it.gi_min}{it.gi_max && it.gi_max !== it.gi_min ? `–${it.gi_max}` : ""} · {giLabel[it.gi_band]}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className={`${recColor[it.recommendation]} capitalize text-[11px]`}>{it.recommendation}</Badge>
                          </td>
                          <td className="px-3 py-3"><Switch checked={it.is_active} onCheckedChange={() => toggleActive(it)} /></td>
                          <td className="px-3 py-3 text-right whitespace-nowrap">
                            <ItemImageControl item={it} onChanged={reload} />
                            <Button size="icon" variant="ghost" onClick={() => setEditing(it)}><Pencil className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteItem(it.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                          </td>
                        </tr>
                      );
                    })}
                    {filterItems.length === 0 && (
                      <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">No items match your filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(editing || creating) && activeFilter && (
        <ItemEditor item={editing} filterId={activeFilter} filterSlug={activeFilterObj?.slug || ""}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); reload(); }} />
      )}
      {editingFilter && (
        <FilterEditor filter={editingFilter} onClose={() => setEditingFilter(null)} onSaved={() => { setEditingFilter(null); reload(); }} />
      )}
      {editingCategory && (
        <CategoryEditor category={editingCategory} onClose={() => setEditingCategory(null)} onSaved={() => { setEditingCategory(null); reload(); }} />
      )}
    </div>
  );
}

function Stat({ label, value, dot, suffix }: { label: string; value: number; dot?: string; suffix?: string }) {
  return (
    <div className="rounded-xl bg-background/60 backdrop-blur border border-border px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
        {label}
      </div>
      <div className="text-lg font-black text-foreground leading-tight mt-0.5">{value}{suffix && <span className="text-xs font-bold text-muted-foreground ml-0.5">{suffix}</span>}</div>
    </div>
  );
}

function FlagBadge({ label, title, tone }: { label: string; title: string; tone: "amber" | "sky" }) {
  const cls = tone === "amber"
    ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
    : "bg-sky-500/10 text-sky-700 border-sky-500/30";
  return (
    <span title={title} className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border ${cls}`}>
      {label}
    </span>
  );
}

// ---------- Item editor (full-page dialog) ----------
function ItemEditor({ item, filterId, filterSlug, onClose, onSaved }: { item: Item | null; filterId: string; filterSlug: string; onClose: () => void; onSaved: () => void; }) {
  const { types: dietTypes } = useDietTypes(true);
  const [form, setForm] = useState<Partial<Item>>(item || {
    filter_id: filterId, name: "", diet_type: "vegan",
    serving_basis: filterSlug === "milk_and_milk_sugars" ? "per_100ml" : filterSlug === "lean_proteins_non_veg" ? "cooked" : "per_100g",
    serving_size_qty: 100,
    serving_size_unit: filterSlug === "milk_and_milk_sugars" ? "ml" : "g",
    household_measure: "",
    recommendation: filterSlug === "lean_proteins_non_veg" ? "encourage" : "limit",
    is_active: true, is_jain_friendly: true, is_dairy_free: true,
    health_benefits: [], extra: {},
  });
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  function set<K extends keyof Item>(k: K, v: any) { setForm(prev => ({ ...prev, [k]: v })); }
  function setExtra(k: string, v: any) { setForm(prev => ({ ...prev, extra: { ...(prev.extra || {}), [k]: v } })); }

  async function save() {
    if (!form.name) return toast.error("Name is required");
    const ok = await confirm({
      title: item ? "Save changes?" : "Create new item?",
      description: item
        ? `Save your changes to "${form.name}"? Updates will go live immediately.`
        : `Add "${form.name}" to the library? It will be visible to coaches and users right away.`,
      confirmText: item ? "Save changes" : "Create item",
    });
    if (!ok) return;
    setSaving(true);
    const payload: any = { ...form, filter_id: filterId };
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    const res = item
      ? await supabase.from("food_items").update(payload).eq("id", item.id)
      : await supabase.from("food_items").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    logAudit({ module: "Diet", action: item ? "update" : "create", target_type: "food_item", target_id: item?.id, target_label: form.name });
    toast.success(item ? "Updated" : "Created"); onSaved();
  }

  const extra = form.extra || {};

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[96vw] h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-xl font-black tracking-tight">
            {item ? `Edit · ${item.name}` : "New food item"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Identity */}
            <section className="lg:col-span-2 space-y-4">
              <SectionTitle>Identity</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Name"><Input value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Atlantic Salmon" /></Field>
                <Field label="Alt / regional name"><Input value={form.alt_name || ""} onChange={e => set("alt_name", e.target.value)} placeholder="e.g. Rawas" /></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Diet type">
                  <Select value={form.diet_type} onValueChange={(v: any) => set("diet_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dietTypes.map(dt => (
                        <SelectItem key={dt.slug} value={dt.slug}>{dt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Serving basis">
                  <Select value={form.serving_basis} onValueChange={(v: any) => set("serving_basis", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_100g">per 100 g</SelectItem>
                      <SelectItem value="per_100ml">per 100 ml</SelectItem>
                      <SelectItem value="raw">raw</SelectItem>
                      <SelectItem value="cooked">cooked</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Serving size">
                  <Input type="number" step="0.1" value={form.serving_size_qty ?? ""} onChange={e => set("serving_size_qty", e.target.value === "" ? null : Number(e.target.value))} placeholder="100" />
                </Field>
                <Field label="Unit">
                  <Select value={form.serving_size_unit || "g"} onValueChange={(v: any) => set("serving_size_unit", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">grams (g)</SelectItem>
                      <SelectItem value="ml">millilitres (ml)</SelectItem>
                      <SelectItem value="piece">piece</SelectItem>
                      <SelectItem value="cup">cup</SelectItem>
                      <SelectItem value="tbsp">tbsp</SelectItem>
                      <SelectItem value="tsp">tsp</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Household measure (shown to user)">
                  <Input value={form.household_measure || ""} onChange={e => set("household_measure", e.target.value)} placeholder="e.g. 1 small katori / 1 medium roti" />
                </Field>
              </div>
              <Field label="Notes / preparation tips"><Textarea rows={3} value={form.notes || ""} onChange={e => set("notes", e.target.value)} /></Field>
              <Field label="Health benefits (comma separated)">
                <Input value={(form.health_benefits || []).join(", ")} onChange={e => set("health_benefits", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
              </Field>
            </section>

            {/* Flags + Action */}
            <section className="space-y-4">
              <SectionTitle>Flags & action</SectionTitle>
              <Field label="Recommendation">
                <Select value={form.recommendation} onValueChange={(v: any) => set("recommendation", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avoid">Avoid</SelectItem>
                    <SelectItem value="limit">Limit</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="encourage">Encourage</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-3">
                <ToggleRow label="Jain-friendly" hint="No roots, honey or fermented items" checked={!!form.is_jain_friendly} onChange={(v) => set("is_jain_friendly", v)} />
                <ToggleRow label="Dairy-free" checked={!!form.is_dairy_free} onChange={(v) => set("is_dairy_free", v)} />
                <ToggleRow label="Active" checked={form.is_active ?? true} onChange={(v) => set("is_active", v)} />
              </div>
            </section>

            {/* Macros */}
            <section className="lg:col-span-2 space-y-4">
              <SectionTitle>Macros & glycemic profile</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Carbs min (g)"><Input type="number" step="0.1" value={form.carbs_min ?? ""} onChange={e => set("carbs_min", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                <Field label="Carbs max (g)"><Input type="number" step="0.1" value={form.carbs_max ?? ""} onChange={e => set("carbs_max", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                <Field label="Protein (g)"><Input type="number" step="0.1" value={form.protein_g ?? ""} onChange={e => set("protein_g", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                <Field label="Fat (g)"><Input type="number" step="0.1" value={form.fat_g ?? ""} onChange={e => set("fat_g", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                <Field label="Fiber (g)"><Input type="number" step="0.1" value={form.fiber_g ?? ""} onChange={e => set("fiber_g", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                <Field label="Calories (kcal)"><Input type="number" value={form.calories_kcal ?? ""} onChange={e => set("calories_kcal", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                <Field label="GI min"><Input type="number" value={form.gi_min ?? ""} onChange={e => set("gi_min", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                <Field label="GI max"><Input type="number" value={form.gi_max ?? ""} onChange={e => set("gi_max", e.target.value === "" ? null : Number(e.target.value))} /></Field>
              </div>
              <Field label="GI band">
                <Select value={form.gi_band || undefined} onValueChange={(v: any) => set("gi_band", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="low_med">Low–Med</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="med_high">Med–High</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </section>

            {/* Filter-specific extras */}
            <section className="space-y-4">
              {item && (
                <>
                  <SectionTitle>Image</SectionTitle>
                  <ItemImageEditor item={item} onChanged={onSaved} />
                </>
              )}
              {filterSlug === "fruits_and_fruit_sugars" && (
                <>
                  <SectionTitle>Fruit sugar breakdown</SectionTitle>
                  <Field label="Sugar group">
                    <Select value={extra.sugar_group || "higher"} onValueChange={(v) => setExtra("sugar_group", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="higher">Higher sugar</SelectItem>
                        <SelectItem value="lower">Lower sugar</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Total sugars"><Input type="number" step="0.1" value={extra.total_sugars_g ?? ""} onChange={e => setExtra("total_sugars_g", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                    <Field label="Fructose"><Input type="number" step="0.1" value={extra.fructose_g ?? ""} onChange={e => setExtra("fructose_g", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                    <Field label="Glucose"><Input type="number" step="0.1" value={extra.glucose_g ?? ""} onChange={e => setExtra("glucose_g", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                    <Field label="Sucrose"><Input type="number" step="0.1" value={extra.sucrose_g ?? ""} onChange={e => setExtra("sucrose_g", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                  </div>
                </>
              )}
              {filterSlug === "milk_and_milk_sugars" && (
                <>
                  <SectionTitle>Milk sugar details</SectionTitle>
                  <Field label="Main milk sugar"><Input value={extra.main_sugar || ""} onChange={e => setExtra("main_sugar", e.target.value)} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Lactose min (g/100ml)"><Input type="number" step="0.1" value={extra.lactose_g_per_100ml_min ?? ""} onChange={e => setExtra("lactose_g_per_100ml_min", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                    <Field label="Lactose max (g/100ml)"><Input type="number" step="0.1" value={extra.lactose_g_per_100ml_max ?? ""} onChange={e => setExtra("lactose_g_per_100ml_max", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                  </div>
                  <ToggleRow label="Lactose-free" checked={!!extra.is_lactose_free} onChange={(v) => setExtra("is_lactose_free", v)} />
                  <ToggleRow label="Alternative milk" checked={!!extra.alternative} onChange={(v) => setExtra("alternative", v)} />
                </>
              )}
            </section>
          </div>
        </div>

        <div className="border-t border-border px-6 py-4 flex items-center justify-end gap-2 shrink-0 bg-card">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : item ? "Save changes" : "Create item"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterEditor({ filter, onClose, onSaved }: { filter: Filter; onClose: () => void; onSaved: () => void; }) {
  const [name, setName] = useState(filter.name);
  const [description, setDescription] = useState(filter.description || "");
  const [takeaways, setTakeaways] = useState((filter.key_takeaways || []).join("\n"));
  const [note, setNote] = useState(filter.cautionary_note || "");
  const [orderNumber, setOrderNumber] = useState<number>(filter.order_number ?? filter.display_order);
  const [imageUrl, setImageUrl] = useState<string | null>(filter.image_url);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  async function save() {
    const ok = await confirm({
      title: "Save filter changes?",
      description: `Save changes to "${name}"? These updates apply to all items inside this category.`,
      confirmText: "Save",
    });
    if (!ok) return;
    setSaving(true);
    const { error } = await supabase.from("food_filters").update({
      name, description, cautionary_note: note, order_number: orderNumber,
      key_takeaways: takeaways.split("\n").map(s => s.trim()).filter(Boolean),
      image_url: imageUrl,
    } as any).eq("id", filter.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    logAudit({ module: "Diet", action: "update", target_type: "food_filter", target_id: filter.id, target_label: name });
    toast.success("Updated"); onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit filter</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <Field label="Image">
            <TaxonomyImageUploader
              value={imageUrl}
              onChange={setImageUrl}
              onUpload={(f) => uploadFilterImage(filter.id, f)}
              label={filter.name}
            />
          </Field>
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <Field label="Number"><Input type="number" value={orderNumber} onChange={e => setOrderNumber(Number(e.target.value))} /></Field>
            <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
          </div>
          <Field label="Description"><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></Field>
          <Field label="Key takeaways (one per line)"><Textarea rows={4} value={takeaways} onChange={e => setTakeaways(e.target.value)} /></Field>
          <Field label="Cautionary note"><Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} /></Field>
          <div className="flex gap-2 pt-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryEditor({ category, onClose, onSaved }: { category: Category; onClose: () => void; onSaved: () => void; }) {
  const [imageUrl, setImageUrl] = useState<string | null>(category.image_url);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("food_categories").update({
      name, description, image_url: imageUrl,
    } as any).eq("id", category.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    logAudit({ module: "Diet", action: "update", target_type: "food_category", target_id: category.id, target_label: name });
    toast.success("Updated"); onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit category</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <Field label="Image">
            <TaxonomyImageUploader
              value={imageUrl}
              onChange={setImageUrl}
              onUpload={(f) => uploadCategoryImage(category.id, f)}
              label={category.name}
            />
          </Field>
          <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Description"><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></Field>
          <div className="flex gap-2 pt-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary border-b border-border pb-2">
      {children}
    </h3>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ItemImageControl({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancel = false;
    if (!item.image_url) { setSignedUrl(null); return; }
    supabase.storage.from("food-images").createSignedUrl(item.image_url, 60 * 60 * 24).then((r) => {
      if (!cancel) setSignedUrl(r.data?.signedUrl || null);
    });
    return () => { cancel = true; };
  }, [item.image_url]);

  async function upload(file: File) {
    setBusy(true);
    const path = `${item.id}.${file.name.split(".").pop() || "png"}`;
    const up = await supabase.storage.from("food-images").upload(path, file, {
      contentType: file.type, upsert: true,
    });
    if (up.error) { toast.error(up.error.message); setBusy(false); return; }
    await supabase.from("food_items").update({ image_url: path, updated_at: new Date().toISOString() }).eq("id", item.id);
    logAudit({ module: "Diet", action: "upload", target_type: "food_item_image", target_id: item.id, target_label: item.name, metadata: { path } });
    setBusy(false);
    toast.success("Image uploaded");
    setOpen(false);
    onChanged();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted transition-colors mr-1"
        title={item.image_url ? "Update image" : "Upload image"}
      >
        {signedUrl ? (
          <img src={signedUrl} alt={item.name} className="w-7 h-7 rounded object-cover" />
        ) : (
          <div className="w-7 h-7 rounded bg-muted flex items-center justify-center">
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{item.name} · Image</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="aspect-square rounded-xl overflow-hidden bg-muted flex items-center justify-center">
              {signedUrl ? (
                <img src={signedUrl} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <p className="text-sm text-muted-foreground">No image yet</p>
              )}
            </div>
            <Button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full">
              {busy ? "Uploading…" : signedUrl ? "Replace image" : "Upload image"}
            </Button>
            <input
              ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ItemImageEditor({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cacheBust, setCacheBust] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancel = false;
    if (!item.image_url) { setSignedUrl(null); return; }
    supabase.storage.from("food-images").createSignedUrl(item.image_url, 60 * 60 * 24).then((r) => {
      if (!cancel) setSignedUrl(r.data?.signedUrl || null);
    });
    return () => { cancel = true; };
  }, [item.image_url, cacheBust]);

  async function upload(file: File) {
    setBusy(true);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${item.id}.${ext}`;
    const up = await supabase.storage.from("food-images").upload(path, file, {
      contentType: file.type, upsert: true,
    });
    if (up.error) { toast.error(up.error.message); setBusy(false); return; }
    await supabase.from("food_items").update({ image_url: path, updated_at: new Date().toISOString() }).eq("id", item.id);
    logAudit({ module: "Diet", action: "upload", target_type: "food_item_image", target_id: item.id, target_label: item.name, metadata: { path } });
    setBusy(false);
    toast.success("Image uploaded");
    setCacheBust((n) => n + 1);
    onChanged();
  }

  return (
    <div className="space-y-3">
      <div className="aspect-square rounded-xl overflow-hidden bg-muted flex items-center justify-center border border-border">
        {signedUrl ? (
          <img src={signedUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="text-center px-4">
            <ImageIcon className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No image yet — upload one</p>
          </div>
        )}
      </div>
      <Button onClick={() => fileRef.current?.click()} disabled={busy} size="sm" className="w-full">
        {busy ? "Uploading…" : signedUrl ? "Replace image" : "Upload image"}
      </Button>
      <input
        ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
      />
    </div>
  );
}

