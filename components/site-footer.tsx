/* eslint-disable @next/next/no-html-link-for-pages -- Le pied de page doit rester navigable avant l'initialisation de l'App Router. */
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
          <a href="/marche">Tous les produits</a>
          <a href="/categories">Catégories</a>
          <a href="/recherche">Rechercher</a>
          <a href="/connexion">Suivre mes commandes</a>
        </nav>
        <nav className="mvp-footer__col" aria-label="Vendre">
          <strong>Vendre</strong>
          <a href="/creer-ma-boutique">Créer ma boutique</a>
          <a href="/devenir-marchand">Devenir marchand</a>
          <a href="/livreur/connexion">Espace livreur</a>
          <a href="/partenaires">Partenaires</a>
        </nav>
        <nav className="mvp-footer__col" aria-label="Aide">
          <strong>Aide</strong>
          <a href="/aide">Centre d’aide</a>
          <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
        </nav>
      </div>
      <div className="mvp-shell mvp-footer__legal">
        <span>© {new Date().getFullYear()} SunuShop. Tous droits réservés.</span>
      </div>
    </footer>
  );
}
