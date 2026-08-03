"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Delivery = {
  id: string; status: string; publicCode: string; delivered_at: string | null;
  pickup_snapshot: Record<string, unknown>; recipient: Record<string, unknown>;
};

export function CourierWorkspace() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/deliveries/mine");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message);
    setItems(payload.data.items); setCount(payload.data.deliveredThisMonth);
  }, []);
  useEffect(() => {
    // Chargement réseau initial uniquement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);

  const transition = async (id: string, status: string) => {
    const note = status === "failed" ? window.prompt("Raison de l’échec") : undefined;
    if (status === "failed" && !note) return;
    const response = await fetch(`/api/deliveries/${id}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, note }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Action impossible.");
    setMessage("Livraison mise à jour."); await load();
  };
  const verify = async (event: FormEvent<HTMLFormElement>, id: string, stage: string) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/deliveries/${id}/verify/${stage}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: form.get("code") }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Code refusé.");
    setMessage(stage === "pickup" ? "Retrait confirmé." : "Réception confirmée."); await load();
  };
  return (
    <div className="mvp-grid">
      <section className="mvp-card mvp-card--full"><span className="mvp-eyebrow">Espace marchand · accès livreur</span><h1 className="mvp-title">Mes livraisons</h1><p className="mvp-lede">{count} livraison(s) terminée(s) ce mois-ci.</p>{message && <p className="mvp-alert">{message}</p>}{error && <p className="mvp-alert mvp-alert--error">{error}</p>}</section>
      {items.map((delivery) => <section className="mvp-card" key={delivery.id}>
        <span className="mvp-status" data-status={delivery.status}>{delivery.status}</span><h2>{delivery.publicCode}</h2>
        <p><strong>Retrait</strong><br />{String(delivery.pickup_snapshot?.name ?? "Boutique")} · {String(delivery.pickup_snapshot?.city ?? "")}</p>
        {delivery.recipient && <p><strong>À livrer</strong><br />{String(delivery.recipient.name ?? "")} · {String(delivery.recipient.phone ?? "")}<br />{String(delivery.recipient.addressHint ?? "")}</p>}
        <div className="mvp-actions">
          {delivery.status === "assigned" && <button className="mvp-button" onClick={() => transition(delivery.id, "accepted")}>Accepter</button>}
          {delivery.status === "accepted" && <button className="mvp-button" onClick={() => transition(delivery.id, "at_pickup")}>Arrivé au commerce</button>}
          {delivery.status === "at_pickup" && <form className="mvp-actions" onSubmit={(event) => verify(event, delivery.id, "pickup")}><input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="Code retrait" required /><button className="mvp-button">Valider le retrait</button></form>}
          {delivery.status === "picked_up" && <button className="mvp-button" onClick={() => transition(delivery.id, "in_transit")}>En route</button>}
          {["picked_up", "in_transit"].includes(delivery.status) && <form className="mvp-actions" onSubmit={(event) => verify(event, delivery.id, "recipient")}><input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="Code client" required /><button className="mvp-button">Confirmer la remise</button></form>}
          {["picked_up", "in_transit"].includes(delivery.status) && <button className="mvp-button mvp-button--danger" onClick={() => transition(delivery.id, "failed")}>Signaler un échec</button>}
        </div>
      </section>)}
      {!items.length && <section className="mvp-card mvp-card--full"><p className="mvp-empty">Aucune livraison ne vous est affectée.</p></section>}
    </div>
  );
}
