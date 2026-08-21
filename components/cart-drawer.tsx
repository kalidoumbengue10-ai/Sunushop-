"use client";

import Link from "next/link";
import { Minus, Plus, X } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { formatPrice } from "@/lib/marketplace";

export function CartDrawer() {
  const cart = useCart();

  return (
    <>
      <div
        className={`cart-drawer-backdrop ${cart.isOpen ? "is-open" : ""}`}
        onClick={cart.close}
        aria-hidden="true"
      />
      <aside
        className={`cart-drawer ${cart.isOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Panier"
      >
        <header className="cart-drawer__header">
          <h2>Mon panier</h2>
          <button type="button" className="cart-drawer__close" onClick={cart.close} aria-label="Fermer le panier">
            <X />
          </button>
        </header>

        {cart.lines.length === 0 ? (
          <div className="cart-drawer__empty">
            <p>Votre panier est vide pour le moment.</p>
          </div>
        ) : (
          <ul className="cart-drawer__lines">
            {cart.lines.map((line) => {
              const attributes = Object.entries(line.product.variant.attributes);
              return (
                <li key={line.product.variant.id} className="cart-drawer__line">
                  {line.product.imageUrl ? <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={line.product.imageUrl} alt={line.product.title} />
                  </> : <span className="cart-drawer__image-placeholder" aria-hidden="true" />}
                  <div className="cart-drawer__line-body">
                    <strong>{line.product.title}</strong>
                    <small>{line.product.merchant.name}</small>
                    {attributes.length > 0 && (
                      <small className="cart-drawer__attributes">
                        {attributes.map(([key, value]) => `${key}: ${value}`).join(" · ")}
                      </small>
                    )}
                    <div className="cart-drawer__line-footer">
                      <div className="quantity-stepper" aria-label={`Quantité pour ${line.product.title}`}>
                        <button
                          type="button"
                          onClick={() => cart.setQuantity(line.product.variant.id, line.quantity - 1)}
                          aria-label="Diminuer la quantité"
                        >
                          <Minus />
                        </button>
                        <output aria-live="polite">{line.quantity}</output>
                        <button
                          type="button"
                          onClick={() => cart.setQuantity(line.product.variant.id, line.quantity + 1)}
                          disabled={line.quantity >= line.product.variant.availableQuantity}
                          aria-label="Augmenter la quantité"
                        >
                          <Plus />
                        </button>
                      </div>
                      <span className="cart-drawer__line-price">
                        {formatPrice(line.quantity * line.product.variant.priceXof)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cart-drawer__remove"
                    onClick={() => cart.remove(line.product.variant.id)}
                    aria-label={`Retirer ${line.product.title} du panier`}
                  >
                    <X />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {cart.lines.length > 0 && (
          <footer className="cart-drawer__footer">
            <div className="cart-drawer__subtotal">
              <span>Sous-total</span>
              <strong>{formatPrice(cart.subtotalXof)}</strong>
            </div>
            <Link href="/commander" className="mvp-button" onClick={cart.close}>
              Commander
            </Link>
          </footer>
        )}
      </aside>
    </>
  );
}
