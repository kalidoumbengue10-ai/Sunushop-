"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AideSupportButton } from "@/components/aide-support-button";
import { ShopContact } from "@/components/shop-contact";
import { StartConversationButton } from "@/components/start-conversation-button";
import { siteConfig } from "@/app/site-config";
import { formatPrice } from "@/lib/marketplace";

type OrderPayload = {
  order: {
    id: string;
    merchant_id: string;
    public_code: string;
    status: string;
    payment_status: string;
    total_xof: number;
    loyalty_points_redeemed: number;
    loyalty_discount_xof: number;
    loyalty_points_earned: number;
    payment_method: string;
    payment_instructions_snapshot: {
      channel?: string;
      number?: string;
    };
    delivery_snapshot: {
      zoneLabel?: string;
      minDelayMinutes?: number;
      maxDelayMinutes?: number;
    };
    merchant_accounts: { public_name: string; slug: string; phone: string | null; email: string | null };
  };
  items: Array<{
    id: string;
    product_snapshot: { title?: string };
    quantity: number;
    line_total_xof: number;
  }>;
  events: Array<{
    id: number;
    to_status: string;
    public_message: string | null;
    created_at: string;
  }>;
  paymentDeclarations: Array<{
    id: string;
    channel: string;
    external_reference: string;
    amount_xof: number;
    declared_at: string;
    status: "pending" | "confirmed" | "rejected";
    reviewed_at: string | null;
    rejection_reason: string | null;
    confirmed_by_merchant_at: string | null;
  }>;
  delivery: {
    id: string;
    status: string;
    recipientCode: string | null;
    pickup_verified_at: string | null;
    delivered_at: string | null;
  } | null;
  refunds: Array<{
    id: string; amount_xof: number; channel: string; external_reference: string;
    status: "pending_confirmation" | "confirmed" | "contested"; declared_at: string;
    reviewed_at: string | null; contest_reason: string | null;
  }>;
  orderDisputes: Array<{
    id: string; reason: string; status: string; resolution: string | null;
    resolution_note: string | null; opened_at: string; resolved_at: string | null;
  }>;
  deliveryDisputes: Array<{
    id: string;
    reason: string;
    status: "open" | "resolved" | "dismissed";
    resolution: string | null;
    opened_at: string;
    resolved_at: string | null;
    delivery_dispute_events: Array<{ id: number; event_type: string; message: string; created_at: string }>;
  }>;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-SN", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(value));
}
const paymentStatusLabels: Record<string, string> = {
  awaiting_payment: "à payer", cash_due: "espèces dues au retrait",
  pending_confirmation: "validation en attente", paid: "payé",
  payment_refused: "paiement refusé", refund_pending: "remboursement en attente",
  refunded: "remboursé",
};

export function OrderTracking({ orderId }: { orderId: string }) {
  const [payload, setPayload] = useState<OrderPayload>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [showDeliveryDisputeForm, setShowDeliveryDisputeForm] = useState(false);
  const [savMessage, setSavMessage] = useState("");

  const loadOrder = () =>
    fetch(`/api/orders/${orderId}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setPayload(body.data as OrderPayload);
    });

  useEffect(() => {
    loadOrder()
      .catch((caught: Error) =>
        setError(caught.message || "Commande introuvable."),
      );
    // orderId est l’unique clé du chargement initial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const declarePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!payload) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const channel =
      payload.order.payment_method === "wave_direct"
        ? "wave"
        : "orange_money";
    const response = await fetch(
      `/api/orders/${orderId}/payment-declarations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel,
          externalReference: form.get("externalReference"),
          amountXof: payload.order.total_xof,
          declaredAt: new Date().toISOString(),
        }),
      },
    );
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(body.error?.message ?? "Déclaration impossible.");
      return;
    }
    event.currentTarget.reset();
    await loadOrder();
  };

  const submitDispute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSavMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/orders/${orderId}/dispute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: form.get("reason") }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Signalement impossible.");
      setSavMessage("Votre signalement est transmis à l’équipe SunuShop. Le support va examiner le dossier avec le marchand.");
      setShowDisputeForm(false);
      await loadOrder();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Signalement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const reviewRefund = async (refundId: string, decision: "confirmed" | "contested") => {
    const contestReason = decision === "contested" ? window.prompt("Pourquoi contestez-vous la réception du remboursement ?") : null;
    if (decision === "contested" && (!contestReason || contestReason.trim().length < 4)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/orders/${orderId}/refunds`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ refundId, decision, contestReason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Décision impossible.");
      setSavMessage(decision === "confirmed" ? "Remboursement confirmé." : "Remboursement contesté et transmis au support.");
      await loadOrder();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally { setBusy(false); }
  };

  const submitDeliveryDispute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSavMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/orders/${orderId}/delivery-disputes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: form.get("reason") }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Signalement impossible.");
      setSavMessage("Votre litige de livraison est transmis au support SunuShop.");
      setShowDeliveryDisputeForm(false);
      await loadOrder();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Signalement impossible.");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <p className="mvp-alert mvp-alert--error">
        {error} <Link href="/connexion?next=/marche">Se connecter</Link>
      </p>
    );
  }
  if (!payload) return <p>Chargement de la commande…</p>;

  return (
    <div className="mvp-grid">
      <section className="mvp-card">
        <span
          className="mvp-status"
          data-status={payload.order.status}
        >
          {payload.order.status.replaceAll("_", " ")}
        </span>
        <h1 className="mvp-title">{payload.order.public_code}</h1>
        <p className="mvp-lede">
          {payload.order.merchant_accounts.public_name} ·{" "}
          {formatPrice(payload.order.total_xof)}
        </p>
        {payload.order.loyalty_discount_xof > 0 && <p className="mvp-alert"><strong>{payload.order.loyalty_points_redeemed} points utilisés</strong><br />Remise fidélité : {formatPrice(payload.order.loyalty_discount_xof)}</p>}
        {payload.order.loyalty_points_earned > 0 && <p className="mvp-alert">Cette livraison vous a rapporté <strong>{payload.order.loyalty_points_earned} points</strong> dans cette boutique.</p>}
        {payload.delivery?.recipientCode && (
          <div className="mvp-alert">
            <strong>Code de réception</strong>
            <div className="mvp-code">{payload.delivery.recipientCode}</div>
            Ne communiquez ce code au livreur qu’après avoir reçu votre commande.
          </div>
        )}
        <div className="mvp-list">
          {payload.items.map((item) => (
            <div className="mvp-row" key={item.id}>
              <div>
                <strong>{item.product_snapshot.title || "Produit"}</strong>
                <small>Quantité {item.quantity}</small>
              </div>
              <strong>{formatPrice(item.line_total_xof)}</strong>
            </div>
          ))}
        </div>
        <div className="mvp-divider" />
        <h2>Contacter le commerçant</h2>
        <ShopContact
          phone={payload.order.merchant_accounts.phone}
          email={payload.order.merchant_accounts.email}
        />
        <StartConversationButton
          merchantId={payload.order.merchant_id}
          orderId={payload.order.id}
          subject={`Commande ${payload.order.public_code}`}
          label="Discuter de cette commande"
        />

        {payload.order.payment_method !== "cash_on_delivery" && (
          <>
            <div className="mvp-divider" />
            <h2>Paiement direct au vendeur</h2>
            <p className="mvp-status" data-status={payload.order.payment_status}>Statut : {paymentStatusLabels[payload.order.payment_status] ?? payload.order.payment_status}</p>
            {["paid", "refund_pending", "refunded"].includes(payload.order.payment_status) && (
              <a className="mvp-button mvp-button--secondary" href={`/api/orders/${orderId}/receipt`} target="_blank" rel="noopener noreferrer">
                Télécharger le reçu
              </a>
            )}
            <p>
              Envoyez {formatPrice(payload.order.total_xof)} par{" "}
              {payload.order.payment_method === "wave_direct"
                ? "Wave"
                : "Orange Money"}{" "}
              au{" "}
              <strong>
                {payload.order.payment_instructions_snapshot.number}
              </strong>
              , puis indiquez la référence.
            </p>
            {!payload.paymentDeclarations.some((item) => item.status === "pending") && !["paid", "refund_pending", "refunded"].includes(payload.order.payment_status) ? (
              <form className="mvp-form" onSubmit={declarePayment}>
                <label className="mvp-field">
                  Référence du transfert
                  <input name="externalReference" required minLength={4} />
                </label>
                <button className="mvp-button" disabled={busy}>
                  {busy ? "Envoi…" : "Déclarer le paiement"}
                </button>
              </form>
            ) : null}
            {payload.paymentDeclarations.map((declaration) => <p className="mvp-alert" key={declaration.id}>
              Paiement {declaration.external_reference} · {declaration.status === "confirmed" ? "confirmé par le vendeur" : declaration.status === "rejected" ? "refusé par le vendeur" : "en attente de confirmation"}
              {declaration.rejection_reason ? <><br />Motif : {declaration.rejection_reason}</> : null}
            </p>)}
          </>
        )}
        {payload.refunds.map((refund) => <div className="mvp-alert" key={refund.id}>
          <strong>Remboursement de {formatPrice(refund.amount_xof)}</strong><br />
          {refund.channel} · référence {refund.external_reference} · {refund.status.replaceAll("_", " ")}
          {refund.status === "pending_confirmation" && <div className="mvp-actions">
            <button className="mvp-button" onClick={() => void reviewRefund(refund.id, "confirmed")} disabled={busy}>Confirmer la réception</button>
            <button className="mvp-button mvp-button--secondary" onClick={() => void reviewRefund(refund.id, "contested")} disabled={busy}>Contester</button>
          </div>}
          {refund.contest_reason && <p>Motif : {refund.contest_reason}</p>}
        </div>)}
        {savMessage && <p className="mvp-alert">{savMessage}</p>}
        {payload.delivery && ["assigned", "accepted", "at_pickup", "picked_up", "in_transit", "delivered", "failed"].includes(payload.delivery.status) && !payload.deliveryDisputes.some((item) => item.status === "open") && (
          <>
            <div className="mvp-divider" />
            <h2>Problème de livraison</h2>
            <p>Vous pouvez ouvrir un dossier pendant la livraison ou jusqu’à trois jours après sa fin, quel que soit votre moyen de paiement.</p>
            {!showDeliveryDisputeForm ? (
              <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setShowDeliveryDisputeForm(true)} disabled={busy}>
                Ouvrir un litige de livraison
              </button>
            ) : (
              <form className="mvp-form" onSubmit={submitDeliveryDispute}>
                <label className="mvp-field">
                  Décrivez précisément le problème (20 caractères minimum)
                  <textarea name="reason" required minLength={20} maxLength={1000} rows={4} />
                </label>
                <div className="mvp-actions">
                  <button className="mvp-button mvp-button--danger" disabled={busy}>{busy ? "Envoi…" : "Transmettre au support"}</button>
                  <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setShowDeliveryDisputeForm(false)} disabled={busy}>Annuler</button>
                </div>
              </form>
            )}
          </>
        )}
        {payload.deliveryDisputes.map((dispute) => (
          <div className="mvp-alert" key={dispute.id}>
            <strong>Litige de livraison {dispute.status === "open" ? "en cours" : "traité"}</strong>
            <p>{dispute.reason}</p>
            <small>Ouvert le {formatDateTime(dispute.opened_at)}</small>
            {dispute.resolution && <p><strong>Décision du support :</strong> {dispute.resolution}</p>}
          </div>
        ))}
        {["paid", "refund_pending"].includes(payload.order.payment_status) && !payload.orderDisputes.some((item) => ["open", "refund_required"].includes(item.status)) && (
          <>
            <div className="mvp-divider" />
            <h2>Problème avec la commande</h2>
            {!showDisputeForm ? (
              <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setShowDisputeForm(true)} disabled={busy}>Signaler un problème de commande ou de paiement</button>
            ) : (
              <form className="mvp-form" onSubmit={submitDispute}>
                <label className="mvp-field">
                  Décrivez le problème rencontré (20 caractères minimum)
                  <textarea name="reason" required minLength={20} maxLength={1000} rows={4} />
                </label>
                <div className="mvp-actions">
                  <button className="mvp-button mvp-button--danger" disabled={busy}>
                    {busy ? "Envoi…" : "Envoyer le signalement"}
                  </button>
                  <button
                    type="button"
                    className="mvp-button mvp-button--secondary"
                    onClick={() => setShowDisputeForm(false)}
                    disabled={busy}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            )}
          </>
        )}
        {payload.orderDisputes.map((dispute) => <div className="mvp-alert" key={dispute.id}>
          <strong>Litige de commande · {dispute.status.replaceAll("_", " ")}</strong>
          <p>{dispute.reason}</p><small>Ouvert le {formatDateTime(dispute.opened_at)}</small>
          {dispute.resolution_note && <p>Décision du support : {dispute.resolution_note}</p>}
        </div>)}
      </section>
      <section className="mvp-card">
        <h2>Besoin d’aide ?</h2>
        <p className="mvp-lede">
          Un problème avec cette commande, une question sur votre paiement ou votre livraison ?
          L’équipe SunuShop peut vous aider.
        </p>
        <div className="mvp-actions">
          <AideSupportButton />
          <a
            className="mvp-button mvp-button--secondary"
            href={`mailto:${siteConfig.supportEmail}?subject=${encodeURIComponent(`SAV commande ${payload.order.public_code}`)}`}
          >
            Contacter le SAV par email
          </a>
        </div>
      </section>
      <section className="mvp-card">
        <h2>Historique vérifiable</h2>
        <div className="mvp-list">
          {payload.events.map((event) => (
            <div className="mvp-row" key={event.id}>
              <div>
                <strong>{event.to_status.replaceAll("_", " ")}</strong>
                <small>
                  {new Intl.DateTimeFormat("fr-SN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.created_at))}
                </small>
              </div>
              <span>{event.public_message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
