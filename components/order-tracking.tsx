"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { formatPrice } from "@/lib/marketplace";

type OrderPayload = {
  order: {
    id: string;
    public_code: string;
    status: string;
    total_xof: number;
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
    merchant_accounts: { public_name: string; slug: string };
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
};

export function OrderTracking({ orderId }: { orderId: string }) {
  const [payload, setPayload] = useState<OrderPayload>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
