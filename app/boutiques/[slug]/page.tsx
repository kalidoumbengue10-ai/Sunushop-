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

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
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
