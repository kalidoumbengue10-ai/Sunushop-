import Link from "next/link";
import { formatPrice } from "@/lib/marketplace";

export type ConfirmedOrder = {
  id: string;
  publicCode: string;
  merchantId: string;
  merchantName?: string;
  totalXof: number;
  status: string;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscountXof?: number;
  loyaltyPointsEarnable?: number;
};

export function OrderBatchConfirmation({ orders, batchTotalXof }: { orders: ConfirmedOrder[]; batchTotalXof: number }) {
  return (
    <div className="checkout-confirmation">
      <span className="mvp-eyebrow">Commande confirmée</span>
      <h2>Merci, votre commande est enregistrée</h2>
      <p className="mvp-lede">
        {orders.length > 1
          ? `Votre commande a été répartie en ${orders.length} commandes, une par boutique.`
          : "Votre commande a bien été transmise à la boutique."}{" "}
        Montant total : <strong>{formatPrice(batchTotalXof)}</strong>.
      </p>
      <ul className="mvp-list">
        {orders.map((order) => (
          <li className="mvp-row" key={order.id}>
            <div>
              <strong>{order.merchantName ?? "Boutique"}</strong>
              <small>Commande {order.publicCode} · {formatPrice(order.totalXof)}</small>
              {Boolean(order.loyaltyDiscountXof) && <small>{order.loyaltyPointsRedeemed} points utilisés · remise {formatPrice(order.loyaltyDiscountXof ?? 0)}</small>}
              {Boolean(order.loyaltyPointsEarnable) && <small>{order.loyaltyPointsEarnable} points après livraison</small>}
            </div>
            <Link href={`/commandes/${order.id}`} className="mvp-button mvp-button--secondary">
              Suivre
            </Link>
          </li>
        ))}
      </ul>
      <div className="mvp-actions">
        <Link href="/marche" className="mvp-button">Continuer mes achats</Link>
      </div>
    </div>
  );
}
