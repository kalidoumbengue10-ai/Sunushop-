"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/marketplace-client";
import { ShopCard } from "@/components/shop-card";
import type { CatalogItem } from "@/lib/domain/repositories";

type ShopResult = { id: string; public_name: string; slug: string; city: string | null; region: string | null };

type ResultTab = "produits" | "boutiques";

export function RechercheClient() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [tab, setTab] = useState<ResultTab>("produits");
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [shops, setShops] = useState<ShopResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!trimmed) { setProducts([]); setShops([]); setSearched(false); return; }
    const timeout = setTimeout(async () => {
      setLoading(true);
      const response = await fetch(`/api/search?query=${encodeURIComponent(trimmed)}&limit=24`);
      if (response.ok) {
        const payload = await response.json();
        setProducts(payload.data.products);
        setShops(payload.data.shops);
        setSearched(true);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <section className="mvp-card mvp-card--full">
      <span className="mvp-eyebrow">Recherche</span>
      <h1 className="mvp-title">Trouvez un produit ou une boutique</h1>
      <label className="catalog-search" style={{ maxWidth: 480 }}>
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un produit ou une boutique"
          aria-label="Rechercher"
          autoFocus
        />
        {loading && <span className="catalog-search__spinner" aria-hidden="true" />}
      </label>

      {searched && (
        <>
          <div className="mvp-tabs" role="tablist" aria-label="Filtrer les résultats">
            <button type="button" role="tab" aria-selected={tab === "produits"} className={tab === "produits" ? "mvp-tab is-active" : "mvp-tab"} onClick={() => setTab("produits")}>
              Produits ({products.length})
            </button>
            <button type="button" role="tab" aria-selected={tab === "boutiques"} className={tab === "boutiques" ? "mvp-tab is-active" : "mvp-tab"} onClick={() => setTab("boutiques")}>
              Boutiques ({shops.length})
            </button>
          </div>

          {tab === "produits" && (
            products.length
              ? <div className="mvp-product-grid">{products.map((product) => <ProductCard product={product} key={product.id} />)}</div>
              : <p className="mvp-empty">Aucun produit ne correspond à « {query} ».</p>
          )}

          {tab === "boutiques" && (
            shops.length
              ? <div className="shop-directory-grid">{shops.map((shop) => (
                  <ShopCard
                    shop={{ id: shop.id, name: shop.public_name, slug: shop.slug, city: shop.city, categories: [], coverUrl: null, logoUrl: null }}
                    key={shop.id}
                  />
                ))}</div>
              : <p className="mvp-empty">Aucune boutique ne correspond à « {query} ».</p>
          )}
        </>
      )}
    </section>
  );
}
