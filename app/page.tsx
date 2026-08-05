import Link from "next/link";
import { MarketplaceClient } from "@/components/marketplace-client";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { getAdminSupabase } from "@/lib/infrastructure/supabase/server";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

/* eslint-disable @next/next/no-img-element */

export const revalidate = 60;

export default async function Home() {
  const admin = getAdminSupabase();
  const [catalogPage, directoryProducts, branding] = admin
    ? await Promise.all([
        new SupabaseCatalogRepository(admin).listPage({ page: 1, limit: 24 }).catch(() => ({ products: [], total: 0, page: 1, limit: 24 })),
        new SupabaseCatalogRepository(admin).list({ limit: 60 }).catch(() => []),
        admin.from("merchant_media").select("merchant_id, kind, storage_bucket, storage_path").then(({ data }) => data ?? []),
      ])
    : [{ products: [], total: 0, page: 1, limit: 24 }, [], []];
  const products = catalogPage.products;
  const shops = new Map<string, { id: string; name: string; slug: string; city: string | null; categories: Set<string>; coverUrl: string | null; logoUrl: string | null }>();
  for (const product of directoryProducts) {
    const shop = shops.get(product.merchant.id) ?? { id: product.merchant.id, name: product.merchant.name, slug: product.merchant.slug, city: product.merchant.city, categories: new Set<string>(), coverUrl: null, logoUrl: null };
    shop.categories.add(product.category.name); shops.set(shop.id, shop);
  }
  for (const media of branding) {
    const shop = shops.get(media.merchant_id); if (!shop || !admin) continue;
    const url = admin.storage.from(media.storage_bucket).getPublicUrl(media.storage_path).data.publicUrl;
    if (media.kind === "cover") shop.coverUrl = url;
    if (media.kind === "logo") shop.logoUrl = url;
  }
  const shopList = [...shops.values()];

  return (
    <MvpShell>
      <main className="mvp-main marketplace-home">
        <div className="mvp-shell">
          {!admin && <SetupRequired />}
          <section className="marketplace-hero">
            <div className="marketplace-hero__copy">
              <span className="mvp-eyebrow">La marketplace des commerces d’ici</span>
              <h1>Vos commerces de confiance, réunis au même endroit.</h1>
              <p>Découvrez les produits disponibles autour de vous, commandez simplement et suivez votre livraison jusqu’à la remise en main propre.</p>
              <div className="mvp-actions"><Link className="mvp-button" href="#catalogue">Explorer les produits</Link><Link className="mvp-button mvp-button--secondary" href="/connexion">Suivre mes commandes</Link></div>
              <div className="marketplace-trust"><span><b>✓</b> Commerces vérifiés</span><span><b>✓</b> Stock affiché à jour</span><span><b>✓</b> Livraison suivie par codes</span></div>
            </div>
            <div className="marketplace-hero__panel" aria-label="Comment acheter">
              <span className="hero-panel-tag">Simple et local</span>
              <div><strong>1</strong><p><b>Choisissez</b><br />un produit et sa boutique.</p></div>
              <div><strong>2</strong><p><b>Commandez</b><br />avec votre adresse et votre paiement.</p></div>
              <div><strong>3</strong><p><b>Recevez</b><br />et confirmez avec votre code personnel.</p></div>
            </div>
          </section>

          <MarketplaceClient initialProducts={products} initialTotal={catalogPage.total} />

          <section className="marketplace-shops" id="boutiques">
            <div className="marketplace-section-heading"><div><span className="mvp-eyebrow">Boutiques SunuShop</span><h2>Rencontrez les commerçants</h2><p>Chaque façade rassemble uniquement les produits réellement publiés et disponibles.</p></div></div>
            {shopList.length ? <div className="shop-directory-grid">{shopList.map((shop) => (
              <article className="shop-directory-card" key={shop.id}>
                {shop.coverUrl ? <img className="shop-directory-cover" src={shop.coverUrl} alt={`Façade de ${shop.name}`} /> : <div className="shop-directory-cover shop-directory-placeholder" aria-hidden="true"><span>{shop.name.slice(0, 1)}</span></div>}
                <div className="shop-directory-body">{shop.logoUrl && <img className="mvp-shop-directory-logo" src={shop.logoUrl} alt={`Logo ${shop.name}`} />}<span className="shop-category-line">{[...shop.categories].join(" · ")}</span><h3>{shop.name}</h3><p>{shop.city || "Sénégal"}</p><Link href={`/boutiques/${shop.slug}`}>Entrer dans la boutique <span>→</span></Link></div>
              </article>
            ))}</div> : <div className="marketplace-empty-state"><strong>Les premières boutiques arrivent.</strong><p>Seuls les commerces acceptés, configurés et prêts à vendre seront affichés ici.</p></div>}
          </section>

          <section className="merchant-bottom-cta">
            <div><span className="mvp-eyebrow">Commerçants</span><h2>Vous aussi, vous souhaitez vendre sur SunuShop ?</h2><p>Présentez votre activité. Après étude, nous vous invitons à compléter votre dossier et à ouvrir votre boutique.</p></div>
            <div><Link className="mvp-button" href="/devenir-marchand">Déposer ma candidature</Link><small>Aucun compte marchand n’est créé sans validation.</small></div>
          </section>
        </div>
      </main>
    </MvpShell>
  );
}
