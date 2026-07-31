import Link from "next/link";

export function MvpShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mvp-page">
      <header className="mvp-header">
        <div className="mvp-shell mvp-header__inner">
          <Link href="/" className="mvp-brand">
            Sunu<span>Shop</span>
          </Link>
          <nav className="mvp-nav" aria-label="Navigation MVP">
            <Link href="/marche">Marché</Link>
            <Link href="/client">Espace client</Link>
            <Link href="/marchand">Espace marchand</Link>
            <Link href="/partenaires">Partenaires</Link>
            <Link href="/admin">Admin</Link>
            <Link href="/connexion?profil=client&next=/client" className="mvp-nav__cta">
              Connexion
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
