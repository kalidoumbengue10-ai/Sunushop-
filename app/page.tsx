import Link from "next/link";
import { MarketplaceClient } from "@/components/marketplace-client";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { ShopCard } from "@/components/shop-card";
import { getAdminSupabase } from "@/lib/infrastructure/supabase/server";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

export const dynamic = "force-dynamic";

export default async function Home() {
  const admin = getAdminSupabase();
  const [catalogPage, directoryProducts, branding, categories] = admin
    ? await Promise.all([
        new SupabaseCatalogRepository(admin).listPage({ page: 1, limit: 24 }).catch(() => ({ products: [], total: 0, page: 1, limit: 24 })),
        new SupabaseCatalogRepository(admin).list({ limit: 60 }).catch(() => []),
        admin.from("merchant_media").select("merchant_id, kind, storage_bucket, storage_path").then(({ data }) => data ?? []),
        admin.from("categories").select("id, slug, name").eq("active", true).order("position").then(({ data }) => data ?? []),
      ])
    : [{ products: [], total: 0, page: 1, limit: 24 }, [], [], []];
  const products = catalogPage.products;
  const shops = new Map<string, { id: string; name: string; slug: string; city: string | null; categories: Set<string>; coverUrl: string | null; logoUrl: string | null; pickupEnabled: boolean }>();
  for (const product of directoryProducts) {
    const shop = shops.get(product.merchant.id) ?? { id: product.merchant.id, name: product.merchant.name, slug: product.merchant.slug, city: product.merchant.city, categories: new Set<string>(), coverUrl: null, logoUrl: null, pickupEnabled: false };
    shop.categories.add(product.category.name); shops.set(shop.id, shop);
  }
  for (const media of branding) {
    const shop = shops.get(media.merchant_id); if (!shop || !admin) continue;
    const url = admin.storage.from(media.storage_bucket).getPublicUrl(media.storage_path).data.publicUrl;
    if (media.kind === "cover") shop.coverUrl = url;
    if (media.kind === "logo") shop.logoUrl = url;
  }
  if (admin && shops.size) {
    const { data: pickupMerchants } = await admin
      .from("merchant_accounts")
      .select("id")
      .in("id", [...shops.keys()])
      .eq("pickup_enabled", true);
    for (const merchant of pickupMerchants ?? []) {
      const shop = shops.get(merchant.id);
      if (shop) shop.pickupEnabled = true;
    }
  }
  const shopList = [...shops.values()].map((shop) => ({ ...shop, categories: [...shop.categories] }));

  return (
    <MvpShell>
      <main className="mvp-main marketplace-home">
        <div className="mvp-shell">
          {!admin && <SetupRequired />}
          <section className="marketplace-hero-compact">
            <div>
              <span className="mvp-eyebrow">La marketplace des commerces d’ici</span>
              <h1>Vos commerces de confiance, réunis au même endroit.</h1>
              <p>Découvrez les produits disponibles autour de vous, commandez simplement et suivez votre livraison jusqu’à la remise en main propre.</p>
            </div>
            <div className="marketplace-hero-compact__actions">
              <div className="mvp-actions"><Link className="mvp-button" href="#catalogue">Explorer les produits</Link><Link className="mvp-button mvp-button--secondary" href="/connexion">Suivre mes commandes</Link></div>
              <div className="marketplace-trust"><span><b>✓</b> Commerces vérifiés</span><span><b>✓</b> Stock affiché à jour</span><span><b>✓</b> Livraison suivie par codes</span></div>
            </div>
          </section>

          <MarketplaceClient initialProducts={products} initialTotal={catalogPage.total} initialCategories={categories} />

          <section className="marketplace-shops" id="boutiques">
            <div className="marketplace-section-heading"><div><span className="mvp-eyebrow">Boutiques SunuShop</span><h2>Rencontrez les commerçants</h2><p>Chaque façade rassemble uniquement les produits réellement publiés et disponibles.</p></div></div>
            {shopList.length ? <div className="shop-directory-grid">{shopList.map((shop) => <ShopCard shop={shop} key={shop.id} />)}</div> : <div className="marketplace-empty-state"><strong>Les premières boutiques arrivent.</strong><p>Seuls les commerces acceptés, configurés et prêts à vendre seront affichés ici.</p></div>}
          </section>

          <section className="merchant-bottom-cta">
            <div><span className="mvp-eyebrow">Commerçants</span><h2>Vous aussi, vous souhaitez vendre sur SunuShop ?</h2><p>Créez votre boutique en une seule fois, sans email à confirmer.</p></div>
            <div><Link className="mvp-button" href="/creer-ma-boutique">Créer ma boutique</Link><small>Ouvrez votre boutique aujourd’hui. Vous vendez dès votre premier paiement d’abonnement.</small></div>
          </section>
        </div>
      </main>
    </MvpShell>
  );
}
