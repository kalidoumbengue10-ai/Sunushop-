import Link from "next/link";
import { ShopFollowButton } from "@/components/shop-follow-button";

/* eslint-disable @next/next/no-img-element */

export type ShopCardData = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  categories: string[];
  coverUrl: string | null;
  logoUrl: string | null;
  pickupEnabled?: boolean;
  distanceKm?: number | null;
};

export function ShopCard({ shop }: { shop: ShopCardData }) {
  return (
    <article className="shop-directory-card shop-directory-card--clickable">
      {shop.coverUrl ? (
        <img className="shop-directory-cover" src={shop.coverUrl} alt={`Façade de ${shop.name}`} />
      ) : (
        <div className="shop-directory-cover shop-directory-placeholder" aria-hidden="true">
          <span>{shop.name.slice(0, 1)}</span>
        </div>
      )}
      <ShopFollowButton merchantId={shop.id} merchantSlug={shop.slug} variant="icon" />
      <div className="shop-directory-body">
        {shop.logoUrl && <img className="mvp-shop-directory-logo" src={shop.logoUrl} alt={`Logo ${shop.name}`} />}
        <span className="shop-category-line">{shop.categories.join(" · ") || "Boutique SunuShop"}</span>
        <h3>{shop.name}</h3>
        <p>{shop.city || "Sénégal"}</p>
        {shop.distanceKm != null && <small>À environ {shop.distanceKm < 10 ? shop.distanceKm.toFixed(1) : Math.round(shop.distanceKm)} km</small>}
        {shop.pickupEnabled && <span className="shop-directory-pickup-badge">Retrait en boutique possible</span>}
        <Link className="shop-directory-card__link" href={`/boutiques/${shop.slug}`}>
          <span className="sr-only">Entrer dans la boutique {shop.name}</span>
          <span aria-hidden="true">Entrer dans la boutique →</span>
        </Link>
      </div>
    </article>
  );
}
