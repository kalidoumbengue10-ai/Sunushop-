"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/marketplace";

type Address = { id: string; label: string; recipient_name: string; phone: string; region: string; city: string; address_hint: string; is_default: boolean };
type Order = { id: string; public_code: string; status: string; total_xof: number; created_at: string; merchant_accounts: { public_name: string } | Array<{ public_name: string }> };

export function ClientWorkspace() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [addressResponse, orderResponse] = await Promise.all([fetch("/api/client/addresses"), fetch("/api/client/orders")]);
    const [addressPayload, orderPayload] = await Promise.all([addressResponse.json(), orderResponse.json()]);
    if (!addressResponse.ok) throw new Error(addressPayload.error?.message);
    if (!orderResponse.ok) throw new Error(orderPayload.error?.message);
    setAddresses(addressPayload.data.items); setOrders(orderPayload.data.items);
  }, []);
  useEffect(() => {
    // Chargement réseau initial uniquement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);
  const saveAddress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/client/addresses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      label: form.get("label"), recipientName: form.get("recipientName"), phone: form.get("phone"), region: form.get("region"), city: form.get("city"), addressHint: form.get("addressHint"), isDefault: form.get("isDefault") === "on",
    }) });
    const payload = await response.json(); if (!response.ok) return setError(payload.error?.message ?? "Adresse non enregistrée.");
    setMessage("Adresse enregistrée."); event.currentTarget.reset(); await load();
  };
  const archive = async (id: string) => {
    const response = await fetch("/api/client/addresses", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, archive: true }) });
    if (!response.ok) return setError("Adresse non supprimée."); await load();
  };
  const one = <T,>(value: T | T[]) => Array.isArray(value) ? value[0] : value;
  return <div className="mvp-grid">
    <section className="mvp-card mvp-card--full"><span className="mvp-eyebrow">Espace client</span><h1 className="mvp-title">Achats, adresses et suivi</h1><div className="mvp-actions"><Link className="mvp-button" href="/marche">Ouvrir mon panier</Link></div>{message && <p className="mvp-alert">{message}</p>}{error && <p className="mvp-alert mvp-alert--error">{error}</p>}</section>
    <section className="mvp-card"><h2>Mes adresses</h2><div className="mvp-list">{addresses.map((address) => <div className="mvp-row" key={address.id}><div><strong>{address.label}{address.is_default ? " · par défaut" : ""}</strong><small>{address.recipient_name} · {address.phone}<br />{address.city}, {address.address_hint}</small></div><button className="mvp-button mvp-button--secondary" onClick={() => archive(address.id)}>Retirer</button></div>)}</div>
      <form className="mvp-form" onSubmit={saveAddress}><h3>Ajouter une adresse</h3><div className="mvp-form__grid"><label className="mvp-field">Libellé<input name="label" placeholder="Maison" required /></label><label className="mvp-field">Destinataire<input name="recipientName" required /></label><label className="mvp-field">Téléphone<input name="phone" required /></label><label className="mvp-field">Région<input name="region" required /></label><label className="mvp-field">Ville<input name="city" required /></label></div><label className="mvp-field">Adresse et repère<textarea name="addressHint" required /></label><label><input name="isDefault" type="checkbox" /> Adresse par défaut</label><button className="mvp-button">Enregistrer</button></form>
    </section>
    <section className="mvp-card"><h2>Mes commandes</h2><div className="mvp-list">{orders.map((order) => <div className="mvp-row" key={order.id}><div><Link href={`/commandes/${order.id}`}><strong>{order.public_code}</strong></Link><small>{one(order.merchant_accounts)?.public_name} · {formatPrice(order.total_xof)} · {new Date(order.created_at).toLocaleDateString("fr-SN")}</small></div><span className="mvp-status" data-status={order.status}>{order.status.replaceAll("_", " ")}</span></div>)}</div>{!orders.length && <p className="mvp-empty">Aucune commande pour le moment.</p>}</section>
  </div>;
}
