"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Search, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

function AccessMenu({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    onNavigate();
  };

  return (
    <div className="auth-access-menu" ref={rootRef}>
      <button
        type="button"
        className="mvp-nav__cta auth-access-menu__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="auth-access-options"
        onClick={() => setOpen((value) => !value)}
      >
        Se connecter <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div id="auth-access-options" className="auth-access-menu__options" role="menu" aria-label="Choisir un espace de connexion">
          <Link role="menuitem" href="/connexion?profil=client&next=/client" onClick={close}><strong>Client</strong><small>Commandes et messages</small></Link>
          <Link role="menuitem" href="/connexion?profil=vendeur&next=/marchand" onClick={close}><strong>Marchand</strong><small>Boutique et catalogue</small></Link>
          <Link role="menuitem" href="/connexion?profil=admin&next=/admin/crm" onClick={close}><strong>Admin</strong><small>Pilotage SunuShop</small></Link>
        </div>
      )}
    </div>
  );
}

function SignOutButton({ onNavigate }: { onNavigate: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST" });
      if (!response.ok) throw new Error("SIGN_OUT_FAILED");
      onNavigate();
      window.location.replace("/");
    } catch {
      setBusy(false);
      setError("La déconnexion a échoué. Réessayez.");
    }
  };

  return (
    <div className="auth-sign-out">
      <button
        type="button"
        className="auth-sign-out__button"
        onClick={signOut}
        disabled={busy}
        aria-label="Se déconnecter"
      >
        <LogOut aria-hidden="true" />
        {busy ? "Déconnexion…" : "Se déconnecter"}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

function ShellChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { authenticated, area: authenticatedArea } = useAuthState();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuth = pathname === "/connexion" || pathname === "/mot-de-passe";
  const area = authenticatedArea === "admin"
    ? { href: "/admin", label: "Pilotage" }
    : authenticatedArea === "merchant" || authenticatedArea === "courier"
      ? { href: "/marchand", label: authenticatedArea === "courier" ? "Mes missions" : "Ma boutique" }
      : { href: "/client", label: "Mes commandes" };

  return (
    <div className="mvp-page">
      <header className="mvp-header">
        <div className="mvp-shell mvp-header__inner">
          <Link href="/" className="mvp-brand">Sunu<span>Shop</span></Link>
          <button className="mvp-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen((value) => !value)}>
            <span className="mvp-menu-toggle__icon"><span /><span /><span /></span><b>Menu</b>
          </button>
          <nav id="main-navigation" className={`mvp-nav ${menuOpen ? "is-open" : ""}`} aria-label="Navigation principale">
            <Link href="/" onClick={() => setMenuOpen(false)}>Accueil</Link>
            <Link href="/marche" onClick={() => setMenuOpen(false)}>Produits</Link>
            <Link href="/categories" onClick={() => setMenuOpen(false)}>Catégories</Link>
            <Link href="/#boutiques" onClick={() => setMenuOpen(false)}>Boutiques</Link>
            <Link href="/recherche" onClick={() => setMenuOpen(false)}>Rechercher</Link>
            <Link href="/aide" onClick={() => setMenuOpen(false)}>Aide</Link>
            <Link href="/creer-ma-boutique" className="mvp-nav__cta" onClick={() => setMenuOpen(false)}>Créer ma boutique</Link>
            {authenticated ? (
              <>
                <Link href={area.href} className="mvp-nav__cta" onClick={() => setMenuOpen(false)}>{area.label}</Link>
                <SignOutButton onNavigate={() => setMenuOpen(false)} />
              </>
            ) : isAuth ? (
              <Link href="/marche" className="mvp-nav__cta" onClick={() => setMenuOpen(false)}>Retour au marché</Link>
            ) : (
              <AccessMenu onNavigate={() => setMenuOpen(false)} />
            )}
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
