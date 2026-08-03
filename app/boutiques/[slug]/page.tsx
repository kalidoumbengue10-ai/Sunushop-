import { notFound } from "next/navigation";
import { MarketplaceClient } from "@/components/marketplace-client";
import { MvpShell } from "@/components/mvp-shell";
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
  const shop = await new SupabaseCatalogRepository(admin).findShopBySlug(slug);
  if (!shop) notFound();
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
          <div className="mvp-list">
            {shop.deliveryZones.map((zone) => (
              <div className="mvp-row" key={zone.id}>
                <strong>{zone.label}</strong>
                <small>
                  {formatPrice(zone.feeXof)} · {zone.minDelayMinutes} à{" "}
                  {zone.maxDelayMinutes} minutes
                </small>
              </div>
            ))}
          </div>
          <MarketplaceClient initialProducts={shop.products} />
        </div>
      </main>
    </MvpShell>
  );
}
