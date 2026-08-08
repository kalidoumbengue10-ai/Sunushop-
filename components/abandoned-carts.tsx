"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/marketplace";
import type { CatalogItem } from "@/lib/domain/repositories";

type AbandonedCart = {
  id: string;
  updatedAt: string;
  items: Array<{ variant_id: string; quantity: number; product: CatalogItem | null }>;
};

export function AbandonedCarts() {
  const router = useRouter();
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/client/abandoned-carts")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => { if (payload?.data?.items) setCarts(payload.data.items); })
      .catch(() => undefined);
  }, []);

  const resume = async (cartId: string) => {
    setBusy(cartId);
    const response = await fetch("/api/client/abandoned-carts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cartId }),
    });
    setBusy(null);
    if (response.ok) {
      setCarts((current) => current.filter((cart) => cart.id !== cartId));
      router.push("/marche");
    }
  };

  if (!carts.length) return null;

  return (
    <section className="mvp-card">
      <h2>Paniers abandonnés</h2>
      <p className="mvp-lede">Ces articles vous attendent toujours.</p>
      <div className="mvp-list">
        {carts.map((cart) => (
          <div className="mvp-row" key={cart.id}>
            <div>
              <strong>{cart.items.length} article{cart.items.length > 1 ? "s" : ""}</strong>
              <small>
                {cart.items.map((item) => item.product?.title).filter(Boolean).join(", ")}
                {" · "}
                {formatPrice(cart.items.reduce((sum, item) => sum + (item.product?.variant.priceXof ?? 0) * item.quantity, 0))}
              </small>
            </div>
            <button className="mvp-button mvp-button--secondary" disabled={busy === cart.id} onClick={() => resume(cart.id)}>
              {busy === cart.id ? "Reprise…" : "Reprendre mon panier"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
