import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RbacAction } from "@/lib/rbacModules";
import type { PermissionRow } from "@/lib/rbacService";
import { cachePackageKey } from "@/components/support/ExpertConnectBar";

interface Cache {
  isAdmin: boolean;
  isCoach: boolean;
  isChannelPartner: boolean;
  packageKey: string | null;
  perms: PermissionRow[];
}

/**
 * Tab → RBAC module mapping. Used by `canSeeTab` to gate the user dashboard
 * sidebar / bottom-nav per package.
 */
const TAB_TO_MODULE: Record<string, string> = {
  home: "overview",
  diet: "diet",
  supplements: "supplements",
  fasting: "fasting",
  habits: "movement",
  labs: "lab_tests",
  videos: "exercises",
  exercise: "exercise",
  community: "community",
  consult: "coaches",
};

export function useRbac() {
  const { user } = useAuth();
  const [cache, setCache] = useState<Cache>({
    isAdmin: false,
    isCoach: false,
    isChannelPartner: false,
    packageKey: null,
    perms: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setCache({ isAdmin: false, isCoach: false, isChannelPartner: false, packageKey: null, perms: [] });
        setLoading(false);
        return;
      }
      const { data: roles } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const roleList: string[] = (roles ?? []).map((r: any) => r.role);
      const isAdmin = roleList.includes("admin");
      const isCoach = roleList.includes("coach");
      const isChannelPartner = roleList.includes("channel_partner");

      if (isAdmin) {
        if (!cancelled) {
          setCache({ isAdmin: true, isCoach, isChannelPartner, packageKey: null, perms: [] });
          setLoading(false);
        }
        return;
      }

      // Resolve current package_key (for non-admin/non-coach plan users)
      let packageKey: string | null = null;
      if (!isCoach && !isChannelPartner) {
        const { data: pkgKey } = await (supabase as any).rpc(
          "current_user_package_key",
          { _user_id: user.id }
        );
        packageKey = (pkgKey as string | null) ?? null;
      }

      const queries: Promise<any>[] = [];
      if (isCoach) {
        queries.push(
          (supabase as any)
            .from("rbac_permissions")
            .select("*")
            .eq("role", "coach")
            .is("package_key", null)
        );
      }
      if (isChannelPartner) {
        queries.push(
          (supabase as any)
            .from("rbac_permissions")
            .select("*")
            .eq("role", "channel_partner")
            .is("package_key", null)
        );
      }
      if (packageKey) {
        queries.push(
          (supabase as any)
            .from("rbac_permissions")
            .select("*")
            .eq("role", "user")
            .eq("package_key", packageKey)
        );
      }

      let perms: PermissionRow[] = [];
      if (queries.length > 0) {
        const results = await Promise.all(queries);
        for (const r of results) {
          perms = perms.concat((r?.data ?? []) as PermissionRow[]);
        }
      }

      if (!cancelled) {
        cachePackageKey(packageKey);
        setCache({ isAdmin: false, isCoach, isChannelPartner, packageKey, perms });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const can = useCallback(
    (module: string, subModule: string | null, action: RbacAction): boolean => {
      if (cache.isAdmin) return true;
      return cache.perms.some(
        (p) =>
          p.module === module &&
          (p.sub_module ?? null) === (subModule ?? null) &&
          ((action === "view" && p.can_view) ||
            (action === "edit" && p.can_edit) ||
            (action === "delete" && p.can_delete))
      );
    },
    [cache]
  );

  /** Module-level "any sub" view check — for dashboard tab gating. */
  const canViewModule = useCallback(
    (module: string): boolean => {
      if (cache.isAdmin) return true;
      return cache.perms.some((p) => p.module === module && p.can_view);
    },
    [cache]
  );

  const canSeeTab = useCallback(
    (tab: string): boolean => {
      if (cache.isAdmin) return true;
      // Foundation package has no coach → no Consult tab
      if (tab === "consult" && !cache.isCoach && cache.packageKey === "foundation") return false;
      // While loading or before any perms resolved, allow common tabs (no flicker)
      if (loading) return true;
      // Standard users without an active package must not see paid app tabs.
      if (!cache.packageKey && !cache.isCoach && !cache.isChannelPartner) {
        return false;
      }
      const mod = TAB_TO_MODULE[tab];
      if (!mod) return true; // unknown tab → don't hide
      return cache.perms.some((p) => p.module === mod && p.can_view);
    },
    [cache, loading]
  );

  return {
    can,
    canViewModule,
    canSeeTab,
    loading,
    isAdmin: cache.isAdmin,
    isCoach: cache.isCoach,
    isChannelPartner: cache.isChannelPartner,
    packageKey: cache.packageKey,
  };
}
