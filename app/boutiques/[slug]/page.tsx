import { notFound } from "next/navigation";
import { MarketplaceClient } from "@/components/marketplace-client";
import { MvpShell } from "@/components/mvp-shell";
import { ShopContact } from "@/components/shop-contact";
import { ShopFollowButton } from "@/components/shop-follow-button";
import { StartConversationButton } from "@/components/start-conversation-button";
import { LocationMap, NavigationLinks } from "@/components/location-map";
import { getAdminSupabase } from "@/lib/infrastructure/supabase/server";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";
import { formatPrice } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

export default async function BoutiquePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = getAdminSupabase();
  if (!admin) notFound();
  const repository = new SupabaseCatalogRepository(admin);
  const shop = await repository.findShopBySlug(slug);
  if (!shop) notFound();
  const page = await repository.listPage({ merchantSlug: slug, page: 1, limit: 24 });
  const { data: categories } = await admin
    .from("categories")
    .select("id, slug, name")
    .eq("active", true)
    .order("position");
  const { data: branding } = await admin
    .from("merchant_media")
    .select("kind, storage_bucket, storage_path")
    .eq("merchant_id", shop.id);
  const mediaUrl = (kind: "logo" | "cover") => {
    const item = branding?.find((entry) => entry.kind === kind);
    return item
      ? admin.storage.from(item.storage_bucket).getPublicUrl(item.storage_path).data.publicUrl
      : null;
  };
  const coverUrl = mediaUrl("cover");
  const logoUrl = mediaUrl("logo");

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mvp-shop-cover" src={coverUrl} alt={`Façade de ${shop.name}`} />
          )}
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mvp-shop-logo" src={logoUrl} alt={`Logo ${shop.name}`} />
          )}
          <span className="mvp-eyebrow">Boutique vérifiée</span>
          <h1 className="mvp-title">{shop.name}</h1>
          <p className="mvp-lede">
            {shop.description || "Catalogue marchand SunuShop."}
          </p>
          <div className="mvp-actions">
            <ShopFollowButton merchantId={shop.id} merchantSlug={shop.slug} />
            <StartConversationButton merchantId={shop.id} subject={`Question sur ${shop.name}`} />
          </div>
          <div className="mvp-list">
            {shop.deliveryZones.map((zone) => (
              <div className="mvp-row" key={zone.id}>
                <strong>{zone.label}</strong>
                <small>
                  {formatPrice(zone.feeXof)} · Livraison le jour même
                </small>
              </div>
            ))}
            {shop.pickup.enabled && (
              <div className="mvp-row">
                <strong>Retrait en boutique</strong>
                <small>0 F de livraison</small>
              </div>
            )}
          </div>
          <ShopContact
            phone={shop.phone}
            email={shop.email}
            addressLine={shop.location.addressLine}
            latitude={shop.location.latitude}
            longitude={shop.location.longitude}
          />
          {shop.location.latitude != null && shop.location.longitude != null ? <>
            <LocationMap point={{ latitude: shop.location.latitude, longitude: shop.location.longitude }} label={shop.location.addressLine ?? shop.name} />
            <NavigationLinks destination={{ latitude: shop.location.latitude, longitude: shop.location.longitude }} label={shop.location.addressLine ?? shop.name} />
          </> : <p className="mvp-alert mvp-alert--warning">La position précise de cette boutique sera bientôt disponible.</p>}
          <MarketplaceClient initialProducts={page.products} initialTotal={page.total} initialCategories={categories ?? []} merchantSlug={shop.slug} groupByCategory />
        </div>
      </main>
    </MvpShell>
  );
}
