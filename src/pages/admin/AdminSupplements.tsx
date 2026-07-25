import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill, Search, Filter, ChevronDown, ChevronRight, Plus,
  Edit2, Edit3, Check, X, ToggleLeft, ToggleRight, Loader2, Clock, Trash2, Award, HeartPulse, Tag
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchSupplements, fetchConditionRules, updateSupplement,
  createSupplement, createConditionRule, updateConditionRule, deleteConditionRule,
  CONDITION_LABELS, CONDITION_ICONS, CONDITION_COLORS, SEVERITY_COLORS,
  CATEGORY_COLORS, CATEGORY_BG, TIMING_ICONS,
  DOSE_UNITS, DOSE_VEHICLES, FREQUENCY_OPTIONS, TIMING_OPTIONS,
  parseDosage, formatDosage,
  type Supplement, type ConditionRule, type VegType
} from "@/lib/supplementService";
import {
  fetchSupplementBadgeDefinitions, updateSupplementBadgeDefinition,
  type SupplementBadge
} from "@/lib/supplementBadgeService";
import DataToolsMenu from "@/components/admin/DataToolsMenu";
import { SUPPLEMENTS_PILLAR } from "@/lib/pillarConfigs";

type View = "catalog" | "rules" | "badges";

const VEG_TYPE_OPTIONS: Array<{ value: VegType; label: string; short: string }> = [
  { value: "veg", label: "Vegetarian", short: "V" },
  { value: "non_veg", label: "Non-vegetarian", short: "NV" },
  { value: "both", label: "Suitable for both", short: "V/NV" },
];

const getVegTypeOption = (value?: string | null) =>
  VEG_TYPE_OPTIONS.find((o) => o.value === value) ?? VEG_TYPE_OPTIONS[2];

function ConditionFlatIcon({ className = "w-3 h-3" }: { className?: string }) {
  return <HeartPulse className={className} strokeWidth={1.75} />;
}

export default function AdminSupplements() {
  const [view, setView] = useState<View>("catalog");
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [rules, setRules] = useState<ConditionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ConditionRule>>({});
  const [editingSupp, setEditingSupp] = useState<string | null>(null);
  const [editSuppValues, setEditSuppValues] = useState<Partial<Supplement>>({});
  const [showAddSupp, setShowAddSupp] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [expandedCondition, setExpandedCondition] = useState<string | null>(null);
  const [newSupp, setNewSupp] = useState<{ name: string; category: string; description: string; veg_type: VegType }>({ name: "", category: "vitamin", description: "", veg_type: "both" });
  const [newRule, setNewRule] = useState({ supplement_id: "", condition: "deficiency", severity: "moderate", dosage: "", frequency: "once daily", timing: "with meal", duration_weeks: 12, remarks: "" });
  const [newDose, setNewDose] = useState({ amount: "", unit: "mg", vehicle: "" });
  const [editDose, setEditDose] = useState({ amount: "", unit: "", vehicle: "" });

  // Badge management
  const [badges, setBadges] = useState<SupplementBadge[]>([]);
  const [editingBadge, setEditingBadge] = useState<string | null>(null);
  const [badgeEdit, setBadgeEdit] = useState<Partial<SupplementBadge>>({});

  // Category master (from supplement_categories table)
  type Category = { key: string; label: string };
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryValue, setEditCategoryValue] = useState("");

  // Condition master (from supplement_conditions table)
  type ConditionDef = { key: string; label: string; icon: string };
  const [conditions, setConditions] = useState<ConditionDef[]>([]);
  const [newCondition, setNewCondition] = useState<{ key: string; label: string; icon: string }>({ key: "", label: "", icon: "" });
  const [savingCondition, setSavingCondition] = useState(false);
  const [editingCondition, setEditingCondition] = useState<string | null>(null);
  const [editConditionValues, setEditConditionValues] = useState<{ key: string; label: string; icon: string }>({ key: "", label: "", icon: "" });


  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, r, b, catRes, condRes] = await Promise.all([
        fetchSupplements(),
        fetchConditionRules(),
        fetchSupplementBadgeDefinitions(),
        supabase.from("supplement_categories").select("key,label").eq("is_active", true).order("sort_order").order("label"),
        supabase.from("supplement_conditions").select("key,label,icon").eq("is_active", true).order("label"),
      ]);
      setSupplements(s);
      setRules(r);
      setBadges(b);
      setCategories(((catRes.data ?? []) as any[]).map((x) => ({ key: x.key, label: x.label })));
      setConditions(((condRes.data ?? []) as any[]).map((x) => ({ key: x.key, label: x.label, icon: x.icon || "🩺" })));
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  const reloadCategories = async () => {
    const { data } = await supabase.from("supplement_categories").select("key,label").eq("is_active", true).order("sort_order").order("label");
    setCategories(((data ?? []) as any[]).map((x) => ({ key: x.key, label: x.label })));
  };

  const reloadConditions = async () => {
    const { data } = await supabase.from("supplement_conditions").select("key,label,icon").eq("is_active", true).order("label");
    setConditions(((data ?? []) as any[]).map((x) => ({ key: x.key, label: x.label, icon: x.icon || "🩺" })));
  };

  const handleAddCategory = async () => {
    const key = newCategory.trim().toLowerCase();
    if (!key) return;
    if (categories.some((c) => c.key === key)) { toast.error("Category already exists"); return; }
    setSavingCategory(true);
    try {
      const label = key.replace(/\b\w/g, (m) => m.toUpperCase());
      const { error } = await supabase.from("supplement_categories").insert({ key, label });
      if (error) throw error;
      setNewCategory("");
      await reloadCategories();
      toast.success(`Added "${key}"`);
    } catch (e: any) { toast.error(e.message); }
    setSavingCategory(false);
  };

  const handleDeleteCategory = async (key: string) => {
    try {
      const { error } = await supabase.rpc("delete_supplement_category", { _key: key });
      if (error) throw error;
      await reloadCategories();
      toast.success(`Removed "${key}"`);
    } catch (e: any) { toast.error(e.message); }
  };

  const startEditCategory = (key: string) => {
    setEditingCategory(key);
    setEditCategoryValue(key);
  };

  const handleSaveCategory = async (oldKey: string) => {
    const newKey = editCategoryValue.trim().toLowerCase();
    if (!newKey) { toast.error("Name required"); return; }
    if (newKey === oldKey) { setEditingCategory(null); return; }
    if (categories.some((c) => c.key === newKey)) { toast.error("Category already exists"); return; }
    try {
      const label = newKey.replace(/\b\w/g, (m) => m.toUpperCase());
      const { error } = await supabase.rpc("rename_supplement_category", {
        _old_key: oldKey, _new_key: newKey, _new_label: label,
      });
      if (error) throw error;
      const affected = supplements.filter((s) => s.category === oldKey).length;
      setSupplements((prev) => prev.map((s) => s.category === oldKey ? { ...s, category: newKey } : s));
      await reloadCategories();
      setEditingCategory(null);
      toast.success(`Renamed to "${newKey}"${affected ? ` · ${affected} supplements updated` : ""}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddCondition = async () => {
    const key = newCondition.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const label = newCondition.label.trim();
    if (!key || !label) { toast.error("Key and label are required"); return; }
    if (conditions.some((c) => c.key === key)) { toast.error("Condition key already exists"); return; }
    setSavingCondition(true);
    try {
      const icon = newCondition.icon.trim() || "🩺";
      const { error } = await supabase.from("supplement_conditions").insert({ key, label, icon });
      if (error) throw error;
      setNewCondition({ key: "", label: "", icon: "" });
      await reloadConditions();
      toast.success(`Added "${label}"`);
    } catch (e: any) { toast.error(e.message); }
    setSavingCondition(false);
  };

  const handleDeleteCondition = async (key: string) => {
    try {
      const { error } = await supabase.rpc("delete_supplement_condition", { _key: key });
      if (error) throw error;
      await reloadConditions();
      toast.success("Condition removed");
    } catch (e: any) { toast.error(e.message); }
  };

  const startEditCondition = (key: string, label: string, icon: string) => {
    setEditingCondition(key);
    setEditConditionValues({ key, label, icon });
  };

  const handleSaveCondition = async (oldKey: string) => {
    const label = editConditionValues.label.trim();
    const icon = (editConditionValues.icon || "").trim() || "🩺";
    const newKey = editConditionValues.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_") || oldKey;
    if (!label) { toast.error("Label required"); return; }
    try {
      if (newKey !== oldKey) {
        if (conditions.some((c) => c.key === newKey)) { toast.error("Condition key already exists"); return; }
        const { error } = await supabase.rpc("rename_supplement_condition", {
          _old_key: oldKey, _new_key: newKey, _new_label: label, _new_icon: icon,
        });
        if (error) throw error;
        setRules((prev) => prev.map((r) => r.condition === oldKey ? { ...r, condition: newKey } : r));
      } else {
        const { error } = await supabase
          .from("supplement_conditions")
          .update({ label, icon })
          .eq("key", oldKey);
        if (error) throw error;
      }
      await reloadConditions();
      setEditingCondition(null);
      toast.success("Condition updated");
    } catch (e: any) { toast.error(e.message); }
  };




  const startBadgeEdit = (b: SupplementBadge) => {
    setEditingBadge(b.id);
    setBadgeEdit({ badge_name: b.badge_name, badge_emoji: b.badge_emoji, description: b.description, required_streak_days: b.required_streak_days });
  };

  const saveBadgeEdit = async (id: string) => {
    try {
      await updateSupplementBadgeDefinition(id, badgeEdit);
      setBadges((prev) => prev.map((b) => b.id === id ? { ...b, ...badgeEdit } : b));
      setEditingBadge(null);
      toast.success("Badge updated");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleToggleActive = async (supp: Supplement) => {
    try {
      await updateSupplement(supp.id, { is_active: !supp.is_active });
      setSupplements((prev) => prev.map((s) => s.id === supp.id ? { ...s, is_active: !s.is_active } : s));
      toast.success(`${supp.name} ${supp.is_active ? "deactivated" : "activated"}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEditSupp = (supp: Supplement) => {
    setEditingSupp(supp.id);
    setEditSuppValues({ name: supp.name, category: supp.category, description: supp.description ?? "", default_dosage: supp.default_dosage ?? "", default_frequency: supp.default_frequency ?? "", default_timing: supp.default_timing ?? "", veg_type: supp.veg_type ?? "both" });
  };

  const handleUpdateSupplementVegType = async (supp: Supplement, vegType: VegType) => {
    try {
      await updateSupplement(supp.id, { veg_type: vegType });
      setSupplements((prev) => prev.map((s) => s.id === supp.id ? { ...s, veg_type: vegType } : s));
      toast.success(`${supp.name} marked ${getVegTypeOption(vegType).label}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSaveSupp = async (suppId: string) => {
    try {
      await updateSupplement(suppId, editSuppValues);
      setSupplements((prev) => prev.map((s) => s.id === suppId ? { ...s, ...editSuppValues } : s));
      setEditingSupp(null);
      toast.success("Supplement updated");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddSupp = async () => {
    if (!newSupp.name.trim()) return;
    try {
      await createSupplement(newSupp as any);
      toast.success("Supplement added");
      setShowAddSupp(false);
      setNewSupp({ name: "", category: "vitamin", description: "", veg_type: "both" });
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddRule = async () => {
    const combinedDose = formatDosage(newDose);
    if (!newRule.supplement_id || !combinedDose) { toast.error("Select a supplement and enter dosage"); return; }
    try {
      await createConditionRule({ ...newRule, dosage: combinedDose } as any);
      toast.success("Condition rule added");
      setShowAddRule(false);
      setNewRule({ supplement_id: "", condition: "deficiency", severity: "moderate", dosage: "", frequency: "once daily", timing: "with meal", duration_weeks: 12, remarks: "" });
      setNewDose({ amount: "", unit: "mg", vehicle: "" });
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSaveRule = async (id: string) => {
    try {
      const combinedDose = formatDosage(editDose);
      const payload = { ...editValues, dosage: combinedDose || editValues.dosage };
      await updateConditionRule(id, payload);
      toast.success("Rule updated");
      setEditingRule(null);
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const startEditRule = (rule: ConditionRule) => {
    setEditingRule(rule.id);
    setEditValues(rule);
    setEditDose(parseDosage(rule.dosage));
  };

  const suppMap = Object.fromEntries(supplements.map((s) => [s.id, s]));
  const rulesConditionKeys = [...new Set(rules.map((r) => r.condition))];

  // Merged condition maps (built-ins + admin-managed master)
  const condLabels: Record<string, string> = { ...CONDITION_LABELS };
  const condIcons: Record<string, string> = { ...CONDITION_ICONS };
  const condColors: Record<string, string> = { ...CONDITION_COLORS };
  conditions.forEach((c) => {
    condLabels[c.key] = c.label;
    if (c.icon) condIcons[c.key] = c.icon;
    if (!condColors[c.key]) condColors[c.key] = "bg-muted text-foreground";
  });
  const allConditionKeys = Array.from(new Set([...conditions.map((c) => c.key), ...rulesConditionKeys]));

  const searchQuery = search.trim().toLowerCase();

  const filteredSupps = supplements.filter((s) => {
    if (searchQuery) {
      const haystack = [s.name, s.category, s.description, s.default_dosage, s.default_frequency, s.default_timing]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }

    if (filterCategory !== "all" && s.category !== filterCategory) return false;
    return true;
  });

  const filteredRules = rules.filter((r) => {
    const supplement = suppMap[r.supplement_id];

    if (searchQuery) {
      const haystack = [
        supplement?.name,
        supplement?.category,
        r.condition,
        r.severity,
        r.dosage,
        r.frequency,
        r.timing,
        r.remarks,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }

    if (filterCondition !== "all" && r.condition !== filterCondition) return false;
    if (filterSeverity !== "all" && r.severity !== filterSeverity) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Pill className="w-6 h-6 text-primary" /> Supplements
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{supplements.length} supplements · {rules.length} condition rules</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataToolsMenu
            pillar={SUPPLEMENTS_PILLAR}
            csvExport={{
              filename: view === "rules" ? "supplement-rules" : "supplements",
              rows: () => (view === "rules" ? rules : supplements) as any,
            }}
            csvImport={{ table: view === "rules" ? "supplement_condition_rules" : view === "badges" ? "supplement_badges" : "supplement_master" }}
            onChanged={() => window.location.reload()}
          />
          {view !== "badges" && (
            <button
              onClick={() => view === "catalog" ? setShowAddSupp(true) : setShowAddRule(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              <Plus className="w-4 h-4" /> {view === "catalog" ? "Add Supplement" : "Add Rule"}
            </button>
          )}
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex gap-2">
        {(["catalog", "rules", "badges"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-colors ${
              view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {v === "catalog" ? <Pill className="w-4 h-4" /> : v === "rules" ? <Filter className="w-4 h-4" /> : <Award className="w-4 h-4" />}
              {v === "catalog" ? `Catalog (${supplements.length})` : v === "rules" ? `Condition Rules (${rules.length})` : `Badges (${badges.length})`}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        {view === "catalog"
          ? "Catalog lists all available supplements. Add or edit names, dosages, and categories here."
          : view === "rules"
          ? "Condition Rules define which supplement to give, at what dosage and severity, for a specific health condition."
          : "Configure badge names, emojis, descriptions, and streak requirements for supplement adherence gamification."}
      </p>

      {/* Category Manager — only on Catalog view */}
      {view === "catalog" && (
        <div className="liquid-glass rounded-3xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground text-sm">Categories</h3>
            <span className="text-[10px] text-muted-foreground">({categories.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const c = cat.key;
              const inUse = supplements.some((s) => s.category === c);
              const isEditing = editingCategory === c;
              if (isEditing) {
                return (
                  <span key={c} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background border border-input">
                    <input
                      className="w-32 bg-transparent text-xs font-semibold outline-none"
                      value={editCategoryValue}
                      onChange={(e) => setEditCategoryValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveCategory(c); if (e.key === "Escape") setEditingCategory(null); }}
                    />
                    <button onClick={() => handleSaveCategory(c)} title="Save" className="text-success hover:opacity-80"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditingCategory(null)} title="Cancel" className="text-muted-foreground hover:opacity-80"><X className="w-3.5 h-3.5" /></button>
                  </span>
                );
              }
              return (
                <span
                  key={c}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize ${CATEGORY_BG[c] ?? "bg-muted"} ${CATEGORY_COLORS[c] ?? "text-foreground"}`}
                >
                  {cat.label}
                  {inUse && <span className="text-[9px] opacity-60">({supplements.filter((s) => s.category === c).length})</span>}
                  <button
                    onClick={() => startEditCategory(c)}
                    title="Rename category"
                    className="opacity-70 hover:opacity-100"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(c)}
                    disabled={inUse}
                    title={inUse ? "In use — reassign supplements first" : "Remove category"}
                    className="opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm"
              placeholder="New category (e.g. mineral, adaptogen)"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
            />
            <button
              onClick={handleAddCategory}
              disabled={savingCategory || !newCategory.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>
      )}

      {/* Condition Manager — only on Rules view */}
      {view === "rules" && (
        <div className="liquid-glass rounded-3xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground text-sm">Conditions</h3>
            <span className="text-[10px] text-muted-foreground">({allConditionKeys.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {allConditionKeys.map((k) => {
              const isBuiltIn = false;
              const inUse = rules.some((r) => r.condition === k);
              const label = condLabels[k] ?? k;
              const icon = condIcons[k] ?? "🩺";
              const isEditing = editingCondition === k;
              if (isEditing) {
                return (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background border border-input">
                    <input
                      className="w-10 bg-transparent text-center text-sm outline-none"
                      maxLength={2}
                      value={editConditionValues.icon}
                      onChange={(e) => setEditConditionValues({ ...editConditionValues, icon: e.target.value })}
                    />
                    <input
                      className="w-40 bg-transparent text-xs font-semibold outline-none"
                      placeholder="Label"
                      value={editConditionValues.label}
                      onChange={(e) => setEditConditionValues({ ...editConditionValues, label: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveCondition(k); if (e.key === "Escape") setEditingCondition(null); }}
                    />
                    <input
                      className="w-28 bg-transparent text-[11px] font-mono text-muted-foreground outline-none border-l border-border pl-1"
                      placeholder="key"
                      value={editConditionValues.key}
                      onChange={(e) => setEditConditionValues({ ...editConditionValues, key: e.target.value })}
                    />
                    <button onClick={() => handleSaveCondition(k)} title="Save" className="text-success hover:opacity-80"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditingCondition(null)} title="Cancel" className="text-muted-foreground hover:opacity-80"><X className="w-3.5 h-3.5" /></button>
                  </span>
                );
              }

              return (
                <span
                  key={k}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${condColors[k] ?? "bg-muted text-foreground"}`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                  {inUse && (
                    <span className="text-[9px] opacity-60">
                      {rules.filter((r) => r.condition === k).length} rules
                    </span>
                  )}
                  <button
                    onClick={() => startEditCondition(k, label, icon)}
                    title="Edit label & icon"
                    className="opacity-70 hover:opacity-100"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteCondition(k)}
                    disabled={inUse}
                    title={inUse ? "Remove its rules first" : "Remove condition"}
                    className="opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto_auto] gap-2">
            <input
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
              placeholder="key (e.g. pcos)"
              value={newCondition.key}
              onChange={(e) => setNewCondition({ ...newCondition, key: e.target.value })}
            />
            <input
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
              placeholder="Label (e.g. PCOS / Hormonal Balance)"
              value={newCondition.label}
              onChange={(e) => setNewCondition({ ...newCondition, label: e.target.value })}
            />
            <input
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm w-20 text-center"
              placeholder="🩺"
              maxLength={2}
              value={newCondition.icon}
              onChange={(e) => setNewCondition({ ...newCondition, icon: e.target.value })}
            />
            <button
              onClick={handleAddCondition}
              disabled={savingCondition || !newCondition.key.trim() || !newCondition.label.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">Key is lowercase snake_case (auto-normalized). Click the pencil to rename the key, label, or icon — renames cascade across all rules automatically. Conditions can be deleted only when no rule references them.</p>
        </div>
      )}


      {/* Add Rule Form */}
      <AnimatePresence>
        {showAddRule && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="liquid-glass rounded-3xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-foreground text-base">New condition rule</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Pick the supplement, dose, and timing exactly as the frontend should display it.</p>
              </div>
              <button onClick={() => setShowAddRule(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <RuleFormFields
              rule={newRule}
              dose={newDose}
              supplements={supplements}
              onRuleChange={(patch) => setNewRule({ ...newRule, ...patch })}
              onDoseChange={(patch) => setNewDose({ ...newDose, ...patch })}
              conditionOptions={allConditionKeys.map((k) => ({ key: k, label: condLabels[k] ?? k }))}
            />

            <div className="flex gap-2 pt-1">
              <button onClick={handleAddRule} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Save rule
              </button>
              <button onClick={() => setShowAddRule(false)} className="px-5 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-semibold">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-input bg-background text-sm"
            placeholder="Search supplements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {view === "catalog" && (
          <select className="rounded-xl border border-input bg-background px-3 py-2 text-sm capitalize"
            value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
          </select>
        )}
        {view === "rules" && (
          <>
            <select className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
              value={filterCondition} onChange={(e) => setFilterCondition(e.target.value)}>
              <option value="all">All conditions</option>
              {allConditionKeys.map((c) => <option key={c} value={c}>{condLabels[c] ?? c}</option>)}
            </select>
            <select className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
              value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
              <option value="all">All severity</option>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </>
        )}
      </div>

      {/* Add Supplement Modal */}
      <AnimatePresence>
        {showAddSupp && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="liquid-glass rounded-3xl p-5 space-y-3">
            <h3 className="font-bold text-foreground text-sm">New Supplement</h3>
            <div className="grid grid-cols-1 gap-3">
              <input className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                placeholder="Supplement name" value={newSupp.name} onChange={(e) => setNewSupp({ ...newSupp, name: e.target.value })} />
              <select
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm capitalize"
                value={newSupp.category}
                onChange={(e) => setNewSupp({ ...newSupp, category: e.target.value })}
              >
                {categories.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
              </select>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Veg / Non-veg</span>
                <select
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={newSupp.veg_type}
                  onChange={(e) => setNewSupp({ ...newSupp, veg_type: e.target.value as VegType })}
                >
                  {VEG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <textarea className="rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none" rows={2}
                placeholder="What does this supplement do?" value={newSupp.description} onChange={(e) => setNewSupp({ ...newSupp, description: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddSupp} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Save</button>
              <button onClick={() => setShowAddSupp(false)} className="px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Catalog View */}
      {view === "catalog" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSupps.map((supp) => {
            const isEditing = editingSupp === supp.id;
            return (
              <motion.div
                key={supp.id}
                className="liquid-glass rounded-2xl overflow-hidden group relative"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              >
                {/* Top bar with category + actions */}
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <Badge className={`text-[10px] capitalize font-bold ${CATEGORY_BG[supp.category] ?? "bg-muted"} ${CATEGORY_COLORS[supp.category] ?? "text-muted-foreground"}`}>
                    {supp.category}
                  </Badge>
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEditSupp(supp)} className="p-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleToggleActive(supp)}
                      className={`p-1.5 rounded-lg bg-muted/50 transition-colors ${supp.is_active ? "text-primary" : "text-muted-foreground"}`}>
                      {supp.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                  </div>
                  {!supp.is_active && (
                    <div className="group-hover:hidden">
                      <Badge variant="outline" className="text-[9px] text-muted-foreground">Inactive</Badge>
                    </div>
                  )}
                </div>

                {/* Icon */}
                <div className="flex justify-center py-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg ${CATEGORY_BG[supp.category] ?? "bg-muted"}`}>
                    <Pill className={`w-6 h-6 ${CATEGORY_COLORS[supp.category] ?? "text-muted-foreground"}`} />
                  </div>
                </div>

                {isEditing ? (
                  <div className="p-4 space-y-3">
                    <input className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-bold"
                      value={editSuppValues.name ?? ""} onChange={(e) => setEditSuppValues({ ...editSuppValues, name: e.target.value })} placeholder="Name" />
                    <select
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm capitalize"
                      value={editSuppValues.category ?? categories[0]?.key ?? ""}
                      onChange={(e) => setEditSuppValues({ ...editSuppValues, category: e.target.value })}
                    >
                      {categories.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                    </select>
                    <Field label="Veg / Non-veg">
                      <select
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                        value={(editSuppValues.veg_type as VegType) ?? "both"}
                        onChange={(e) => setEditSuppValues({ ...editSuppValues, veg_type: e.target.value as VegType })}
                      >
                        {VEG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </Field>
                    <textarea className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none" rows={2}
                      value={editSuppValues.description ?? ""} onChange={(e) => setEditSuppValues({ ...editSuppValues, description: e.target.value })} placeholder="Description" />
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveSupp(supp.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"><Check className="w-3.5 h-3.5" />Save</button>
                      <button onClick={() => setEditingSupp(null)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs"><X className="w-3.5 h-3.5" />Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 pb-4 text-center">
                    <h3 className="text-sm font-bold text-foreground">{supp.name}</h3>
                    <div className="mt-2 flex justify-center">
                      <select
                        aria-label={`Veg type for ${supp.name}`}
                        className="rounded-full border border-input bg-background px-3 py-1.5 text-[11px] font-bold text-foreground"
                        value={supp.veg_type ?? "both"}
                        onChange={(e) => handleUpdateSupplementVegType(supp, e.target.value as VegType)}
                      >
                        {VEG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{supp.description || "No description added yet"}</p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {view === "rules" && (() => {
        // Group rules by condition
        const conditionGroups: Record<string, ConditionRule[]> = {};
        filteredRules.forEach((r) => {
          if (!conditionGroups[r.condition]) conditionGroups[r.condition] = [];
          conditionGroups[r.condition].push(r);
        });

        return (
          <div className="space-y-4">
            {/* Summary cards row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(conditionGroups).slice(0, 4).map(([cond, items]) => (
                <div key={cond} className="liquid-glass rounded-2xl px-4 py-3">
                  <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${condColors[cond] ?? "bg-muted text-muted-foreground"}`}>
                    <ConditionFlatIcon />
                    {(condLabels[cond] ?? cond).split(":")[0]}
                  </div>
                  <p className="mt-2 text-xl font-black text-foreground">{items.length}</p>
                  <p className="text-[10px] text-muted-foreground">supplements</p>
                </div>
              ))}
            </div>

            {/* Expandable condition cards */}
            <div className="space-y-3">
              {Object.entries(conditionGroups).map(([condition, condRules]) => {
                const isOpen = expandedCondition === condition;

                return (
                  <motion.div key={condition} layout className="liquid-glass rounded-3xl overflow-hidden">
                    {/* Header */}
                    <button
                      onClick={() => setExpandedCondition(isOpen ? null : condition)}
                      className="w-full flex items-center gap-4 p-5 text-left hover:bg-accent/50 transition-colors"
                    >
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-lg ${condColors[condition] ?? "bg-muted"}`}>
                        <ConditionFlatIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-foreground truncate">{condLabels[condition] ?? condition}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {condRules.length} supplement{condRules.length > 1 ? "s" : ""} · {[...new Set(condRules.map(r => r.severity))].join(", ")} severity
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Severity pills summary */}
                        <div className="hidden md:flex gap-1">
                          {["mild", "moderate", "severe"].map((sev) => {
                            const count = condRules.filter(r => r.severity === sev).length;
                            if (!count) return null;
                            return (
                              <span key={sev} className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${SEVERITY_COLORS[sev]}`}>
                                {count} {sev}
                              </span>
                            );
                          })}
                        </div>
                        {isOpen ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 space-y-4" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                            {/* Detailed table */}
                              <div className="rounded-2xl border border-border overflow-hidden mt-4">
                              <div className="grid grid-cols-[minmax(150px,1.6fr)_100px_minmax(100px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)_80px_minmax(100px,1fr)_50px] gap-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-3 py-2">
                                <span>Supplement / Veg type</span>
                                <span>Severity</span>
                                <span>Dosage</span>
                                <span>Frequency</span>
                                <span>Timing</span>
                                <span>Weeks</span>
                                <span>Remarks</span>
                                <span></span>
                              </div>
                              <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
                                {condRules.map((rule) => {
                                  const supp = suppMap[rule.supplement_id];
                                  const isEditing = editingRule === rule.id;

                                  return (
                                    <div key={rule.id} className="border-b border-border last:border-b-0">
                                      {/* Display row */}
                                       <div className="grid grid-cols-[minmax(150px,1.6fr)_100px_minmax(100px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)_80px_minmax(100px,1fr)_50px] gap-0 items-center px-3 py-2.5 text-sm hover:bg-accent/30 transition-colors">
                                         <span className="text-xs flex items-center gap-2 min-w-0">
                                           <div className={`w-6 h-6 rounded-lg ${CATEGORY_BG[supp?.category ?? ""] ?? "bg-muted"} flex items-center justify-center shrink-0`}>
                                             <Pill className={`w-3 h-3 ${CATEGORY_COLORS[supp?.category ?? ""] ?? "text-muted-foreground"}`} />
                                           </div>
                                           <span className="min-w-0 flex-1">
                                             <span className="block font-bold text-foreground truncate">{supp?.name ?? "Unknown"}</span>
                                             {supp && (
                                               <select
                                                 aria-label={`Veg type for ${supp.name}`}
                                                 className="mt-1 max-w-full rounded-lg border border-input bg-background px-2 py-1 text-[10px] font-bold text-foreground"
                                                 value={supp.veg_type ?? "both"}
                                                 onChange={(e) => handleUpdateSupplementVegType(supp, e.target.value as VegType)}
                                               >
                                                 {VEG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                               </select>
                                             )}
                                           </span>
                                         </span>
                                        <span>
                                          <Badge className={`text-[9px] ${SEVERITY_COLORS[rule.severity] ?? ""}`} variant="outline">
                                            {rule.severity}
                                          </Badge>
                                        </span>
                                        <span className="font-mono font-bold text-primary text-xs">{rule.dosage}</span>
                                        <span className="text-xs text-muted-foreground">{rule.frequency}</span>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                          {TIMING_ICONS[rule.timing ?? ""] && <span className="text-xs">{TIMING_ICONS[rule.timing ?? ""]}</span>}
                                          {rule.timing ?? "—"}
                                        </span>
                                        <span className="text-xs text-muted-foreground">{rule.duration_weeks}w</span>
                                        <span className="text-[10px] text-muted-foreground truncate">{rule.remarks || "—"}</span>
                                        <div className="flex gap-1">
                                          <button
                                            onClick={() => isEditing ? setEditingRule(null) : startEditRule(rule)}
                                            className={`p-1 rounded-lg transition-colors ${isEditing ? "bg-primary/15 text-primary" : "hover:bg-accent text-muted-foreground hover:text-foreground"}`}
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                          <button onClick={async () => {
                                            try { await deleteConditionRule(rule.id); toast.success("Rule deleted"); loadData(); }
                                            catch (e: any) { toast.error(e.message); }
                                          }}
                                            className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Expanded editor */}
                                      <AnimatePresence>
                                        {isEditing && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                            className="overflow-hidden bg-muted/40"
                                          >
                                            <div className="p-5 space-y-4">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                  <div className={`w-8 h-8 rounded-xl ${CATEGORY_BG[supp?.category ?? ""] ?? "bg-muted"} flex items-center justify-center`}>
                                                    <Pill className={`w-4 h-4 ${CATEGORY_COLORS[supp?.category ?? ""] ?? "text-muted-foreground"}`} />
                                                  </div>
                                                  <div>
                                                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Editing rule</p>
                                                    <p className="text-sm font-black text-foreground">{supp?.name ?? "Unknown"}</p>
                                                  </div>
                                                </div>
                                              </div>
                                              <RuleFormFields
                                                rule={editValues as any}
                                                dose={editDose}
                                                supplements={supplements}
                                                onRuleChange={(patch) => setEditValues({ ...editValues, ...patch })}
                                                onDoseChange={(patch) => setEditDose({ ...editDose, ...patch })}
                                                hideSupplement
                                                conditionOptions={allConditionKeys.map((k) => ({ key: k, label: condLabels[k] ?? k }))}
                                              />
                                              <div className="flex gap-2 pt-1">
                                                <button onClick={() => handleSaveRule(rule.id)} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5">
                                                  <Check className="w-4 h-4" /> Save changes
                                                </button>
                                                <button onClick={() => setEditingRule(null)} className="px-5 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-semibold">Cancel</button>
                                              </div>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ═══ BADGE MANAGEMENT ═══ */}
      {view === "badges" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((b) => {
            const isEditing = editingBadge === b.id;
            return (
              <motion.div
                key={b.id}
                layout
                className="liquid-glass rounded-3xl p-5 space-y-3"
              >
                {isEditing ? (
                  <>
                    <div className="flex items-center gap-3">
                      <input
                        className="w-16 text-center text-2xl rounded-xl border border-input bg-background px-2 py-1"
                        value={badgeEdit.badge_emoji ?? ""}
                        onChange={(e) => setBadgeEdit({ ...badgeEdit, badge_emoji: e.target.value })}
                        maxLength={4}
                      />
                      <div className="flex-1">
                        <input
                          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-bold"
                          value={badgeEdit.badge_name ?? ""}
                          onChange={(e) => setBadgeEdit({ ...badgeEdit, badge_name: e.target.value })}
                          placeholder="Badge name"
                        />
                      </div>
                    </div>
                    <textarea
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none"
                      rows={2}
                      value={badgeEdit.description ?? ""}
                      onChange={(e) => setBadgeEdit({ ...badgeEdit, description: e.target.value })}
                      placeholder="Description"
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground font-semibold">Streak days:</label>
                      <input
                        type="number"
                        min={1}
                        className="w-20 rounded-xl border border-input bg-background px-3 py-2 text-sm font-bold"
                        value={badgeEdit.required_streak_days ?? 7}
                        onChange={(e) => setBadgeEdit({ ...badgeEdit, required_streak_days: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => saveBadgeEdit(b.id)} className="flex-1 py-2 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-1">
                        <Check className="w-4 h-4" /> Save
                      </button>
                      <button onClick={() => setEditingBadge(null)} className="px-4 py-2 rounded-2xl bg-accent text-muted-foreground font-semibold text-sm">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                          <Pill className="w-5 h-5" strokeWidth={1.75} />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Level {b.level}</p>
                          <p className="text-sm font-black text-foreground">{b.badge_name}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => startBadgeEdit(b)}
                        className="p-2 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{b.description || "No description"}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 font-bold">{b.required_streak_days} day streak</span>
                    </div>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Structured rule editor — shared by "Add rule" and inline edit
// ═══════════════════════════════════════════════════════════════
type DoseParts = { amount: string; unit: string; vehicle: string };
type RulePartial = {
  supplement_id?: string;
  condition?: string;
  severity?: string;
  frequency?: string;
  timing?: string | null;
  duration_weeks?: number;
  remarks?: string | null;
};

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const selectCls = "rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors";
const inputCls = selectCls;

function RuleFormFields({
  rule,
  dose,
  supplements,
  onRuleChange,
  onDoseChange,
  hideSupplement = false,
  conditionOptions,
}: {
  rule: RulePartial;
  dose: DoseParts;
  supplements: Supplement[];
  onRuleChange: (patch: RulePartial) => void;
  onDoseChange: (patch: Partial<DoseParts>) => void;
  hideSupplement?: boolean;
  conditionOptions?: Array<{ key: string; label: string }>;
}) {
  const groupedUnits = DOSE_UNITS.reduce<Record<string, typeof DOSE_UNITS>>((acc, u) => {
    (acc[u.group] ||= []).push(u);
    return acc;
  }, {});
  const preview = formatDosage(dose);
  const condOpts = conditionOptions ?? Object.entries(CONDITION_LABELS).map(([key, label]) => ({ key, label }));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {!hideSupplement && (
        <Field label="Supplement" className="md:col-span-2">
          <select className={selectCls} value={rule.supplement_id ?? ""} onChange={(e) => onRuleChange({ supplement_id: e.target.value })}>
            <option value="">Select supplement…</option>
            {supplements.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Condition">
        <select className={selectCls} value={rule.condition ?? ""} onChange={(e) => onRuleChange({ condition: e.target.value })}>
          {condOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </Field>

      <Field label="Severity">
        <select className={selectCls} value={rule.severity ?? "moderate"} onChange={(e) => onRuleChange({ severity: e.target.value })}>
          <option value="mild">Mild</option>
          <option value="moderate">Moderate</option>
          <option value="severe">Severe</option>
        </select>
      </Field>

      {/* Dose builder */}
      <Field label="Dose amount">
        <input
          className={inputCls}
          type="text"
          inputMode="decimal"
          placeholder="e.g. 500, 1, 1/2"
          value={dose.amount}
          onChange={(e) => onDoseChange({ amount: e.target.value })}
        />
      </Field>

      <Field label="Unit">
        <select className={selectCls} value={dose.unit} onChange={(e) => onDoseChange({ unit: e.target.value })}>
          <option value="">— unit —</option>
          {Object.entries(groupedUnits).map(([group, opts]) => (
            <optgroup key={group} label={group}>
              {opts.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label="With / vehicle (optional)" className="md:col-span-2">
        <input
          className={inputCls}
          list="dose-vehicles"
          placeholder="e.g. in water, in warm water, chewed"
          value={dose.vehicle}
          onChange={(e) => onDoseChange({ vehicle: e.target.value })}
        />
        <datalist id="dose-vehicles">
          {DOSE_VEHICLES.map((v) => <option key={v} value={v} />)}
        </datalist>
        <span className="text-[11px] text-muted-foreground">
          Frontend will show: <span className="font-mono font-bold text-foreground">{preview || "—"}</span>
        </span>
      </Field>

      <Field label="Frequency">
        <select className={selectCls} value={rule.frequency ?? ""} onChange={(e) => onRuleChange({ frequency: e.target.value })}>
          {FREQUENCY_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>

      <Field label="Timing">
        <select className={selectCls} value={rule.timing ?? ""} onChange={(e) => onRuleChange({ timing: e.target.value })}>
          <option value="">— select timing —</option>
          {TIMING_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {TIMING_ICONS[t] ? `${TIMING_ICONS[t]} ` : ""}{t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Duration (weeks)">
        <input
          type="number"
          min={1}
          className={inputCls}
          value={rule.duration_weeks ?? 12}
          onChange={(e) => onRuleChange({ duration_weeks: parseInt(e.target.value) || 12 })}
        />
      </Field>

      <Field label="Remarks (optional)" className="md:col-span-2">
        <input
          className={inputCls}
          placeholder="Any coach note shown alongside the recommendation"
          value={rule.remarks ?? ""}
          onChange={(e) => onRuleChange({ remarks: e.target.value })}
        />
      </Field>
    </div>
  );
}

