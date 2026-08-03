"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Courier = { id: string; display_name: string; phone: string; status: string };
type Delivery = {
  id: string; status: string; pickupCode: string | null;
  courier_memberships: Courier | Courier[];
  orders: { public_code: string; status: string } | Array<{ public_code: string; status: string }>;
};

export function CourierManager({
  merchantId,
  orders,
}: {
  merchantId: string;
  orders: Array<{ id: string; public_code: string; status: string }>;
}) {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [courierResponse, deliveryResponse] = await Promise.all([
      fetch(`/api/merchant/couriers?merchantId=${merchantId}`),
      fetch(`/api/merchant/deliveries?merchantId=${merchantId}`),
    ]);
    const [courierPayload, deliveryPayload] = await Promise.all([courierResponse.json(), deliveryResponse.json()]);
    if (!courierResponse.ok) throw new Error(courierPayload.error?.message);
    if (!deliveryResponse.ok) throw new Error(deliveryPayload.error?.message);
    setCouriers(courierPayload.data.items);
    setDeliveries(deliveryPayload.data.items);
  }, [merchantId]);

  useEffect(() => {
    // Chargement réseau initial uniquement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/merchant/couriers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchantId, email: form.get("email"), displayName: form.get("displayName"), phone: form.get("phone") }),
    });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Invitation impossible.");
    setMessage("Invitation livreur envoyée par email."); event.currentTarget.reset(); await load();
  };

  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/merchant/deliveries", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: form.get("orderId"), courierMembershipId: form.get("courierMembershipId") }),
    });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Affectation impossible.");
    setMessage(`Livraison affectée. Code de retrait : ${payload.data.pickupCode}`); await load();
  };

  const one = <T,>(value: T | T[]) => Array.isArray(value) ? value[0] : value;
  return (
    <div className="mvp-grid">
      <section className="mvp-card">
        <h2>Inviter un livreur</h2>
        {message && <p className="mvp-alert">{message}</p>}
        {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
        <form className="mvp-form" onSubmit={invite}>
          <label className="mvp-field">Nom complet<input name="displayName" required /></label>
          <label className="mvp-field">Email<input name="email" type="email" required /></label>
          <label className="mvp-field">Téléphone<input name="phone" required /></label>
          <button className="mvp-button" disabled={busy}>Envoyer l’invitation</button>
        </form>
        <div className="mvp-list">{couriers.map((courier) => <div className="mvp-row" key={courier.id}><div><strong>{courier.display_name}</strong><small>{courier.phone}</small></div><span className="mvp-status" data-status={courier.status}>{courier.status}</span></div>)}</div>
      </section>
      <section className="mvp-card">
        <h2>Affecter une commande prête</h2>
        <form className="mvp-form" onSubmit={assign}>
          <label className="mvp-field">Commande<select name="orderId" required><option value="">Choisir</option>{orders.filter((order) => order.status === "ready_for_handoff").map((order) => <option value={order.id} key={order.id}>{order.public_code}</option>)}</select></label>
          <label className="mvp-field">Livreur<select name="courierMembershipId" required><option value="">Choisir</option>{couriers.filter((courier) => courier.status === "active").map((courier) => <option value={courier.id} key={courier.id}>{courier.display_name}</option>)}</select></label>
          <button className="mvp-button" disabled={busy}>Affecter</button>
        </form>
      </section>
      <section className="mvp-card mvp-card--full">
        <h2>Livraisons de la boutique</h2>
        <div className="mvp-list">{deliveries.map((delivery) => <div className="mvp-row" key={delivery.id}><div><strong>{one(delivery.orders)?.public_code}</strong><small>{one(delivery.courier_memberships)?.display_name}</small></div><div><span className="mvp-status" data-status={delivery.status}>{delivery.status}</span>{delivery.pickupCode && <div className="mvp-code">Retrait : {delivery.pickupCode}</div>}</div></div>)}</div>
      </section>
    </div>
  );
}
