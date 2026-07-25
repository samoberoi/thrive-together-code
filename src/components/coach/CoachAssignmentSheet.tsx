import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listPatientAssignments,
  setPatientAssignments,
  type AssignmentModule,
} from "@/lib/coachVideoAssignmentService";

export interface AssignableItem {
  key: string;
  title: string;
  subtitle?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  coachId: string;
  patient: { user_id: string; name: string };
  module: AssignmentModule;
  items: AssignableItem[];
  loadingItems?: boolean;
}

export default function CoachAssignmentSheet({
  open,
  onClose,
  coachId,
  patient,
  module,
  items,
  loadingItems,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listPatientAssignments(patient.user_id, module)
      .then((rows) => {
        const s = new Set(rows.map((r) => r.item_key));
        setSelected(s);
        setInitial(new Set(s));
      })
      .catch((e) => toast.error(e?.message || "Failed to load assignments"))
      .finally(() => setLoading(false));
  }, [open, patient.user_id, module]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (it) =>
        it.title.toLowerCase().includes(query) ||
        (it.subtitle || "").toLowerCase().includes(query),
    );
  }, [items, q]);

  const dirty = useMemo(() => {
    if (selected.size !== initial.size) return true;
    for (const k of selected) if (!initial.has(k)) return true;
    return false;
  }, [selected, initial]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setPatientAssignments({
        coachId,
        patientUserId: patient.user_id,
        module,
        itemKeys: Array.from(selected),
      });
      toast.success("Assignments updated");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save assignments");
    } finally {
      setSaving(false);
    }
  };

  const label = module === "yoga" ? "Yoga videos" : "Exercises";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="h-[92dvh] p-0 flex flex-col"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <SheetTitle className="text-left">
            Assign {label} — {patient.name}
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">
            Selected {selected.size} of {items.length}. Leave empty to keep them awaiting your plan.
          </p>
        </SheetHeader>

        <div className="px-4 py-3 border-b space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${label.toLowerCase()}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
              autoFocus={false}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  filtered.forEach((i) => next.add(i.key));
                  return next;
                })
              }
              disabled={loading || loadingItems || filtered.length === 0}
            >
              Select all{q ? " (filtered)" : ""}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="flex-1"
              onClick={() => setSelected(new Set())}
              disabled={loading || loadingItems || selected.size === 0}
            >
              Clear all
            </Button>
          </div>
        </div>


        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading || loadingItems ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">No items.</div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((it) => {
                const checked = selected.has(it.key);
                return (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={() => toggle(it.key)}
                      className={`w-full flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                        checked ? "bg-primary/10 border-primary/40" : "bg-card border-border"
                      }`}
                      aria-pressed={checked}
                    >
                      <Checkbox checked={checked} className="mt-0.5 pointer-events-none" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{it.title}</p>
                        {it.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">{it.subtitle}</p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-3 border-t flex items-center gap-2 sticky bottom-0 bg-background">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : `Submit${selected.size ? ` (${selected.size})` : ""}`}
          </Button>

        </div>
      </SheetContent>
    </Sheet>
  );
}
