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
  paymentMethod?: "cash_on_delivery" | "wave_direct" | "orange_money_direct";
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
            </div>
            <Link
              href={`/commandes/${order.id}${order.paymentMethod === "cash_on_delivery" ? "#retrait" : "#paiement"}`}
              className="mvp-button"
            >
              {order.paymentMethod === "cash_on_delivery" ? "Voir les instructions de retrait" : "Continuer vers le paiement"}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mvp-actions">
        <Link href="/client/commandes" className="mvp-button mvp-button--secondary">Voir toutes mes commandes</Link>
        <Link href="/marche" className="mvp-button mvp-button--secondary">Continuer mes achats</Link>
      </div>
    </div>
  );
}
