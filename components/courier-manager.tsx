"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Mail, MessageCircle, Smartphone } from "lucide-react";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";
import { formatPrice } from "@/lib/marketplace";
import { courierSmsUrl, courierWhatsappUrl } from "@/lib/domain/courier-sharing";

type InvitationState = {
  id: string;
  status: string | null;
  emailStatus: string;
  sentAt: string | null;
  expiresAt: string;
  invitationUrl: string | null;
  lastError: string | null;
};
type Courier = {
  id: string; courier_user_id: string | null; display_name: string; email: string | null; phone: string; status: "pending_invitation" | "active" | "inactive";
  vehicle_type: string | null; vehicle_registration: string | null; photoUrl: string | null;
  wave_payment_number: string | null; orange_money_payment_number: string | null;
  preferred_payment_channel: "wave" | "orange_money" | null; invitation: InvitationState | null;
  availability: "available" | "busy";
  stats: { active: number; deliveredThisMonth: number; deliveredTotal: number; failedTotal: number; globalActive: number };
};
type OrderInfo = {
  public_code: string; merchant_sequence: number; created_at: string; status: string;
  recipient_snapshot: Record<string, unknown>;
  order_items: Array<{ product_snapshot: { title?: string }; sku_snapshot: string; quantity: number }>;
};
type AssignableOrder = {
  id: string; publicCode: string; merchantSequence: number; status: string;
  ready: boolean; label: string; reassignment: boolean; recipientName: string; city: string; deliveryFeeXof: number;
};
type OfferQuote = { distanceMeters: number; durationSeconds: number; clientDeliveryFeeXof: number; suggestedCourierFeeXof: number };
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
type ManagerTab = "missions" | "assign" | "couriers" | "payments";
type ManagerDialog =
  | { kind: "compensation"; delivery: Delivery }
  | { kind: "void-payout"; payout: Payout }
  | null;

const terminalStatuses = new Set(["delivered", "failed", "cancelled"]);
const vehicleLabels: Record<string, string> = { walking: "À pied", bicycle: "Vélo", motorbike: "Moto", car: "Voiture", van: "Fourgon", other: "Autre" };
const paymentLabels: Record<string, string> = { wave: "Wave", orange_money: "Orange Money" };
const statusLabels: Record<string, string> = { assigned: "Affectée", accepted: "Acceptée", at_pickup: "Au retrait", picked_up: "Récupérée", in_transit: "En route", delivered: "Livrée", failed: "Échec", cancelled: "Annulée" };
const one = <T,>(value: T | T[]) => Array.isArray(value) ? value[0] : value;

function invitationLabel(courier: Courier) {
  if (courier.status === "active" || courier.invitation?.status === "claimed") return { text: "Accès actif", tone: "claimed" };
  if (courier.invitation?.status === "expired") return { text: "Invitation expirée", tone: "expired" };
  if (courier.invitation?.status === "revoked") return { text: "Invitation révoquée", tone: "expired" };
  if (["sent", "accepted", "delivered"].includes(courier.invitation?.emailStatus ?? "")) return { text: courier.invitation?.emailStatus === "delivered" ? "Email livré" : "Email accepté", tone: "sent" };
  if (courier.invitation && !courier.email) return { text: "À partager", tone: "pending" };
  if (courier.invitation?.emailStatus === "failed") return { text: "Échec de l’envoi", tone: "failed" };
  return { text: "Envoi en attente", tone: "pending" };
}

export function CourierManager({ merchantId, canManagePayments = false, onOpenOrders }: { merchantId: string; canManagePayments?: boolean; onOpenOrders?: () => void }) {
  const [tab, setTab] = useState<ManagerTab>("missions");
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<DeliveryStats>({ active: 0, deliveredThisMonth: 0, grossDeliveryFeesXof: 0, platformCommissionXof: 0 });
  const [paymentData, setPaymentData] = useState<PaymentPayload>({ deliveries: [], payouts: [], courierMonthlyStats: [], stats: { dueXof: 0, paidThisMonthXof: 0 } });
  const [assignable, setAssignable] = useState<{ items: AssignableOrder[]; excluded: { pickup: number; locked: number } }>({ items: [], excluded: { pickup: 0, locked: 0 } });
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedCourierId, setSelectedCourierId] = useState("");
  const [selectedDeliveries, setSelectedDeliveries] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [offerQuote, setOfferQuote] = useState<OfferQuote | null>(null);
  const [invitationUrls, setInvitationUrls] = useState<Record<string, string>>({});
  const [managerDialog, setManagerDialog] = useState<ManagerDialog>(null);
  const [dialogError, setDialogError] = useState("");
  const dialogFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!managerDialog) return;
    dialogFieldRef.current?.focus();
  }, [managerDialog]);

  const load = useCallback(async () => {
    const responses = await Promise.all([
      fetch(`/api/merchant/couriers?merchantId=${merchantId}`, { cache: "no-store" }),
      fetch(`/api/merchant/deliveries?merchantId=${merchantId}`, { cache: "no-store" }),
      fetch(`/api/merchant/courier-payments?merchantId=${merchantId}`, { cache: "no-store" }),
      fetch(`/api/merchant/assignable-orders?merchantId=${merchantId}`, { cache: "no-store" }),
    ]);
    const payloads = await Promise.all(responses.map((response) => response.json()));
    const failed = responses.findIndex((response) => !response.ok);
    if (failed >= 0) throw new Error(payloads[failed].error?.message ?? "Chargement impossible.");
    const courierItems = payloads[0].data.items as Courier[];
    setCouriers(courierItems);
    setInvitationUrls((current) => Object.fromEntries(Object.entries(current).filter(([membershipId]) => courierItems.find((courier) => courier.id === membershipId)?.invitation?.status === "pending")));
    setDeliveries(payloads[1].data.items); setStats(payloads[1].data.stats);
    setPaymentData(payloads[2].data); setAssignable(payloads[3].data);
  }, [merchantId]);

  const reloadTimer = useRef<number | null>(null);
  const scheduleReload = useCallback(() => {
    // Coalesce les événements réaltime rapprochés (5 tables abonnées, une
    // rafale de mises à jour de livraison déclenche sinon jusqu'à 5 rechargements
    // complets de 4 endpoints en quelques secondes) en un seul `load()`.
    if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => { void load(); }, 800);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) load().catch((caught: Error) => setError(caught.message)); });
    const supabase = getBrowserSupabase();
    const channel = supabase.channel(`merchant-logistics-${merchantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `merchant_id=eq.${merchantId}` }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_memberships", filter: `merchant_id=eq.${merchantId}` }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_payouts", filter: `merchant_id=eq.${merchantId}` }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_offers", filter: `merchant_id=eq.${merchantId}` }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `merchant_id=eq.${merchantId}` }, scheduleReload)
      .subscribe();
    return () => {
      cancelled = true;
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [load, merchantId, scheduleReload]);

  const submit = async (url: string, method: string, body: BodyInit, success: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method, headers: typeof body === "string" ? { "content-type": "application/json" } : undefined, body });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error?.message ?? "Action impossible."); return null; }
      setMessage(success); await load(); return payload.data;
    } catch {
      setError("Connexion interrompue. Réessayez sans ressaisir les informations.");
      return null;
    } finally { setBusy(false); }
  };

  const inviteCourier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const requestedEmail = String(values.get("email") ?? "").trim();
    const data = await submit("/api/merchant/couriers", "POST", JSON.stringify({
      merchantId,
      displayName: values.get("displayName"),
      phone: values.get("phone"),
      email: values.get("email") || undefined,
      vehicleType: values.get("vehicleType") || undefined,
      vehicleRegistration: values.get("vehicleRegistration") || undefined,
    }), "Invitation créée.");
    if (data) {
      if (data.membershipId && data.invitationUrl) {
        setInvitationUrls((current) => ({ ...current, [data.membershipId]: data.invitationUrl }));
      }
      form.reset();
      setMessage(!requestedEmail
        ? "Lien prêt pour WhatsApp."
        : data.emailSent
          ? "E-mail envoyé. Le lien est aussi prêt pour WhatsApp."
          : data.invitation?.emailStatus === "failed"
            ? "Échec de l’e-mail — utilisez WhatsApp."
            : "E-mail en cours d’envoi. Le lien est prêt pour WhatsApp.");
    }
  };

  const cancelInvitation = async (courier: Courier) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/merchant/couriers/invite-existing/${courier.id}?merchantId=${merchantId}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error?.message ?? "Annulation impossible."); return; }
      setMessage("Invitation annulée."); await load();
    } catch {
      setError("Connexion interrompue. Réessayez sans ressaisir les informations.");
    } finally { setBusy(false); }
  };
  const resendInvitation = async (courier: Courier) => {
    const data = await submit(`/api/merchant/couriers/${courier.id}/invitation`, "POST", JSON.stringify({ merchantId }), "Invitation traitée.");
    if (data?.invitationUrl) {
      setInvitationUrls((current) => ({ ...current, [courier.id]: data.invitationUrl }));
      setMessage(!courier.email
        ? "Nouveau lien prêt pour WhatsApp."
        : data.emailSent
          ? "Nouveau lien envoyé par e-mail et prêt pour WhatsApp."
          : "Échec de l’e-mail — utilisez WhatsApp.");
    }
  };
  const copyInvitation = async (courier: Courier) => {
    const invitationUrl = invitationUrls[courier.id] ?? (courier.invitation?.status === "pending" ? courier.invitation.invitationUrl : null);
    if (!invitationUrl) return;
    await navigator.clipboard.writeText(invitationUrl);
    setMessage("Lien d’invitation copié.");
  };
  const shareOnWhatsApp = async (courier: Courier) => {
    let invitationUrl = invitationUrls[courier.id] ?? (courier.invitation?.status === "pending" ? courier.invitation.invitationUrl : null);
    if (!invitationUrl) {
      const data = await submit(`/api/merchant/couriers/${courier.id}/invitation`, "POST", JSON.stringify({ merchantId }), "Préparation du lien WhatsApp.");
      invitationUrl = data?.invitationUrl;
      if (!invitationUrl) return;
      setInvitationUrls((current) => ({ ...current, [courier.id]: invitationUrl }));
    }
    window.location.assign(courierWhatsappUrl(courier.phone, invitationUrl));
  };
  const loadQuote = async (orderId: string) => {
    setOfferQuote(null);
    if (!orderId) return;
    const response = await fetch(`/api/merchant/delivery-offers/quote?merchantId=${merchantId}&orderId=${orderId}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error?.message ?? "Estimation du trajet impossible."); return; }
    setOfferQuote(payload.data);
  };
  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const orderId = String(values.get("orderId") ?? "");
    const courierMembershipId = String(values.get("courierMembershipId") ?? "");
    const courierFeeXof = Number(values.get("courierFeeXof") ?? 0);
    const order = assignable.items.find((item) => item.id === orderId);
    if (!order?.ready) { setError("Marquez d’abord cette commande comme prête."); return; }
    if (!courierMembershipId) { setError("Choisissez le livreur qui prendra la mission."); return; }
    if (!Number.isInteger(courierFeeXof) || courierFeeXof < 0) { setError("Indiquez une rémunération valide."); return; }
    const data = await submit("/api/merchant/delivery-offers", "POST", JSON.stringify({
      merchantId,
      orderId,
      courierMembershipId,
      courierFeeXof,
      idempotencyKey: `offer-${orderId}-${courierMembershipId}-${crypto.randomUUID()}`,
    }), "Offre envoyée au livreur.");
    if (data) { setSelectedOrderId(""); setSelectedCourierId(""); setOfferQuote(null); setTab("missions"); }
  };
  const markReady = async (order: AssignableOrder) => {
    await submit(`/api/orders/${order.id}/ready-for-handoff`, "POST", JSON.stringify({}), `${order.publicCode} est prête à être affectée.`);
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
    await submit(`/api/deliveries/${delivery.id}/verify/pickup`, "POST", JSON.stringify({ code: values.get("code") }), "Retrait confirmé. Le livreur est maintenant en route.");
  };
  const resetAttempts = (delivery: Delivery) => submit(`/api/deliveries/${delivery.id}/code-attempts`, "PATCH", JSON.stringify({}), "Les essais du code ont été réinitialisés.");
  const openCompensation = (delivery: Delivery) => {
    setDialogError("");
    setManagerDialog({ kind: "compensation", delivery });
  };
  const submitCompensation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (managerDialog?.kind !== "compensation") return;
    const amount = Number(new FormData(event.currentTarget).get("amountXof"));
    if (!Number.isInteger(amount) || amount < 0 || amount > 100_000_000) {
      setDialogError("Saisissez un montant entier compris entre 0 et 100 000 000 FCFA.");
      return;
    }
    setBusy(true); setDialogError(""); setMessage("");
    try {
      const response = await fetch(`/api/merchant/deliveries/${managerDialog.delivery.id}/compensation`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountXof: amount }),
      });
      const payload = await response.json();
      if (!response.ok) { setDialogError(payload.error?.message ?? "Compensation impossible à enregistrer."); return; }
      setManagerDialog(null); setMessage("Compensation enregistrée."); await load();
    } catch {
      setDialogError("Connexion interrompue. Réessayez sans fermer cette fenêtre.");
    } finally { setBusy(false); }
  };
  const recordPayout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget;
    const selected = paymentData.deliveries.filter((delivery) => selectedDeliveries.includes(delivery.id));
    const courierIds = [...new Set(selected.map((delivery) => one(delivery.courier_memberships)?.id).filter(Boolean))];
    if (courierIds.length !== 1) { setError("Sélectionnez uniquement des missions du même livreur."); return; }
    const values = new FormData(form);
    const data = await submit("/api/merchant/courier-payments", "POST", JSON.stringify({ merchantId, courierMembershipId: courierIds[0], deliveryIds: selectedDeliveries, paymentMethod: values.get("paymentMethod"), externalReference: values.get("externalReference"), paidAt: new Date().toISOString() }), "Transfert déclaré. Le livreur doit confirmer sa réception.");
    if (data) { setSelectedDeliveries([]); form.reset(); }
  };
  const openVoidPayout = (payout: Payout) => {
    setDialogError("");
    setManagerDialog({ kind: "void-payout", payout });
  };
  const submitVoidPayout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (managerDialog?.kind !== "void-payout") return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (reason.length < 4 || reason.length > 500) {
      setDialogError("Le motif doit contenir entre 4 et 500 caractères.");
      return;
    }
    setBusy(true); setDialogError(""); setMessage("");
    try {
      const response = await fetch(`/api/merchant/courier-payments/${managerDialog.payout.id}/void`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }),
      });
      const payload = await response.json();
      if (!response.ok) { setDialogError(payload.error?.message ?? "Ce règlement ne peut pas être annulé."); return; }
      setManagerDialog(null); setMessage("Règlement annulé : les missions sont de nouveau dues."); await load();
    } catch {
      setDialogError("Connexion interrompue. Réessayez sans fermer cette fenêtre.");
    } finally { setBusy(false); }
  };

  const activeDeliveries = useMemo(() => deliveries.filter((delivery) => !terminalStatuses.has(delivery.status)), [deliveries]);
  const historyDeliveries = useMemo(() => deliveries.filter((delivery) => terminalStatuses.has(delivery.status)), [deliveries]);
  const readyCount = assignable.items.filter((order) => order.ready).length;
  const pendingInvitations = couriers.filter((courier) => courier.status === "pending_invitation").length;
  const selectedOrder = assignable.items.find((order) => order.id === selectedOrderId);
  const selectedCourier = couriers.find((courier) => courier.id === selectedCourierId);

  const deliveryCard = (delivery: Delivery) => {
    const order = one(delivery.orders); const courier = one(delivery.courier_memberships); const recipient = order?.recipient_snapshot;
    return <article className="courier-delivery-row" key={delivery.id}>
      <header><div><strong>{order?.public_code} · N° interne {order?.merchant_sequence}</strong><small>{courier?.display_name} · {order?.created_at && new Date(order.created_at).toLocaleString("fr-SN")}</small></div><span className="mvp-status" data-status={delivery.status}>{statusLabels[delivery.status] ?? delivery.status}</span></header>
      <div className="courier-route"><p><span>Retrait</span><strong>{String(delivery.pickup_snapshot?.name ?? "Boutique")}</strong><small>{String(delivery.pickup_snapshot?.addressHint ?? "")}</small></p><i>→</i><p><span>Destination</span><strong>{String(recipient?.name ?? "Client")}</strong><small>{String(recipient?.phone ?? "")}<br />{String(recipient?.city ?? "")}, {String(recipient?.addressHint ?? "")}</small></p></div>
      <p>{order?.order_items.map((item) => `${item.quantity} × ${item.product_snapshot?.title ?? item.sku_snapshot}`).join(" · ")}</p>
      <p><strong>Rémunération :</strong> {delivery.courier_fee_xof == null ? "non configurée" : formatPrice(delivery.courier_payable_xof || delivery.courier_fee_xof)} · {delivery.courier_payment_status.replaceAll("_", " ")}</p>
      {delivery.status === "at_pickup" && !delivery.pickupLocked && <form className="courier-code-form" onSubmit={(event) => void verifyPickup(event, delivery)}><label>Code présenté par le livreur<input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" required /></label><button className="mvp-button" disabled={busy}>Autoriser le retrait</button></form>}
      {delivery.pickupLocked && <div className="mvp-alert mvp-alert--warning"><p>Code verrouillé après cinq essais.</p><button className="mvp-button mvp-button--secondary" onClick={() => void resetAttempts(delivery)}>Réinitialiser les essais</button></div>}
      {canManagePayments && delivery.status === "failed" && delivery.courier_payment_status !== "paid" && <button type="button" className="mvp-button mvp-button--secondary" onClick={() => openCompensation(delivery)}>Fixer la compensation</button>}
    </article>;
  };

  const tabs: Array<{ id: ManagerTab; label: string; count: number }> = [
    { id: "missions", label: "Missions", count: activeDeliveries.length },
    { id: "assign", label: "À affecter", count: readyCount },
    { id: "couriers", label: "Livreurs", count: pendingInvitations },
    { id: "payments", label: "Paiements", count: paymentData.deliveries.filter((delivery) => delivery.courier_payment_status === "due").length },
  ];

  return <div className="courier-manager">
    <nav className="courier-task-tabs" role="tablist" aria-label="Gestion des livreurs">{tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} key={item.id} onClick={() => setTab(item.id)}><span>{item.label}</span>{item.count > 0 && <b>{item.count}</b>}</button>)}</nav>
    {message && <p className="mvp-alert" role="status">{message}</p>}{error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}

    {tab === "missions" && <section role="tabpanel" className="courier-tab-panel">
      <div className="marketplace-section-heading"><div><h2>Missions en cours</h2><p>Les retraits à valider et les livraisons actives apparaissent en premier.</p></div><span>{activeDeliveries.length}</span></div>
      <div className="courier-delivery-list">{activeDeliveries.map(deliveryCard)}</div>
      {!activeDeliveries.length && <p className="mvp-empty">Aucune mission en cours.</p>}
      <details className="courier-history"><summary>Historique des missions ({historyDeliveries.length})</summary><div className="courier-delivery-list">{historyDeliveries.map(deliveryCard)}</div>{!historyDeliveries.length && <p className="mvp-empty">Aucune mission terminée.</p>}</details>
    </section>}

    {tab === "assign" && <section role="tabpanel" className="courier-tab-panel">
      <div className="marketplace-section-heading"><div><h2>Affecter une commande</h2><p>Sélectionnez la commande puis le livreur. Les commandes non prêtes restent visibles et peuvent être préparées ici.</p></div><span>{assignable.items.length}</span></div>
      <form className="mvp-card mvp-card--full mvp-form" onSubmit={assign}>
        <label className="mvp-field">1. Commande<select name="orderId" required value={selectedOrderId} onChange={(event) => { setSelectedOrderId(event.target.value); setError(""); void loadQuote(event.target.value); }}><option value="">Choisir une commande</option>{assignable.items.map((order) => <option value={order.id} key={order.id}>{order.publicCode} · n° {order.merchantSequence} · {order.label}{order.reassignment ? " · réaffectation" : ""}</option>)}</select></label>
        {selectedOrder && <div className={`courier-selection-summary ${selectedOrder.ready ? "is-ready" : ""}`}><div><strong>{selectedOrder.publicCode}</strong><small>{selectedOrder.recipientName} · {selectedOrder.city} · {selectedOrder.label}</small></div>{!selectedOrder.ready && <button type="button" className="mvp-button" disabled={busy} onClick={() => void markReady(selectedOrder)}>Marquer prête</button>}</div>}
        {offerQuote && <div className="courier-offer-metrics" aria-label="Estimation du trajet"><span><small>Distance</small><strong>{(offerQuote.distanceMeters / 1000).toFixed(1)} km</strong></span><span><small>Durée estimée</small><strong>{Math.max(1, Math.round(offerQuote.durationSeconds / 60))} min</strong></span><span><small>Payé par le client</small><strong>{formatPrice(offerQuote.clientDeliveryFeeXof)}</strong></span></div>}
        <label className="mvp-field">2. Livreur<select name="courierMembershipId" required value={selectedCourierId} onChange={(event) => setSelectedCourierId(event.target.value)}><option value="">Choisir un livreur</option>{couriers.filter((courier) => ["active", "pending_invitation"].includes(courier.status)).map((courier) => <option value={courier.id} key={courier.id}>{courier.display_name}{courier.status === "pending_invitation" ? " · activation en attente" : ""}</option>)}</select></label>
        <label className="mvp-field">3. Rémunération proposée au livreur (FCFA)<input key={offerQuote?.suggestedCourierFeeXof ?? "empty"} name="courierFeeXof" type="number" min="0" step="25" defaultValue={offerQuote?.suggestedCourierFeeXof ?? selectedOrder?.deliveryFeeXof ?? 0} required /><small>Cette somme est figée lorsque le livreur accepte. Elle ne modifie pas ce que le client a déjà payé.</small></label>
        {selectedOrder?.ready && selectedCourier && <p className="mvp-alert"><strong>Confirmation</strong><br />Proposer {selectedOrder.publicCode} à {selectedCourier.display_name}. Le livreur verra la zone, le trajet estimé et son gain avant de décider.</p>}
        <button className="mvp-button" disabled={busy || !selectedOrder?.ready || !selectedCourierId || !offerQuote}>{busy ? "Envoi…" : "Envoyer l’offre"}</button>
      </form>
      {!assignable.items.length && <p className="mvp-empty">Aucune commande à affecter. {assignable.excluded.pickup > 0 && `${assignable.excluded.pickup} commande(s) en retrait boutique ne nécessitent pas de livreur.`}</p>}
      {!couriers.some((courier) => ["active", "pending_invitation"].includes(courier.status)) && <p className="mvp-alert mvp-alert--warning">Aucun livreur disponible. Invitez-en un depuis l’onglet Livreurs.</p>}
      {onOpenOrders && <button type="button" className="mvp-button mvp-button--secondary" onClick={onOpenOrders}>Ouvrir toutes les commandes</button>}
    </section>}

    {tab === "couriers" && <section role="tabpanel" className="courier-tab-panel">
      <div className="mvp-grid"><section className="mvp-card"><h2>Inviter un livreur</h2><p>Son nom et son téléphone suffisent. Ajoutez son e-mail seulement si vous souhaitez lui envoyer aussi le lien par e-mail.</p><form className="mvp-form" onSubmit={inviteCourier}><div className="mvp-form__grid"><label className="mvp-field">Nom complet<input name="displayName" autoComplete="name" required /></label><label className="mvp-field">Téléphone<input name="phone" inputMode="tel" autoComplete="tel" placeholder="+221 77 000 00 00" required /></label><label className="mvp-field">E-mail (facultatif)<input name="email" type="email" autoComplete="email" /></label></div><button className="mvp-button" disabled={busy}>{busy ? "Création…" : "Créer le lien de partage"}</button></form></section>
      <section className="mvp-card"><h2>Deux gestes seulement</h2><ol className="courier-steps"><li>Vous saisissez son nom, son téléphone et éventuellement son e-mail.</li><li>L’e-mail part automatiquement et vous pouvez partager le même lien sur WhatsApp.</li></ol></section></div>
      <section>
        <div className="marketplace-section-heading"><div><h2>Équipe de livraison</h2><p>L’état affiché correspond à l’envoi réel de l’invitation.</p></div><span>{couriers.length}</span></div>
        <div className="courier-profile-grid">{couriers.map((courier) => {
          const state = invitationLabel(courier);
          const invitationUrl = invitationUrls[courier.id] ?? (courier.invitation?.status === "pending" ? courier.invitation.invitationUrl : null);
          return <article className="courier-profile" key={courier.id}>
            {courier.photoUrl ? <Image unoptimized width={72} height={72} src={courier.photoUrl} alt="" /> : <div className="courier-profile__placeholder">{courier.display_name.slice(0, 1)}</div>}
            <span className="courier-invitation-status" data-status={state.tone}>{state.text}</span>
            <div className="courier-invitation-actions">
              <button type="button" className="mvp-button mvp-button--secondary" disabled={busy} onClick={() => void resendInvitation(courier)}><Mail /> {courier.status === "active" ? "Renvoyer un lien d’accès" : "Renvoyer"}</button>
              {invitationUrl && <button type="button" className="mvp-button mvp-button--secondary" onClick={() => void copyInvitation(courier)}><Copy /> Copier le lien</button>}
              <button type="button" className="mvp-button mvp-button--secondary" disabled={busy} onClick={() => void shareOnWhatsApp(courier)}><MessageCircle /> Envoyer par WhatsApp</button>
              {invitationUrl && <a className="mvp-button mvp-button--secondary" href={courierSmsUrl(courier.phone, invitationUrl)}><Smartphone /> Envoyer par SMS</a>}
              {courier.status === "pending_invitation" && <button type="button" className="mvp-button mvp-button--danger" disabled={busy} onClick={() => void cancelInvitation(courier)}>Révoquer</button>}
            </div>
            <form className="mvp-form" onSubmit={(event) => void updateCourier(event, courier)}>
              <div className="mvp-form__grid">
                <label className="mvp-field">Nom<input name="displayName" defaultValue={courier.display_name} required /></label>
                <label className="mvp-field">Téléphone<input name="phone" defaultValue={courier.phone} readOnly aria-describedby={`courier-phone-help-${courier.id}`} /><small id={`courier-phone-help-${courier.id}`}>Identifiant global, modifiable uniquement par le support.</small></label>
                <label className="mvp-field">Email<input value={courier.email ?? ""} readOnly /></label>
                <label className="mvp-field">Véhicule<select name="vehicleType" defaultValue={courier.vehicle_type ?? ""}><option value="">Non renseigné</option>{Object.entries(vehicleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label className="mvp-field">Immatriculation<input name="vehicleRegistration" defaultValue={courier.vehicle_registration ?? ""} /></label>
                <label className="mvp-field">Accès<select name="status" defaultValue={courier.status} disabled={courier.status === "pending_invitation"}>{courier.status === "pending_invitation" && <option value="pending_invitation">Invitation en attente</option>}<option value="active">Actif</option><option value="inactive">Inactif</option></select></label>
              </div>
              <div className="courier-profile__stats"><span>{courier.availability === "busy" ? `Occupé · ${courier.stats.globalActive} mission(s)` : "Disponible"}</span><span>{courier.stats.deliveredThisMonth} ce mois</span><span>{courier.stats.deliveredTotal} livrée(s)</span><span>{courier.stats.failedTotal} échec(s)</span></div>
              <label className="mvp-button mvp-button--secondary">Changer la photo<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadPhoto(courier, event.target.files?.[0] ?? null)} /></label>
              <button className="mvp-button" disabled={busy}>Enregistrer</button>
            </form>
          </article>;
        })}</div>
        {!couriers.length && <p className="mvp-empty">Aucun livreur enregistré.</p>}
      </section>
    </section>}

    {tab === "payments" && <section role="tabpanel" className="courier-tab-panel">
      <section className="merchant-kpi-grid"><article><span>Dû aux livreurs</span><strong>{formatPrice(paymentData.stats.dueXof)}</strong></article><article><span>Payé ce mois</span><strong>{formatPrice(paymentData.stats.paidThisMonthXof)}</strong></article><article><span>Livrées ce mois</span><strong>{stats.deliveredThisMonth}</strong></article></section>
      <section className="mvp-card mvp-card--full"><h2>Rémunérations du mois</h2><div className="mvp-list">{paymentData.courierMonthlyStats.map((item) => <div className="mvp-row" key={item.courierMembershipId}><span><strong>{item.displayName}</strong><small>{item.courseCount} course(s) terminée(s)</small></span><span><small>{formatPrice(item.dueXof)} dû</small><small>{formatPrice(item.pendingXof)} en confirmation</small><small>{formatPrice(item.paidXof)} payé</small></span></div>)}</div>{!paymentData.courierMonthlyStats.length && <p className="mvp-empty">Aucune rémunération ce mois.</p>}</section>
      <section className="mvp-card mvp-card--full"><h2>Régler les livreurs</h2>{canManagePayments ? <><p>Sélectionnez les missions dues d’un seul livreur.</p><div className="mvp-list">{paymentData.deliveries.filter((delivery) => delivery.courier_payment_status === "due").map((delivery) => { const order = one(delivery.orders); const courier = one(delivery.courier_memberships); return <label className="mvp-row" key={delivery.id}><span><input type="checkbox" checked={selectedDeliveries.includes(delivery.id)} onChange={(event) => setSelectedDeliveries((current) => event.target.checked ? [...current, delivery.id] : current.filter((id) => id !== delivery.id))} /> <strong>{order?.public_code}</strong> · {courier?.display_name}<small>Wave : {courier?.wave_payment_number ?? "non renseigné"} · Orange Money : {courier?.orange_money_payment_number ?? "non renseigné"}</small></span><strong>{formatPrice(delivery.courier_payable_xof)}</strong></label>; })}</div><form className="mvp-form" onSubmit={recordPayout}><div className="mvp-form__grid"><label className="mvp-field">Moyen<select name="paymentMethod" required defaultValue="wave"><option value="wave">Wave</option><option value="orange_money">Orange Money</option></select></label><label className="mvp-field">Référence du transfert<input name="externalReference" required /></label></div><button className="mvp-button" disabled={busy || selectedDeliveries.length === 0}>Déclarer le transfert ({selectedDeliveries.length})</button></form></> : <p className="mvp-alert">Seuls le propriétaire et les managers peuvent déclarer un règlement.</p>}<div className="mvp-divider" /><h3>Historique</h3><div className="mvp-list">{paymentData.payouts.map((payout) => { const courier = one(payout.courier_memberships); return <div className="mvp-row" key={payout.id}><div><strong>{courier?.display_name} · {formatPrice(payout.amount_xof)}</strong><small>{paymentLabels[payout.payment_method] ?? payout.payment_method} vers {payout.destination_number} · {new Date(payout.paid_at).toLocaleString("fr-SN")}{payout.external_reference ? ` · réf. ${payout.external_reference}` : ""}</small><small>{payout.status === "pending_confirmation" ? "Confirmation en attente" : payout.status === "confirmed" ? "Réception confirmée" : payout.status === "contested" ? `Contesté : ${payout.contest_reason}` : `Annulé : ${payout.void_reason}`}</small></div>{canManagePayments && ["pending_confirmation", "contested"].includes(payout.status) && <button type="button" className="mvp-button mvp-button--secondary" onClick={() => openVoidPayout(payout)}>Annuler</button>}</div>; })}</div></section>
    </section>}
    {managerDialog && <div className="courier-sheet-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) setManagerDialog(null); }}><section className="courier-sheet" role="dialog" aria-modal="true" aria-labelledby="manager-dialog-title" aria-describedby={dialogError ? "manager-dialog-error" : undefined} onKeyDown={(event) => { if (!busy && event.key === "Escape") setManagerDialog(null); }}><div className="courier-sheet__handle" />
      {managerDialog.kind === "compensation" ? <form className="mvp-form" onSubmit={submitCompensation}><h2 id="manager-dialog-title">Confirmer la compensation</h2><p>Fixez le montant dû pour cette tentative de livraison échouée.</p>{dialogError && <p id="manager-dialog-error" className="mvp-alert mvp-alert--error" role="alert">{dialogError}</p>}<label className="mvp-field">Montant en FCFA<input ref={dialogFieldRef as React.RefObject<HTMLInputElement>} name="amountXof" type="number" min="0" max="100000000" step="1" required defaultValue={managerDialog.delivery.courier_payable_xof || managerDialog.delivery.courier_fee_xof || 0} /></label><div className="mvp-actions"><button className="mvp-button" disabled={busy}>{busy ? "Enregistrement…" : "Confirmer la compensation"}</button><button type="button" className="mvp-button mvp-button--secondary" disabled={busy} onClick={() => setManagerDialog(null)}>Annuler</button></div></form>
      : <form className="mvp-form" onSubmit={submitVoidPayout}><h2 id="manager-dialog-title">Annuler ce règlement ?</h2><p>Les missions concernées redeviendront dues après confirmation.</p>{dialogError && <p id="manager-dialog-error" className="mvp-alert mvp-alert--error" role="alert">{dialogError}</p>}<label className="mvp-field">Motif de l’annulation<textarea ref={dialogFieldRef as React.RefObject<HTMLTextAreaElement>} name="reason" rows={4} minLength={4} maxLength={500} required /></label><div className="mvp-actions"><button className="mvp-button mvp-button--danger" disabled={busy}>{busy ? "Annulation…" : "Confirmer l’annulation"}</button><button type="button" className="mvp-button mvp-button--secondary" disabled={busy} onClick={() => setManagerDialog(null)}>Retour</button></div></form>}
    </section></div>}
  </div>;
}
