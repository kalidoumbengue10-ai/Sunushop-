"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { CartProvider, useCart } from "@/components/cart-provider";
import { CartDrawer } from "@/components/cart-drawer";
import { LocationProvider } from "@/components/location-provider";
import { FavoritesProvider } from "@/components/favorites-provider";
import { AuthStateProvider, useAuthState } from "@/components/auth-state-provider";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { SiteFooter } from "@/components/site-footer";

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
  const { authenticated } = useAuthState();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuth = pathname === "/connexion" || pathname === "/mot-de-passe";
  const area = pathname.startsWith("/marchand")
    ? { href: "/marchand", label: "Ma boutique" }
    : pathname.startsWith("/client") || pathname.startsWith("/commandes")
      ? { href: "/client", label: "Mes commandes" }
      : pathname.startsWith("/admin")
        ? { href: "/admin", label: "Pilotage" }
        // Un acheteur déjà connecté ne doit pas revoir "Mon espace" → /connexion.
        : authenticated
          ? { href: "/client", label: "Mes commandes" }
          : { href: "/connexion", label: "Mon espace" };

  return (
    <div className="mvp-page">
      <header className="mvp-header">
        <div className="mvp-shell mvp-header__inner">
          <Link href="/" className="mvp-brand">Sunu<span>Shop</span></Link>
          <button className="mvp-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen((value) => !value)}>
            <span className="mvp-menu-toggle__icon"><span /><span /><span /></span><b>Menu</b>
          </button>
          <nav id="main-navigation" className={`mvp-nav ${menuOpen ? "is-open" : ""}`} aria-label="Navigation principale" onClick={() => setMenuOpen(false)}>
            <Link href="/">Accueil</Link>
            <Link href="/marche">Produits</Link>
            <Link href="/categories">Catégories</Link>
            <Link href="/#boutiques">Boutiques</Link>
            <Link href="/recherche">Rechercher</Link>
            <Link href="/aide">Aide</Link>
            <Link href="/creer-ma-boutique" className="mvp-nav__cta">Créer ma boutique</Link>
            <Link href={isAuth ? "/marche" : area.href} className="mvp-nav__cta">{isAuth ? "Retour au marché" : area.label}</Link>
          </nav>
          <Link href="/recherche" className="mvp-search-trigger" aria-label="Rechercher"><Search aria-hidden="true" /></Link>
          <CartTrigger />
        </div>
      </header>
      {children}
      <SiteFooter />
      <CartDrawer />
      <MobileTabBar />
    </div>
  );
}

export function MvpShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthStateProvider>
      <LocationProvider>
        <FavoritesProvider>
          <CartProvider>
            <ShellChrome>{children}</ShellChrome>
          </CartProvider>
        </FavoritesProvider>
      </LocationProvider>
    </AuthStateProvider>
  );
}
