"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MvpShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname === "/connexion" || pathname === "/mot-de-passe";
  const area = pathname.startsWith("/marchand")
    ? { href: "/marchand", label: "Ma boutique" }
    : pathname.startsWith("/partenaires")
      ? { href: "/partenaires", label: "Mes livraisons" }
      : pathname.startsWith("/client") || pathname.startsWith("/commandes")
        ? { href: "/client", label: "Mes commandes" }
        : pathname.startsWith("/admin")
          ? { href: "/admin", label: "Pilotage" }
          : { href: "/connexion", label: "Mon espace" };

  return (
    <div className="mvp-page">
      <header className="mvp-header">
        <div className="mvp-shell mvp-header__inner">
          <Link href="/" className="mvp-brand">
            Sunu<span>Shop</span>
          </Link>
          <nav className="mvp-nav" aria-label="Navigation principale">
            <Link href="/">Accueil</Link>
            <Link href="/marche">Marché</Link>
            <Link href="/marchand">Vendre</Link>
            <Link href="/partenaires">Livrer</Link>
            <Link href={isAuth ? "/marche" : area.href} className="mvp-nav__cta">
              {isAuth ? "Retour au marché" : area.label}
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
