import { MarketplaceClient } from "@/components/marketplace-client";
import { MvpShell } from "@/components/mvp-shell";
import { PrelaunchForm } from "@/components/prelaunch-form";
import { SetupRequired } from "@/components/setup-required";
import Link from "next/link";
import { getAdminSupabase } from "@/lib/infrastructure/supabase/server";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

export const dynamic = "force-dynamic";

export default async function Home() {
  const admin = getAdminSupabase();
  const [products, categories, branding] = admin
    ? await Promise.all([
        new SupabaseCatalogRepository(admin).list({ limit: 60 }).catch(() => []),
        admin.from("categories").select("name").eq("active", true).order("position").then(({ data }) => data ?? []),
        admin.from("merchant_media").select("merchant_id, kind, storage_bucket, storage_path").then(({ data }) => data ?? []),
      ])
    : [[], [], []];
  const shops = new Map<string, {
    id: string; name: string; slug: string; city: string | null;
    categories: Set<string>; coverUrl: string | null; logoUrl: string | null;
  }>();
  for (const product of products) {
    const shop = shops.get(product.merchant.id) ?? {
      id: product.merchant.id,
      name: product.merchant.name,
      slug: product.merchant.slug,
      city: product.merchant.city,
      categories: new Set<string>(),
      coverUrl: null,
      logoUrl: null,
    };
    shop.categories.add(product.category.name);
    shops.set(shop.id, shop);
  }
  for (const media of branding) {
    const shop = shops.get(media.merchant_id);
    if (!shop || !admin) continue;
    const url = admin.storage.from(media.storage_bucket).getPublicUrl(media.storage_path).data.publicUrl;
    if (media.kind === "cover") shop.coverUrl = url;
    if (media.kind === "logo") shop.logoUrl = url;
  }
  return (
    <MvpShell>
      <main className="mvp-main"><div className="mvp-shell">
        {!admin && <SetupRequired />}
        <section className="mvp-card mvp-card--full">
          <span className="mvp-eyebrow">Marketplace sénégalaise</span>
          <h1 className="mvp-title">Des boutiques réelles, un catalogue à jour.</h1>
          <p className="mvp-lede">Seuls les commerçants approuvés et prêts à vendre apparaissent ici. Aucun produit fictif n’est affiché.</p>
        </section>
        <section className="mvp-card mvp-card--full">
          <span className="mvp-eyebrow">Boutiques par catégories</span>
          <h2>Façades digitales des commerçants acceptés</h2>
          {[...shops.values()].length ? (
            <div className="mvp-product-grid">
              {[...shops.values()].map((shop) => (
                <article className="mvp-product" key={shop.id}>
                  {shop.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="mvp-product__image" src={shop.coverUrl} alt={`Façade de ${shop.name}`} />
                  )}
                  <div className="mvp-product__body">
                    {shop.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="mvp-shop-directory-logo" src={shop.logoUrl} alt={`Logo ${shop.name}`} />
                    )}
                    <small>{[...shop.categories].join(" · ")}</small>
                    <h2>{shop.name}</h2><p>{shop.city}</p>
                    <Link className="mvp-button" href={`/boutiques/${shop.slug}`}>Voir la boutique</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="mvp-empty">Les boutiques apparaîtront ici dès qu’elles seront prêtes à vendre.</p>}
        </section>
        <MarketplaceClient initialProducts={products} />
        <PrelaunchForm categories={categories} />
      </div></main>
    </MvpShell>
  );
}
