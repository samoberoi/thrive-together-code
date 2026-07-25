import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Plus, Trash2, Scale } from "lucide-react";
import { useBmiCategories, type BmiCategory } from "@/hooks/useBmiCategories";

export default function AdminBmiCategories() {
  const { categories, reload } = useBmiCategories();
  const [rows, setRows] = useState<BmiCategory[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setRows(categories.map((c) => ({ ...c }))); }, [categories]);

  const update = (id: string, patch: Partial<BmiCategory>) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const addRow = async () => {
    const nextSort = (rows[rows.length - 1]?.sort_order ?? 0) + 1;
    const { data, error } = await (supabase as any)
      .from("bmi_categories")
      .insert({
        code: `custom_${Date.now()}`,
        label: "New category",
        min_value: 0,
        max_value: 100,
        color: "#10B981",
        sort_order: nextSort,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    reload();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this BMI category?")) return;
    const { error } = await (supabase as any).from("bmi_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    reload();
  };

  const saveAll = async () => {
    setSaving(true);
    for (const r of rows) {
      const { error } = await (supabase as any)
        .from("bmi_categories")
        .update({
          label: r.label,
          min_value: r.min_value,
          max_value: r.max_value,
          color: r.color,
          sort_order: r.sort_order,
          description: r.description,
        })
        .eq("id", r.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    setSaving(false);
    toast.success("BMI categories saved");
    reload();
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-[var(--bbdo-blue)]" />
          <h2 className="text-lg font-black">BMI Categories</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={addRow} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border text-sm font-semibold">
            <Plus className="w-4 h-4" /> Add
          </button>
          <button onClick={saveAll} disabled={saving} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-[var(--bbdo-blue)] text-white text-sm font-semibold disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save all"}
          </button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        WHO adult BMI bands used across the app (home rings, onboarding, coach view). Leave "min" empty for the lowest band and "max" empty for the highest.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border rounded-xl overflow-hidden">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Sort</th>
              <th className="text-left p-2">Label</th>
              <th className="text-left p-2">Min BMI</th>
              <th className="text-left p-2">Max BMI</th>
              <th className="text-left p-2">Color</th>
              <th className="text-left p-2">Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 w-16">
                  <input type="number" value={r.sort_order} onChange={(e) => update(r.id, { sort_order: Number(e.target.value) })} className="w-14 border rounded px-2 py-1" />
                </td>
                <td className="p-2">
                  <input value={r.label} onChange={(e) => update(r.id, { label: e.target.value })} className="w-40 border rounded px-2 py-1" />
                </td>
                <td className="p-2">
                  <input type="number" step="0.1" value={r.min_value ?? ""} onChange={(e) => update(r.id, { min_value: e.target.value === "" ? null : Number(e.target.value) })} className="w-20 border rounded px-2 py-1" />
                </td>
                <td className="p-2">
                  <input type="number" step="0.1" value={r.max_value ?? ""} onChange={(e) => update(r.id, { max_value: e.target.value === "" ? null : Number(e.target.value) })} className="w-20 border rounded px-2 py-1" />
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <input type="color" value={r.color ?? "#10B981"} onChange={(e) => update(r.id, { color: e.target.value })} className="w-9 h-8 border rounded" />
                    <input value={r.color ?? ""} onChange={(e) => update(r.id, { color: e.target.value })} className="w-24 border rounded px-2 py-1 font-mono text-xs" />
                  </div>
                </td>
                <td className="p-2">
                  <input value={r.description ?? ""} onChange={(e) => update(r.id, { description: e.target.value })} className="w-full min-w-[220px] border rounded px-2 py-1" />
                </td>
                <td className="p-2">
                  <button onClick={() => remove(r.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
