"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";

type ShopRelationshipsContextValue = {
  authenticated: boolean | null;
  followedMerchantIds: Set<string>;
  favoriteMerchantIds: Set<string>;
  isFollowing: (merchantId: string) => boolean;
  isFavorite: (merchantId: string) => boolean;
  toggleFollow: (merchantId: string) => Promise<void>;
  toggleFavorite: (merchantId: string) => Promise<void>;
};

const ShopRelationshipsContext = createContext<ShopRelationshipsContextValue | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [followedMerchantIds, setFollowedMerchantIds] = useState<Set<string>>(new Set());
  const [favoriteMerchantIds, setFavoriteMerchantIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await getBrowserSupabase().auth.getUser();
      if (cancelled) return;
      if (!user) { setAuthenticated(false); return; }
      setAuthenticated(true);
      try {
        const [followResponse, favoriteResponse] = await Promise.all([fetch("/api/client/shop-follows"), fetch("/api/client/shop-favorites")]);
        if (!followResponse.ok || !favoriteResponse.ok) throw new Error("RELATIONSHIPS_LOAD_FAILED");
        const [followPayload, favoritePayload] = await Promise.all([followResponse.json(), favoriteResponse.json()]);
        if (cancelled) return;
        setFollowedMerchantIds(new Set((followPayload.data.items as Array<{ merchantId: string }>).map((item) => item.merchantId)));
        setFavoriteMerchantIds(new Set((favoritePayload.data.items as Array<{ merchantId: string }>).map((item) => item.merchantId)));
      } catch {
        if (!cancelled) setError("Vos suivis et favoris n’ont pas pu être chargés. Réessayez.");
      }
    })().catch(() => { if (!cancelled) { setAuthenticated(false); setError("Votre session n’a pas pu être vérifiée."); } });
    return () => { cancelled = true; };
  }, []);

  const toggleRelationship = useCallback(async (
    kind: "follow" | "favorite",
    merchantId: string,
  ) => {
    const current = kind === "follow" ? followedMerchantIds : favoriteMerchantIds;
    const setCurrent = kind === "follow" ? setFollowedMerchantIds : setFavoriteMerchantIds;
    const active = current.has(merchantId);
    setError("");
    setCurrent((value) => {
      const next = new Set(value);
      if (active) next.delete(merchantId); else next.add(merchantId);
      return next;
    });

    try {
      const response = await fetch(`/api/client/shop-${kind === "follow" ? "follows" : "favorites"}`, {
        method: active ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchantId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "La modification n’a pas pu être enregistrée.");
    } catch (caught) {
      setCurrent((value) => {
        const next = new Set(value);
        if (active) next.add(merchantId); else next.delete(merchantId);
        return next;
      });
      const message = caught instanceof Error ? caught.message : "La modification n’a pas pu être enregistrée.";
      setError(message);
      throw caught;
    }
  }, [favoriteMerchantIds, followedMerchantIds]);

  const isFollowing = useCallback((merchantId: string) => followedMerchantIds.has(merchantId), [followedMerchantIds]);
  const isFavorite = useCallback((merchantId: string) => favoriteMerchantIds.has(merchantId), [favoriteMerchantIds]);
  const toggleFollow = useCallback((merchantId: string) => toggleRelationship("follow", merchantId), [toggleRelationship]);
  const toggleFavorite = useCallback((merchantId: string) => toggleRelationship("favorite", merchantId), [toggleRelationship]);

  return (
    <ShopRelationshipsContext.Provider value={{
      authenticated,
      followedMerchantIds,
      favoriteMerchantIds,
      isFollowing,
      isFavorite,
      toggleFollow,
      toggleFavorite,
    }}>
      {children}
      {error && <div className="shop-relationship-toast" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Fermer">×</button></div>}
    </ShopRelationshipsContext.Provider>
  );
}

export function useShopRelationships() {
  const context = useContext(ShopRelationshipsContext);
  if (!context) throw new Error("useFavorites doit être utilisé sous FavoritesProvider.");
  return context;
}
