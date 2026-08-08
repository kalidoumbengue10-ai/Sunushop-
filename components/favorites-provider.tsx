"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type FavoritesContextValue = {
  authenticated: boolean | null;
  merchantIds: Set<string>;
  isFollowing: (merchantId: string) => boolean;
  toggle: (merchantId: string) => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [merchantIds, setMerchantIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/client/shop-follows")
      .then((response) => {
        setAuthenticated(response.ok);
        return response.ok ? response.json() : null;
      })
      .then((payload) => {
        if (!payload?.data?.items) return;
        const items = payload.data.items as Array<{ merchant_id: string }>;
        setMerchantIds(new Set(items.map((item) => item.merchant_id)));
      })
      .catch(() => setAuthenticated(false));
  }, []);

  const isFollowing = useCallback((merchantId: string) => merchantIds.has(merchantId), [merchantIds]);

  const toggle = useCallback(async (merchantId: string) => {
    const following = merchantIds.has(merchantId);
    const response = await fetch("/api/client/shop-follows", {
      method: following ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchantId }),
    });
    if (!response.ok) return;
    setMerchantIds((current) => {
      const next = new Set(current);
      if (following) next.delete(merchantId); else next.add(merchantId);
      return next;
    });
  }, [merchantIds]);

  return (
    <FavoritesContext.Provider value={{ authenticated, merchantIds, isFollowing, toggle }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error("useFavorites doit être utilisé sous FavoritesProvider.");
  return context;
}
