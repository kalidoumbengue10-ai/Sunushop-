"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { OrderBatchConfirmation, type ConfirmedOrder } from "@/components/order-batch-confirmation";
import {
  clearCheckoutDraft,
  readCheckoutDraft,
  saveCheckoutDraft,
  type CheckoutGroupDraft,
  type CheckoutRecipient,
} from "@/lib/domain/checkout-draft";
import { formatPrice } from "@/lib/marketplace";
import type { CartLine } from "@/lib/domain/cart";

type Step = "panier" | "livraison" | "compte" | "confirmation";

type ShopInfo = {
  id: string;
  name: string;
  slug: string;
  paymentMethods: { cashOnDelivery: boolean; wave: boolean; orangeMoney: boolean };
  deliveryZones: Array<{
    id: string;
    label: string;
    feeXof: number;
    minDelayMinutes: number;
    maxDelayMinutes: number;
  }>;
};

type QuoteGroupResult = {
  merchantId: string;
  merchantName: string;
  deliveryZoneId: string;
  deliveryLabel: string;
  subtotalXof: number;
  deliveryFeeXof: number;
  totalXof: number;
};

function groupLinesByMerchant(lines: CartLine[]) {
  const byMerchant = new Map<string, { merchantId: string; merchantName: string; merchantSlug: string; lines: CartLine[] }>();
  for (const line of lines) {
    const key = line.product.merchant.id;
    const bucket = byMerchant.get(key) ?? {
      merchantId: key,
      merchantName: line.product.merchant.name,
      merchantSlug: line.product.merchant.slug,
      lines: [],
    };
    bucket.lines.push(line);
    byMerchant.set(key, bucket);
  }
  return [...byMerchant.values()];
}

const emptyRecipient: CheckoutRecipient = { name: "", phone: "", region: "", city: "", addressHint: "" };

export function CheckoutFlow() {
  const cart = useCart();
  const groups = useMemo(() => groupLinesByMerchant(cart.lines), [cart.lines]);

  const [step, setStep] = useState<Step>("panier");
  const [shops, setShops] = useState<Record<string, ShopInfo>>({});
  const [selectedZones, setSelectedZones] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, CheckoutGroupDraft["paymentMethod"]>>({});
  const [recipient, setRecipient] = useState<CheckoutRecipient>(emptyRecipient);
  const [quote, setQuote] = useState<{ groups: QuoteGroupResult[]; totalXof: number } | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [confirmedOrders, setConfirmedOrders] = useState<ConfirmedOrder[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const resumedRef = useState({ done: false })[0];

  // Charge les fiches boutique (zones de livraison, moyens de paiement) pour chaque marchand du panier.
  useEffect(() => {
    groups.forEach((group) => {
      if (shops[group.merchantId]) return;
      fetch(`/api/shops/${group.merchantSlug}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (!payload?.data) return;
          const shop = payload.data as ShopInfo;
          setShops((current) => ({ ...current, [group.merchantId]: shop }));
          setSelectedZones((current) =>
            current[group.merchantId] ? current : { ...current, [group.merchantId]: shop.deliveryZones[0]?.id ?? "" },
          );
          setPaymentMethods((current) =>
            current[group.merchantId]
              ? current
              : {
                  ...current,
                  [group.merchantId]: shop.paymentMethods.cashOnDelivery
                    ? "cash_on_delivery"
                    : shop.paymentMethods.wave
                      ? "wave_direct"
                      : "orange_money_direct",
                },
          );
        })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  // Détecte une session active pour proposer les adresses sauvegardées et sauter l'étape Compte si déjà connecté.
  useEffect(() => {
    fetch("/api/client/addresses")
      .then((response) => {
        setAuthenticated(response.ok);
        return response.ok ? response.json() : null;
      })
      .then((payload) => {
        const defaultAddress = payload?.data?.items?.find((item: { is_default: boolean }) => item.is_default) ?? payload?.data?.items?.[0];
        if (defaultAddress) {
          setRecipient({
            name: defaultAddress.recipient_name,
            phone: defaultAddress.phone,
            region: defaultAddress.region,
            city: defaultAddress.city,
            addressHint: defaultAddress.address_hint,
          });
        }
      })
      .catch(() => setAuthenticated(false));
  }, []);

  // Reprise après retour d'email de confirmation : ré-hydrate le brouillon puis avance à la Confirmation (sans soumettre).
  useEffect(() => {
    if (resumedRef.done || authenticated !== true) return;
    resumedRef.done = true;
    const draft = readCheckoutDraft();
    if (!draft) return;
    setRecipient(draft.recipient);
    setSelectedZones(Object.fromEntries(draft.groups.map((group) => [group.merchantId, group.deliveryZoneId])));
    setPaymentMethods(Object.fromEntries(draft.groups.map((group) => [group.merchantId, group.paymentMethod])));
    void cart.merge().then(() => setStep("confirmation"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const buildQuoteGroups = () =>
    groups.map((group) => ({
      merchantId: group.merchantId,
      deliveryZoneId: selectedZones[group.merchantId],
      items: group.lines.map((line) => ({ variantId: line.product.variant.id, quantity: line.quantity })),
    }));

  const requestQuote = async () => {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/cart/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups: buildQuoteGroups() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Le devis n’a pas pu être calculé.");
      setQuote(payload.data);
      return true;
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Une erreur est survenue.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const goToLivraison = async () => {
    if (await requestQuote()) setStep("livraison");
  };

  const confirmLivraison = async () => {
    if (!recipient.name || !recipient.phone || !recipient.region || !recipient.city || !recipient.addressHint) {
      setError("Merci de renseigner toutes les informations de livraison.");
      return;
    }
    if (!(await requestQuote())) return;
    saveCheckoutDraft({
      recipient,
      groups: groups.map((group) => ({
        merchantId: group.merchantId,
        deliveryZoneId: selectedZones[group.merchantId],
        paymentMethod: paymentMethods[group.merchantId],
      })),
    });
    setStep(authenticated ? "confirmation" : "compte");
  };

  const submitOrder = async () => {
    setError("");
    setBusy(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/orders/batch", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({
          recipient,
          groups: groups.map((group) => ({
            merchantId: group.merchantId,
            deliveryZoneId: selectedZones[group.merchantId],
            paymentMethod: paymentMethods[group.merchantId],
            items: group.lines.map((line) => ({ variantId: line.product.variant.id, quantity: line.quantity })),
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (["INSUFFICIENT_STOCK", "VARIANT_UNAVAILABLE", "DELIVERY_ZONE_UNAVAILABLE"].includes(payload?.error?.code)) {
          setError("Certains articles ne sont plus disponibles comme prévu. Vérifiez votre panier.");
          setStep("panier");
          void requestQuote();
          return;
        }
        throw new Error(payload?.error?.message ?? "La commande n’a pas pu être créée.");
      }
      clearCheckoutDraft();
      cart.clear();
      const merchantNames = Object.fromEntries(groups.map((group) => [group.merchantId, group.merchantName]));
      setConfirmedOrders(
        payload.data.orders.map((order: ConfirmedOrder) => ({ ...order, merchantName: merchantNames[order.merchantId] })),
      );
      setStep("confirmation");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  if (cart.ready && cart.lines.length === 0 && !confirmedOrders) {
    return (
      <div className="mvp-empty">
        <p>Votre panier est vide.</p>
        <Link href="/marche" className="mvp-button">Découvrir le catalogue</Link>
      </div>
    );
  }

  return (
    <div className="checkout-flow">
      <div className="mvp-stepper" aria-label="Étapes de commande">
        {(["panier", "livraison", "compte", "confirmation"] as Step[]).map((value) => (
          <span key={value} className={step === value || confirmedOrders ? "is-active" : ""} />
        ))}
      </div>

      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}

      {step === "panier" && (
        <section className="checkout-step">
          <h2>Votre panier</h2>
          {groups.map((group) => {
            const shop = shops[group.merchantId];
            return (
              <div className="mvp-card" key={group.merchantId}>
                <h3>{group.merchantName}</h3>
                <ul className="mvp-list">
                  {group.lines.map((line) => (
                    <li className="mvp-row" key={line.product.variant.id}>
                      <div>
                        <strong>{line.product.title}</strong>
                        <small>{line.quantity} × {formatPrice(line.product.variant.priceXof)}</small>
                      </div>
                      <span>{formatPrice(line.quantity * line.product.variant.priceXof)}</span>
                    </li>
                  ))}
                </ul>
                {shop && shop.deliveryZones.length > 0 && (
                  <label className="mvp-field">
                    Zone de livraison
                    <select
                      value={selectedZones[group.merchantId] ?? ""}
                      onChange={(event) => setSelectedZones((current) => ({ ...current, [group.merchantId]: event.target.value }))}
                    >
                      {shop.deliveryZones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.label} — {formatPrice(zone.feeXof)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            );
          })}
          <div className="mvp-actions">
            <button type="button" className="mvp-button" onClick={goToLivraison} disabled={busy}>
              Continuer vers la livraison
            </button>
          </div>
        </section>
      )}

      {step === "livraison" && (
        <section className="checkout-step">
          <h2>Livraison</h2>
          <div className="mvp-form">
            <div className="mvp-form__grid">
              <label className="mvp-field">
                Nom du destinataire
                <input value={recipient.name} onChange={(event) => setRecipient({ ...recipient, name: event.target.value })} required />
              </label>
              <label className="mvp-field">
                Téléphone
                <input value={recipient.phone} onChange={(event) => setRecipient({ ...recipient, phone: event.target.value })} placeholder="+221..." required />
              </label>
              <label className="mvp-field">
                Région
                <input value={recipient.region} onChange={(event) => setRecipient({ ...recipient, region: event.target.value })} required />
              </label>
              <label className="mvp-field">
                Ville
                <input value={recipient.city} onChange={(event) => setRecipient({ ...recipient, city: event.target.value })} required />
              </label>
            </div>
            <label className="mvp-field">
              Précisions d’adresse
              <textarea value={recipient.addressHint} onChange={(event) => setRecipient({ ...recipient, addressHint: event.target.value })} required />
            </label>
          </div>

          {groups.map((group) => {
            const shop = shops[group.merchantId];
            if (!shop) return null;
            return (
              <div className="mvp-card" key={group.merchantId}>
                <h3>Paiement — {group.merchantName}</h3>
                <div className="mvp-actions">
                  {shop.paymentMethods.cashOnDelivery && (
                    <label><input type="radio" checked={paymentMethods[group.merchantId] === "cash_on_delivery"} onChange={() => setPaymentMethods((current) => ({ ...current, [group.merchantId]: "cash_on_delivery" }))} /> À la livraison</label>
                  )}
                  {shop.paymentMethods.wave && (
                    <label><input type="radio" checked={paymentMethods[group.merchantId] === "wave_direct"} onChange={() => setPaymentMethods((current) => ({ ...current, [group.merchantId]: "wave_direct" }))} /> Wave</label>
                  )}
                  {shop.paymentMethods.orangeMoney && (
                    <label><input type="radio" checked={paymentMethods[group.merchantId] === "orange_money_direct"} onChange={() => setPaymentMethods((current) => ({ ...current, [group.merchantId]: "orange_money_direct" }))} /> Orange Money</label>
                  )}
                </div>
              </div>
            );
          })}

          {quote && (
            <div className="mvp-card">
              <h3>Devis</h3>
              <ul className="mvp-list">
                {quote.groups.map((group) => (
                  <li className="mvp-row" key={group.merchantId}>
                    <span>{group.merchantName} · livraison {formatPrice(group.deliveryFeeXof)}</span>
                    <strong>{formatPrice(group.totalXof)}</strong>
                  </li>
                ))}
              </ul>
              <p className="mvp-price">Total : {formatPrice(quote.totalXof)}</p>
            </div>
          )}

          <div className="mvp-actions">
            <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setStep("panier")}>Retour</button>
            <button type="button" className="mvp-button" onClick={confirmLivraison} disabled={busy}>
              {authenticated ? "Continuer vers la confirmation" : "Continuer vers la connexion"}
            </button>
          </div>
        </section>
      )}

      {step === "compte" && (
        <section className="checkout-step">
          <h2>Connexion ou création de compte</h2>
          <p className="mvp-lede">
            Connectez-vous ou créez votre compte pour finaliser la commande. Votre panier et vos informations de livraison sont conservés.
          </p>
          <div className="mvp-actions">
            <Link href="/connexion?profil=client&next=/commander" className="mvp-button">
              Se connecter ou créer un compte
            </Link>
          </div>
        </section>
      )}

      {step === "confirmation" && !confirmedOrders && quote && (
        <section className="checkout-step">
          <h2>Confirmer la commande</h2>
          <ul className="mvp-list">
            {quote.groups.map((group) => (
              <li className="mvp-row" key={group.merchantId}>
                <span>{group.merchantName}</span>
                <strong>{formatPrice(group.totalXof)}</strong>
              </li>
            ))}
          </ul>
          <p className="mvp-price">Total : {formatPrice(quote.totalXof)}</p>
          <div className="mvp-actions">
            <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setStep("livraison")}>Modifier</button>
            <button type="button" className="mvp-button" onClick={submitOrder} disabled={busy}>
              Confirmer la commande
            </button>
          </div>
        </section>
      )}

      {step === "confirmation" && confirmedOrders && (
        <OrderBatchConfirmation orders={confirmedOrders} batchTotalXof={confirmedOrders.reduce((sum, order) => sum + order.totalXof, 0)} />
      )}
    </div>
  );
}
