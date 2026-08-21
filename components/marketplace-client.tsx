"use client";

import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Minus, Plus, ShoppingBag, X, ZoomIn } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import type { CatalogItem } from "@/lib/domain/repositories";
import {
  optionValueAvailable,
  productOptionNames,
  productOptionValues,
} from "@/lib/domain/product-options";
import { useVariantSelection } from "@/lib/domain/use-variant-selection";
import { useCatalogSync } from "@/lib/domain/use-catalog-sync";
import { formatPrice } from "@/lib/marketplace";
import { useLocationFilter } from "@/components/location-provider";
import { LocationFilter } from "@/components/location-filter";

function VariantOptions({
  product,
  selected,
  selectOption,
}: {
  product: CatalogItem;
  selected: Record<string, string>;
  selectOption: (name: string, value: string) => void;
}) {
  const optionNames = productOptionNames(product.variants, product.optionNames);
  return (
    <>
      {optionNames.map((name) => (
        <fieldset className="product-options" key={name}>
          <legend>{name}</legend>
          <div>
            {productOptionValues(product.variants, name).map((value) => {
              const available = optionValueAvailable(product.variants, selected, name, value);
              return (
                <button
                  type="button"
                  key={value}
                  className={selected[name] === value ? "is-active" : ""}
                  disabled={!available}
                  onClick={() => selectOption(name, value)}
                  aria-pressed={selected[name] === value}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </>
  );
}

function ProductDetailModal({ product, onClose }: { product: CatalogItem; onClose: () => void }) {
  const cart = useCart();
  const { selected, variant, quantity, setQuantity, selectOption } = useVariantSelection(product);
  const [added, setAdded] = useState(false);
  const photos = product.imageUrls.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [];
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const add = () => {
    cart.add({ ...product, variant }, quantity);
    cart.open();
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  };

  return (
    <div className="product-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <button type="button" className="product-modal__close" onClick={onClose} aria-label="Fermer"><X /></button>
        <div className="product-modal__gallery">
          {photos.length ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="product-modal__main-image" src={photos[activePhoto]} alt={product.title} />
              {photos.length > 1 && (
                <>
                  <button type="button" className="product-modal__nav product-modal__nav--prev" aria-label="Photo précédente" onClick={() => setActivePhoto((index) => (index - 1 + photos.length) % photos.length)}><ChevronLeft /></button>
                  <button type="button" className="product-modal__nav product-modal__nav--next" aria-label="Photo suivante" onClick={() => setActivePhoto((index) => (index + 1) % photos.length)}><ChevronRight /></button>
                  <div className="product-modal__thumbnails">
                    {photos.map((photo, index) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={photo}
                        src={photo}
                        alt=""
                        className={index === activePhoto ? "is-active" : ""}
                        onClick={() => setActivePhoto(index)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="product-modal__main-image product-modal__placeholder" aria-hidden="true"><ZoomIn /></div>
          )}
        </div>
        <div className="product-modal__body">
          <small className="product-category">{product.category.name}</small>
          <h2 id="product-modal-title">{product.title}</h2>
          <Link className="product-shop-link" href={`/boutiques/${product.merchant.slug}`}>Vendu par {product.merchant.name}</Link>
          {product.merchant.distanceKm != null && <small>À environ {product.merchant.distanceKm < 10 ? product.merchant.distanceKm.toFixed(1) : Math.round(product.merchant.distanceKm)} km</small>}
          <p className="product-modal__description">{product.description}</p>

          <VariantOptions product={product} selected={selected} selectOption={selectOption} />

          <div className="product-purchase-row">
            <div><span className="mvp-price">{formatPrice(variant.priceXof)}</span><small>{variant.availableQuantity} en stock</small></div>
            <div className="quantity-stepper" aria-label={`Quantité pour ${product.title}`}>
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Diminuer la quantité"><Minus /></button>
              <output aria-live="polite">{quantity}</output>
              <button type="button" onClick={() => setQuantity((value) => Math.min(variant.availableQuantity, value + 1))} disabled={quantity >= variant.availableQuantity} aria-label="Augmenter la quantité"><Plus /></button>
            </div>
          </div>
          <button className="mvp-button product-add-button" onClick={add} disabled={variant.availableQuantity < 1}>
            {added ? <><Check /> Ajouté au panier</> : <><ShoppingBag /> Ajouter {quantity > 1 ? `${quantity} articles` : "au panier"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProductCard({ product }: { product: CatalogItem }) {
  const cart = useCart();
  const { selected, variant, quantity, setQuantity, selectOption } = useVariantSelection(product);
  const [added, setAdded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const add = () => {
    cart.add({ ...product, variant }, quantity);
    cart.open();
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  };

  return (
    <article className="mvp-product">
      <button type="button" className="mvp-product__image-trigger" onClick={() => setDetailOpen(true)} aria-label={`Voir les détails de ${product.title}`}>
        {product.imageUrl ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mvp-product__image" src={product.imageUrl} alt={product.title} />
        </> : <div className="mvp-product__image" aria-hidden="true" />}
        {product.imageUrls.length > 1 && <span className="mvp-product__photo-count">+{product.imageUrls.length - 1} photo{product.imageUrls.length > 2 ? "s" : ""}</span>}
      </button>
      <div className="mvp-product__body">
        <small className="product-category">{product.category.name}</small>
        <button type="button" className="mvp-product__title-trigger" onClick={() => setDetailOpen(true)}><h3>{product.title}</h3></button>
        <p className="mvp-product__description-preview">{product.description}</p>
        <Link className="product-shop-link" href={`/boutiques/${product.merchant.slug}`}>Vendu par {product.merchant.name}</Link>
        {product.merchant.distanceKm != null && <small>À environ {product.merchant.distanceKm < 10 ? product.merchant.distanceKm.toFixed(1) : Math.round(product.merchant.distanceKm)} km</small>}

        <VariantOptions product={product} selected={selected} selectOption={selectOption} />

        <div className="product-purchase-row">
          <div><span className="mvp-price">{formatPrice(variant.priceXof)}</span><small>{variant.availableQuantity} en stock</small></div>
          <div className="quantity-stepper" aria-label={`Quantité pour ${product.title}`}>
            <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Diminuer la quantité"><Minus /></button>
            <output aria-live="polite">{quantity}</output>
            <button type="button" onClick={() => setQuantity((value) => Math.min(variant.availableQuantity, value + 1))} disabled={quantity >= variant.availableQuantity} aria-label="Augmenter la quantité"><Plus /></button>
          </div>
        </div>
        <button className="mvp-button product-add-button" onClick={add} disabled={variant.availableQuantity < 1}>
          {added ? <><Check /> Ajouté au panier</> : <><ShoppingBag /> Ajouter {quantity > 1 ? `${quantity} articles` : "au panier"}</>}
        </button>
      </div>
      {detailOpen && <ProductDetailModal product={product} onClose={() => setDetailOpen(false)} />}
    </article>
  );
}

type CatalogCategory = { id: string; slug: string; name: string };

export function MarketplaceClient({
  initialProducts,
  initialTotal = initialProducts.length,
  initialCategories = [],
  initialCategorySlug = null,
  merchantSlug,
  groupByCategory = false,
}: {
  initialProducts: CatalogItem[];
  initialTotal?: number;
  initialCategories?: CatalogCategory[];
  initialCategorySlug?: string | null;
  merchantSlug?: string;
  groupByCategory?: boolean;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [allCategories, setAllCategories] = useState(initialCategories);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [activeCategorySlug, setActiveCategorySlug] = useState<string | null>(initialCategorySlug);
  const [search, setSearch] = useState("");

  // Les catégories affichées viennent de la table `categories` (fixe), pas des
  // produits déjà chargés : sinon les catégories vides ou non paginées disparaissent.
  useEffect(() => {
    if (initialCategories.length) return;
    fetch("/api/storefront?limit=1")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => { if (payload?.data?.categories) setAllCategories(payload.data.categories); })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCategoryName = activeCategorySlug ? allCategories.find((category) => category.slug === activeCategorySlug)?.name : undefined;

  // Le filtre de localisation ne s'applique qu'au marché global : à l'intérieur
  // d'une boutique précise, filtrer par région n'aurait pas de sens.
  const { region, city, latitude, longitude } = useLocationFilter();

  const fetchPage = useCallback(async (options: { page: number; categorySlug: string | null; query: string }) => {
    const params = new URLSearchParams({ page: String(options.page), limit: "24" });
    if (merchantSlug) params.set("merchant", merchantSlug);
    if (options.categorySlug) params.set("category", options.categorySlug);
    if (options.query.trim()) params.set("query", options.query.trim());
    if (!merchantSlug && region) params.set("region", region);
    if (!merchantSlug && city) params.set("city", city);
    if (!merchantSlug && latitude != null && longitude != null) {
      params.set("lat", String(latitude));
      params.set("lng", String(longitude));
    }
    const response = await fetch(`/api/storefront?${params}`);
    if (!response.ok) return null;
    return (await response.json()) as { data: { products: CatalogItem[]; pagination: { total: number }; categories: CatalogCategory[] } };
  }, [merchantSlug, region, city, latitude, longitude]);

  // Filtre instantané sur la fenêtre déjà chargée, pendant que la recherche
  // serveur (ci-dessous, débouncée) rapatrie les résultats sur tout le catalogue.
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return products.filter((product) =>
      (!activeCategoryName || product.category.name === activeCategoryName) &&
      (!query || `${product.title} ${product.description} ${product.merchant.name}`.toLocaleLowerCase("fr").includes(query)),
    );
  }, [activeCategoryName, products, search]);

  const sections = useMemo(() => {
    if (!groupByCategory || activeCategorySlug) return [[activeCategoryName ?? "Toutes", filtered] as const];
    const names = [...new Set(filtered.map((product) => product.category.name))].sort();
    return names.map((category) => [category, filtered.filter((product) => product.category.name === category)] as const);
  }, [activeCategoryName, activeCategorySlug, filtered, groupByCategory]);

  const loadMore = async () => {
    setLoadingMore(true);
    const nextPage = page + 1;
    const payload = await fetchPage({ page: nextPage, categorySlug: activeCategorySlug, query: search });
    if (payload) {
      const incoming = payload.data.products;
      setProducts((current) => [...current, ...incoming.filter((product) => !current.some((item) => item.id === product.id))]);
      setTotal(payload.data.pagination.total);
      setPage(nextPage);
    }
    setLoadingMore(false);
  };

  // Recherche et filtre catégorie server-side, débouncés : couvre tout le
  // catalogue (pas seulement les 24 produits déjà chargés) et repart de la page 1.
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) { isFirstFilterRun.current = false; return; }
    const timeout = setTimeout(async () => {
      setLoadingFilter(true);
      const payload = await fetchPage({ page: 1, categorySlug: activeCategorySlug, query: search });
      if (payload) {
        setProducts(payload.data.products);
        setTotal(payload.data.pagination.total);
        setPage(1);
      }
      setLoadingFilter(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [activeCategorySlug, search, fetchPage]);

  useCatalogSync(async () => {
    // Rafraîchit toutes les pages déjà chargées (prix, stock, photos,
    // nouvelles variantes) sans réduire le catalogue à la première page.
    const payloads = await Promise.all(
      Array.from({ length: page }, (_, index) => fetchPage({ page: index + 1, categorySlug: activeCategorySlug, query: search })),
    );
    const available = payloads.filter((payload): payload is NonNullable<typeof payload> => Boolean(payload));
    if (!available.length) return;
    const refreshed = available.flatMap((payload) => payload.data.products);
    setProducts([...new Map(refreshed.map((product) => [product.id, product])).values()]);
    setTotal(available[0].data.pagination.total);
  });

  return (
    <section className="marketplace-catalog" id="catalogue">
      <div className="marketplace-section-heading">
        <div><span className="mvp-eyebrow">Catalogue en direct</span><h2>{groupByCategory ? "Tous les produits de la boutique" : "Produits disponibles maintenant"}</h2><p>Prix, variantes et stocks visibles avant de créer un compte.</p></div>
        <span>{total} produit{total > 1 ? "s" : ""}</span>
      </div>
      <div className="catalog-tools">
        <div className="catalog-category-tabs" role="group" aria-label="Filtrer par catégorie">
          <button type="button" className={activeCategorySlug === null ? "is-active" : ""} onClick={() => setActiveCategorySlug(null)}>Toutes</button>
          {allCategories.map((category) => <button type="button" key={category.id} className={category.slug === activeCategorySlug ? "is-active" : ""} onClick={() => setActiveCategorySlug(category.slug)}>{category.name}</button>)}
        </div>
        <label className="catalog-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un produit ou une boutique" aria-label="Rechercher dans le catalogue" />{loadingFilter && <span className="catalog-search__spinner" aria-hidden="true" />}</label>
        {!merchantSlug && <LocationFilter />}
      </div>

      {filtered.length ? sections.map(([category, items]) => items.length > 0 && (
        <section className="catalog-category-section" key={category}>
          {groupByCategory && !activeCategorySlug && <header><h3>{category}</h3><span>{items.length} produit{items.length > 1 ? "s" : ""}</span></header>}
          <div className="mvp-product-grid">{items.map((product) => <ProductCard product={product} key={product.id} />)}</div>
        </section>
      )) : <div className="mvp-empty">Aucun produit ne correspond à cette recherche.</div>}

      {products.length < total && (
        <div className="catalog-load-more"><button type="button" className="mvp-button mvp-button--secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Chargement…" : "Afficher plus de produits"}</button><small>{products.length} sur {total}</small></div>
      )}
    </section>
  );
}
