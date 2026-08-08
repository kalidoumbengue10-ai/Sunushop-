"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";

export type AuthArea = "client" | "merchant" | "admin" | "courier";

type AuthStateContextValue = {
  authenticated: boolean | null;
  userId: string | null;
  area: AuthArea | null;
};

const AuthStateContext = createContext<AuthStateContextValue>({ authenticated: null, userId: null, area: null });

export function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthStateContextValue>({ authenticated: null, userId: null, area: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setState({ authenticated: false, userId: null, area: null });
          return;
        }
        const [{ data: adminRoles }, { data: merchantMemberships }, { data: courierMemberships }] = await Promise.all([
          supabase.from("admin_roles").select("role").eq("user_id", user.id).eq("active", true).limit(1),
          supabase.from("merchant_members").select("merchant_id").eq("user_id", user.id).eq("active", true).limit(1),
          supabase.from("courier_memberships").select("id").eq("courier_user_id", user.id).eq("active", true).limit(1),
        ]);
        const area: AuthArea = adminRoles?.length
          ? "admin"
          : merchantMemberships?.length
            ? "merchant"
            : courierMemberships?.length
              ? "courier"
              : "client";
        if (!cancelled) setState({ authenticated: true, userId: user.id, area });
      } catch {
        if (!cancelled) setState({ authenticated: false, userId: null, area: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return <AuthStateContext.Provider value={state}>{children}</AuthStateContext.Provider>;
}

export function useAuthState() {
  return useContext(AuthStateContext);
}
