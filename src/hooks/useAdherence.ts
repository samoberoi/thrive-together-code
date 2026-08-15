import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchDailyAdherence, type AdherenceSummary } from "@/lib/adherenceService";

/** Today's on-track status for a list of users, fetched in one batch. */
export function useAdherence(userIds: string[]) {
  const key = useMemo(() => Array.from(new Set(userIds.filter(Boolean))).sort().join(","), [userIds]);
  const [map, setMap] = useState<Map<string, AdherenceSummary>>(new Map());
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) { setMap(new Map()); return; }
    const mine = ++seq.current;
    setLoading(true);
    try {
      const result = await fetchDailyAdherence(ids);
      if (mine === seq.current) setMap(result);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => { void load(); }, [load]);

  return { map, loading, refresh: load };
}
