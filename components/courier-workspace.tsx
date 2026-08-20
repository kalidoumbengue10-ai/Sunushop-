"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
type ShopStat = { membershipId: string; shopName: string; active: number; delivered: number; failed: number; dueXof: number; paidXof: number };
type CourierStats = { upcoming: number; active: number; deliveredThisMonth: number; deliveredTotal: number; failedTotal: number; dueXof: number; paidThisMonthXof: number };
type CourierPayout = { id: string; amount_xof: number; payment_method: string; destination_number: string; external_reference: string | null; paid_at: string; status: string; reviewed_at: string | null; contest_reason: string | null; voided_at: string | null; courier_payout_deliveries: Array<{ delivery_id: string }> };
type DeliveryRoute = { geometry: { type: "LineString"; coordinates: number[][] }; distanceMeters: number; durationSeconds: number };
type CourierTab = "mission" | "history" | "payments" | "profile";

const terminalStatuses = new Set(["delivered", "failed", "cancelled"]);
const statusLabels: Record<string, string> = { assigned: "À accepter", accepted: "Acceptée", at_pickup: "Au commerce", picked_up: "Colis récupéré", in_transit: "En route", delivered: "Livrée", failed: "Échec", cancelled: "Annulée" };
const paymentStatusLabels: Record<string, string> = { not_due: "Non due", review_required: "Compensation à fixer", due: "À payer", payment_declared: "Transfert déclaré", paid: "Payée", waived: "Sans compensation" };
const formatDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("fr-SN", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(value)) : "—";

export function CourierWorkspace() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [shopStats, setShopStats] = useState<ShopStat[]>([]);
  const [payouts, setPayouts] = useState<CourierPayout[]>([]);
  const [stats, setStats] = useState<CourierStats>({ upcoming: 0, active: 0, deliveredThisMonth: 0, deliveredTotal: 0, failedTotal: 0, dueXof: 0, paidThisMonthXof: 0 });
  const [tab, setTab] = useState<CourierTab>("mission");
  const [historyFilter, setHistoryFilter] = useState<"all" | "delivered" | "failed" | "cancelled">("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [routes, setRoutes] = useState<Record<string, DeliveryRoute | null>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/deliveries/mine", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message);
    setItems(payload.data.items); setMemberships(payload.data.memberships); setShopStats(payload.data.shopStats); setPayouts(payload.data.payouts); setStats(payload.data.stats);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `courier_membership_id=in.(${membershipKey})` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_disputes" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_payouts" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, membershipKey]);

  const activeItems = useMemo(() => items.filter((item) => !terminalStatuses.has(item.status)), [items]);
  const historyItems = useMemo(() => items.filter((item) => terminalStatuses.has(item.status) && (historyFilter === "all" || item.status === historyFilter)), [historyFilter, items]);

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
  const reviewPayout = async (payout: CourierPayout, decision: "confirmed" | "contested") => {
    const reason = decision === "contested" ? window.prompt("Pourquoi contestez-vous ce règlement ?") : undefined;
    if (decision === "contested" && !reason) return;
    setError(""); setMessage("");
    const response = await fetch(`/api/courier/payouts/${payout.id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, contestReason: reason }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Décision impossible.");
    setMessage(decision === "confirmed" ? "Réception du règlement confirmée." : "Règlement contesté : les missions redeviennent dues."); await load();
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
    const navigationDestination: Coordinates | null = ["assigned", "accepted", "at_pickup"].includes(delivery.status)
      ? (Number.isFinite(pickup.latitude) && Number.isFinite(pickup.longitude) ? pickup : null)
      : (Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude) ? destination : null);
    return <article className={`courier-mission ${primary ? "courier-mission--primary" : ""}`} key={delivery.id}>
      <header><div><small>Commande SunuShop</small><h3>{delivery.publicCode}</h3><small>N° interne boutique {delivery.merchantSequence}</small></div><span className="mvp-status" data-status={delivery.status}>{statusLabels[delivery.status] ?? delivery.status}</span></header>
      <p><strong>{delivery.shop?.name ?? "Boutique"}</strong> · commandée le {formatDate(delivery.orderCreatedAt)}</p>
      <div className="courier-route"><p><span>Retrait</span><strong>{String(delivery.pickup_snapshot?.name ?? delivery.shop?.name ?? "Boutique")}</strong><small>{String(delivery.pickup_snapshot?.phone ?? "")}<br />{String(delivery.pickup_snapshot?.addressHint ?? delivery.pickup_snapshot?.city ?? "")}{delivery.pickup_snapshot?.instructions ? <><br />Instructions : {String(delivery.pickup_snapshot.instructions)}</> : null}</small></p><i>→</i><p><span>Destination</span>{hasRecipientDetails ? <><strong>{String(delivery.recipient?.name ?? "Client")}</strong><small>{String(delivery.recipient?.phone ?? "")}<br />{String(delivery.recipient?.region ?? "")} {String(delivery.recipient?.city ?? "")}<br />{String(delivery.recipient?.addressHint ?? "")}</small></> : <><strong>Mission terminée</strong><small>Coordonnées personnelles masquées</small></>}</p></div>
      {!terminalStatuses.has(delivery.status) && navigationDestination && <NavigationLinks destination={navigationDestination} label={["assigned", "accepted", "at_pickup"].includes(delivery.status) ? String(delivery.pickup_snapshot?.addressHint ?? "Boutique") : String(delivery.recipient?.addressHint ?? "Client")} />}
      {!terminalStatuses.has(delivery.status) && hasRouteCoordinates && <div className="courier-route-map">
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
      {delivery.failure_reason && <p className="mvp-alert mvp-alert--warning">Échec : {delivery.failure_reason}</p>}
      {delivery.dispute && <p className="mvp-alert mvp-alert--warning"><strong>Litige actif</strong><br />Les coordonnées nécessaires sont temporairement visibles pour votre défense. {delivery.dispute.reason}</p>}
      <div className={`mvp-actions courier-mission-actions ${primary ? "courier-mission-actions--primary" : ""}`}>
        {delivery.status === "assigned" && <button className="mvp-button" onClick={() => void transition(delivery.id, "accepted")}>Accepter la mission</button>}
        {delivery.status === "accepted" && <button className="mvp-button" onClick={() => void transition(delivery.id, "at_pickup")}>Je suis arrivé au retrait</button>}
        {delivery.status === "at_pickup" && delivery.pickupCode && <div className="courier-pickup-code"><small>Présentez ce code au commerçant</small><strong>{delivery.pickupCode}</strong><span>Il disparaît dès sa validation.</span></div>}
        {["picked_up", "in_transit"].includes(delivery.status) && <form className="courier-code-form" onSubmit={(event) => void verifyRecipient(event, delivery.id)}><label>Code donné par le client<input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" autoComplete="one-time-code" required /></label><button className="mvp-button">Confirmer la remise</button></form>}
        {["picked_up", "in_transit"].includes(delivery.status) && <button className="mvp-button mvp-button--danger" onClick={() => void transition(delivery.id, "failed")}>Signaler un échec</button>}
      </div>
    </article>;
  };

  const tabs: Array<{ id: CourierTab; label: string; count?: number }> = [
    { id: "mission", label: "Mission actuelle", count: activeItems.length },
    { id: "history", label: "Historique" },
    { id: "payments", label: "Paiements", count: payouts.filter((payout) => payout.status === "pending_confirmation").length },
    { id: "profile", label: "Profil" },
  ];

  return <div className="courier-workspace">
    <nav className="courier-task-tabs courier-task-tabs--workspace" role="tablist" aria-label="Espace livreur">{tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} key={item.id} onClick={() => setTab(item.id)}><span>{item.label}</span>{Boolean(item.count) && <b>{item.count}</b>}</button>)}</nav>
    {message && <p className="mvp-alert" role="status">{message}</p>}{error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}

    {tab === "mission" && <section role="tabpanel" className="courier-tab-panel courier-current-mission">
      <div className="marketplace-section-heading"><div><span className="mvp-eyebrow">À faire maintenant</span><h1>Ma mission actuelle</h1><p>Une seule action principale est affichée à chaque étape.</p></div><span>{activeItems.length}</span></div>
      {activeItems[0] ? deliveryCard(activeItems[0], true) : <div className="mvp-card mvp-card--full courier-empty-state"><h2>Aucune mission en attente</h2><p>Les nouvelles missions confiées par vos boutiques apparaîtront ici.</p></div>}
      {activeItems.length > 1 && <details className="courier-history"><summary>Missions suivantes ({activeItems.length - 1})</summary><div className="courier-mission-grid">{activeItems.slice(1).map((delivery) => deliveryCard(delivery))}</div></details>}
    </section>}

    {tab === "history" && <section role="tabpanel" className="courier-tab-panel">
      <div className="marketplace-section-heading"><div><h1>Historique</h1><p>Consultez vos missions terminées, échouées ou annulées.</p></div><span>{historyItems.length}</span></div>
      <div className="courier-filter-tabs">{(["all", "delivered", "failed", "cancelled"] as const).map((value) => <button type="button" key={value} className={`mvp-button ${historyFilter === value ? "" : "mvp-button--secondary"}`} onClick={() => setHistoryFilter(value)}>{value === "all" ? "Toutes" : statusLabels[value]}</button>)}</div>
      <div className="courier-mission-grid courier-mission-grid--history">{historyItems.map((delivery) => deliveryCard(delivery))}</div>
      {!historyItems.length && <p className="mvp-empty">Aucune mission dans cette catégorie.</p>}
    </section>}

    {tab === "payments" && <section role="tabpanel" className="courier-tab-panel">
      <section className="merchant-kpi-grid"><article><span>Montant dû</span><strong>{formatPrice(stats.dueXof)}</strong></article><article><span>Payé ce mois</span><strong>{formatPrice(stats.paidThisMonthXof)}</strong></article><article><span>Livrées ce mois</span><strong>{stats.deliveredThisMonth}</strong></article></section>
      <section className="mvp-card mvp-card--full"><h2>Mes coordonnées de paiement</h2><p>Ces numéros sont transmis uniquement aux boutiques qui vous rémunèrent.</p><form className="mvp-form" key={`${memberships[0]?.wave_payment_number}-${memberships[0]?.orange_money_payment_number}-${memberships[0]?.preferred_payment_channel}`} onSubmit={savePaymentProfile}><div className="mvp-form__grid"><label className="mvp-field">Numéro Wave<input name="waveNumber" inputMode="tel" defaultValue={memberships[0]?.wave_payment_number ?? ""} /></label><label className="mvp-field">Numéro Orange Money<input name="orangeMoneyNumber" inputMode="tel" defaultValue={memberships[0]?.orange_money_payment_number ?? ""} /></label><label className="mvp-field">Canal préféré<select name="preferredChannel" defaultValue={memberships[0]?.preferred_payment_channel ?? ""}><option value="">Aucun</option><option value="wave">Wave</option><option value="orange_money">Orange Money</option></select></label></div><button className="mvp-button">Enregistrer mes numéros</button></form></section>
      <section className="courier-shops"><h2>Mes règlements</h2><div>{payouts.map((payout) => <article className="courier-shop-profile" key={payout.id}><div><b>{formatPrice(payout.amount_xof)} · {payout.payment_method.replaceAll("_", " ")}</b><small>{formatDate(payout.paid_at)} · vers {payout.destination_number} · {payout.courier_payout_deliveries.length} mission(s){payout.external_reference ? ` · réf. ${payout.external_reference}` : ""}</small><small>{payout.status === "pending_confirmation" ? "Réception à confirmer" : payout.status === "confirmed" ? `Réception confirmée le ${formatDate(payout.reviewed_at)}` : payout.status === "contested" ? `Contesté : ${payout.contest_reason}` : `Règlement annulé le ${formatDate(payout.voided_at)}`}</small></div>{payout.status === "pending_confirmation" && <div className="mvp-actions"><button className="mvp-button" onClick={() => void reviewPayout(payout, "confirmed")}>Confirmer la réception</button><button className="mvp-button mvp-button--danger" onClick={() => void reviewPayout(payout, "contested")}>Contester</button></div>}</article>)}</div>{!payouts.length && <p className="mvp-empty">Aucun règlement enregistré.</p>}</section>
    </section>}

    {tab === "profile" && <section role="tabpanel" className="courier-tab-panel">
      <section className="courier-hero"><div><span className="mvp-eyebrow">Espace livreur</span><h1>Mon profil</h1><p>Vos boutiques, votre véhicule et vos statistiques sont regroupés ici.</p></div><div className="courier-month-stat"><strong>{stats.deliveredThisMonth}</strong><span>livraison{stats.deliveredThisMonth > 1 ? "s" : ""}<br />ce mois-ci</span></div></section>
      <section className="merchant-kpi-grid"><article><span>Total livré</span><strong>{stats.deliveredTotal}</strong></article><article><span>Échecs</span><strong>{stats.failedTotal}</strong></article><article><span>À venir</span><strong>{stats.upcoming}</strong></article></section>
      <section className="courier-shops"><h2>Activité par boutique</h2><div>{shopStats.map((shop) => <article className="courier-shop-profile" key={shop.membershipId}><div><b>{shop.shopName}</b><small>{shop.active} active(s) · {shop.delivered} livrée(s) · {shop.failed} échec(s)</small><small>{formatPrice(shop.dueXof)} dû · {formatPrice(shop.paidXof)} payé</small></div></article>)}</div></section>
      <section className="courier-shops"><h2>Mes profils boutique</h2><div>{memberships.map((membership) => { const shop = Array.isArray(membership.merchant_accounts) ? membership.merchant_accounts[0] : membership.merchant_accounts; return <article className="courier-shop-profile" key={membership.id}>{membership.photoUrl ? <Image unoptimized width={72} height={72} src={membership.photoUrl} alt="" /> : <div className="courier-profile__placeholder">{membership.display_name.slice(0, 1)}</div>}<div><b>{shop?.public_name ?? "Boutique"}</b><small>{membership.display_name} · {membership.phone}</small><small>{membership.vehicle_type ? `${membership.vehicle_type}${membership.vehicle_registration ? ` · ${membership.vehicle_registration}` : ""}` : "Véhicule non renseigné"}</small><small>{membership.status === "active" ? "Accès actif" : "Historique uniquement"}</small></div></article>; })}</div></section>
    </section>}
  </div>;
}
