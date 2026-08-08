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
    confirmed_by_merchant_at: string | null;
  }>;
  delivery: {
    id: string;
    status: string;
    recipientCode: string | null;
    pickup_verified_at: string | null;
    delivered_at: string | null;
  } | null;
  escrow: {
    id: string;
    status: string;
    releasable_at: string | null;
    dispute_opened_at: string | null;
    dispute_reason: string | null;
    dispute_resolved_at: string | null;
    dispute_resolution: string | null;
  } | null;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-SN", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(value));
}

export function OrderTracking({ orderId }: { orderId: string }) {
  const [payload, setPayload] = useState<OrderPayload>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
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

  const confirmReception = async () => {
    if (!window.confirm("Confirmer que vous avez bien reçu une commande conforme ? Le marchand sera payé.")) return;
    setBusy(true);
    setError("");
    setSavMessage("");
    try {
      const response = await fetch(`/api/orders/${orderId}/reception`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Confirmation impossible.");
      setSavMessage("Merci ! La réception est confirmée et le marchand va être payé.");
      await loadOrder();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible.");
    } finally {
      setBusy(false);
    }
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
      setSavMessage("Votre signalement est transmis à l’équipe SunuShop. Les fonds sont gelés en attendant l’arbitrage.");
      setShowDisputeForm(false);
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
            {!payload.paymentDeclarations.length ? (
              <form className="mvp-form" onSubmit={declarePayment}>
                <label className="mvp-field">
                  Référence du transfert
                  <input name="externalReference" required minLength={4} />
                </label>
                <button className="mvp-button" disabled={busy}>
                  {busy ? "Envoi…" : "Déclarer le paiement"}
                </button>
              </form>
            ) : (
              <p className="mvp-alert">
                Paiement déclaré :{" "}
                {payload.paymentDeclarations[0].external_reference} ·{" "}
                {payload.paymentDeclarations[0].confirmed_by_merchant_at
                  ? "confirmé par le vendeur"
                  : "en attente de confirmation"}
              </p>
            )}
          </>
        )}
        {savMessage && <p className="mvp-alert">{savMessage}</p>}
        {payload.escrow?.status === "held" && payload.order.status === "delivered" && (
          <>
            <div className="mvp-divider" />
            <h2>Réception de la commande</h2>
            {payload.escrow.releasable_at && (
              <p>
                Sans action de votre part, la commande sera validée
                automatiquement le{" "}
                <strong>{formatDateTime(payload.escrow.releasable_at)}</strong>{" "}
                et le marchand sera payé.
              </p>
            )}
            {!showDisputeForm ? (
              <div className="mvp-actions">
                <button className="mvp-button" onClick={confirmReception} disabled={busy}>
                  J’ai bien reçu ma commande, elle est conforme
                </button>
                <button
                  type="button"
                  className="mvp-button mvp-button--secondary"
                  onClick={() => setShowDisputeForm(true)}
                  disabled={busy}
                >
                  Signaler un problème
                </button>
              </div>
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
        {payload.escrow?.status === "disputed" && (
          <>
            <div className="mvp-divider" />
            <h2>Litige en cours</h2>
            <p className="mvp-alert">
              Un litige est ouvert sur cette commande depuis le{" "}
              {payload.escrow.dispute_opened_at && formatDateTime(payload.escrow.dispute_opened_at)}
              . Les fonds sont gelés en attendant l’arbitrage de l’équipe
              SunuShop.
            </p>
          </>
        )}
        {payload.escrow?.dispute_resolution && (
          <>
            <div className="mvp-divider" />
            <p className="mvp-alert">
              Litige résolu —{" "}
              {payload.escrow.dispute_resolution === "refund"
                ? "vous avez été remboursé."
                : "le marchand a été payé."}
            </p>
          </>
        )}
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
