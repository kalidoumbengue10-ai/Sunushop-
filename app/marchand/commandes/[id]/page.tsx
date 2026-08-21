import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MvpShell } from "@/components/mvp-shell";
import { formatPrice } from "@/lib/marketplace";
import { formatMerchantOrderNumber, merchantStatusLabel } from "@/lib/domain/merchant-ui";
import { getAdminSupabase, getServerSupabase } from "@/lib/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

type Snapshot = Record<string, unknown>;

function snapshot(value: unknown): Snapshot {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Snapshot : {};
}

function text(value: unknown, fallback = "Non renseigné") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default async function MerchantOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  if (!supabase) redirect("/marchand");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?profil=vendeur&next=/marchand/commandes/${id}`);

  const admin = getAdminSupabase();
  if (!admin) redirect("/marchand");
  const { data: order, error } = await admin
    .from("orders")
    .select("id, merchant_id, public_code, merchant_sequence, status, payment_method, payment_status, subtotal_xof, delivery_fee_xof, total_xof, recipient_snapshot, delivery_snapshot, created_at, order_items(id, product_snapshot, sku_snapshot, quantity, unit_price_xof, line_total_xof), order_events(id, from_status, to_status, public_message, created_at), deliveries(id, status, assigned_at, pickup_verified_at, delivered_at, terminal_at, failure_reason), direct_payment_declarations(id, external_reference, status, rejection_reason, created_at), order_refunds(id, amount_xof, channel, external_reference, destination_number, status, declared_at, reviewed_at, contest_reason)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!order) notFound();

  const { data: membership } = await admin
    .from("merchant_members")
    .select("role")
    .eq("merchant_id", order.merchant_id)
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "manager", "fulfillment"])
    .maybeSingle();
  if (!membership) notFound();

  const recipient = snapshot(order.recipient_snapshot);
  const delivery = snapshot(order.delivery_snapshot);

  return <MvpShell>
    <main className="mvp-main"><div className="mvp-shell">
      <div className="mvp-actions"><Link className="mvp-button mvp-button--secondary" href="/marchand">Retour aux commandes</Link></div>
      <section className="mvp-card mvp-card--full">
        <span className="mvp-eyebrow">Commande marchande</span>
        <h1>{formatMerchantOrderNumber(order.merchant_sequence)}</h1>
        <p>{order.public_code} · créée le {new Date(order.created_at).toLocaleString("fr-SN")}</p>
        <div className="mvp-actions">
          <span className="mvp-status" data-status={order.status}>{merchantStatusLabel(order.status)}</span>
          <span className="mvp-status" data-status={order.payment_status}>Paiement {merchantStatusLabel(order.payment_status)}</span>
        </div>
      </section>

      <div className="mvp-grid mvp-grid--two">
        <section className="mvp-card">
          <h2>Client et remise</h2>
          <p><strong>{text(recipient.name)}</strong><br />{text(recipient.phone)}</p>
          <p>{text(recipient.addressHint)}<br />{[recipient.city, recipient.region].filter((value) => typeof value === "string").join(", ") || "Localité non renseignée"}</p>
          <p><strong>Mode :</strong> {text(delivery.methodName ?? delivery.methodKind)}<br /><strong>Délai :</strong> {typeof delivery.minDelayMinutes === "number" && typeof delivery.maxDelayMinutes === "number" ? `${Math.floor(delivery.minDelayMinutes / 1440)} à ${Math.ceil(delivery.maxDelayMinutes / 1440)} jour(s)` : "Retrait selon les horaires de la boutique"}</p>
        </section>
        <section className="mvp-card">
          <h2>Paiement</h2>
          <p><strong>Méthode :</strong> {merchantStatusLabel(order.payment_method)}<br /><strong>État :</strong> {merchantStatusLabel(order.payment_status)}</p>
          <p>Sous-total : {formatPrice(order.subtotal_xof)}<br />Livraison : {formatPrice(order.delivery_fee_xof)}<br /><strong>Total : {formatPrice(order.total_xof)}</strong></p>
        </section>
      </div>

      <section className="mvp-card mvp-card--full">
        <h2>Articles à préparer</h2>
        <div className="mvp-list">{order.order_items.map((item) => {
          const product = snapshot(item.product_snapshot);
          return <div className="mvp-row" key={item.id}><div><strong>{text(product.title, "Produit")}</strong><small>SKU {text(item.sku_snapshot, "—")} · quantité {item.quantity}</small></div><span>{formatPrice(item.line_total_xof)}</span></div>;
        })}</div>
      </section>

      <section className="mvp-card mvp-card--full">
        <h2>Historique</h2>
        <div className="mvp-list">{order.order_events.map((event) => <div className="mvp-row" key={event.id}><div><strong>{merchantStatusLabel(event.to_status)}</strong><small>{event.public_message || "Changement de statut"}</small></div><time>{new Date(event.created_at).toLocaleString("fr-SN")}</time></div>)}</div>
        {!order.order_events.length && <p className="mvp-empty">Aucun événement enregistré.</p>}
      </section>

      {(order.deliveries.length > 0 || order.order_refunds.length > 0) && <div className="mvp-grid mvp-grid--two">
        <section className="mvp-card"><h2>Livraison</h2>{order.deliveries.map((item) => <div key={item.id}><span className="mvp-status" data-status={item.status}>{merchantStatusLabel(item.status)}</span>{item.failure_reason && <p className="mvp-alert mvp-alert--warning">Échec : {item.failure_reason}. Livraison à reprogrammer.</p>}</div>)}</section>
        <section className="mvp-card"><h2>Remboursements</h2>{order.order_refunds.map((item) => <div className="mvp-row" key={item.id}><div><strong>{formatPrice(item.amount_xof)}</strong><small>{item.channel} · {item.external_reference}</small></div><span className="mvp-status" data-status={item.status}>{merchantStatusLabel(item.status)}</span></div>)}{!order.order_refunds.length && <p className="mvp-empty">Aucun remboursement.</p>}</section>
      </div>}
    </div></main>
  </MvpShell>;
}
