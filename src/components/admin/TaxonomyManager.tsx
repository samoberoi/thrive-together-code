import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  listTaxonomy,
  createTaxonomyItem,
  updateTaxonomyItem,
  deleteTaxonomyItem,
  TAXONOMY_LABEL,
  type TaxonomyItem,
  type TaxonomyTable,
} from "@/lib/exercise2Service";

export default function TaxonomyManager({ table }: { table: TaxonomyTable }) {
  const confirm = useConfirm();
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listTaxonomy(table));
    } catch (e: any) {
      toast({ title: "Could not load list", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const next = (items.reduce((m, i) => Math.max(m, i.sort_order), 0) || 0) + 1;
      await createTaxonomyItem(table, name, next);
      setNewName("");
      await load();
    } catch (e: any) {
      toast({ title: "Could not add", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveName = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateTaxonomyItem(table, id, { name });
      setEditingId(null);
      await load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    }
  };

  const move = async (item: TaxonomyItem, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.id === item.id);
    const other = items[idx + dir];
    if (!other) return;
    try {
      await updateTaxonomyItem(table, item.id, { sort_order: other.sort_order });
      await updateTaxonomyItem(table, other.id, { sort_order: item.sort_order });
      await load();
    } catch (e: any) {
      toast({ title: "Could not reorder", description: e.message, variant: "destructive" });
    }
  };

  const remove = async (item: TaxonomyItem) => {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      description: "It will be removed from the dropdown and from any exercise using it.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteTaxonomyItem(table, item.id);
      await load();
    } catch (e: any) {
      toast({ title: "Could not delete", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-foreground">{TAXONOMY_LABEL[table]}</h3>
        <span className="text-xs text-muted-foreground">{items.length} options</span>
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          placeholder={`Add ${TAXONOMY_LABEL[table].toLowerCase()}…`}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add} disabled={busy || !newName.trim()} size="sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item, idx) => (
            <li key={item.id} className="flex items-center gap-2 py-2">
              <div className="flex flex-col">
                <button
                  className="text-[10px] leading-none text-muted-foreground disabled:opacity-30"
                  onClick={() => move(item, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  className="text-[10px] leading-none text-muted-foreground disabled:opacity-30"
                  onClick={() => move(item, 1)}
                  disabled={idx === items.length - 1}
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>

              {editingId === item.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveName(item.id)}
                    className="h-8"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveName(item.id)}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-foreground truncate">{item.name}</span>
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={async (v) => {
                      await updateTaxonomyItem(table, item.id, { enabled: v });
                      void load();
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditName(item.name);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(item)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </>
              )}
            </li>
          ))}
          {!items.length && <li className="py-4 text-sm text-muted-foreground">No options yet.</li>}
        </ul>
      )}
    </div>
  );
}
