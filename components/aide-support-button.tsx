"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { merchantStatusLabel } from "@/lib/domain/merchant-ui";

type MerchantRef = { public_name: string; slug: string } | Array<{ public_name: string; slug: string }>;
type OrderOption = { id: string; public_code: string; status: string; created_at: string; merchant_accounts: MerchantRef };

function merchantName(value: MerchantRef) {
  const merchant = Array.isArray(value) ? value[0] : value;
  return merchant?.public_name ?? "Boutique";
}

export function AideSupportButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || ordersLoaded) return;
    fetch("/api/client/orders")
      .then(async (response) => {
        if (response.status === 401) return;
        const payload = await response.json();
        if (response.ok) setOrders(payload.data.items);
      })
      .finally(() => setOrdersLoaded(true));
  }, [open, ordersLoaded]);

  const openPicker = () => {
    setError("");
    setOpen(true);
  };

  const start = async (selectedOrderId: string) => {
    setBusy(true);
    setError("");
    try {
      const selected = orders.find((order) => order.id === selectedOrderId);
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "buyer_support",
          orderId: selectedOrderId || undefined,
          subject: selected ? `Commande ${selected.public_code}` : undefined,
        }),
      });
      if (response.status === 401) {
        router.push("/connexion?profil=client&next=/aide");
        return;
      }
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message ?? "Impossible d’ouvrir le support.");
        return;
      }
      router.push("/messages");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <>
        <button type="button" className="mvp-button" onClick={openPicker}>
          Discuter avec un admin SunuShop
        </button>
        {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      </>
    );
  }

  return (
    <div className="aide-support-picker">
      <label htmlFor="aide-support-order">
        Cette demande concerne-t-elle une commande précise ?
      </label>
      {!ordersLoaded && <p className="mvp-empty">Chargement de vos commandes…</p>}
      {ordersLoaded && (
        <select
          id="aide-support-order"
          value={orderId}
          onChange={(event) => setOrderId(event.target.value)}
        >
          <option value="">Autre demande (non liée à une commande)</option>
          {orders.map((order) => (
            <option value={order.id} key={order.id}>
              {order.public_code} · {merchantName(order.merchant_accounts)} · {merchantStatusLabel(order.status)} · {new Date(order.created_at).toLocaleDateString("fr-SN")}
            </option>
          ))}
        </select>
      )}
      <div className="mvp-actions">
        <button type="button" className="mvp-button" onClick={() => start(orderId)} disabled={busy || !ordersLoaded}>
          {busy ? "Ouverture…" : "Continuer"}
        </button>
        <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setOpen(false)} disabled={busy}>
          Annuler
        </button>
      </div>
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
    </div>
  );
}
