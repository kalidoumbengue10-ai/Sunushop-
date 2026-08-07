"use client";

import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Minus, Plus, ShoppingBag, X, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/cart-provider";
import type { CatalogItem } from "@/lib/domain/repositories";
import {
  optionValueAvailable,
  productOptionNames,
  productOptionValues,
} from "@/lib/domain/product-options";
import { useVariantSelection } from "@/lib/domain/use-variant-selection";
import { formatPrice } from "@/lib/marketplace";

function VariantOptions({
  product,
  selected,
  selectOption,
}: {
  product: CatalogItem;
  selected: Record<string, string>;
  selectOption: (name: string, value: string) => void;
}) {
  const optionNames = productOptionNames(product.variants);
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

function ProductCard({ product }: { product: CatalogItem }) {
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mvp-product__image" src={product.imageUrl ?? ""} alt={product.title} />
        {product.imageUrls.length > 1 && <span className="mvp-product__photo-count">+{product.imageUrls.length - 1} photo{product.imageUrls.length > 2 ? "s" : ""}</span>}
      </button>
      <div className="mvp-product__body">
        <small className="product-category">{product.category.name}</small>
        <button type="button" className="mvp-product__title-trigger" onClick={() => setDetailOpen(true)}><h3>{product.title}</h3></button>
        <p className="mvp-product__description-preview">{product.description}</p>
        <Link className="product-shop-link" href={`/boutiques/${product.merchant.slug}`}>Vendu par {product.merchant.name}</Link>

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

export function MarketplaceClient({
  initialProducts,
  initialTotal = initialProducts.length,
  merchantSlug,
  groupByCategory = false,
}: {
  initialProducts: CatalogItem[];
  initialTotal?: number;
  merchantSlug?: string;
  groupByCategory?: boolean;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Toutes");
  const [search, setSearch] = useState("");

  const categories = useMemo(
    () => ["Toutes", ...Array.from(new Set(products.map((product) => product.category.name))).sort()],
    [products],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return products.filter((product) =>
      (activeCategory === "Toutes" || product.category.name === activeCategory) &&
      (!query || `${product.title} ${product.description} ${product.merchant.name}`.toLocaleLowerCase("fr").includes(query)),
    );
  }, [activeCategory, products, search]);

  const sections = useMemo(() => {
    if (!groupByCategory || activeCategory !== "Toutes") return [[activeCategory, filtered] as const];
    return categories.slice(1).map((category) => [category, filtered.filter((product) => product.category.name === category)] as const);
  }, [activeCategory, categories, filtered, groupByCategory]);

  const loadMore = async () => {
    setLoadingMore(true);
    const nextPage = page + 1;
    const params = new URLSearchParams({ page: String(nextPage), limit: "24" });
    if (merchantSlug) params.set("merchant", merchantSlug);
    const response = await fetch(`/api/storefront?${params}`);
    const payload = await response.json();
    if (response.ok) {
      const incoming = payload.data.products as CatalogItem[];
      setProducts((current) => [...current, ...incoming.filter((product) => !current.some((item) => item.id === product.id))]);
      setTotal(payload.data.pagination.total);
      setPage(nextPage);
    }
    setLoadingMore(false);
  };

  return (
    <section className="marketplace-catalog" id="catalogue">
      <div className="marketplace-section-heading">
        <div><span className="mvp-eyebrow">Catalogue en direct</span><h2>{groupByCategory ? "Tous les produits de la boutique" : "Produits disponibles maintenant"}</h2><p>Prix, variantes et stocks visibles avant de créer un compte.</p></div>
        <span>{total} produit{total > 1 ? "s" : ""}</span>
      </div>
      <div className="catalog-tools">
        <div className="catalog-category-tabs" role="group" aria-label="Filtrer par catégorie">
          {categories.map((category) => <button type="button" key={category} className={category === activeCategory ? "is-active" : ""} onClick={() => setActiveCategory(category)}>{category}</button>)}
        </div>
        <label className="catalog-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un produit ou une boutique" aria-label="Rechercher dans le catalogue" /></label>
      </div>

      {filtered.length ? sections.map(([category, items]) => items.length > 0 && (
        <section className="catalog-category-section" key={category}>
          {groupByCategory && activeCategory === "Toutes" && <header><h3>{category}</h3><span>{items.length} produit{items.length > 1 ? "s" : ""}</span></header>}
          <div className="mvp-product-grid">{items.map((product) => <ProductCard product={product} key={product.id} />)}</div>
        </section>
      )) : <div className="mvp-empty">Aucun produit ne correspond à cette recherche.</div>}

      {products.length < total && (
        <div className="catalog-load-more"><button type="button" className="mvp-button mvp-button--secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Chargement…" : "Afficher plus de produits"}</button><small>{products.length} sur {total}</small></div>
      )}
    </section>
  );
}
