"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import posthog from "posthog-js";
import type { CatalogItem } from "@/lib/domain/repositories";
import {
  addCartLine,
  CART_STORAGE_KEY,
  cartItemCount,
  cartSubtotal,
  isCartLine,
  mergeCarts,
  setCartLineQuantity,
  type CartLine,
} from "@/lib/domain/cart";

type CartContextValue = {
  lines: CartLine[];
  ready: boolean;
  itemCount: number;
  subtotalXof: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (product: CatalogItem, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => Promise<void>;
  merge: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [serverCartAvailable, setServerCartAvailable] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const fetchAndMergeWithServer = useCallback(async (local: CartLine[]) => {
    const response = await fetch("/api/client/cart");
    const payload = response.ok ? await response.json() : null;
    const remote = ((payload?.data?.items ?? []) as Array<{ quantity: number; product?: CatalogItem }>)
      .filter((item) => item.product)
      .map((item) => ({ product: item.product!, quantity: item.quantity }));
    const merged = mergeCarts(local, remote);
    setLines(merged);
    setServerCartAvailable(Boolean(payload));
    if (payload) {
      await Promise.all(merged.map((line) => fetch("/api/client/cart", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId: line.product.variant.id, quantity: line.quantity }),
      })));
    }
    return merged;
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      let local: CartLine[] = [];
      try {
        const saved = localStorage.getItem(CART_STORAGE_KEY);
        const parsed = saved ? JSON.parse(saved) : [];
        if (Array.isArray(parsed)) local = parsed.filter(isCartLine);
      } catch {
        localStorage.removeItem(CART_STORAGE_KEY);
      }
      try {
        await fetchAndMergeWithServer(local);
      } catch {
        if (!cancelled) setLines(local);
      } finally {
        if (!cancelled) setReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [fetchAndMergeWithServer]);

  useEffect(() => {
    if (ready) localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  }, [lines, ready]);

  const sync = useCallback(async (variantId: string, quantity: number) => {
    if (!serverCartAvailable) return;
    const response = await fetch("/api/client/cart", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variantId, quantity }),
    });
    if (!response.ok) throw new Error("Le panier n’a pas pu être synchronisé.");
  }, [serverCartAvailable]);

  const value = useMemo<CartContextValue>(() => ({
    lines,
    ready,
    itemCount: cartItemCount(lines),
    subtotalXof: cartSubtotal(lines),
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    add(product, quantity = 1) {
      setLines((current) => {
        const updated = addCartLine(current, product, quantity);
        const line = updated.find((entry) => entry.product.variant.id === product.variant.id);
        if (line) void sync(product.variant.id, line.quantity).catch(() => undefined);
        return updated;
      });
      posthog.capture("product_added_to_cart", {
        product_id: product.id,
        variant_id: product.variant.id,
        merchant_id: product.merchant.id,
        price_xof: product.variant.priceXof,
        quantity,
      });
    },
    setQuantity(variantId, quantity) {
      setLines((current) => setCartLineQuantity(current, variantId, quantity));
      void sync(variantId, Math.max(0, quantity)).catch(() => undefined);
    },
    remove(variantId) {
      setLines((current) => current.filter((line) => line.product.variant.id !== variantId));
      void sync(variantId, 0).catch(() => undefined);
    },
    async clear() {
      const ids = lines.map((line) => line.product.variant.id);
      setLines([]);
      await Promise.all(ids.map((id) => sync(id, 0)));
    },
    async merge() {
      await fetchAndMergeWithServer(lines);
    },
  }), [lines, ready, isOpen, sync, fetchAndMergeWithServer]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart doit être utilisé dans CartProvider.");
  return value;
}
