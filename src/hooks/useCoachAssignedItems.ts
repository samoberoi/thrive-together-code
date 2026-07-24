import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMyAssignedItems, type AssignmentModule } from "@/lib/coachVideoAssignmentService";

/**
 * For coach-managed packages (active / intensive), returns the item_keys the coach has
 * assigned to this user. Foundation users (no coach) should NOT consume this — they see
 * everything unfiltered.
 *
 * `enabled` lets callers skip the query when the user isn't coach-managed.
 */
export function useCoachAssignedItems(module: AssignmentModule, enabled: boolean) {
  const { user } = useAuth();
  const [items, setItems] = useState<string[] | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);

  useEffect(() => {
    if (!enabled || !user) {
      setItems(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMyAssignedItems(user.id, module)
      .then((keys) => {
        if (!cancelled) setItems(keys);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, module, enabled]);

  return { items, loading };
}
