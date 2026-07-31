import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DietType {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  dot_color: string | null;
  display_order: number;
  is_active: boolean;
}

// Fallback used only until the backend responds — keeps first paint from flickering
// with the wrong set of options. Do NOT hardcode business logic against this.
const FALLBACK: DietType[] = [
  { id: "veg",        slug: "veg",        label: "Vegetarian",     description: null, dot_color: "bg-emerald-600", display_order: 10, is_active: true },
  { id: "vegan",      slug: "vegan",      label: "Vegan",          description: null, dot_color: "bg-emerald-500", display_order: 20, is_active: true },
  { id: "jain",       slug: "jain",       label: "Jain",           description: null, dot_color: "bg-amber-500",   display_order: 30, is_active: true },
  { id: "eggitarian", slug: "eggitarian", label: "Eggetarian",     description: null, dot_color: "bg-yellow-500",  display_order: 40, is_active: true },
  { id: "non_veg",    slug: "non_veg",    label: "Non-vegetarian", description: null, dot_color: "bg-rose-600",    display_order: 50, is_active: true },
];

export function useDietTypes(includeInactive = false) {
  const [types, setTypes] = useState<DietType[]>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data, error } = await supabase
        .from("diet_types" as any)
        .select("*")
        .order("display_order", { ascending: true });
      if (cancel) return;
      if (!error && data) {
        const rows = (data as any as DietType[]).filter(t => includeInactive || t.is_active);
        if (rows.length) setTypes(rows);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [includeInactive]);

  return { types, loading };
}
