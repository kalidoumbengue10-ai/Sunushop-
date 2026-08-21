"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/marketplace";
import { merchantStatusLabel } from "@/lib/domain/merchant-ui";
import { StartConversationButton } from "@/components/start-conversation-button";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";
import { canBuyerCancelOrder, canBuyerHideOrder } from "@/lib/domain/client-order-actions";
import { useCart } from "@/components/cart-provider";

type OrderItem = { id: string; variant_id: string; product_snapshot: { title?: string; variantTitle?: string }; quantity: number; line_total_xof: number };
type Order = {
  id: string;
  merchant_id: string;
  public_code: string;
  status: string;
  payment_status: string;
  total_xof: number;
  loyalty_points_redeemed: number;
  loyalty_discount_xof: number;
  loyalty_points_earned: number;
  created_at: string;
  merchant_accounts: { public_name: string; slug: string } | Array<{ public_name: string; slug: string }>;
  order_items: OrderItem[];
  deliveries: Array<{ id: string; status: string; delivered_at: string | null }>;
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
  const router = useRouter();
  const cart = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("toutes");
  const [merchantFilter, setMerchantFilter] = useState("toutes");
  const [search, setSearch] = useState("");
  const [busyOrderId, setBusyOrderId] = useState("");

  const loadOrders = useCallback(() =>
    fetch("/api/client/orders")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "Commandes indisponibles.");
        setOrders(payload.data.items);
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false)), []);

  useEffect(() => {
    void loadOrders();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadOrders();
    }, 30_000);
    let channel: ReturnType<ReturnType<typeof getBrowserSupabase>["channel"]> | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        channel = supabase.channel("client-order-list")
          .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `buyer_id=eq.${user.id}` }, () => void loadOrders())
          .subscribe();
      } catch { /* Le rafraîchissement périodique reste actif. */ }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (channel) void channel.unsubscribe();
    };
  }, [loadOrders]);

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

  const cancelOrder = async (order: Order) => {
    if (!window.confirm(`Annuler la commande ${order.public_code} ? Cette action est définitive.`)) return;
    setBusyOrderId(order.id); setError("");
    try {
      const response = await fetch(`/api/orders/${order.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled", publicMessage: "La commande a été annulée par le client." }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Annulation impossible.");
      await loadOrders();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Annulation impossible.");
    } finally { setBusyOrderId(""); }
  };

  const hideOrder = async (order: Order) => {
    if (!window.confirm(`Retirer ${order.public_code} de votre liste ? Son historique restera conservé par la boutique.`)) return;
    setBusyOrderId(order.id); setError("");
    try {
      const response = await fetch(`/api/client/orders/${order.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Suppression impossible.");
      setOrders((current) => current.filter((item) => item.id !== order.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suppression impossible.");
    } finally { setBusyOrderId(""); }
  };

  const reorder = async (order: Order) => {
    setBusyOrderId(order.id); setError("");
    try {
      await cart.clear();
      const results = await Promise.all(order.order_items.map(async (item) => {
        const response = await fetch("/api/client/cart", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variantId: item.variant_id, quantity: item.quantity }),
        });
        return response.ok;
      }));
      const availableCount = results.filter(Boolean).length;
      await cart.merge();
      if (!availableCount) throw new Error("Les articles de cette commande ne sont plus disponibles.");
      if (availableCount !== results.length) {
        setError(`${availableCount} article${availableCount > 1 ? "s ont" : " a"} été ajouté${availableCount > 1 ? "s" : ""}. Les autres ne sont plus disponibles dans les quantités demandées.`);
        cart.open();
        return;
      }
      router.push("/commander");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de reconstruire le panier.");
    } finally { setBusyOrderId(""); }
  };

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
          const delivery = order.deliveries[0];
          const canCancel = canBuyerCancelOrder(order.status, delivery?.status);
          const canHide = canBuyerHideOrder(order.status, order.payment_status);
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
                <div><strong>{formatPrice(order.total_xof)}</strong></div>
                <div className="mvp-actions">
                  <Link className="mvp-button mvp-button--secondary" href={`/commandes/${order.id}`}>Voir le suivi</Link>
                  <StartConversationButton
                    merchantId={order.merchant_id}
                    orderId={order.id}
                    subject={`Commande ${order.public_code}`}
                    label="Discuter"
                  />
                  <button type="button" className="mvp-button mvp-button--secondary" disabled={busyOrderId === order.id || !cart.ready} onClick={() => void reorder(order)}>{busyOrderId === order.id ? "Reconstruction…" : "Commander à nouveau"}</button>
                  {canCancel && <button type="button" className="mvp-button mvp-button--danger" disabled={busyOrderId === order.id} onClick={() => void cancelOrder(order)}>Annuler</button>}
                  {canHide && <button type="button" className="mvp-button mvp-button--secondary" disabled={busyOrderId === order.id} onClick={() => void hideOrder(order)}>Retirer de ma liste</button>}
                </div>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
