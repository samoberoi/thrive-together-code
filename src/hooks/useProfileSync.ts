import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchProfile, loadProfileToLocal, syncLocalToBackend } from "@/lib/profileService";
import { ensureCacheOwner } from "@/lib/userStore";
import { backfillFromProfile } from "@/lib/healthLogsService";

/**
 * Hook that syncs localStorage user data to the backend.
 * On mount (session restore), fetches the backend profile so avatar etc. are available.
 * Then listens for local changes and pushes them to the backend (debounced).
 */
export function useProfileSync() {
  const { user } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const fetchedUserId = useRef<string | null>(null);

  // On login / session restore, pull backend profile into localStorage
  useEffect(() => {
    if (!user) {
      fetchedUserId.current = null;
      return;
    }
    if (fetchedUserId.current === user.id) return;
    fetchedUserId.current = user.id;

    // Drop any cache left behind by another account on this device before we
    // read or push anything (prevents old test-patient names resurfacing).
    ensureCacheOwner(user.id);

    fetchProfile(user.id).then((profile) => {
      if (profile) {
        loadProfileToLocal(profile);
      }
      // Backfill initial health logs for existing users
      backfillFromProfile(user.id);
    }).catch(console.error);
  }, [user]);

  // Push local changes to backend (debounced)
  useEffect(() => {
    if (!user) return;

    const handleUpdate = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        syncLocalToBackend(user.id).catch(console.error);
      }, 1500);
    };

    window.addEventListener("bb_user_updated", handleUpdate);
    return () => {
      window.removeEventListener("bb_user_updated", handleUpdate);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user]);
}
