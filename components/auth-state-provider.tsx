"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";

type AuthStateContextValue = { authenticated: boolean | null; userId: string | null };

const AuthStateContext = createContext<AuthStateContextValue>({ authenticated: null, userId: null });

export function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthStateContextValue>({ authenticated: null, userId: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!cancelled) setState({ authenticated: Boolean(user), userId: user?.id ?? null });
      } catch {
        if (!cancelled) setState({ authenticated: false, userId: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return <AuthStateContext.Provider value={state}>{children}</AuthStateContext.Provider>;
}

export function useAuthState() {
  return useContext(AuthStateContext);
}
