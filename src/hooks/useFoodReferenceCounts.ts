import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dietAllowsItem } from "@/components/diet/dietTypes";

function normalizePref(p: string | null | undefined): string | null {
  const v = (p || "").toLowerCase().replace(/[-\s]/g, "_");
  if (!v) return null;
  if (v === "vegetarian") return "veg";
  if (v === "nonveg" || v === "non_vegetarian") return "non_veg";
  return v;
}

/**
 * Live counts for the Quick Food Reference tile.
 * Counts only the categories (filters) and food items the current user can actually
 * see, given their saved diet preference. Re-computes on any admin change to
 * food_items / food_filters and on diet-preference changes — no app release needed.
 */
export function useFoodReferenceCounts(userId?: string | null) {
  const [counts, setCounts] = useState<{ categories: number; foods: number } | null>(null);

  const load = useCallback(async () => {
    const [dietRes, filtersRes, itemsRes] = await Promise.all([
      userId
        ? supabase
            .from("user_diet_profiles")
            .select("diet_preference, diet_preferences")
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabase.from("food_filters").select("id").eq("is_active", true),
      supabase.from("food_items").select("filter_id, diet_type, is_jain_friendly").eq("is_active", true),
    ]);

    const arr = ((dietRes as any)?.data?.diet_preferences as string[] | null) || [];
    const pref =
      normalizePref(arr[0]) ??
      normalizePref((dietRes as any)?.data?.diet_preference as string) ??
      null;

    const activeFilterIds = new Set(((filtersRes.data as any[]) || []).map((f) => f.id));
    const items = ((itemsRes.data as any[]) || []).filter(
      (it) => (!it.filter_id || activeFilterIds.has(it.filter_id)) && dietAllowsItem(pref ? [pref] : [], it),
    );

    const cats = new Set(items.map((it) => it.filter_id).filter(Boolean));
    setCounts({ categories: cats.size, foods: items.length });
  }, [userId]);

  useEffect(() => {
    void load();
    // Food catalog is static reference data — refresh on foreground instead of
    // keeping a realtime subscription open per client.
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    const channel = supabase
      .channel(`food-ref-counts-${userId || "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_diet_profiles" }, () => void load())
      .subscribe();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [load, userId]);


  return counts;
}
