"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";
import { formatPrice } from "@/lib/marketplace";
import { LocationMap, NavigationLinks } from "@/components/location-map";
import type { Coordinates } from "@/lib/domain/geo";

type OrderItem = { product_snapshot: { title?: string }; sku_snapshot: string; quantity: number; unit_price_xof: number; line_total_xof: number };
type Delivery = {
  id: string; courier_membership_id: string; status: string; publicCode: string; merchantSequence: number;
  orderCreatedAt: string; assigned_at: string; pickup_verified_at: string | null; delivered_at: string | null; terminal_at: string | null;
  pickupCode: string | null; pickup_snapshot: Record<string, unknown>; recipient: Record<string, unknown> | null;
  orderItems: OrderItem[]; shop: { name: string; slug: string } | null; failure_reason: string | null;
  courier_fee_xof: number | null; courier_payable_xof: number; courier_payment_status: string;
  dispute: { id: string; reason: string; opened_at: string } | null;
};
type Membership = {
  id: string; display_name: string; email: string | null; phone: string; vehicle_type: string | null;
  vehicle_registration: string | null; photoUrl: string | null; status: "active" | "inactive";
  wave_payment_number: string | null; orange_money_payment_number: string | null;
  preferred_payment_channel: "wave" | "orange_money" | null;
  merchant_accounts: { public_name: string; slug: string } | Array<{ public_name: string; slug: string }>;
};
type CourierStats = { upcoming: number; active: number; deliveredThisMonth: number; deliveredTotal: number; failedTotal: number; dueXof: number; paidThisMonthXof: number };
type CourierPayout = { id: string; amount_xof: number; payment_method: string; destination_number: string; external_reference: string | null; paid_at: string; status: string; reviewed_at: string | null; contest_reason: string | null; voided_at: string | null; courier_payout_deliveries: Array<{ delivery_id: string }> };
type DeliveryRoute = { geometry: { type: "LineString"; coordinates: number[][] }; distanceMeters: number; durationSeconds: number };
type DeliveryOffer = { id: string; publicCode: string; merchantSequence: number; shopName: string; zone: string; distanceMeters: number; durationSeconds: number; courierFeeXof: number; createdAt: string; expiresAt: string };
type CourierTab = "mission" | "payments";

const terminalStatuses = new Set(["delivered", "failed", "cancelled"]);
const statusLabels: Record<string, string> = { assigned: "À accepter", accepted: "Aller au retrait", at_pickup: "Aller au retrait", picked_up: "En route", in_transit: "En route", delivered: "Livrée", failed: "Échec", cancelled: "Annulée" };
const paymentStatusLabels: Record<string, string> = { not_due: "Non due", review_required: "Compensation à fixer", due: "À payer", payment_declared: "Transfert déclaré", paid: "Payée", waived: "Sans compensation" };
const formatDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("fr-SN", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(value)) : "—";

export function CourierWorkspace() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Delivery[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [payouts, setPayouts] = useState<CourierPayout[]>([]);
  const [stats, setStats] = useState<CourierStats>({ upcoming: 0, active: 0, deliveredThisMonth: 0, deliveredTotal: 0, failedTotal: 0, dueXof: 0, paidThisMonthXof: 0 });
  const [tab, setTab] = useState<CourierTab>(() => searchParams.get("tab") === "paiements" ? "payments" : "mission");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [routes, setRoutes] = useState<Record<string, DeliveryRoute | null>>({});
  const [invitations, setInvitations] = useState<Array<{ id: string; shopName: string; location: string; invitedAt: string }>>([]);
  const [offers, setOffers] = useState<DeliveryOffer[]>([]);
  const [failureDeliveryId, setFailureDeliveryId] = useState<string | null>(null);
  const [contestedPayout, setContestedPayout] = useState<CourierPayout | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutDialogError, setPayoutDialogError] = useState("");
  const contestReasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!contestedPayout) return;
    contestReasonRef.current?.focus();
  }, [contestedPayout]);

  const load = useCallback(async () => {
    const [response, invitationResponse, offerResponse] = await Promise.all([
      fetch("/api/deliveries/mine?page=1&limit=100", { cache: "no-store" }),
      fetch("/api/courier/invitations", { cache: "no-store" }),
      fetch("/api/courier/delivery-offers", { cache: "no-store" }),
    ]);
    const payload = await response.json();
    if (invitationResponse.ok) setInvitations((await invitationResponse.json()).data.items);
    if (offerResponse.ok) setOffers((await offerResponse.json()).data.items);
    if (!response.ok) throw new Error(payload.error?.message);
    setItems(payload.data.items);
    setMemberships(payload.data.memberships); setPayouts(payload.data.payouts); setStats(payload.data.stats);
  }, []);

  const respondToOffer = async (offerId: string, decision: "accept" | "decline") => {
    setError(""); setMessage("");
    const response = await fetch(`/api/courier/delivery-offers/${offerId}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Cette proposition ne peut plus être traitée.");
    setMessage(decision === "accept" ? "Mission acceptée. Les coordonnées du client sont maintenant disponibles." : "Mission refusée. Le marchand peut l’affecter à un autre livreur.");
    await load();
  };

  const respondToInvitation = async (invitationId: string, decision: "accept" | "decline") => {
    setError(""); setMessage("");
    try {
      const response = await fetch(`/api/courier/invitations/${invitationId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error?.message ?? "Action impossible."); return; }
      setMessage(decision === "accept" ? "Invitation acceptée. Vous pouvez recevoir les missions de cette boutique." : "Invitation refusée.");
      await load();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    }
  };
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) load().catch((caught: Error) => setError(caught.message)); });
    // Une première requête peut partir pendant l'hydratation de la session.
    // Cette relance courte évite de laisser un livreur sur un écran vide alors
    // qu'une offre l'attend déjà.
    const initialRetry = window.setTimeout(() => {
      if (!cancelled && document.visibilityState === "visible") void load().catch((caught: Error) => setError(caught.message));
    }, 2_500);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => { cancelled = true; window.clearTimeout(initialRetry); window.clearInterval(interval); };
  }, [load]);
  const membershipKey = memberships.map((membership) => membership.id).sort().join(",");
  useEffect(() => {
    if (!membershipKey) return;
    const supabase = getBrowserSupabase();
    const channel = supabase.channel(`courier-deliveries-${membershipKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `courier_membership_id=in.(${membershipKey})` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_offers", filter: `courier_membership_id=in.(${membershipKey})` }, () => void load())
      // Ces deux tables portent aussi courier_membership_id : sans filtre,
      // chaque livreur connecté recevait (et l'évaluation RLS de Realtime
      // facturait) les événements de TOUTE la plateforme, pas seulement les
      // siens — un litige ou un versement ailleurs rechargeait cet espace.
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_disputes", filter: `courier_membership_id=in.(${membershipKey})` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_payouts", filter: `courier_membership_id=in.(${membershipKey})` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, membershipKey]);

  const activeItems = useMemo(() => items.filter((item) => !terminalStatuses.has(item.status)).sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()), [items]);

  const transition = async (id: string, status: string, options?: { note?: string; failureReason?: string }) => {
    const note = options?.note;
    setError("");
    const response = await fetch(`/api/deliveries/${id}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, note, failureReason: options?.failureReason }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Action impossible.");
    setMessage("Livraison mise à jour."); await load();
  };
  const submitFailure = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!failureDeliveryId) return;
    const values = new FormData(event.currentTarget);
    const reason = String(values.get("reason") ?? "other");
    const details = String(values.get("details") ?? "").trim();
    const labels: Record<string, string> = { client_absent: "Client absent", client_unreachable: "Client injoignable", wrong_address: "Adresse incorrecte", parcel_refused: "Colis refusé", other: "Autre problème" };
    await transition(failureDeliveryId, "failed", { failureReason: reason, note: details || labels[reason] });
    setFailureDeliveryId(null);
  };
  const verifyRecipient = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/deliveries/${id}/verify/recipient`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: form.get("code") }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Code refusé.");
    setMessage("Réception confirmée. La rémunération de cette mission est désormais due."); await load();
  };
  const savePaymentProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/courier/payment-profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ wavePaymentNumber: form.get("waveNumber") || null, orangeMoneyPaymentNumber: form.get("orangeMoneyNumber") || null, preferredPaymentChannel: form.get("preferredChannel") || null }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Coordonnées impossibles à enregistrer.");
    setMessage("Coordonnées de paiement enregistrées."); await load();
  };
  const reviewPayout = async (payout: CourierPayout, decision: "confirmed" | "contested", reason?: string) => {
    if (decision === "contested" && (!reason || reason.length < 4 || reason.length > 500)) {
      setPayoutDialogError("Le motif doit contenir entre 4 et 500 caractères.");
      return;
    }
    setError(""); setMessage("");
    setPayoutBusy(true);
    try {
      const response = await fetch(`/api/courier/payouts/${payout.id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, contestReason: reason }) });
      const payload = await response.json();
      if (!response.ok) {
        const actionError = payload.error?.message ?? "Décision impossible.";
        if (decision === "contested") setPayoutDialogError(actionError); else setError(actionError);
        return;
      }
      setContestedPayout(null); setPayoutDialogError("");
      setMessage(decision === "confirmed" ? "Réception du règlement confirmée." : "Règlement contesté : les missions redeviennent dues."); await load();
    } catch {
      const actionError = "Connexion interrompue. Réessayez sans fermer cette fenêtre.";
      if (decision === "contested") setPayoutDialogError(actionError); else setError(actionError);
    } finally { setPayoutBusy(false); }
  };
  const submitPayoutContest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contestedPayout) return;
    const reason = String(new FormData(event.currentTarget).get("contestReason") ?? "").trim();
    await reviewPayout(contestedPayout, "contested", reason);
  };

  const showRoute = async (deliveryId: string) => {
    setError("");
    const response = await fetch(`/api/deliveries/${deliveryId}/route`);
    const payload = await response.json();
    if (!response.ok) {
      setRoutes((current) => ({ ...current, [deliveryId]: null }));
      return setError(`${payload.error?.message ?? "Itinéraire indisponible."} Les boutons GPS restent utilisables.`);
    }
    setRoutes((current) => ({ ...current, [deliveryId]: payload.data as DeliveryRoute }));
  };

  const deliveryCard = (delivery: Delivery, primary = false) => {
    const hasRecipientDetails = Boolean(delivery.recipient?.name || delivery.recipient?.phone || delivery.recipient?.addressHint);
    const pickup = { latitude: Number(delivery.pickup_snapshot?.latitude), longitude: Number(delivery.pickup_snapshot?.longitude) };
    const destination = { latitude: Number(delivery.recipient?.latitude), longitude: Number(delivery.recipient?.longitude) };
    const hasRouteCoordinates = Number.isFinite(pickup.latitude) && Number.isFinite(pickup.longitude) && Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude);
    const route = routes[delivery.id];
    const active = !terminalStatuses.has(delivery.status);
    const navigationDestination: Coordinates | null = ["assigned", "accepted", "at_pickup"].includes(delivery.status)
      ? (Number.isFinite(pickup.latitude) && Number.isFinite(pickup.longitude) ? pickup : null)
      : (Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude) ? destination : null);
    const secondaryDetails = <>
      {active && hasRouteCoordinates && <div className="courier-route-map">
        {route === undefined && <button type="button" className="mvp-button mvp-button--secondary" onClick={() => void showRoute(delivery.id)}>Afficher l’itinéraire boutique → client</button>}
        {route !== undefined && <>
          <LocationMap point={pickup} destination={destination} route={route?.geometry ?? null} label={String(delivery.shop?.name ?? "Boutique")} />
          {route && <p><strong>{(route.distanceMeters / 1000).toFixed(1)} km</strong> · environ {Math.max(1, Math.round(route.durationSeconds / 60))} min</p>}
          {!route && <p className="mvp-alert mvp-alert--warning">Trajet routier indisponible : la ligne affichée relie directement les deux points.</p>}
        </>}
      </div>}
      <div className="mvp-list">{delivery.orderItems.map((item, index) => <div className="mvp-row" key={`${delivery.id}-${index}`}><span>{item.product_snapshot?.title ?? item.sku_snapshot}</span><strong>× {item.quantity}</strong></div>)}</div>
      <div className="courier-mission__timeline"><small>Affectation : {formatDate(delivery.assigned_at)}</small><small>Retrait : {formatDate(delivery.pickup_verified_at)}</small><small>Livraison : {formatDate(delivery.delivered_at)}</small></div>
      <p className="mvp-alert"><strong>Rémunération : {formatPrice(delivery.courier_payable_xof || delivery.courier_fee_xof || 0)}</strong><br />{paymentStatusLabels[delivery.courier_payment_status] ?? delivery.courier_payment_status}</p>
    </>;
    return <article className={`courier-mission ${primary ? "courier-mission--primary" : ""}`} key={delivery.id}>
      <header><div><small>Commande SunuShop</small><h3>{delivery.publicCode}</h3><small>N° interne boutique {delivery.merchantSequence}</small></div><span className="mvp-status" data-status={delivery.status}>{statusLabels[delivery.status] ?? delivery.status}</span></header>
      <p><strong>{delivery.shop?.name ?? "Boutique"}</strong> · commandée le {formatDate(delivery.orderCreatedAt)}</p>
      <div className="courier-route"><p><span>Retrait</span><strong>{String(delivery.pickup_snapshot?.name ?? delivery.shop?.name ?? "Boutique")}</strong><small>{String(delivery.pickup_snapshot?.phone ?? "")}<br />{String(delivery.pickup_snapshot?.addressHint ?? delivery.pickup_snapshot?.city ?? "")}{delivery.pickup_snapshot?.instructions ? <><br />Instructions : {String(delivery.pickup_snapshot.instructions)}</> : null}</small></p><i>→</i><p><span>Destination</span>{hasRecipientDetails ? <><strong>{String(delivery.recipient?.name ?? "Client")}</strong><small>{String(delivery.recipient?.phone ?? "")}<br />{String(delivery.recipient?.region ?? "")} {String(delivery.recipient?.city ?? "")}<br />{String(delivery.recipient?.addressHint ?? "")}</small></> : <><strong>Mission terminée</strong><small>Coordonnées personnelles masquées</small></>}</p></div>
      {active && navigationDestination && <NavigationLinks destination={navigationDestination} label={["assigned", "accepted", "at_pickup"].includes(delivery.status) ? String(delivery.pickup_snapshot?.addressHint ?? "Boutique") : String(delivery.recipient?.addressHint ?? "Client")} />}
      {delivery.failure_reason && <p className="mvp-alert mvp-alert--warning">Échec : {delivery.failure_reason}</p>}
      {delivery.dispute && <p className="mvp-alert mvp-alert--warning"><strong>Litige actif</strong><br />Les coordonnées nécessaires sont temporairement visibles pour votre défense. {delivery.dispute.reason}</p>}
      <div className={`mvp-actions courier-mission-actions ${primary ? "courier-mission-actions--primary" : ""}`}>
        {delivery.status === "assigned" && <button className="mvp-button" onClick={() => void transition(delivery.id, "accepted")}>Accepter la mission</button>}
        {["accepted", "at_pickup"].includes(delivery.status) && delivery.pickupCode && <div className="courier-pickup-code"><small>Au retrait, montrez ce code au marchand</small><strong>{delivery.pickupCode}</strong><span>Le marchand le valide et votre trajet client démarre automatiquement.</span></div>}
        {["picked_up", "in_transit"].includes(delivery.status) && <form className="courier-code-form" onSubmit={(event) => void verifyRecipient(event, delivery.id)}><label>Code de remise donné par le client<input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" autoComplete="one-time-code" required /></label><button className="mvp-button">Confirmer la remise</button></form>}
        {["picked_up", "in_transit"].includes(delivery.status) && <button className="mvp-button mvp-button--danger" onClick={() => setFailureDeliveryId(delivery.id)}>Signaler un échec</button>}
      </div>
      {primary && active
        ? <details className="courier-mission-details"><summary>Voir les détails de la mission</summary>{secondaryDetails}</details>
        : secondaryDetails}
    </article>;
  };

  const tabs: Array<{ id: CourierTab; label: string; count?: number }> = [
    { id: "mission", label: "Ma mission", count: activeItems.length + offers.length },
    { id: "payments", label: "Mon argent", count: payouts.filter((payout) => payout.status === "pending_confirmation").length },
  ];

  return <div className="courier-workspace">
    <nav className="courier-task-tabs courier-task-tabs--workspace" role="tablist" aria-label="Espace livreur">{tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} key={item.id} onClick={() => setTab(item.id)}><span>{item.label}</span>{Boolean(item.count) && <b>{item.count}</b>}</button>)}</nav>
    {message && <p className="mvp-alert" role="status">{message}</p>}{error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}

    {tab === "mission" && <section role="tabpanel" className="courier-tab-panel courier-current-mission">
      {offers.length > 0 && <section className="courier-offers"><div className="marketplace-section-heading"><div><span className="mvp-eyebrow">Nouvelles propositions</span><h2>À accepter</h2><p>La distance et votre gain sont affichés avant les coordonnées du client.</p></div><span>{offers.length}</span></div><div className="courier-offer-grid">{offers.map((offer) => <article className="courier-offer-card" key={offer.id}><header><div><small>{offer.shopName}</small><h3>{offer.publicCode}</h3></div><strong>{formatPrice(offer.courierFeeXof)}</strong></header><div className="courier-offer-metrics"><span><b>{(offer.distanceMeters / 1000).toFixed(1)} km</b><small>distance</small></span><span><b>{Math.max(1, Math.round(offer.durationSeconds / 60))} min</b><small>estimées</small></span><span><b>{offer.zone || "Zone à préciser"}</b><small>destination</small></span></div><p>Les coordonnées exactes du client apparaîtront après votre acceptation. Offre valable jusqu’à {formatDate(offer.expiresAt)}.</p><div className="mvp-actions"><button className="mvp-button" onClick={() => void respondToOffer(offer.id, "accept")}>Accepter la mission</button><button className="mvp-button mvp-button--secondary" onClick={() => void respondToOffer(offer.id, "decline")}>Refuser</button></div></article>)}</div></section>}
      {invitations.length > 0 && <section className="mvp-card mvp-card--full"><h2>Invitations reçues</h2><p>Ces boutiques souhaitent vous confier leurs livraisons.</p><div className="mvp-list">{invitations.map((invitation) => <div className="mvp-row" key={invitation.id}><span><strong>{invitation.shopName}</strong><small>{invitation.location || "Localisation à préciser"}</small></span><div className="mvp-actions"><button type="button" className="mvp-button" onClick={() => void respondToInvitation(invitation.id, "accept")}>Accepter</button><button type="button" className="mvp-button mvp-button--secondary" onClick={() => void respondToInvitation(invitation.id, "decline")}>Refuser</button></div></div>)}</div></section>}
      <div className="marketplace-section-heading"><div><span className="mvp-eyebrow">À faire maintenant</span><h1>Ma mission</h1><p>Retrait au commerce, puis remise au client : une seule action est affichée à chaque étape.</p></div><span>{activeItems.length}</span></div>
      {activeItems[0] ? deliveryCard(activeItems[0], true) : <div className="mvp-card mvp-card--full courier-empty-state"><h2>Aucune mission en attente</h2><p>Les nouvelles missions confiées par vos boutiques apparaîtront ici.</p></div>}
      {activeItems.length > 1 && <details className="courier-history"><summary>Missions suivantes ({activeItems.length - 1})</summary><div className="courier-mission-grid">{activeItems.slice(1).map((delivery) => deliveryCard(delivery))}</div></details>}
    </section>}

    {tab === "payments" && <section role="tabpanel" className="courier-tab-panel">
      <section className="merchant-kpi-grid"><article><span>Montant dû</span><strong>{formatPrice(stats.dueXof)}</strong></article><article><span>Payé ce mois</span><strong>{formatPrice(stats.paidThisMonthXof)}</strong></article><article><span>Livrées ce mois</span><strong>{stats.deliveredThisMonth}</strong></article></section>
      <section className="mvp-card mvp-card--full"><h2>Mes coordonnées de paiement</h2><p>Ces numéros sont transmis uniquement aux boutiques qui vous rémunèrent.</p><form className="mvp-form" key={`${memberships[0]?.wave_payment_number}-${memberships[0]?.orange_money_payment_number}-${memberships[0]?.preferred_payment_channel}`} onSubmit={savePaymentProfile}><div className="mvp-form__grid"><label className="mvp-field">Numéro Wave<input name="waveNumber" inputMode="tel" defaultValue={memberships[0]?.wave_payment_number ?? ""} /></label><label className="mvp-field">Numéro Orange Money<input name="orangeMoneyNumber" inputMode="tel" defaultValue={memberships[0]?.orange_money_payment_number ?? ""} /></label><label className="mvp-field">Canal préféré<select name="preferredChannel" defaultValue={memberships[0]?.preferred_payment_channel ?? ""}><option value="">Aucun</option><option value="wave">Wave</option><option value="orange_money">Orange Money</option></select></label></div><button className="mvp-button">Enregistrer mes numéros</button></form></section>
      <section className="courier-shops"><h2>Mes règlements</h2><div>{payouts.map((payout) => <article className="courier-shop-profile" key={payout.id}><div><b>{formatPrice(payout.amount_xof)} · {payout.payment_method.replaceAll("_", " ")}</b><small>{formatDate(payout.paid_at)} · vers {payout.destination_number} · {payout.courier_payout_deliveries.length} mission(s){payout.external_reference ? ` · réf. ${payout.external_reference}` : ""}</small><small>{payout.status === "pending_confirmation" ? "Réception à confirmer" : payout.status === "confirmed" ? `Réception confirmée le ${formatDate(payout.reviewed_at)}` : payout.status === "contested" ? `Contesté : ${payout.contest_reason}` : `Règlement annulé le ${formatDate(payout.voided_at)}`}</small></div>{payout.status === "pending_confirmation" && <div className="mvp-actions"><button className="mvp-button" disabled={payoutBusy} onClick={() => void reviewPayout(payout, "confirmed")}>{payoutBusy ? "Traitement…" : "Confirmer la réception"}</button><button className="mvp-button mvp-button--danger" disabled={payoutBusy} onClick={() => { setPayoutDialogError(""); setContestedPayout(payout); }}>Contester</button></div>}</article>)}</div>{!payouts.length && <p className="mvp-empty">Aucun règlement enregistré.</p>}</section>
    </section>}

    {failureDeliveryId && <div className="courier-sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFailureDeliveryId(null); }}><section className="courier-sheet" role="dialog" aria-modal="true" aria-labelledby="courier-failure-title"><div className="courier-sheet__handle" /><h2 id="courier-failure-title">Pourquoi la livraison n’a pas abouti ?</h2><p>Choisissez le motif le plus simple. Le marchand sera averti.</p><form className="mvp-form" onSubmit={submitFailure}><div className="courier-failure-options">{[["client_absent", "Client absent"], ["client_unreachable", "Client injoignable"], ["wrong_address", "Adresse incorrecte"], ["parcel_refused", "Colis refusé"], ["other", "Autre problème"]].map(([value, label], index) => <label key={value}><input type="radio" name="reason" value={value} defaultChecked={index === 0} /><span>{label}</span></label>)}</div><label className="mvp-field">Précision facultative<textarea name="details" rows={3} maxLength={500} placeholder="Ajoutez seulement ce qui aidera le marchand." /></label><div className="mvp-actions"><button className="mvp-button mvp-button--danger">Confirmer l’échec</button><button type="button" className="mvp-button mvp-button--secondary" onClick={() => setFailureDeliveryId(null)}>Retour</button></div></form></section></div>}
    {contestedPayout && <div className="courier-sheet-backdrop" role="presentation" onMouseDown={(event) => { if (!payoutBusy && event.target === event.currentTarget) setContestedPayout(null); }}><section className="courier-sheet" role="dialog" aria-modal="true" aria-labelledby="courier-payout-contest-title" aria-describedby={payoutDialogError ? "courier-payout-contest-error" : "courier-payout-contest-help"} onKeyDown={(event) => { if (!payoutBusy && event.key === "Escape") setContestedPayout(null); }}><div className="courier-sheet__handle" /><form className="mvp-form" onSubmit={submitPayoutContest}><h2 id="courier-payout-contest-title">Contester ce règlement ?</h2><p id="courier-payout-contest-help">Expliquez précisément ce qui manque ou ne correspond pas. Les missions concernées redeviendront dues.</p>{payoutDialogError && <p id="courier-payout-contest-error" className="mvp-alert mvp-alert--error" role="alert">{payoutDialogError}</p>}<label className="mvp-field">Motif de la contestation<textarea ref={contestReasonRef} name="contestReason" rows={4} minLength={4} maxLength={500} required /></label><div className="mvp-actions"><button className="mvp-button mvp-button--danger" disabled={payoutBusy}>{payoutBusy ? "Envoi…" : "Confirmer la contestation"}</button><button type="button" className="mvp-button mvp-button--secondary" disabled={payoutBusy} onClick={() => setContestedPayout(null)}>Retour</button></div></form></section></div>}
  </div>;
}
