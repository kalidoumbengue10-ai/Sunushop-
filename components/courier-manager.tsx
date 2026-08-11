"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";
import { formatPrice } from "@/lib/marketplace";

type Courier = {
  id: string; display_name: string; email: string | null; phone: string; status: "active" | "inactive";
  vehicle_type: string | null; vehicle_registration: string | null; photoUrl: string | null;
  wave_payment_number: string | null; orange_money_payment_number: string | null;
  preferred_payment_channel: "wave" | "orange_money" | null;
  stats: { active: number; deliveredThisMonth: number; deliveredTotal: number; failedTotal: number };
};
type OrderInfo = {
  public_code: string; merchant_sequence: number; created_at: string; status: string;
  recipient_snapshot: Record<string, unknown>;
  order_items: Array<{ product_snapshot: { title?: string }; sku_snapshot: string; quantity: number }>;
};
type Delivery = {
  id: string; status: string; pickupLocked: boolean; pickup_snapshot: Record<string, unknown>;
  assigned_at: string; pickup_verified_at: string | null; delivered_at: string | null; terminal_at: string | null; failure_reason: string | null;
  gross_delivery_fee_xof: number; platform_commission_xof: number; courier_fee_xof: number | null;
  courier_payable_xof: number; courier_payment_status: string; courier_payout_id: string | null;
  courier_memberships: Courier | Courier[]; orders: OrderInfo | OrderInfo[];
};
type Payout = {
  id: string; courier_membership_id: string; amount_xof: number; payment_method: string;
  destination_number: string; external_reference: string | null; paid_at: string; status: string; void_reason: string | null;
  reviewed_at: string | null; contest_reason: string | null;
  courier_memberships: { display_name: string } | Array<{ display_name: string }>;
  courier_payout_deliveries: Array<{ amount_xof: number; delivery_id: string; deliveries: { orders: { public_code: string; merchant_sequence: number } | Array<{ public_code: string; merchant_sequence: number }> } | Array<{ orders: { public_code: string; merchant_sequence: number } | Array<{ public_code: string; merchant_sequence: number }> }> }>;
};
type DeliveryStats = { active: number; deliveredThisMonth: number; grossDeliveryFeesXof: number; platformCommissionXof: number };
type PaymentPayload = { deliveries: Delivery[]; payouts: Payout[]; courierMonthlyStats: Array<{ courierMembershipId: string; displayName: string; courseCount: number; dueXof: number; pendingXof: number; paidXof: number }>; stats: { dueXof: number; paidThisMonthXof: number } };

const vehicleLabels: Record<string, string> = { walking: "À pied", bicycle: "Vélo", motorbike: "Moto", car: "Voiture", van: "Fourgon", other: "Autre" };
const paymentLabels: Record<string, string> = { wave: "Wave", orange_money: "Orange Money" };
const one = <T,>(value: T | T[]) => Array.isArray(value) ? value[0] : value;

export function CourierManager({ merchantId, orders, canManagePayments = false }: { merchantId: string; orders: Array<{ id: string; public_code: string; status: string }>; canManagePayments?: boolean }) {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<DeliveryStats>({ active: 0, deliveredThisMonth: 0, grossDeliveryFeesXof: 0, platformCommissionXof: 0 });
  const [paymentData, setPaymentData] = useState<PaymentPayload>({ deliveries: [], payouts: [], courierMonthlyStats: [], stats: { dueXof: 0, paidThisMonthXof: 0 } });
  const [selectedDeliveries, setSelectedDeliveries] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [courierResponse, deliveryResponse, paymentResponse] = await Promise.all([
      fetch(`/api/merchant/couriers?merchantId=${merchantId}`, { cache: "no-store" }),
      fetch(`/api/merchant/deliveries?merchantId=${merchantId}`, { cache: "no-store" }),
      fetch(`/api/merchant/courier-payments?merchantId=${merchantId}`, { cache: "no-store" }),
    ]);
    const [courierPayload, deliveryPayload, paymentPayload] = await Promise.all([courierResponse.json(), deliveryResponse.json(), paymentResponse.json()]);
    if (!courierResponse.ok) throw new Error(courierPayload.error?.message);
    if (!deliveryResponse.ok) throw new Error(deliveryPayload.error?.message);
    if (!paymentResponse.ok) throw new Error(paymentPayload.error?.message);
    setCouriers(courierPayload.data.items);
    setDeliveries(deliveryPayload.data.items);
    setStats(deliveryPayload.data.stats);
    setPaymentData(paymentPayload.data);
  }, [merchantId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) load().catch((caught: Error) => setError(caught.message)); });
    const supabase = getBrowserSupabase();
    const channel = supabase.channel(`merchant-logistics-${merchantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `merchant_id=eq.${merchantId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_memberships", filter: `merchant_id=eq.${merchantId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_payouts", filter: `merchant_id=eq.${merchantId}` }, () => void load())
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [load, merchantId]);

  const submit = async (url: string, method: string, body: BodyInit, success: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method, headers: typeof body === "string" ? { "content-type": "application/json" } : undefined, body });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error?.message ?? "Action impossible."); return false; }
      setMessage(success); await load(); return true;
    } finally { setBusy(false); }
  };
  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    const ok = await submit("/api/merchant/couriers", "POST", JSON.stringify({ merchantId, email: values.get("email"), displayName: values.get("displayName"), phone: values.get("phone"), vehicleType: values.get("vehicleType") || undefined, vehicleRegistration: values.get("vehicleRegistration") || undefined }), "Invitation livreur envoyée par email.");
    if (ok) form.reset();
  };
  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    await submit("/api/merchant/deliveries", "POST", JSON.stringify({ orderId: values.get("orderId"), courierMembershipId: values.get("courierMembershipId") }), "Livraison affectée. Le tarif du livreur est maintenant figé pour cette mission.");
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
    await submit(`/api/deliveries/${delivery.id}/verify/pickup`, "POST", JSON.stringify({ code: values.get("code") }), "Retrait confirmé. La commande est confiée au livreur.");
  };
  const resetAttempts = (delivery: Delivery) => submit(`/api/deliveries/${delivery.id}/code-attempts`, "PATCH", JSON.stringify({}), "Les essais du code ont été réinitialisés.");
  const compensate = async (delivery: Delivery) => {
    const amount = window.prompt("Compensation libre à verser au livreur (FCFA)", String(delivery.courier_payable_xof || delivery.courier_fee_xof || 0));
    if (amount == null || !/^\d+$/.test(amount)) return;
    await submit(`/api/merchant/deliveries/${delivery.id}/compensation`, "POST", JSON.stringify({ amountXof: Number(amount) }), "Compensation enregistrée.");
  };
  const recordPayout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const selected = paymentData.deliveries.filter((delivery) => selectedDeliveries.includes(delivery.id));
    const courierIds = [...new Set(selected.map((delivery) => one(delivery.courier_memberships)?.id).filter(Boolean))];
    if (courierIds.length !== 1) { setError("Sélectionnez uniquement des missions du même livreur."); return; }
    const values = new FormData(form);
    const ok = await submit("/api/merchant/courier-payments", "POST", JSON.stringify({ merchantId, courierMembershipId: courierIds[0], deliveryIds: selectedDeliveries, paymentMethod: values.get("paymentMethod"), externalReference: values.get("externalReference"), paidAt: new Date().toISOString() }), "Transfert déclaré. Le livreur doit maintenant confirmer sa réception.");
    if (ok) { setSelectedDeliveries([]); form.reset(); }
  };
  const voidPayout = async (payout: Payout) => {
    const reason = window.prompt("Pourquoi annuler ce règlement ?");
    if (reason) await submit(`/api/merchant/courier-payments/${payout.id}/void`, "POST", JSON.stringify({ reason }), "Règlement annulé : les missions sont de nouveau dues.");
  };

  return <div className="courier-manager">
    {message && <p className="mvp-alert" role="status">{message}</p>}{error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}
    <section className="merchant-kpi-grid"><article><span>Missions actives</span><strong>{stats.active}</strong></article><article><span>Livrées ce mois</span><strong>{stats.deliveredThisMonth}</strong></article><article><span>Dû aux livreurs</span><strong>{formatPrice(paymentData.stats.dueXof)}</strong></article><article><span>Payé ce mois</span><strong>{formatPrice(paymentData.stats.paidThisMonthXof)}</strong></article></section>
    <section className="mvp-card mvp-card--full"><h2>Rémunérations du mois par livreur</h2><div className="mvp-list">{paymentData.courierMonthlyStats.map((item) => <div className="mvp-row" key={item.courierMembershipId}><span><strong>{item.displayName}</strong><small>{item.courseCount} course(s) terminée(s)</small></span><span><small>{formatPrice(item.dueXof)} dû</small><small>{formatPrice(item.pendingXof)} en confirmation</small><small>{formatPrice(item.paidXof)} payé</small></span></div>)}</div>{!paymentData.courierMonthlyStats.length && <p className="mvp-empty">Aucune rémunération livreur pour ce mois.</p>}</section>
    <div className="mvp-grid">
      <section className="mvp-card"><h2>Inviter un livreur</h2><form className="mvp-form" onSubmit={invite}><label className="mvp-field">Nom complet<input name="displayName" required /></label><label className="mvp-field">Email<input name="email" type="email" required /></label><label className="mvp-field">Téléphone<input name="phone" required /></label><label className="mvp-field">Véhicule<select name="vehicleType" defaultValue=""><option value="">Non renseigné</option>{Object.entries(vehicleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="mvp-field">Immatriculation<input name="vehicleRegistration" /></label><button className="mvp-button" disabled={busy}>Envoyer l’invitation</button></form></section>
      <section className="mvp-card"><h2>Affecter une commande prête</h2><p>Le tarif livreur de la zone doit être configuré avant l’affectation.</p><form className="mvp-form" onSubmit={assign}><label className="mvp-field">Commande<select name="orderId" required><option value="">Choisir</option>{orders.filter((order) => order.status === "ready_for_handoff").map((order) => <option value={order.id} key={order.id}>{order.public_code}</option>)}</select></label><label className="mvp-field">Livreur<select name="courierMembershipId" required><option value="">Choisir</option>{couriers.filter((courier) => courier.status === "active").map((courier) => <option value={courier.id} key={courier.id}>{courier.display_name}</option>)}</select></label><button className="mvp-button" disabled={busy}>Affecter</button></form></section>
    </div>
    <section className="mvp-card mvp-card--full"><h2>Équipe de livraison</h2><div className="courier-profile-grid">{couriers.map((courier) => <article className="courier-profile" key={courier.id}>{courier.photoUrl ? <Image unoptimized width={72} height={72} src={courier.photoUrl} alt="" /> : <div className="courier-profile__placeholder">{courier.display_name.slice(0, 1)}</div>}<form className="mvp-form" onSubmit={(event) => void updateCourier(event, courier)}><div className="mvp-form__grid"><label className="mvp-field">Nom<input name="displayName" defaultValue={courier.display_name} required /></label><label className="mvp-field">Téléphone<input name="phone" defaultValue={courier.phone} required /></label><label className="mvp-field">Email<input value={courier.email ?? ""} readOnly /></label><label className="mvp-field">Véhicule<select name="vehicleType" defaultValue={courier.vehicle_type ?? ""}><option value="">Non renseigné</option>{Object.entries(vehicleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="mvp-field">Immatriculation<input name="vehicleRegistration" defaultValue={courier.vehicle_registration ?? ""} /></label><label className="mvp-field">Accès<select name="status" defaultValue={courier.status}><option value="active">Actif</option><option value="inactive">Inactif</option></select></label></div><div className="courier-profile__stats"><span>{courier.stats.active} active(s)</span><span>{courier.stats.deliveredThisMonth} ce mois</span><span>{courier.stats.deliveredTotal} livrée(s)</span><span>{courier.stats.failedTotal} échec(s)</span></div><label className="mvp-button mvp-button--secondary">Changer la photo<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadPhoto(courier, event.target.files?.[0] ?? null)} /></label><button className="mvp-button" disabled={busy}>Enregistrer</button></form></article>)}</div>{!couriers.length && <p className="mvp-empty">Aucun livreur actif pour le moment.</p>}</section>
    <section className="mvp-card mvp-card--full"><h2>Régler les livreurs</h2>{canManagePayments ? <><p>Sélectionnez les missions dues d’un seul livreur. Son numéro est photographié dans le règlement au moment de la déclaration.</p><div className="mvp-list">{paymentData.deliveries.filter((delivery) => delivery.courier_payment_status === "due").map((delivery) => { const order = one(delivery.orders); const courier = one(delivery.courier_memberships); return <label className="mvp-row" key={delivery.id}><span><input type="checkbox" checked={selectedDeliveries.includes(delivery.id)} onChange={(event) => setSelectedDeliveries((current) => event.target.checked ? [...current, delivery.id] : current.filter((id) => id !== delivery.id))} /> <strong>{order?.public_code}</strong> · {courier?.display_name}<small>Wave : {courier?.wave_payment_number ?? "non renseigné"} · Orange Money : {courier?.orange_money_payment_number ?? "non renseigné"}{courier?.preferred_payment_channel ? ` · préféré : ${paymentLabels[courier.preferred_payment_channel]}` : ""}</small></span><strong>{formatPrice(delivery.courier_payable_xof)}</strong></label>; })}</div><form className="mvp-form" onSubmit={recordPayout}><div className="mvp-form__grid"><label className="mvp-field">Moyen<select name="paymentMethod" required defaultValue="wave"><option value="wave">Wave</option><option value="orange_money">Orange Money</option></select></label><label className="mvp-field">Référence du transfert<input name="externalReference" required /></label></div><button className="mvp-button" disabled={busy || selectedDeliveries.length === 0}>Déclarer le transfert ({selectedDeliveries.length})</button></form></> : <p className="mvp-alert">Seuls le propriétaire et les managers peuvent déclarer ou annuler un règlement.</p>}<div className="mvp-divider" /><h3>Historique</h3><div className="mvp-list">{paymentData.payouts.map((payout) => { const courier = one(payout.courier_memberships); const codes = payout.courier_payout_deliveries.map((link) => { const delivery = one(link.deliveries); const order = delivery ? one(delivery.orders) : null; return order ? `${order.public_code} (n° ${order.merchant_sequence})` : link.delivery_id; }); return <div className="mvp-row" key={payout.id}><div><strong>{courier?.display_name} · {formatPrice(payout.amount_xof)}</strong><small>{paymentLabels[payout.payment_method] ?? payout.payment_method} vers {payout.destination_number} · {new Date(payout.paid_at).toLocaleString("fr-SN")}{payout.external_reference ? ` · réf. ${payout.external_reference}` : ""}</small><small>Missions : {codes.join(" · ")}</small><small>{payout.status === "pending_confirmation" ? "Confirmation du livreur en attente" : payout.status === "confirmed" ? "Réception confirmée" : payout.status === "contested" ? `Contesté : ${payout.contest_reason}` : `Annulé : ${payout.void_reason}`}</small></div>{canManagePayments && ["pending_confirmation", "contested"].includes(payout.status) && <button type="button" className="mvp-button mvp-button--secondary" onClick={() => void voidPayout(payout)}>Annuler</button>}</div>; })}</div></section>
    <section className="mvp-card mvp-card--full"><h2>Livraisons de la boutique</h2><div className="courier-delivery-list">{deliveries.map((delivery) => { const order = one(delivery.orders); const courier = one(delivery.courier_memberships); const recipient = order?.recipient_snapshot; return <article className="courier-delivery-row" key={delivery.id}><header><div><strong>{order?.public_code} · N° interne {order?.merchant_sequence}</strong><small>{courier?.display_name} · commandée le {order?.created_at && new Date(order.created_at).toLocaleString("fr-SN")}</small></div><span className="mvp-status" data-status={delivery.status}>{delivery.status.replaceAll("_", " ")}</span></header><div className="courier-route"><p><span>Retrait</span><strong>{String(delivery.pickup_snapshot?.name ?? "Boutique")}</strong><small>{String(delivery.pickup_snapshot?.addressHint ?? "")}</small></p><i>→</i><p><span>Destination</span><strong>{String(recipient?.name ?? "Client")}</strong><small>{String(recipient?.phone ?? "")}<br />{String(recipient?.city ?? "")}, {String(recipient?.addressHint ?? "")}</small></p></div><p>{order?.order_items.map((item) => `${item.quantity} × ${item.product_snapshot?.title ?? item.sku_snapshot}`).join(" · ")}</p><p><strong>Rémunération :</strong> {delivery.courier_fee_xof == null ? "non configurée" : formatPrice(delivery.courier_payable_xof || delivery.courier_fee_xof)} · {delivery.courier_payment_status.replaceAll("_", " ")}</p>{canManagePayments && delivery.status === "failed" && delivery.courier_payment_status !== "paid" && <button type="button" className="mvp-button mvp-button--secondary" onClick={() => void compensate(delivery)}>Fixer la compensation</button>}{delivery.status === "at_pickup" && !delivery.pickupLocked && <form className="courier-code-form" onSubmit={(event) => void verifyPickup(event, delivery)}><label>Code présenté par le livreur<input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" required /></label><button className="mvp-button" disabled={busy}>Autoriser le retrait</button></form>}{delivery.pickupLocked && <div className="mvp-alert mvp-alert--warning"><p>Code verrouillé après cinq essais.</p><button className="mvp-button mvp-button--secondary" onClick={() => void resetAttempts(delivery)}>Réinitialiser les essais</button></div>}</article>; })}</div>{!deliveries.length && <p className="mvp-empty">Aucune livraison affectée.</p>}</section>
  </div>;
}
