import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { fetchSymptomCatalog, type SymptomCatalog } from "@/lib/symptomsService";

interface Props {
  selectedKeys: string[];
  notes: string;
  gender?: string;
  onSelectionChange: (next: string[]) => void;
  onNotesChange: (next: string) => void;
}

/**
 * Checkbox list of clinical symptoms grouped by category.
 * Content is driven by the symptom_categories / symptom_options tables so
 * admins can extend it without a code change.
 */
export default function SymptomsChecklist({
  selectedKeys, notes, gender, onSelectionChange, onNotesChange,
}: Props) {
  const [catalog, setCatalog] = useState<SymptomCatalog>({ categories: [], optionsByCategory: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetchSymptomCatalog().then((c) => {
      if (cancel) return;
      setCatalog(c);
      setLoading(false);
    });
    return () => { cancel = true; };
  }, []);

  const toggle = (key: string) => {
    if (selectedKeys.includes(key)) onSelectionChange(selectedKeys.filter((k) => k !== key));
    else onSelectionChange([...selectedKeys, key]);
  };

  const g = (gender || "").toLowerCase();
  const visibleCategories = catalog.categories.filter((c) => {
    // Hide the opposite gender's section only when we already know the gender
    // and nothing in it has been ticked.
    const opts = catalog.optionsByCategory[c.id] || [];
    const hasSelection = opts.some((o) => selectedKeys.includes(o.key));
    if (hasSelection) return true;
    if (c.key === "womens_health" && g === "male") return false;
    if (c.key === "mens_health" && g === "female") return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {selectedKeys.length > 0 && (
        <p className="text-[11px] font-bold text-[var(--bbdo-blue)]">{selectedKeys.length} selected</p>
      )}

      {visibleCategories.map((cat) => (
        <div key={cat.id}>
          <p className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 break-words">
            {cat.name}
          </p>
          <div className="rounded-xl border border-border divide-y divide-border bg-card overflow-hidden">
            {(catalog.optionsByCategory[cat.id] || []).map((opt) => {
              const active = selectedKeys.includes(opt.key);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggle(opt.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${active ? "bg-[var(--bbdo-blue)]/5" : ""}`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${active ? "bg-[var(--bbdo-blue)] border-[var(--bbdo-blue)]" : "border-border"}`}>
                    {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </div>
                  <span className="text-sm font-semibold text-foreground leading-snug break-words">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <p className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2">Miscellaneous notes</p>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value.slice(0, 2000))}
          rows={4}
          placeholder="Anything else worth noting about symptoms…"
          className="w-full p-3 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--bbdo-blue)]/40 resize-y"
        />
      </div>
    </div>
  );
}
