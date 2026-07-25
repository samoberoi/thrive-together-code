import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BmiCategory {
  id: string;
  code: string;
  label: string;
  min_value: number | null;
  max_value: number | null;
  color: string | null;
  sort_order: number;
  description: string | null;
}

export function categorizeBmi(bmi: number | null, cats: BmiCategory[]): BmiCategory | null {
  if (bmi == null || !isFinite(bmi) || !cats.length) return null;
  for (const c of cats) {
    const min = c.min_value ?? -Infinity;
    const max = c.max_value ?? Infinity;
    if (bmi >= Number(min) && bmi < Number(max)) return c;
  }
  return cats[cats.length - 1] ?? null;
}

export function useBmiCategories() {
  const [categories, setCategories] = useState<BmiCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("bmi_categories" as any)
      .select("*")
      .order("sort_order", { ascending: true });
    if (!error && data) setCategories(data as unknown as BmiCategory[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { categories, loading, reload: load };
}
