"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/marketplace-client";
import { ShopCard } from "@/components/shop-card";
import type { CatalogItem } from "@/lib/domain/repositories";
import { SENEGAL_REGIONS } from "@/lib/domain/merchant-ui";

type ShopResult = { id: string; public_name: string; slug: string; city: string | null; region: string | null };
type CategoryOption = { id: string; name: string; slug: string };

type ResultTab = "produits" | "boutiques";

export function RechercheClient() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [region, setRegion] = useState(searchParams.get("region") ?? "");
  const [city, setCity] = useState(searchParams.get("city") ?? "");
  const [tab, setTab] = useState<ResultTab>("produits");
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [shops, setShops] = useState<ShopResult[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/search?limit=1")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setCategories(payload?.data?.filters?.categories ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!trimmed && !category && !region && !city.trim()) { setProducts([]); setShops([]); setSearched(false); setError(""); return; }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ limit: "24" });
        if (trimmed) params.set("query", trimmed);
        if (category) params.set("category", category);
        if (region) params.set("region", region);
        if (city.trim()) params.set("city", city.trim());
        const response = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.message ?? "La recherche est indisponible.");
        setProducts(payload.data.products ?? []);
        setShops(payload.data.shops ?? []);
        setCategories(payload.data.filters?.categories ?? []);
        setSearched(true);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setProducts([]);
        setShops([]);
        setSearched(true);
        setError(caught instanceof Error ? caught.message : "La recherche est indisponible.");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, category, region, city]);

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

      <div className="mvp-form__grid recherche-filters" aria-label="Filtres de recherche">
        <label className="mvp-field">
          Catégorie
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((option) => <option value={option.slug} key={option.id}>{option.name}</option>)}
          </select>
        </label>
        <label className="mvp-field">
          Région
          <select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="">Toutes les régions</option>
            {SENEGAL_REGIONS.map((option) => <option value={option} key={option}>{option}</option>)}
          </select>
        </label>
        <label className="mvp-field">
          Ville
          <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Toutes les villes" />
        </label>
      </div>

      {loading && <p className="mvp-empty" role="status">Recherche en cours…</p>}
      {error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}

      {searched && !loading && !error && (
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
