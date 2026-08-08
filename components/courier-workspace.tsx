"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";

type Delivery = { id: string; status: string; publicCode: string; delivered_at: string | null; pickup_snapshot: Record<string, unknown>; recipient: Record<string, unknown> | null; deliveryFeeXof?: number };
type Membership = { id: string; status: "active" | "inactive"; merchant_accounts: { public_name: string; slug: string } | Array<{ public_name: string; slug: string }> };
const terminalStatuses = ["delivered", "failed", "cancelled"];

export function CourierWorkspace() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/deliveries/mine", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message);
    setItems(payload.data.items); setMemberships(payload.data.memberships); setCount(payload.data.deliveredThisMonth);
  }, []);
  useEffect(() => {
    // Chargement réseau initial, puis abonnement aux mises à jour.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((caught: Error) => setError(caught.message));
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") load().catch(() => undefined); }, 30_000);
    let channel: ReturnType<ReturnType<typeof getBrowserSupabase>["channel"]> | undefined;
    try {
      const supabase = getBrowserSupabase();
      const membershipIds = memberships.map((membership) => membership.id);
      // Filtré sur les missions du livreur : sans ce filtre, chaque changement de
      // livraison (toutes boutiques confondues) réveillait tous les livreurs connectés.
      if (membershipIds.length) {
        channel = supabase.channel("courier-deliveries")
          .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `courier_membership_id=in.(${membershipIds.join(",")})` }, () => { load().catch(() => undefined); })
          .subscribe();
      }
    } catch { /* Le rafraîchissement périodique reste actif. */ }
    return () => { window.clearInterval(interval); if (channel) channel.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, memberships.length]);
  const active = useMemo(() => items.filter((item) => !terminalStatuses.includes(item.status)), [items]);
  const history = useMemo(() => items.filter((item) => terminalStatuses.includes(item.status)), [items]);

  const transition = async (id: string, status: string) => {
    const note = status === "failed" ? window.prompt("Décrivez la raison de l’échec") : undefined;
    if (status === "failed" && !note) return;
    setError("");
    const response = await fetch(`/api/deliveries/${id}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, note }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Action impossible.");
    setMessage("Livraison mise à jour."); await load();
  };
  const verify = async (event: FormEvent<HTMLFormElement>, id: string, stage: string) => {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/deliveries/${id}/verify/${stage}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: form.get("code") }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Code refusé.");
    setMessage(stage === "pickup" ? "Retrait confirmé." : "Réception confirmée."); await load();
  };
  const deliveryCard = (delivery: Delivery) => <article className="courier-mission" key={delivery.id}>
    <header><div><small>Commande</small><h3>{delivery.publicCode}</h3></div><span className="mvp-status" data-status={delivery.status}>{delivery.status.replaceAll("_", " ")}</span></header>
    <div className="courier-route"><p><span>Retrait</span><strong>{String(delivery.pickup_snapshot?.name ?? "Boutique")}</strong><small>{String(delivery.pickup_snapshot?.city ?? "")}</small></p><i>→</i><p><span>Destination</span>{delivery.recipient ? <><strong>{String(delivery.recipient.name ?? "Client")}</strong><small>{String(delivery.recipient.phone ?? "")}<br />{String(delivery.recipient.addressHint ?? "")}</small></> : <><strong>Livraison terminée</strong><small>Coordonnées personnelles masquées</small></>}</p></div>
    <div className="mvp-actions">
      {delivery.status === "assigned" && <button className="mvp-button" onClick={() => transition(delivery.id, "accepted")}>Accepter la mission</button>}
      {delivery.status === "accepted" && <button className="mvp-button" onClick={() => transition(delivery.id, "at_pickup")}>Je suis au commerce</button>}
      {delivery.status === "at_pickup" && <form className="courier-code-form" onSubmit={(event) => verify(event, delivery.id, "pickup")}><label>Code donné par le commerçant<input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" autoComplete="one-time-code" required /></label><button className="mvp-button">Valider le retrait</button></form>}
      {delivery.status === "picked_up" && <button className="mvp-button" onClick={() => transition(delivery.id, "in_transit")}>Démarrer le trajet</button>}
      {["picked_up", "in_transit"].includes(delivery.status) && <form className="courier-code-form" onSubmit={(event) => verify(event, delivery.id, "recipient")}><label>Code donné par le client<input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" autoComplete="one-time-code" required /></label><button className="mvp-button">Confirmer la remise</button></form>}
      {["picked_up", "in_transit"].includes(delivery.status) && <button className="mvp-button mvp-button--danger" onClick={() => transition(delivery.id, "failed")}>Signaler un échec</button>}
    </div>
  </article>;
  return <div className="courier-workspace">
    <section className="courier-hero"><div><span className="mvp-eyebrow">Espace marchand · accès livreur</span><h1>Mes missions de livraison</h1><p>Vous voyez uniquement vos propres missions. Les coordonnées client disparaissent dès la fin de la livraison.</p></div><div className="courier-month-stat"><strong>{count}</strong><span>livraison{count > 1 ? "s" : ""}<br />ce mois-ci</span></div></section>
    {message && <p className="mvp-alert" role="status">{message}</p>}{error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}
    <section className="courier-shops"><h2>Mes boutiques</h2><div>{memberships.map((membership) => { const shop = Array.isArray(membership.merchant_accounts) ? membership.merchant_accounts[0] : membership.merchant_accounts; return <span key={membership.id}><b>{shop?.public_name ?? "Boutique"}</b><small>{membership.status === "active" ? "Accès actif" : "Historique uniquement"}</small></span>; })}</div></section>
    <section><div className="marketplace-section-heading"><div><h2>Missions à faire</h2><p>Les changements envoyés par vos boutiques apparaissent automatiquement.</p></div><span>{active.length}</span></div><div className="courier-mission-grid">{active.map(deliveryCard)}</div>{!active.length && <p className="mvp-empty">Aucune mission active pour le moment.</p>}</section>
    {history.length > 0 && <section><div className="marketplace-section-heading"><div><h2>Historique</h2><p>Résultat, boutique et date sont conservés, sans adresse précise du client.</p></div></div><div className="courier-mission-grid courier-mission-grid--history">{history.map(deliveryCard)}</div></section>}
  </div>;
}
