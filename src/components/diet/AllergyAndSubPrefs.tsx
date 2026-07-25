import { useEffect, useMemo, useState } from "react";
import { Search, Check, WheatOff, MilkOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type FoodItemLite = {
  id: string;
  name: string;
  alt_name: string | null;
  diet_type: string;
  is_jain_friendly: boolean;
};

const SUB_PREFS: { key: string; label: string; icon: any }[] = [
  { key: "gluten_free", label: "Gluten-free", icon: WheatOff },
  { key: "dairy_free", label: "Dairy-free", icon: MilkOff },
];

/**
 * Diet slugs the picker uses to narrow the allergen list. Rules:
 *  - empty → show everything
 *  - non_veg present → show everything
 *  - vegan → vegan items only
 *  - veg → veg + vegan
 *  - eggitarian → veg + vegan + eggitarian
 *  - jain → jain-friendly only
 * Anything else falls back to exact diet_type match.
 */
function itemMatchesDietPrefs(item: FoodItemLite, prefs: string[]): boolean {
  if (!prefs.length) return true;
  if (prefs.includes("non_veg")) return true;
  return prefs.some((p) => {
    if (p === "vegan") return item.diet_type === "vegan";
    if (p === "veg") return item.diet_type === "veg" || item.diet_type === "vegan";
    if (p === "eggitarian") return ["veg", "vegan", "eggitarian"].includes(item.diet_type);
    if (p === "jain") return item.is_jain_friendly;
    return item.diet_type === p;
  });
}

interface Props {
  dietPrefs: string[];
  subPreferences: string[];
  allergenFoodIds: string[];
  onSubChange: (next: string[]) => void;
  onAllergensChange: (next: string[]) => void;
}

export default function AllergyAndSubPrefs({
  dietPrefs, subPreferences, allergenFoodIds, onSubChange, onAllergensChange,
}: Props) {
  const [items, setItems] = useState<FoodItemLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("food_items")
        .select("id,name,alt_name,diet_type,is_jain_friendly")
        .eq("is_active", true)
        .order("name");
      if (cancel) return;
      setItems(((data as any) || []) as FoodItemLite[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const eligible = useMemo(
    () => items.filter((it) => itemMatchesDietPrefs(it, dietPrefs)),
    [items, dietPrefs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter((it) =>
      it.name.toLowerCase().includes(q) || (it.alt_name || "").toLowerCase().includes(q));
  }, [eligible, search]);

  // Keep any allergen ids the user picked previously, even if their diet
  // filter now hides that item — otherwise we'd silently drop rules.
  const orphanAllergens = useMemo(() => {
    const eligibleIds = new Set(eligible.map((i) => i.id));
    return items.filter((it) => allergenFoodIds.includes(it.id) && !eligibleIds.has(it.id));
  }, [items, eligible, allergenFoodIds]);

  // Selected chips shown pinned at the top so users don't have to hunt through
  // the alphabetical list to see or remove picks.
  const selectedItems = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i] as const));
    return allergenFoodIds
      .map((id) => byId.get(id))
      .filter((it): it is FoodItemLite => Boolean(it));
  }, [items, allergenFoodIds]);


  const toggleAllergen = (id: string) => {
    if (allergenFoodIds.includes(id)) onAllergensChange(allergenFoodIds.filter((x) => x !== id));
    else onAllergensChange([...allergenFoodIds, id]);
  };

  const toggleSub = (key: string) => {
    if (subPreferences.includes(key)) onSubChange(subPreferences.filter((x) => x !== key));
    else onSubChange([...subPreferences, key]);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 break-words">Sub-preferences</p>
        <div className="flex flex-wrap gap-2">
          {SUB_PREFS.map(({ key, label, icon: Icon }) => {
            const active = subPreferences.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSub(key)}
                className={`px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-colors ${
                  active ? "bg-[var(--bbdo-blue)] text-white border-[var(--bbdo-blue)]" : "bg-muted text-muted-foreground border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          Foods that don't match are hidden across your library and plate builder.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 gap-3">
          <p className="text-xs font-bold tracking-wider uppercase text-muted-foreground break-words">Allergies · pick from foods</p>
          {allergenFoodIds.length > 0 && (
            <span className="text-[11px] font-bold text-[var(--bbdo-blue)]">{allergenFoodIds.length} selected</span>
          )}
        </div>

        {selectedItems.length > 0 && (
          <div className="mb-2 rounded-xl border border-[var(--bbdo-blue)]/30 bg-[var(--bbdo-blue)]/5 p-2">
            <p className="text-[11px] font-bold text-[var(--bbdo-blue)] mb-1.5 uppercase tracking-wider">
              Selected · tap × to remove
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedItems.map((it) => {
                const isOrphan = orphanAllergens.some((o) => o.id === it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggleAllergen(it.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold text-white flex items-center gap-1 ${
                      isOrphan ? "bg-amber-600" : "bg-[var(--bbdo-blue)]"
                    }`}
                  >
                    <span className="truncate max-w-[140px]">{it.name}</span>
                    <span aria-hidden>×</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="relative mb-2">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search foods…"
            className="w-full pl-9 pr-3 h-10 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--bbdo-blue)]/40"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>


            <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border bg-card">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">No foods match this search.</p>
              ) : (
                filtered.map((it) => {
                  const active = allergenFoodIds.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggleAllergen(it.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${active ? "bg-[var(--bbdo-blue)]/5" : ""}`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${active ? "bg-[var(--bbdo-blue)] border-[var(--bbdo-blue)]" : "border-border"}`}>
                        {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{it.name}</p>
                        {it.alt_name && <p className="text-[11px] text-muted-foreground truncate">{it.alt_name}</p>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
