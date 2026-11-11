"use client";

import { useEffect, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";

/**
 * Whether the signed-in user holds the super_admin role in tenant_users.
 * This is a UI convenience gate only -- the manage-tenants edge function and
 * the underlying RLS policies independently re-check this server-side, so
 * hiding the tab here is not the security boundary.
 */
export function useIsSuperAdmin() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  // Nothing to look up without a database.
  const [loading, setLoading] = useState(isConfigured);

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("tenant_users")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setIsSuperAdmin(Boolean(data));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isSuperAdmin, loading };
}
