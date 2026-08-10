"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";

type Delivery = { id: string; status: string; publicCode: string; delivered_at: string | null; pickupCode: string | null; pickup_snapshot: Record<string, unknown>; recipient: Record<string, unknown> | null; deliveryFeeXof?: number };
type Membership = { id: string; display_name: string; email: string | null; phone: string; vehicle_type: string | null; vehicle_registration: string | null; photoUrl: string | null; status: "active" | "inactive"; merchant_accounts: { public_name: string; slug: string } | Array<{ public_name: string; slug: string }> };
const terminalStatuses = ["delivered", "failed", "cancelled"];
const statusLabels: Record<string, string> = { assigned: "À accepter", accepted: "Acceptée", at_pickup: "Au commerce", picked_up: "Colis récupéré", in_transit: "En route", delivered: "Livrée", failed: "Échec", cancelled: "Annulée" };

export function CourierWorkspace() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [stats, setStats] = useState({ deliveredThisMonth: 0, deliveredTotal: 0, failedTotal: 0 });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/deliveries/mine", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message);
    setItems(payload.data.items); setMemberships(payload.data.memberships); setStats({ deliveredThisMonth: payload.data.deliveredThisMonth, deliveredTotal: payload.data.deliveredTotal, failedTotal: payload.data.failedTotal });
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) load().catch((caught: Error) => setError(caught.message)); });
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [load]);
  const membershipKey = memberships.map((membership) => membership.id).sort().join(",");
  useEffect(() => {
    if (!membershipKey) return;
    const supabase = getBrowserSupabase();
    const channel = supabase.channel(`courier-deliveries-${membershipKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `courier_membership_id=in.(${membershipKey})` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, membershipKey]);
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
  const verifyRecipient = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/deliveries/${id}/verify/recipient`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: form.get("code") }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Code refusé.");
    setMessage("Réception confirmée."); await load();
  };
  const deliveryCard = (delivery: Delivery) => <article className="courier-mission" key={delivery.id}>
    <header><div><small>Commande</small><h3>{delivery.publicCode}</h3></div><span className="mvp-status" data-status={delivery.status}>{statusLabels[delivery.status] ?? delivery.status}</span></header>
    <div className="courier-route"><p><span>Retrait</span><strong>{String(delivery.pickup_snapshot?.name ?? "Boutique")}</strong><small>{String(delivery.pickup_snapshot?.phone ?? "")}<br />{String(delivery.pickup_snapshot?.addressHint ?? delivery.pickup_snapshot?.city ?? "")}{delivery.pickup_snapshot?.hours ? <><br />{String(delivery.pickup_snapshot.hours)}</> : null}</small></p><i>→</i><p><span>Destination</span>{delivery.recipient ? <><strong>{String(delivery.recipient.name ?? "Client")}</strong><small>{String(delivery.recipient.phone ?? "")}<br />{String(delivery.recipient.city ?? "")}, {String(delivery.recipient.addressHint ?? "")}</small></> : <><strong>Livraison terminée</strong><small>Coordonnées personnelles masquées</small></>}</p></div>
    <div className="mvp-actions">
      {delivery.status === "assigned" && <button className="mvp-button" onClick={() => void transition(delivery.id, "accepted")}>Accepter la mission</button>}
      {delivery.status === "accepted" && <button className="mvp-button" onClick={() => void transition(delivery.id, "at_pickup")}>Je suis au commerce</button>}
      {delivery.status === "at_pickup" && delivery.pickupCode && <div className="courier-pickup-code"><small>Présentez ce code au commerçant</small><strong>{delivery.pickupCode}</strong><span>Le colis ne peut être remis qu’après sa validation.</span></div>}
      {delivery.status === "picked_up" && <button className="mvp-button" onClick={() => void transition(delivery.id, "in_transit")}>Démarrer le trajet</button>}
      {["picked_up", "in_transit"].includes(delivery.status) && <form className="courier-code-form" onSubmit={(event) => void verifyRecipient(event, delivery.id)}><label>Code donné par le client<input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" autoComplete="one-time-code" required /></label><button className="mvp-button">Confirmer la remise</button></form>}
      {["picked_up", "in_transit"].includes(delivery.status) && <button className="mvp-button mvp-button--danger" onClick={() => void transition(delivery.id, "failed")}>Signaler un échec</button>}
    </div>
  </article>;
  return <div className="courier-workspace">
    <section className="courier-hero"><div><span className="mvp-eyebrow">Espace marchand · Mes missions</span><h1>Mon activité de livraison</h1><p>Vous voyez uniquement vos propres missions. Les coordonnées client disparaissent dès la fin de la livraison.</p></div><div className="courier-month-stat"><strong>{stats.deliveredThisMonth}</strong><span>livraison{stats.deliveredThisMonth > 1 ? "s" : ""}<br />ce mois-ci</span></div></section>
    {message && <p className="mvp-alert" role="status">{message}</p>}{error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}
    <section className="merchant-kpi-grid"><article><span>Missions à faire</span><strong>{active.length}</strong></article><article><span>Total livré</span><strong>{stats.deliveredTotal}</strong></article><article><span>Échecs</span><strong>{stats.failedTotal}</strong></article></section>
    <section className="courier-shops"><h2>Mes profils boutique</h2><div>{memberships.map((membership) => { const shop = Array.isArray(membership.merchant_accounts) ? membership.merchant_accounts[0] : membership.merchant_accounts; return <article className="courier-shop-profile" key={membership.id}>{membership.photoUrl ? <Image unoptimized width={72} height={72} src={membership.photoUrl} alt="" /> : <div className="courier-profile__placeholder">{membership.display_name.slice(0, 1)}</div>}<div><b>{shop?.public_name ?? "Boutique"}</b><small>{membership.display_name} · {membership.phone}</small><small>{membership.vehicle_type ? `${membership.vehicle_type}${membership.vehicle_registration ? ` · ${membership.vehicle_registration}` : ""}` : "Véhicule non renseigné"}</small><small>{membership.status === "active" ? "Accès actif" : "Historique uniquement"}</small></div></article>; })}</div></section>
    <section><div className="marketplace-section-heading"><div><h2>Missions à faire</h2><p>Les changements envoyés par vos boutiques apparaissent automatiquement.</p></div><span>{active.length}</span></div><div className="courier-mission-grid">{active.map(deliveryCard)}</div>{!active.length && <p className="mvp-empty">Aucune mission active pour le moment.</p>}</section>
    {history.length > 0 && <section><div className="marketplace-section-heading"><div><h2>Historique</h2><p>Résultat, boutique et date sont conservés, sans adresse précise du client.</p></div></div><div className="courier-mission-grid courier-mission-grid--history">{history.map(deliveryCard)}</div></section>}
  </div>;
}
