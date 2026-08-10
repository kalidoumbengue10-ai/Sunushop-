"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";
import { formatPrice } from "@/lib/marketplace";

type Courier = {
  id: string; display_name: string; email: string | null; phone: string; status: "active" | "inactive";
  vehicle_type: string | null; vehicle_registration: string | null; photoUrl: string | null;
  stats: { active: number; deliveredThisMonth: number; deliveredTotal: number; failedTotal: number };
};
type Delivery = {
  id: string; status: string; pickupLocked: boolean; pickup_snapshot: Record<string, unknown>;
  gross_delivery_fee_xof: number; platform_commission_xof: number;
  courier_memberships: Courier | Courier[];
  orders: { public_code: string; status: string; recipient_snapshot: Record<string, unknown> } | Array<{ public_code: string; status: string; recipient_snapshot: Record<string, unknown> }>;
};
type DeliveryPayload = { items: Delivery[]; stats: { active: number; deliveredThisMonth: number; grossDeliveryFeesXof: number; platformCommissionXof: number } };
const vehicleLabels: Record<string, string> = { walking: "À pied", bicycle: "Vélo", motorbike: "Moto", car: "Voiture", van: "Fourgon", other: "Autre" };

export function CourierManager({ merchantId, orders }: { merchantId: string; orders: Array<{ id: string; public_code: string; status: string }> }) {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<DeliveryPayload["stats"]>({ active: 0, deliveredThisMonth: 0, grossDeliveryFeesXof: 0, platformCommissionXof: 0 });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [courierResponse, deliveryResponse] = await Promise.all([
      fetch(`/api/merchant/couriers?merchantId=${merchantId}`, { cache: "no-store" }),
      fetch(`/api/merchant/deliveries?merchantId=${merchantId}`, { cache: "no-store" }),
    ]);
    const [courierPayload, deliveryPayload] = await Promise.all([courierResponse.json(), deliveryResponse.json()]);
    if (!courierResponse.ok) throw new Error(courierPayload.error?.message);
    if (!deliveryResponse.ok) throw new Error(deliveryPayload.error?.message);
    setCouriers(courierPayload.data.items); setDeliveries(deliveryPayload.data.items); setStats(deliveryPayload.data.stats);
  }, [merchantId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) load().catch((caught: Error) => setError(caught.message)); });
    const supabase = getBrowserSupabase();
    const channel = supabase.channel(`merchant-logistics-${merchantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `merchant_id=eq.${merchantId}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_memberships", filter: `merchant_id=eq.${merchantId}` }, () => { void load(); })
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [load, merchantId]);

  const submit = async (url: string, method: string, body: BodyInit, success: string) => {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch(url, { method, headers: typeof body === "string" ? { "content-type": "application/json" } : undefined, body });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) { setError(payload.error?.message ?? "Action impossible."); return false; }
    setMessage(success); await load(); return true;
  };
  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    const ok = await submit("/api/merchant/couriers", "POST", JSON.stringify({ merchantId, email: values.get("email"), displayName: values.get("displayName"), phone: values.get("phone"), vehicleType: values.get("vehicleType") || undefined, vehicleRegistration: values.get("vehicleRegistration") || undefined }), "Invitation livreur envoyée par email.");
    if (ok) form.reset();
  };
  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    await submit("/api/merchant/deliveries", "POST", JSON.stringify({ orderId: values.get("orderId"), courierMembershipId: values.get("courierMembershipId") }), "Livraison affectée. Le livreur dispose maintenant de son code de retrait.");
  };
  const updateCourier = async (event: FormEvent<HTMLFormElement>, courier: Courier) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    await submit("/api/merchant/couriers", "PATCH", JSON.stringify({ merchantId, membershipId: courier.id, displayName: values.get("displayName"), phone: values.get("phone"), vehicleType: values.get("vehicleType") || null, vehicleRegistration: values.get("vehicleRegistration") || null, status: values.get("status") }), "Profil livreur enregistré.");
  };
  const uploadPhoto = async (courier: Courier, file: File | null) => {
    if (!file) return; const form = new FormData(); form.set("merchantId", merchantId); form.set("file", file);
    await submit(`/api/merchant/couriers/${courier.id}/photo`, "POST", form, "Photo du livreur mise à jour.");
  };
  const verifyPickup = async (event: FormEvent<HTMLFormElement>, delivery: Delivery) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    await submit(`/api/deliveries/${delivery.id}/verify/pickup`, "POST", JSON.stringify({ code: values.get("code") }), "Retrait confirmé. La commande est maintenant confiée au livreur.");
  };
  const resetAttempts = async (delivery: Delivery) => { await submit(`/api/deliveries/${delivery.id}/code-attempts`, "PATCH", JSON.stringify({}), "Les essais du code ont été réinitialisés."); };
  const one = <T,>(value: T | T[]) => Array.isArray(value) ? value[0] : value;

  return <div className="courier-manager">
    {message && <p className="mvp-alert" role="status">{message}</p>}{error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}
    <section className="merchant-kpi-grid"><article><span>Missions actives</span><strong>{stats.active}</strong></article><article><span>Livrées ce mois</span><strong>{stats.deliveredThisMonth}</strong></article><article><span>Frais livrés</span><strong>{formatPrice(stats.grossDeliveryFeesXof)}</strong></article><article><span>Commission SunuShop</span><strong>{formatPrice(stats.platformCommissionXof)}</strong></article></section>
    <div className="mvp-grid"><section className="mvp-card"><h2>Inviter un livreur</h2><form className="mvp-form" onSubmit={invite}><label className="mvp-field">Nom complet<input name="displayName" required /></label><label className="mvp-field">Email<input name="email" type="email" required /></label><label className="mvp-field">Téléphone<input name="phone" required /></label><label className="mvp-field">Véhicule<select name="vehicleType" defaultValue=""><option value="">Non renseigné</option>{Object.entries(vehicleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="mvp-field">Immatriculation<input name="vehicleRegistration" /></label><button className="mvp-button" disabled={busy}>Envoyer l’invitation</button></form></section>
      <section className="mvp-card"><h2>Affecter une commande prête</h2><form className="mvp-form" onSubmit={assign}><label className="mvp-field">Commande<select name="orderId" required><option value="">Choisir</option>{orders.filter((order) => order.status === "ready_for_handoff").map((order) => <option value={order.id} key={order.id}>{order.public_code}</option>)}</select></label><label className="mvp-field">Livreur<select name="courierMembershipId" required><option value="">Choisir</option>{couriers.filter((courier) => courier.status === "active").map((courier) => <option value={courier.id} key={courier.id}>{courier.display_name}</option>)}</select></label><button className="mvp-button" disabled={busy}>Affecter</button></form></section></div>
    <section className="mvp-card mvp-card--full"><h2>Équipe de livraison</h2><div className="courier-profile-grid">{couriers.map((courier) => <article className="courier-profile" key={courier.id}>{courier.photoUrl ? <Image unoptimized width={72} height={72} src={courier.photoUrl} alt="" /> : <div className="courier-profile__placeholder">{courier.display_name.slice(0, 1)}</div>}<form className="mvp-form" onSubmit={(event) => void updateCourier(event, courier)}><div className="mvp-form__grid"><label className="mvp-field">Nom<input name="displayName" defaultValue={courier.display_name} required /></label><label className="mvp-field">Téléphone<input name="phone" defaultValue={courier.phone} required /></label><label className="mvp-field">Email<input value={courier.email ?? ""} readOnly /></label><label className="mvp-field">Véhicule<select name="vehicleType" defaultValue={courier.vehicle_type ?? ""}><option value="">Non renseigné</option>{Object.entries(vehicleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="mvp-field">Immatriculation<input name="vehicleRegistration" defaultValue={courier.vehicle_registration ?? ""} /></label><label className="mvp-field">Accès<select name="status" defaultValue={courier.status}><option value="active">Actif</option><option value="inactive">Inactif</option></select></label></div><div className="courier-profile__stats"><span>{courier.stats.active} active(s)</span><span>{courier.stats.deliveredThisMonth} ce mois</span><span>{courier.stats.deliveredTotal} livrée(s)</span><span>{courier.stats.failedTotal} échec(s)</span></div><label className="mvp-button mvp-button--secondary">Changer la photo<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadPhoto(courier, event.target.files?.[0] ?? null)} /></label><button className="mvp-button" disabled={busy}>Enregistrer</button></form></article>)}</div>{!couriers.length && <p className="mvp-empty">Aucun livreur actif pour le moment.</p>}</section>
    <section className="mvp-card mvp-card--full"><h2>Livraisons de la boutique</h2><div className="courier-delivery-list">{deliveries.map((delivery) => { const order = one(delivery.orders); const courier = one(delivery.courier_memberships); const recipient = order?.recipient_snapshot; return <article className="courier-delivery-row" key={delivery.id}><header><div><strong>{order?.public_code}</strong><small>{courier?.display_name}</small></div><span className="mvp-status" data-status={delivery.status}>{delivery.status.replaceAll("_", " ")}</span></header><div className="courier-route"><p><span>Retrait</span><strong>{String(delivery.pickup_snapshot?.name ?? "Boutique")}</strong><small>{String(delivery.pickup_snapshot?.addressHint ?? "")}</small></p><i>→</i><p><span>Destination</span><strong>{String(recipient?.name ?? "Client")}</strong><small>{String(recipient?.phone ?? "")}<br />{String(recipient?.city ?? "")}, {String(recipient?.addressHint ?? "")}</small></p></div>{delivery.status === "at_pickup" && !delivery.pickupLocked && <form className="courier-code-form" onSubmit={(event) => void verifyPickup(event, delivery)}><label>Code présenté par le livreur<input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" required /></label><button className="mvp-button" disabled={busy}>Autoriser le retrait</button></form>}{delivery.pickupLocked && <div className="mvp-alert mvp-alert--warning"><p>Code verrouillé après cinq essais.</p><button className="mvp-button mvp-button--secondary" onClick={() => void resetAttempts(delivery)}>Réinitialiser les essais</button></div>}</article>; })}</div>{!deliveries.length && <p className="mvp-empty">Aucune livraison affectée.</p>}</section>
  </div>;
}
