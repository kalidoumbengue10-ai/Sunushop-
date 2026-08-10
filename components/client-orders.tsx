"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/marketplace";
import { merchantStatusLabel } from "@/lib/domain/merchant-ui";
import { StartConversationButton } from "@/components/start-conversation-button";

type OrderItem = { id: string; product_snapshot: { title?: string; variantTitle?: string }; quantity: number; line_total_xof: number };
type Order = {
  id: string;
  merchant_id: string;
  public_code: string;
  status: string;
  total_xof: number;
  loyalty_points_redeemed: number;
  loyalty_discount_xof: number;
  loyalty_points_earned: number;
  created_at: string;
  merchant_accounts: { public_name: string; slug: string } | Array<{ public_name: string; slug: string }>;
  order_items: OrderItem[];
};

const CANCELLED_STATUSES = new Set(["cancelled", "disputed"]);
const FINISHED_STATUSES = new Set(["delivered"]);
type StatusFilter = "toutes" | "en_cours" | "terminees" | "annulees";
const STATUS_FILTERS: StatusFilter[] = ["toutes", "en_cours", "terminees", "annulees"];
const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  toutes: "Toutes",
  en_cours: "En cours",
  terminees: "Terminées",
  annulees: "Annulées",
};

function orderBucket(status: string): Exclude<StatusFilter, "toutes"> {
  if (CANCELLED_STATUSES.has(status)) return "annulees";
  if (FINISHED_STATUSES.has(status)) return "terminees";
  return "en_cours";
}

function one<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

export function ClientOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("toutes");
  const [merchantFilter, setMerchantFilter] = useState("toutes");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/client/orders")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "Commandes indisponibles.");
        setOrders(payload.data.items);
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, []);

  const merchants = useMemo(
    () => [...new Map(orders.map((order) => { const m = one(order.merchant_accounts); return [m.slug, m.public_name]; })).entries()],
    [orders],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return orders.filter((order) => {
      const merchant = one(order.merchant_accounts);
      if (statusFilter !== "toutes" && orderBucket(order.status) !== statusFilter) return false;
      if (merchantFilter !== "toutes" && merchant.slug !== merchantFilter) return false;
      if (query && !order.public_code.toLocaleLowerCase("fr").includes(query)) return false;
      return true;
    });
  }, [orders, statusFilter, merchantFilter, search]);

  return (
    <div className="client-orders">
      <section className="mvp-card mvp-card--full">
        <span className="mvp-eyebrow">Espace client</span>
        <h1 className="mvp-title">Mes commandes</h1>
        {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
        <div className="client-orders__filters">
          <div className="mvp-tabs" role="tablist" aria-label="Filtrer par statut">
            {STATUS_FILTERS.map((filter) => (
              <button
                type="button"
                key={filter}
                role="tab"
                aria-selected={statusFilter === filter}
                className={statusFilter === filter ? "mvp-tab is-active" : "mvp-tab"}
                onClick={() => setStatusFilter(filter)}
              >
                {STATUS_FILTER_LABELS[filter]}
              </button>
            ))}
          </div>
          <select value={merchantFilter} onChange={(event) => setMerchantFilter(event.target.value)} aria-label="Filtrer par boutique">
            <option value="toutes">Toutes les boutiques</option>
            {merchants.map(([slug, name]) => <option value={slug} key={slug}>{name}</option>)}
          </select>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un numéro de commande"
            aria-label="Rechercher par numéro de commande"
          />
        </div>
      </section>

      {loading && <p className="mvp-empty">Chargement…</p>}
      {!loading && !filtered.length && <p className="mvp-empty">Aucune commande ne correspond à ces filtres.</p>}

      <div className="client-orders__list">
        {filtered.map((order) => {
          const merchant = one(order.merchant_accounts);
          return (
            <article className="client-order-card" key={order.id}>
              <header>
                <div>
                  <Link href={`/commandes/${order.id}`}><strong>{order.public_code}</strong></Link>
                  <small><Link href={`/boutiques/${merchant.slug}`}>{merchant.public_name}</Link> · {new Date(order.created_at).toLocaleDateString("fr-SN")}</small>
                </div>
                <span className="mvp-status" data-status={order.status}>{merchantStatusLabel(order.status)}</span>
              </header>
              <ul className="client-order-card__items">
                {order.order_items.map((item) => (
                  <li key={item.id}>
                    {item.product_snapshot.title}
                    {item.product_snapshot.variantTitle ? ` — ${item.product_snapshot.variantTitle}` : ""}
                    {" "}× {item.quantity}
                  </li>
                ))}
              </ul>
              <footer>
                <div><strong>{formatPrice(order.total_xof)}</strong>{order.loyalty_discount_xof > 0 && <small>{order.loyalty_points_redeemed} points utilisés</small>}{order.loyalty_points_earned > 0 && <small>{order.loyalty_points_earned} points gagnés</small>}</div>
                <div className="mvp-actions">
                  <Link className="mvp-button mvp-button--secondary" href={`/commandes/${order.id}`}>Voir le suivi</Link>
                  <StartConversationButton
                    merchantId={order.merchant_id}
                    orderId={order.id}
                    subject={`Commande ${order.public_code}`}
                    label="Discuter"
                  />
                  <Link className="mvp-button mvp-button--secondary" href={`/boutiques/${merchant.slug}`}>Commander à nouveau</Link>
                </div>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
