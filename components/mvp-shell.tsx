"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useState } from "react";
import { CartProvider, useCart } from "@/components/cart-provider";
import { CartDrawer } from "@/components/cart-drawer";

function CartTrigger() {
  const cart = useCart();
  return (
    <button
      type="button"
      className="mvp-cart-trigger"
      onClick={cart.open}
      aria-label={`Ouvrir le panier (${cart.itemCount} article${cart.itemCount > 1 ? "s" : ""})`}
    >
      <ShoppingBag aria-hidden="true" />
      {cart.itemCount > 0 && <span className="mvp-cart-count">{cart.itemCount}</span>}
    </button>
  );
}

function ShellChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuth = pathname === "/connexion" || pathname === "/mot-de-passe";
  const area = pathname.startsWith("/marchand")
    ? { href: "/marchand", label: "Ma boutique" }
    : pathname.startsWith("/client") || pathname.startsWith("/commandes")
      ? { href: "/client", label: "Mes commandes" }
      : pathname.startsWith("/admin")
        ? { href: "/admin", label: "Pilotage" }
        : { href: "/connexion", label: "Mon espace" };

  return (
    <div className="mvp-page">
      <header className="mvp-header">
        <div className="mvp-shell mvp-header__inner">
          <Link href="/" className="mvp-brand">Sunu<span>Shop</span></Link>
          <button className="mvp-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen((value) => !value)}>
            <span /><span /><span /><b>Menu</b>
          </button>
          <nav id="main-navigation" className={`mvp-nav ${menuOpen ? "is-open" : ""}`} aria-label="Navigation principale" onClick={() => setMenuOpen(false)}>
            <Link href="/">Accueil</Link>
            <Link href="/#catalogue">Produits</Link>
            <Link href="/#boutiques">Boutiques</Link>
            <Link href="/devenir-marchand">Vendre sur SunuShop</Link>
            <Link href={isAuth ? "/marche" : area.href} className="mvp-nav__cta">{isAuth ? "Retour au marché" : area.label}</Link>
          </nav>
          <CartTrigger />
        </div>
      </header>
      {children}
      <CartDrawer />
    </div>
  );
}

export function MvpShell({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <ShellChrome>{children}</ShellChrome>
    </CartProvider>
  );
}
