import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { createSupplementRec, type SupplementRecItem } from "@/lib/recommendationService";
import { Loader2, Pill, Search, X } from "lucide-react";

interface Sup {
  id: string;
  name: string;
  category: string;
  default_dosage: string | null;
  default_timing: string | null;
}

interface Rule {
  supplement_id: string;
  condition: string;
  dosage: string | null;
  timing: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  coachId: string;
  patientId: string;
  patientName?: string;
  onCreated?: () => void;
}

const CONDITION_LABELS: Record<string, string> = {
  insulin_resistance: "Insulin Resistance",
  ir_stress: "IR / Stress",
  thyroid: "Thyroid",
  liver: "Liver / Fatty Liver",
  uric_acid: "Uric Acid",
  deficiency: "Deficiency",
  foundational: "Foundational",
  metabolic_boost: "Metabolic Boost",
};

const prettyCondition = (c: string) => CONDITION_LABELS[c] ?? c.replace(/_/g, " ");

export default function RecommendSupplementsDialog({ open, onOpenChange, coachId, patientId, patientName, onCreated }: Props) {
  const { toast } = useToast();
  const [list, setList] = useState<Sup[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [selected, setSelected] = useState<Record<string, SupplementRecItem>>({});
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [condition, setCondition] = useState<string>("all");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      supabase
        .from("supplement_master")
        .select("id, name, category, default_dosage, default_timing")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("supplement_condition_rules")
        .select("supplement_id, condition, dosage, timing"),
    ]).then(([sups, rls]) => {
      setList((sups.data ?? []) as Sup[]);
      setRules((rls.data ?? []) as Rule[]);
      setLoading(false);
    });
  }, [open]);

  const categories = useMemo(
    () => Array.from(new Set(list.map((s) => s.category))).sort(),
    [list]
  );
  const conditions = useMemo(
    () => Array.from(new Set(rules.map((r) => r.condition))).sort(),
    [rules]
  );

  const rulesBySup = useMemo(() => {
    const m: Record<string, Rule[]> = {};
    rules.forEach((r) => {
      (m[r.supplement_id] ||= []).push(r);
    });
    return m;
  }, [rules]);

  const filtered = list.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== "all" && s.category !== category) return false;
    if (condition !== "all") {
      const rs = rulesBySup[s.id] ?? [];
      if (!rs.some((r) => r.condition === condition)) return false;
    }
    return true;
  });

  const toggle = (s: Sup, on: boolean) => {
    setSelected((prev) => {
      const c = { ...prev };
      if (on) {
        // If a condition filter is active, prefer that rule's dose/timing
        let dose = s.default_dosage ?? "";
        let timing = s.default_timing ?? "";
        if (condition !== "all") {
          const rule = (rulesBySup[s.id] ?? []).find((r) => r.condition === condition);
          if (rule) {
            dose = rule.dosage ?? dose;
            timing = rule.timing ?? timing;
          }
        }
        c[s.id] = { supplement_id: s.id, name: s.name, dose, timing, duration_days: 30 };
      } else {
        delete c[s.id];
      }
      return c;
    });
  };

  const update = (id: string, key: keyof SupplementRecItem, value: any) => {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const items = Object.values(selected);
  const filtersActive = search !== "" || category !== "all" || condition !== "all";
  const clearFilters = () => { setSearch(""); setCategory("all"); setCondition("all"); };

  const submit = async () => {
    if (items.length === 0) return toast({ title: "Pick at least one supplement", variant: "destructive" });
    try {
      setSaving(true);
      await createSupplementRec({ coach_id: coachId, user_id: patientId, items, note });
      toast({ title: "Supplements recommended" });
      onCreated?.();
      onOpenChange(false);
      setSelected({}); setNote(""); clearFilters();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pill className="w-4 h-4 text-primary" /> Recommend supplements</DialogTitle>
          <DialogDescription>Search or filter by category / condition for {patientName ?? "the client"}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search supplements by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger><SelectValue placeholder="Condition" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All conditions</SelectItem>
                {conditions.map((c) => (
                  <SelectItem key={c} value={c}>{prettyCondition(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{loading ? "Loading…" : `${filtered.length} of ${list.length} supplements`}</span>
            {filtersActive && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1 text-primary hover:underline">
                <X className="w-3 h-3" /> Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1.5">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto my-8 text-primary" />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No supplements match your filters.</p>
          ) : (
            filtered.map((s) => {
              const on = !!selected[s.id];
              const supRules = rulesBySup[s.id] ?? [];
              return (
                <div key={s.id} className={`rounded-xl border ${on ? "border-primary/40 bg-primary/5" : "border-border"} p-2.5`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox checked={on} onCheckedChange={(c) => toggle(s, !!c)} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{s.category}</p>
                      {supRules.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {supRules.map((r, i) => (
                            <Badge
                              key={`${r.condition}-${i}`}
                              variant={condition === r.condition ? "default" : "secondary"}
                              className="text-[10px] py-0 px-1.5 font-normal"
                            >
                              {prettyCondition(r.condition)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                  {on && (
                    <div className="grid grid-cols-3 gap-2 mt-2 pl-7">
                      <Input placeholder="Dose" value={selected[s.id].dose ?? ""} onChange={(e) => update(s.id, "dose", e.target.value)} />
                      <Input placeholder="Timing" value={selected[s.id].timing ?? ""} onChange={(e) => update(s.id, "timing", e.target.value)} />
                      <Input type="number" placeholder="Days" value={selected[s.id].duration_days ?? 30} onChange={(e) => update(s.id, "duration_days", Number(e.target.value))} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for client (optional)" />
        <Button onClick={submit} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Recommend {items.length || ""} supplement{items.length === 1 ? "" : "s"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
