import Link from "next/link";
import { siteConfig } from "@/app/site-config";

export function SiteFooter() {
  return (
    <footer className="mvp-footer">
      <div className="mvp-shell mvp-footer__inner">
        <div className="mvp-footer__brand">
          <span className="mvp-brand">Sunu<span>Shop</span></span>
          <p>La marketplace des commerces d’ici, au Sénégal.</p>
        </div>
        <nav className="mvp-footer__col" aria-label="Acheter">
          <strong>Acheter</strong>
          <Link href="/marche">Tous les produits</Link>
          <Link href="/categories">Catégories</Link>
          <Link href="/recherche">Rechercher</Link>
          <Link href="/connexion">Suivre mes commandes</Link>
        </nav>
        <nav className="mvp-footer__col" aria-label="Vendre">
          <strong>Vendre</strong>
          <Link href="/creer-ma-boutique">Créer ma boutique</Link>
          <Link href="/devenir-marchand">Devenir marchand</Link>
          <Link href="/devenir-livreur">Devenir livreur</Link>
          <Link href="/partenaires">Partenaires</Link>
        </nav>
        <nav className="mvp-footer__col" aria-label="Aide">
          <strong>Aide</strong>
          <Link href="/aide">Centre d’aide</Link>
          <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
        </nav>
      </div>
      <div className="mvp-shell mvp-footer__legal">
        <span>© {new Date().getFullYear()} SunuShop. Tous droits réservés.</span>
      </div>
    </footer>
  );
}
