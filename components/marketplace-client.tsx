"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CatalogItem, PublicShop, QuoteGroup } from "@/lib/domain/repositories";
import { formatPrice } from "@/lib/marketplace";

type CartLine = {
  product: CatalogItem;
  quantity: number;
};

type OrderResult = {
  publicCode: string;
  id: string;
  merchantId: string;
  totalXof: number;
};

type PaymentMethod =
  | "cash_on_delivery"
  | "wave_direct"
  | "orange_money_direct";

const storageKey = "sunushop-live-cart-v1";

function isPaymentMethodAvailable(
  shop: PublicShop | undefined,
  paymentMethod: PaymentMethod,
) {
  if (paymentMethod === "cash_on_delivery") return true;
  if (paymentMethod === "wave_direct") return Boolean(shop?.paymentMethods.wave);
  return Boolean(shop?.paymentMethods.orangeMoney);
}

export function MarketplaceClient({
  initialProducts,
}: {
  initialProducts: CatalogItem[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [shops, setShops] = useState<Record<string, PublicShop>>({});
  const [zones, setZones] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<Record<string, PaymentMethod>>({});
  const [quote, setQuote] = useState<QuoteGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<OrderResult[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      // Synchronisation unique avec le stockage navigateur après hydratation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setCart(JSON.parse(saved) as CartLine[]);
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  }, [cart]);

  const groups = useMemo(() => {
    const map = new Map<string, CartLine[]>();
    cart.forEach((line) => {
      const existing = map.get(line.product.merchant.id) ?? [];
      existing.push(line);
      map.set(line.product.merchant.id, existing);
    });
    return [...map.entries()];
  }, [cart]);

  useEffect(() => {
    const missing = groups
      .map(([, lines]) => lines[0]?.product.merchant)
      .filter(
        (merchant): merchant is CatalogItem["merchant"] =>
          Boolean(merchant) && !shops[merchant.id],
      );
    if (!missing.length) return;

    Promise.all(
      missing.map(async (merchant) => {
        const response = await fetch(`/api/shops/${merchant.slug}`);
        if (!response.ok) return null;
        const payload = await response.json();
        return payload.data as PublicShop;
      }),
    ).then((loaded) => {
      setShops((current) => {
        const next = { ...current };
        loaded.forEach((shop) => {
          if (shop) next[shop.id] = shop;
        });
        return next;
      });
      setZones((current) => {
        const next = { ...current };
        loaded.forEach((shop) => {
          if (shop?.deliveryZones[0] && !next[shop.id]) {
            next[shop.id] = shop.deliveryZones[0].id;
          }
        });
        return next;
      });
    });
  }, [groups, shops]);

  const add = (product: CatalogItem) => {
    setQuote([]);
    setOrders([]);
    setCart((current) => {
      const existing = current.find(
        (line) => line.product.variant.id === product.variant.id,
      );
      if (existing) {
        return current.map((line) =>
          line === existing
            ? {
                ...line,
                quantity: Math.min(
                  product.variant.availableQuantity,
                  line.quantity + 1,
                ),
              }
            : line,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const remove = (variantId: string) => {
    setQuote([]);
    setCart((current) =>
      current.filter((line) => line.product.variant.id !== variantId),
    );
  };

  const requestGroups = groups.map(([merchantId, lines]) => ({
    merchantId,
    deliveryZoneId: zones[merchantId],
    items: lines.map((line) => ({
      variantId: line.product.variant.id,
      quantity: line.quantity,
    })),
  }));

  const requestQuote = async () => {
    if (requestGroups.some((group) => !group.deliveryZoneId)) {
      setError("Choisissez une zone pour chaque boutique.");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/cart/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groups: requestGroups }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Impossible de calculer le total.");
      return;
    }
    setQuote(payload.data.groups as QuoteGroup[]);
    setMessage("Prix, stock et livraison ont été recalculés.");
  };

  const createOrders = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/orders/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        recipient: {
          name: form.get("name"),
          phone: form.get("phone"),
          region: form.get("region"),
          city: form.get("city"),
          addressHint: form.get("addressHint"),
        },
        groups: requestGroups.map((group) => ({
          ...group,
          paymentMethod: isPaymentMethodAvailable(
            shops[group.merchantId],
            payments[group.merchantId] ?? "cash_on_delivery",
          )
            ? (payments[group.merchantId] ?? "cash_on_delivery")
            : "cash_on_delivery",
        })),
      }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      if (response.status === 401) {
        setError("Connectez-vous avant de confirmer les commandes.");
      } else {
        setError(payload.error?.message ?? "Impossible de créer les commandes.");
      }
      return;
    }
    setOrders(payload.data.orders as OrderResult[]);
    setCart([]);
    setQuote([]);
    localStorage.removeItem(storageKey);
    setMessage("Vos commandes ont été créées séparément par boutique.");
  };

  return (
    <div className="mvp-grid">
      <section className="mvp-card mvp-card--full">
        <span className="mvp-eyebrow">Catalogue vérifié</span>
        <h1 className="mvp-title">Le marché pilote</h1>
        <p className="mvp-lede">
          Les produits apparaissent ici uniquement si le marchand est approuvé,
          abonné et disponible dans une zone configurée.
        </p>
        {initialProducts.length ? (
          <div className="mvp-product-grid">
            {initialProducts.map((product) => (
              <article className="mvp-product" key={product.variant.id}>
                <div className="mvp-product__body">
                  <small>
                    {product.merchant.name} · {product.category.name}
                  </small>
                  <h2>{product.title}</h2>
                  <p>{product.description}</p>
                  <span className="mvp-price">
                    {formatPrice(product.variant.priceXof)}
                  </span>
                  <small>
                    {product.variant.availableQuantity} disponible(s)
                  </small>
                  <button
                    className="mvp-button"
                    onClick={() => add(product)}
                    disabled={product.variant.availableQuantity < 1}
                  >
                    Ajouter au panier
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mvp-empty">
            Aucun produit public pour le moment. Les boutiques apparaîtront
            après validation de leur dossier et activation de leur abonnement.
          </div>
        )}
      </section>

      <aside className="mvp-card mvp-card--full mvp-cart">
        <h2>
          Panier séparé par boutique{" "}
          <span className="mvp-cart-count">{cart.length}</span>
        </h2>
        {message && <p className="mvp-alert">{message}</p>}
        {error && (
          <p className="mvp-alert mvp-alert--error">
            {error}{" "}
            {error.includes("Connectez") && (
              <Link href="/connexion?next=/marche">Se connecter</Link>
            )}
          </p>
        )}
        {orders.length > 0 && (
          <div className="mvp-list">
            {orders.map((order) => (
              <div className="mvp-row" key={order.id}>
                <div>
                  <strong>{order.publicCode}</strong>
                  <small>{formatPrice(order.totalXof)}</small>
                </div>
                <Link
                  className="mvp-button mvp-button--secondary"
                  href={`/commandes/${order.id}`}
                >
                  Suivre
                </Link>
              </div>
            ))}
          </div>
        )}
        {!groups.length ? (
          <p className="mvp-empty">Votre panier est vide.</p>
        ) : (
          <>
            {groups.map(([merchantId, lines]) => {
              const shop = shops[merchantId];
              return (
                <div className="mvp-list" key={merchantId}>
                  <h3>{lines[0].product.merchant.name}</h3>
                  {lines.map((line) => (
                    <div className="mvp-row" key={line.product.variant.id}>
                      <div>
                        <strong>{line.product.title}</strong>
                        <small>
                          {line.quantity} ×{" "}
                          {formatPrice(line.product.variant.priceXof)}
                        </small>
                      </div>
                      <button
                        className="mvp-button mvp-button--secondary"
                        onClick={() => remove(line.product.variant.id)}
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                  <div className="mvp-form__grid">
                    <label className="mvp-field">
                      Zone ou retrait
                      <select
                        value={zones[merchantId] ?? ""}
                        onChange={(event) => {
                          setQuote([]);
                          setZones((current) => ({
                            ...current,
                            [merchantId]: event.target.value,
                          }));
                        }}
                      >
                        <option value="">Choisir</option>
                        {shop?.deliveryZones.map((zone) => (
                          <option value={zone.id} key={zone.id}>
                            {zone.label} · {formatPrice(zone.feeXof)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mvp-field">
                      Paiement
                      <select
                        value={
                          isPaymentMethodAvailable(
                            shop,
                            payments[merchantId] ?? "cash_on_delivery",
                          )
                            ? (payments[merchantId] ?? "cash_on_delivery")
                            : "cash_on_delivery"
                        }
                        onChange={(event) =>
                          setPayments((current) => ({
                            ...current,
                            [merchantId]: event.target.value as PaymentMethod,
                          }))
                        }
                      >
                        <option value="cash_on_delivery">À la livraison</option>
                        {shop?.paymentMethods.wave && (
                          <option value="wave_direct">Wave au vendeur</option>
                        )}
                        {shop?.paymentMethods.orangeMoney && (
                          <option value="orange_money_direct">
                            Orange Money au vendeur
                          </option>
                        )}
                      </select>
                      <small>
                        Disponibles : paiement à la livraison
                        {shop?.paymentMethods.wave ? " · Wave" : ""}
                        {shop?.paymentMethods.orangeMoney
                          ? " · Orange Money"
                          : ""}
                      </small>
                    </label>
                  </div>
                </div>
              );
            })}
            <button className="mvp-button" onClick={requestQuote} disabled={busy}>
              {busy ? "Calcul…" : "Vérifier prix, stock et délais"}
            </button>
          </>
        )}

        {quote.length > 0 && (
          <form className="mvp-form" onSubmit={createOrders}>
            <div className="mvp-divider" />
            <h3>Totaux confirmés</h3>
            {quote.map((group) => (
              <div className="mvp-row" key={group.merchantId}>
                <div>
                  <strong>{group.merchantName}</strong>
                  <small>
                    {group.deliveryLabel} · {group.minDelayMinutes} à{" "}
                    {group.maxDelayMinutes} min
                  </small>
                </div>
                <strong>{formatPrice(group.totalXof)}</strong>
              </div>
            ))}
            <h3>Destinataire</h3>
            <div className="mvp-form__grid">
              <label className="mvp-field">
                Nom
                <input name="name" required />
              </label>
              <label className="mvp-field">
                Téléphone
                <input name="phone" placeholder="+221770000000" required />
              </label>
              <label className="mvp-field">
                Région
                <input name="region" required />
              </label>
              <label className="mvp-field">
                Ville
                <input name="city" required />
              </label>
            </div>
            <label className="mvp-field">
              Adresse ou point de repère
              <textarea name="addressHint" required />
            </label>
            <button className="mvp-button" disabled={busy}>
              {busy ? "Création…" : "Confirmer les commandes"}
            </button>
          </form>
        )}
      </aside>
    </div>
  );
}
