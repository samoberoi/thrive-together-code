import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill, Plus, Check, X, Pause, Play, Edit2, Trash2,
  ChevronDown, ChevronRight, Clock, Users, HeartPulse
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  fetchSupplements, fetchConditionRules, fetchUserPlan, fetchPlanItems,
  createUserPlan, addPlanItem, removePlanItem, updatePlanItem, updateUserPlanStatus, fetchTrackingHistory,
  CONDITION_LABELS, CONDITION_ICONS, CONDITION_COLORS, SEVERITY_COLORS,
  CATEGORY_COLORS, CATEGORY_BG, TIMING_ICONS,
  type Supplement, type ConditionRule, type UserSupplementPlan, type PlanItem, type SupplementTracking
} from "@/lib/supplementService";

type View = "protocols" | "patients";

function ConditionFlatIcon({ className = "w-4 h-4" }: { className?: string }) {
  return <HeartPulse className={className} strokeWidth={1.75} />;
}

export default function CoachSupplements() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("patients");
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [rules, setRules] = useState<ConditionRule[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [patientPlans, setPatientPlans] = useState<Record<string, UserSupplementPlan | null>>({});
  const [patientItems, setPatientItems] = useState<Record<string, PlanItem[]>>({});
  const [patientTracking, setPatientTracking] = useState<Record<string, SupplementTracking[]>>({});
  const [expandedCondition, setExpandedCondition] = useState<string | null>(null);
  const [assigningPatient, setAssigningPatient] = useState<string | null>(null);
  const [editingPatient, setEditingPatient] = useState<string | null>(null);
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  // Per-rule duration overrides during assignment
  const [ruleDurations, setRuleDurations] = useState<Record<string, number>>({});
  // Inline edit state for existing plan items
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editItemValues, setEditItemValues] = useState<Partial<PlanItem>>({});
  // Adding more supplements to existing plan
  const [addingToPatient, setAddingToPatient] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Search & filter state for the rule selector
  const [ruleSearch, setRuleSearch] = useState("");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  // Patient list search + expansion
  const [patientSearch, setPatientSearch] = useState("");
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);

  useEffect(() => { if (user) loadData(); }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: coach } = await supabase.from("coaches" as any).select("id").eq("user_id", user.id).single();
      if (!coach) return;

      const { data: assignments } = await supabase
        .from("coach_assignments" as any).select("user_id").eq("coach_id", (coach as any).id).eq("is_active", true);
      if (!assignments) return;

      const userIds = (assignments as any[]).map((a: any) => a.user_id);
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, name, phone, avatar_url").in("user_id", userIds);
      setPatients((profiles as any) ?? []);

      const [supps, condRules] = await Promise.all([fetchSupplements(), fetchConditionRules()]);
      setSupplements(supps.filter((s) => s.is_active));
      setRules(condRules.filter((r) => r.is_active));

      const planMap: Record<string, UserSupplementPlan | null> = {};
      const itemMap: Record<string, PlanItem[]> = {};
      const trackMap: Record<string, SupplementTracking[]> = {};

      for (const uid of userIds) {
        const plan = await fetchUserPlan(uid);
        planMap[uid] = plan;
        if (plan) {
          const items = await fetchPlanItems(plan.id);
          itemMap[uid] = items;
          const tracking = await fetchTrackingHistory(uid, 7);
          trackMap[uid] = tracking;
        }
      }
      setPatientPlans(planMap);
      setPatientItems(itemMap);
      setPatientTracking(trackMap);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  const suppMap = Object.fromEntries(supplements.map((s) => [s.id, s]));

  // Group rules by condition
  const conditionGroups: Record<string, ConditionRule[]> = {};
  rules.forEach((r) => {
    if (!conditionGroups[r.condition]) conditionGroups[r.condition] = [];
    conditionGroups[r.condition].push(r);
  });

  const toggleRuleSelection = (ruleId: string) => {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
    // Set default duration from rule
    const rule = rules.find((r) => r.id === ruleId);
    if (rule && !ruleDurations[ruleId]) {
      setRuleDurations((prev) => ({ ...prev, [ruleId]: rule.duration_weeks }));
    }
  };

  const handleAssignPlan = async (userId: string) => {
    if (!user || selectedRules.size === 0) return;
    try {
      const planId = await createUserPlan({
        user_id: userId,
        assigned_by: user.id,
        plan_name: "Coach Assigned Plan",
        start_date: new Date().toISOString().split("T")[0],
      } as any);

      for (const ruleId of selectedRules) {
        const rule = rules.find((r) => r.id === ruleId);
        if (!rule) continue;
        await addPlanItem({
          plan_id: planId,
          supplement_id: rule.supplement_id,
          dosage: rule.dosage,
          frequency: rule.frequency,
          timing: rule.timing ?? "with meal",
          remarks: rule.remarks,
          duration_weeks: ruleDurations[ruleId] ?? rule.duration_weeks,
        });
      }

      toast.success("Supplement plan assigned!");
      setAssigningPatient(null);
      setSelectedRules(new Set());
      setRuleDurations({});
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddToExistingPlan = async (userId: string, planId: string) => {
    if (!user || selectedRules.size === 0) return;
    try {
      for (const ruleId of selectedRules) {
        const rule = rules.find((r) => r.id === ruleId);
        if (!rule) continue;
        await addPlanItem({
          plan_id: planId,
          supplement_id: rule.supplement_id,
          dosage: rule.dosage,
          frequency: rule.frequency,
          timing: rule.timing ?? "with meal",
          remarks: rule.remarks,
          duration_weeks: ruleDurations[ruleId] ?? rule.duration_weeks,
        });
      }
      toast.success("Supplements added to plan!");
      setAddingToPatient(null);
      setSelectedRules(new Set());
      setRuleDurations({});
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await removePlanItem(itemId);
      toast.success("Supplement removed");
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSaveItem = async (itemId: string) => {
    try {
      await updatePlanItem(itemId, editItemValues);
      toast.success("Supplement updated");
      setEditingItem(null);
      setEditItemValues({});
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleStatusChange = async (plan: UserSupplementPlan, newStatus: string) => {
    try {
      await updateUserPlanStatus(plan.id, newStatus);
      toast.success(`Plan ${newStatus}`);
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  // Reusable condition-rule selector
  const renderRuleSelector = (existingItemSupps?: Set<string>) => {
    const categories = Array.from(new Set(supplements.map((s) => s.category))).filter(Boolean).sort();
    const conditionKeys = Object.keys(conditionGroups).sort();
    const severities = Array.from(new Set(rules.map((r) => r.severity))).filter(Boolean).sort();
    const q = ruleSearch.trim().toLowerCase();

    // Apply top-level filters to condition groups
    const visibleGroups = Object.entries(conditionGroups)
      .filter(([cond]) => filterCondition === "all" || cond === filterCondition)
      .map(([cond, condRules]) => {
        const filtered = condRules.filter((r) => {
          if (existingItemSupps && existingItemSupps.has(r.supplement_id)) return false;
          if (filterSeverity !== "all" && r.severity !== filterSeverity) return false;
          const supp = suppMap[r.supplement_id];
          if (filterCategory !== "all" && supp?.category !== filterCategory) return false;
          if (q) {
            const hay = `${supp?.name ?? ""} ${r.dosage ?? ""} ${r.frequency ?? ""} ${r.timing ?? ""} ${r.remarks ?? ""} ${cond}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return [cond, filtered] as [string, ConditionRule[]];
      })
      .filter(([, r]) => r.length > 0);

    const totalMatches = visibleGroups.reduce((n, [, r]) => n + r.length, 0);
    const filtersActive = q !== "" || filterCondition !== "all" || filterCategory !== "all" || filterSeverity !== "all";

    return (
    <div className="space-y-3">
      {/* Filters bar */}
      <div className="space-y-2 sticky top-0 z-10 bg-background pb-2">
        <div className="relative">
          <input
            type="text"
            value={ruleSearch}
            onChange={(e) => setRuleSearch(e.target.value)}
            placeholder="Search by name, dosage, timing, condition…"
            className="w-full rounded-xl border border-input bg-background pl-9 pr-8 py-2 text-xs"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          {ruleSearch && (
            <button onClick={() => setRuleSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select
            value={filterCondition}
            onChange={(e) => setFilterCondition(e.target.value)}
            className="rounded-xl border border-input bg-background px-2 py-2 text-xs"
          >
            <option value="all">All conditions</option>
            {conditionKeys.map((c) => (
              <option key={c} value={c}>{(CONDITION_LABELS[c] ?? c).split(":")[0]}</option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-xl border border-input bg-background px-2 py-2 text-xs capitalize"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="rounded-xl border border-input bg-background px-2 py-2 text-xs capitalize"
          >
            <option value="all">All severities</option>
            {severities.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{totalMatches} match{totalMatches === 1 ? "" : "es"}</span>
          {filtersActive && (
            <button
              onClick={() => { setRuleSearch(""); setFilterCondition("all"); setFilterCategory("all"); setFilterSeverity("all"); }}
              className="text-primary font-semibold"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
      {visibleGroups.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-6">No supplements match your filters.</div>
      )}
      {visibleGroups.map(([cond, filteredRules]) => {
        return (
          <div key={cond} className="rounded-2xl bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <ConditionFlatIcon className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-foreground">{(CONDITION_LABELS[cond] ?? cond).split(":")[0]}</span>
              <button
                onClick={() => {
                  const allIds = filteredRules.map((r) => r.id);
                  const allSelected = allIds.every((id) => selectedRules.has(id));
                  setSelectedRules((prev) => {
                    const next = new Set(prev);
                    allIds.forEach((id) => {
                      if (allSelected) next.delete(id);
                      else {
                        next.add(id);
                        const rule = rules.find((r) => r.id === id);
                        if (rule) setRuleDurations((p) => ({ ...p, [id]: p[id] ?? rule.duration_weeks }));
                      }
                    });
                    return next;
                  });
                }}
                className="ml-auto text-[10px] text-primary font-semibold"
              >
                {filteredRules.every((r) => selectedRules.has(r.id)) ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="space-y-1">
              {filteredRules.map((rule) => {
                const supp = suppMap[rule.supplement_id];
                const selected = selectedRules.has(rule.id);
                return (
                  <div key={rule.id} className={`rounded-2xl border transition-colors ${
                    selected ? "bg-primary/5 border-primary/30" : "bg-background/60 border-border/40 hover:bg-muted/40"
                  }`}>
                    <button
                      onClick={() => toggleRuleSelection(rule.id)}
                      className="w-full flex items-start gap-3 p-3 text-left"
                    >
                      <div className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-colors ${
                        selected ? "bg-primary border-primary" : "border-muted-foreground/30 bg-background"
                      }`}>
                        {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-foreground text-[13px] leading-tight break-words">
                            {supp?.name ?? "Unknown"}
                          </span>
                          <Badge variant="outline" className={`text-[9px] shrink-0 ${SEVERITY_COLORS[rule.severity] ?? ""}`}>
                            {rule.severity}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold">
                            {rule.dosage}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                            {rule.frequency}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                            {TIMING_ICONS[rule.timing ?? ""] ?? ""} {rule.timing}
                          </span>
                        </div>
                      </div>
                    </button>
                    {selected && (
                      <div className="flex items-center gap-2 px-3 pb-3 pt-1 pl-11 text-[11px] border-t border-primary/10">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Duration:</span>
                        <input
                          type="number"
                          min={1}
                          max={52}
                          className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-xs text-center"
                          value={ruleDurations[rule.id] ?? rule.duration_weeks}
                          onChange={(e) => setRuleDurations((p) => ({ ...p, [rule.id]: parseInt(e.target.value) || rule.duration_weeks }))}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-muted-foreground">weeks</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>
    </div>
    );
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Pill className="w-6 h-6 text-primary" /> Supplements
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Condition protocols, assignments & tracking</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {(["patients", "protocols"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-colors ${
              view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {v === "protocols" ? <Pill className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              {v === "protocols" ? `Condition Protocols (${Object.keys(conditionGroups).length})` : `Patients (${patients.length})`}
            </span>
          </button>
        ))}
      </div>

      {/* ─── Protocols View ─── */}
      {view === "protocols" && (
        <div className="space-y-3">
          {Object.entries(conditionGroups).map(([cond, condRules]) => (
            <motion.div
              key={cond}
              className="liquid-glass rounded-3xl overflow-hidden"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            >
              <button
                onClick={() => setExpandedCondition(expandedCondition === cond ? null : cond)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${CONDITION_COLORS[cond] ?? "bg-muted text-muted-foreground"}`}>
                    <ConditionFlatIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-sm">{CONDITION_LABELS[cond] ?? cond}</h3>
                    <p className="text-[10px] text-muted-foreground">{condRules.length} supplements</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{condRules.length}</Badge>
                  {expandedCondition === cond ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                </div>
              </button>

              <AnimatePresence>
                {expandedCondition === cond && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-5 pb-5"
                  >
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                      {condRules.map((rule) => {
                        const supp = suppMap[rule.supplement_id];
                        return (
                          <div key={rule.id} className="flex flex-col sm:flex-row sm:items-center gap-1.5 py-2.5 px-3 rounded-xl bg-muted/50 text-xs">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Pill className={`w-3.5 h-3.5 shrink-0 ${CATEGORY_COLORS[supp?.category ?? ""] ?? "text-muted-foreground"}`} />
                              <span className="font-semibold text-foreground truncate">{supp?.name ?? "Unknown"}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 sm:pl-0 shrink-0">
                              <span className="text-primary font-bold whitespace-nowrap">{rule.dosage}</span>
                              <span className="text-muted-foreground whitespace-nowrap">{rule.frequency}</span>
                              <span className="text-muted-foreground whitespace-nowrap">{TIMING_ICONS[rule.timing ?? ""] ?? "⏰"} {rule.timing}</span>
                              <Badge variant="outline" className={`text-[9px] ${SEVERITY_COLORS[rule.severity] ?? ""}`}>
                                {rule.severity}
                              </Badge>
                              <span className="text-muted-foreground whitespace-nowrap">{rule.duration_weeks}w</span>
                            </div>
                          </div>

                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      {/* ─── Patients View ─── */}
      {view === "patients" && (
        <div className="space-y-3">
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder="Search patient by name or phone…"
              className="w-full rounded-2xl border border-input bg-background pl-10 pr-9 py-2.5 text-sm"
            />
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            {patientSearch && (
              <button onClick={() => setPatientSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {patients.length === 0 ? (
            <div className="liquid-glass rounded-3xl p-10 text-center text-muted-foreground">No patients assigned.</div>
          ) : (() => {
            const q = patientSearch.trim().toLowerCase();
            const filtered = q
              ? patients.filter((p: any) =>
                  (p.name ?? "").toLowerCase().includes(q) || (p.phone ?? "").toLowerCase().includes(q))
              : patients;
            if (filtered.length === 0) {
              return <div className="liquid-glass rounded-3xl p-8 text-center text-sm text-muted-foreground">No patients match “{patientSearch}”.</div>;
            }
            return filtered.map((patient: any) => {
            const plan = patientPlans[patient.user_id];
            const items = patientItems[patient.user_id] ?? [];
            const tracking = patientTracking[patient.user_id] ?? [];
            const today = new Date().toISOString().split("T")[0];
            const todayTaken = tracking.filter((t) => t.date === today && t.taken).length;
            const totalItems = items.length;
            const compliance = totalItems > 0 ? Math.round((todayTaken / totalItems) * 100) : 0;
            const isAssigning = assigningPatient === patient.user_id;
            const isEditing = editingPatient === patient.user_id;
            const isAdding = addingToPatient === patient.user_id;
            const isExpanded = expandedPatient === patient.user_id || isAssigning || isEditing || isAdding;
            const isPaused = plan?.status === "paused";

            return (
              <motion.div
                key={patient.user_id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="liquid-glass rounded-3xl p-4 sm:p-5"
              >
                {/* Compact header row */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button
                    onClick={() => setExpandedPatient(isExpanded && !isAssigning && !isEditing && !isAdding ? null : patient.user_id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                      {patient.avatar_url ? (
                        <img src={patient.avatar_url} alt="" className="w-10 h-10 rounded-2xl object-cover" />
                      ) : (
                        <span className="text-primary font-bold text-sm">{(patient.name ?? "?")[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-foreground text-sm truncate">{patient.name || "Unnamed"}</h3>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {patient.phone}
                        {plan && <> · <span className="text-foreground/70">{items.length} supp · {plan.plan_name}</span></>}
                      </p>
                    </div>
                    {plan ? (
                      <Badge className={`text-[10px] shrink-0 ${
                        isPaused ? "bg-amber-500/15 text-amber-500 border-amber-500/20" :
                        compliance >= 80 ? "bg-primary/15 text-primary border-primary/20" :
                        compliance >= 50 ? "bg-amber-500/15 text-amber-500 border-amber-500/20" :
                        "bg-destructive/15 text-destructive border-destructive/20"
                      }`} variant="outline">
                        {isPaused ? "Paused" : `${compliance}% today`}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground shrink-0">No Plan</Badge>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  {/* Inline action buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!plan && !isAssigning && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAssigningPatient(patient.user_id); setSelectedRules(new Set()); setRuleDurations({}); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5" /> Assign
                      </button>
                    )}
                    {plan && !isEditing && !isAdding && !isAssigning && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingPatient(patient.user_id); setExpandedPatient(patient.user_id); }}
                          className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary/10 text-primary"
                          aria-label="Edit plan"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {plan.status === "active" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(plan, "paused"); }}
                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"
                            aria-label="Pause plan"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {plan.status === "paused" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(plan, "active"); }}
                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary/10 text-primary"
                            aria-label="Resume plan"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                <>


                {/* ─── Existing plan: View / Edit mode ─── */}
                {plan && !isAssigning && !isAdding && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{items.length} supplements</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-primary">{plan.plan_name}</span>
                        {!isEditing && (
                          <button
                            onClick={() => setEditingPatient(patient.user_id)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-[10px] font-semibold transition-colors"
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Items list */}
                    <div className="space-y-1.5">
                      {items.map((item) => {
                        const supp = suppMap[item.supplement_id];
                        const isItemEditing = editingItem === item.id;

                        if (isItemEditing) {
                          return (
                            <div key={item.id} className="rounded-xl bg-muted/50 p-3 space-y-2">
                              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                <Pill className={`w-3.5 h-3.5 ${CATEGORY_COLORS[supp?.category ?? ""] ?? "text-muted-foreground"}`} />
                                {supp?.name ?? "Unknown"}
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <div>
                                  <label className="text-[9px] text-muted-foreground font-semibold uppercase">Dosage</label>
                                  <input className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                                    value={editItemValues.dosage ?? ""} onChange={(e) => setEditItemValues({ ...editItemValues, dosage: e.target.value })} />
                                </div>
                                <div>
                                  <label className="text-[9px] text-muted-foreground font-semibold uppercase">Frequency</label>
                                  <select className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                                    value={editItemValues.frequency ?? "once daily"} onChange={(e) => setEditItemValues({ ...editItemValues, frequency: e.target.value })}>
                                    <option value="once daily">Once daily</option>
                                    <option value="twice daily">Twice daily</option>
                                    <option value="thrice daily">Thrice daily</option>
                                    <option value="alternate days">Alternate days</option>
                                    <option value="weekly">Weekly</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[9px] text-muted-foreground font-semibold uppercase">Timing</label>
                                  <select className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                                    value={editItemValues.timing ?? "with meal"} onChange={(e) => setEditItemValues({ ...editItemValues, timing: e.target.value })}>
                                    <option value="morning empty stomach">Morning empty stomach</option>
                                    <option value="with first meal (FMOD)">With first meal (FMOD)</option>
                                    <option value="with meal">With meal</option>
                                    <option value="before meal">Before meal</option>
                                    <option value="before meal with water">Before meal with water</option>
                                    <option value="evening">Evening</option>
                                    <option value="morning and evening">Morning and evening</option>
                                    <option value="empty stomach">Empty stomach</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[9px] text-muted-foreground font-semibold uppercase">Duration</label>
                                  <div className="flex items-center gap-1">
                                    <input type="number" min={1} max={52}
                                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                                      value={editItemValues.duration_weeks ?? 12}
                                      onChange={(e) => setEditItemValues({ ...editItemValues, duration_weeks: parseInt(e.target.value) || 12 })} />
                                    <span className="text-[10px] text-muted-foreground shrink-0">wks</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => handleSaveItem(item.id)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold">
                                  <Check className="w-3 h-3" /> Save
                                </button>
                                <button onClick={() => { setEditingItem(null); setEditItemValues({}); }}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px]">
                                  <X className="w-3 h-3" /> Cancel
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={item.id} className="flex flex-col gap-1.5 py-2 px-3 rounded-xl bg-muted/50 text-xs group">
                            <div className="flex items-center gap-2 min-w-0">
                              <Pill className={`w-3.5 h-3.5 shrink-0 ${CATEGORY_COLORS[supp?.category ?? ""] ?? "text-muted-foreground"}`} />
                              <span className="font-semibold text-foreground truncate flex-1 min-w-0">{supp?.name ?? "Unknown"}</span>
                              {isEditing && (
                                <div className="flex items-center gap-1 shrink-0 -mr-1">
                                  <button
                                    aria-label="Edit supplement"
                                    onClick={() => { setEditingItem(item.id); setEditItemValues({ dosage: item.dosage, frequency: item.frequency, timing: item.timing, duration_weeks: item.duration_weeks ?? 12 }); }}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-background border border-border text-muted-foreground active:scale-95 hover:text-foreground transition-all">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    aria-label="Remove supplement"
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-background border border-border text-muted-foreground active:scale-95 hover:text-destructive hover:border-destructive/40 transition-all">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-5">
                              <span className="text-primary font-bold whitespace-nowrap">{item.dosage}</span>
                              <span className="text-muted-foreground whitespace-nowrap">{item.frequency}</span>
                              <span className="text-muted-foreground whitespace-nowrap">{TIMING_ICONS[item.timing ?? ""] ?? ""} {item.timing}</span>
                              <span className="text-muted-foreground whitespace-nowrap">{item.duration_weeks ?? 12}w</span>
                            </div>
                          </div>


                        );
                      })}
                    </div>

                    {/* Edit mode actions */}
                    {isEditing && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            setAddingToPatient(patient.user_id);
                            setEditingPatient(null);
                            setSelectedRules(new Set());
                            setRuleDurations({});
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/10 text-primary"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Supplements
                        </button>
                        <button onClick={() => setEditingPatient(null)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-muted text-muted-foreground">
                          Done
                        </button>
                      </div>
                    )}

                    {/* Non-edit actions */}
                    {!isEditing && (
                      <div className="flex gap-2">
                        {plan.status === "active" && (
                          <button onClick={() => handleStatusChange(plan, "paused")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-500">
                            <Pause className="w-3.5 h-3.5" /> Pause
                          </button>
                        )}
                        {plan.status === "paused" && (
                          <button onClick={() => handleStatusChange(plan, "active")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/10 text-primary">
                            <Play className="w-3.5 h-3.5" /> Resume
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Assign trigger for patients without a plan */}
                {!plan && (
                  <div className="mt-4">
                    <button
                      onClick={() => { setAssigningPatient(patient.user_id); setSelectedRules(new Set()); setRuleDurations({}); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
                    >
                      <Pill className="w-4 h-4" /> Assign Supplement Plan
                    </button>
                  </div>
                )}
                </>
                )}
              </motion.div>
            );
            });
          })()}
        </div>
      )}

      {/* Assign / Add supplements bottom sheet */}
      {(() => {
        const activeUserId = assigningPatient ?? addingToPatient;
        const isAdd = !!addingToPatient;
        const activePatient = activeUserId ? patients.find((p: any) => p.user_id === activeUserId) : null;
        const activePlan = activeUserId ? patientPlans[activeUserId] : null;
        const activeItems = activeUserId ? (patientItems[activeUserId] ?? []) : [];
        const existingSuppIds = isAdd ? new Set(activeItems.map((i) => i.supplement_id)) : undefined;
        const open = !!activeUserId;

        const close = () => {
          setAssigningPatient(null);
          setAddingToPatient(null);
          setSelectedRules(new Set());
          setRuleDurations({});
        };

        return (
          <Sheet open={open} onOpenChange={(o) => { if (!o) close(); }}>
            <SheetContent side="bottom" className="h-[92vh] p-0 flex flex-col rounded-t-3xl">
              <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Pill className="w-5 h-5 text-primary" />
                  {isAdd ? "Add More Supplements" : "Assign Supplement Plan"}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {activePatient?.name ? <span className="font-semibold text-foreground">{activePatient.name}</span> : "Patient"}
                  {" · "}Pick condition protocols and adjust duration per item.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {open && renderRuleSelector(existingSuppIds)}
              </div>

              <div className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-muted-foreground">
                  {selectedRules.size} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={close}
                    className="px-4 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!activeUserId) return;
                      if (isAdd && activePlan) handleAddToExistingPlan(activeUserId, activePlan.id);
                      else handleAssignPlan(activeUserId);
                    }}
                    disabled={selectedRules.size === 0}
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    {isAdd ? `Add (${selectedRules.size})` : `Assign (${selectedRules.size})`}
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        );
      })()}
    </div>
  );
}
