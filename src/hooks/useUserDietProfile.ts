import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadDietProfile } from "@/lib/dietProfileService";

export interface UserDietProfileState {
  dietPreferences: string[];
  subPreferences: string[];
  allergenFoodIds: string[];
  loading: boolean;
}

/**
 * Live-syncing view of user_diet_profiles for the given user id.
 * Consumers use this to filter food libraries by allergies + sub-preferences.
 */
export function useUserDietProfile(userId: string | null | undefined): UserDietProfileState {
  const [state, setState] = useState<UserDietProfileState>({
    dietPreferences: [],
    subPreferences: [],
    allergenFoodIds: [],
    loading: !!userId,
  });

  useEffect(() => {
    if (!userId) {
      setState({ dietPreferences: [], subPreferences: [], allergenFoodIds: [], loading: false });
      return;
    }
    let cancelled = false;

    const apply = (row: any) => {
      if (cancelled) return;
      setState({
        dietPreferences: (row?.diet_preferences as string[] | null) || (row?.diet_preference ? [row.diet_preference] : []),
        subPreferences: (row?.sub_preferences as string[] | null) || [],
        allergenFoodIds: (row?.allergen_food_ids as string[] | null) || [],
        loading: false,
      });
    };

    loadDietProfile(userId).then(apply);

    const channel = supabase
      .channel(`user-diet-profile-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_diet_profiles", filter: `user_id=eq.${userId}` },
        (payload) => apply(payload.new ?? payload.old ?? {}),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return state;
}

/** True when an item should be hidden for the given diet-profile constraints. */
export function isFoodBlockedByDietProfile(
  item: { id: string; is_dairy_free?: boolean | null; is_gluten_free?: boolean | null },
  subPreferences: string[],
  allergenFoodIds: string[],
): boolean {
  if (allergenFoodIds.includes(item.id)) return true;
  if (subPreferences.includes("gluten_free") && item.is_gluten_free === false) return true;
  if (subPreferences.includes("dairy_free") && item.is_dairy_free === false) return true;
  return false;
}
