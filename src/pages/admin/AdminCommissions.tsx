import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Percent, Calendar, Users, Star, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import { useConfirm } from "@/components/ConfirmProvider";

import CsvToolbar from "@/components/admin/CsvToolbar";
interface CommissionModel {
  id: string;
  name: string;
  description: string | null;
  percent: number;
  payout_frequency: "monthly" | "quarterly" | "weekly";
  payout_day: number;
  min_active_patients: number;
  min_avg_rating: number;
  applies_to: string[];
  rules: string | null;
  is_active: boolean;
  is_default: boolean;
}

const empty: Omit<CommissionModel, "id"> = {
  name: "",
  description: "",
  percent: 10,
  payout_frequency: "monthly",
  payout_day: 7,
  min_active_patients: 0,
  min_avg_rating: 0,
  applies_to: [],
  rules: "",
  is_active: true,
  is_default: false,
};

const PACKAGE_KEYS = ["foundation", "active", "intensive"];

export default function AdminCommissions() {
  const confirm = useConfirm();
  const [models, setModels] = useState<CommissionModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CommissionModel | null>(null);
  const [form, setForm] = useState<Omit<CommissionModel, "id">>(empty);
  const [coachCounts, setCoachCounts] = useState<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("commission_models" as any)
      .select("*")
      .order("percent", { ascending: true });
    if (error) {
      toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    } else {
      setModels((data as any) ?? []);
    }

    const { data: coaches } = await supabase
      .from("coaches" as any)
      .select("commission_model_id")
      .not("commission_model_id", "is", null);
    const counts: Record<string, number> = {};
    (coaches as any[] | null)?.forEach((c) => {
      counts[c.commission_model_id] = (counts[c.commission_model_id] ?? 0) + 1;
    });
    setCoachCounts(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (m: CommissionModel) => {
    setEditing(m);
    const { id: _id, ...rest } = m;
    setForm({ ...rest, description: rest.description ?? "", rules: rest.rules ?? "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    const payload = { ...form, name: form.name.trim() };
    if (editing) {
      const { error } = await supabase
        .from("commission_models" as any)
        .update(payload as any)
        .eq("id", editing.id);
      if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
      logAudit({ module: "Control Center", action: "update", target_type: "commission_model", target_id: editing.id, target_label: payload.name });
      toast({ title: "Commission model updated" });
    } else {
      const { data, error } = await supabase
        .from("commission_models" as any)
        .insert(payload as any)
        .select()
        .single();
      if (error) return toast({ title: "Create failed", description: error.message, variant: "destructive" });
      logAudit({ module: "Control Center", action: "create", target_type: "commission_model", target_id: (data as any)?.id, target_label: payload.name });
      toast({ title: "Commission model created" });
    }
    setOpen(false);
    load();
  };

  const remove = async (m: CommissionModel) => {
    if (coachCounts[m.id] > 0) {
      toast({ title: "Cannot delete", description: `${coachCounts[m.id]} coach(es) still use this model.`, variant: "destructive" });
      return;
    }
    if (!(await confirm({ title: "Delete model?", description: `Delete "${m.name}"?`, destructive: true, confirmText: "Delete" }))) return;
    const { error } = await supabase.from("commission_models" as any).delete().eq("id", m.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    logAudit({ module: "Control Center", action: "delete", target_type: "commission_model", target_id: m.id, target_label: m.name });
    toast({ title: "Deleted" });
    load();
  };

  const toggleApplies = (key: string) => {
    setForm((f) => ({
      ...f,
      applies_to: f.applies_to.includes(key)
        ? f.applies_to.filter((k) => k !== key)
        : [...f.applies_to, key],
    }));
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex justify-end mb-3"><CsvToolbar table="commission_models" onImported={() => window.location.reload()} /></div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-foreground">Commission Models</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define commission tiers for coaches. Map a model to each coach from the Coaches page.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> New Model
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : models.length === 0 ? (
        <div className="text-sm text-muted-foreground">No commission models yet.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {models.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-[var(--bbdo-line)] bg-white p-5 shadow-card flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg text-foreground truncate">{m.name}</h3>
                    {m.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                    {!m.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {m.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[var(--bbdo-blue)] font-black text-2xl shrink-0">
                  {m.percent}<Percent className="w-5 h-5" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="capitalize">{m.payout_frequency}</span>
                  <span>· day {m.payout_day}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  {coachCounts[m.id] ?? 0} coach{(coachCounts[m.id] ?? 0) === 1 ? "" : "es"}
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ≥ {m.min_active_patients} patients
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Star className="w-3.5 h-3.5" />
                  ≥ {m.min_avg_rating.toFixed(1)} rating
                </div>
              </div>

              {m.applies_to.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {m.applies_to.map((k) => (
                    <Badge key={k} variant="outline" className="text-[10px] capitalize">{k}</Badge>
                  ))}
                </div>
              )}

              {m.rules && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 line-clamp-3">{m.rules}</p>
              )}

              <div className="flex gap-2 pt-2 mt-auto border-t border-[var(--bbdo-line)]">
                <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(m)}>
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(m)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Commission Model" : "New Commission Model"}</DialogTitle>
            <DialogDescription>
              Define the percentage, payout schedule, and eligibility rules.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Growth" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short summary" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Percent (%)</Label>
                <Input type="number" step="0.1" min={0} max={100}
                  value={form.percent}
                  onChange={(e) => setForm({ ...form, percent: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Payout frequency</Label>
                <Select value={form.payout_frequency} onValueChange={(v: any) => setForm({ ...form, payout_frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Payout day</Label>
                <Input type="number" min={1} max={31}
                  value={form.payout_day}
                  onChange={(e) => setForm({ ...form, payout_day: parseInt(e.target.value) || 1 })} />
              </div>
              <div>
                <Label>Min clients</Label>
                <Input type="number" min={0}
                  value={form.min_active_patients}
                  onChange={(e) => setForm({ ...form, min_active_patients: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Min rating</Label>
                <Input type="number" step="0.1" min={0} max={5}
                  value={form.min_avg_rating}
                  onChange={(e) => setForm({ ...form, min_avg_rating: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>

            <div>
              <Label>Applies to packages</Label>
              <div className="flex gap-2 flex-wrap mt-2">
                {PACKAGE_KEYS.map((k) => {
                  const on = form.applies_to.includes(k);
                  return (
                    <button
                      type="button"
                      key={k}
                      onClick={() => toggleApplies(k)}
                      className={`px-3 py-1.5 rounded-full text-xs capitalize border transition-colors ${
                        on
                          ? "bg-[var(--bbdo-blue)] text-white border-[var(--bbdo-blue)]"
                          : "bg-white text-muted-foreground border-[var(--bbdo-line)]"
                      }`}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Rules / notes</Label>
              <Textarea rows={3}
                value={form.rules ?? ""}
                onChange={(e) => setForm({ ...form, rules: e.target.value })}
                placeholder="e.g. Requires ≥30 active clients, 4.5+ avg rating, 6+ months tenure." />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[var(--bbdo-line)] p-3">
              <div>
                <div className="text-sm font-medium">Active</div>
                <div className="text-xs text-muted-foreground">Available to assign to coaches</div>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--bbdo-line)] p-3">
              <div>
                <div className="text-sm font-medium">Default</div>
                <div className="text-xs text-muted-foreground">Used for new coaches by default</div>
              </div>
              <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save changes" : "Create model"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
