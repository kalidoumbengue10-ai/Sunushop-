"use client";

import Link from "next/link";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { useCart } from "@/components/cart-provider";
import type { CatalogItem } from "@/lib/domain/repositories";
import {
  optionValueAvailable,
  productOptionNames,
  productOptionValues,
  resolveProductVariant,
} from "@/lib/domain/product-options";
import { formatPrice } from "@/lib/marketplace";

function ProductCard({ product }: { product: CatalogItem }) {
  const cart = useCart();
  const [selected, setSelected] = useState<Record<string, string>>(product.variant.attributes);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const optionNames = productOptionNames(product.variants);
  const variant = resolveProductVariant(product.variants, selected) ?? product.variant;

  const selectOption = (name: string, value: string) => {
    const wanted = { ...selected, [name]: value };
    const exact = resolveProductVariant(product.variants, wanted);
    const compatible = exact ?? product.variants.find((candidate) =>
      candidate.availableQuantity > 0 && candidate.attributes[name] === value,
    );
    if (compatible) {
      setSelected(compatible.attributes);
      setQuantity((current) => Math.min(current, Math.max(1, compatible.availableQuantity)));
    }
  };

  const add = () => {
    cart.add({ ...product, variant }, quantity);
    cart.open();
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  };

  return (
    <article className="mvp-product">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="mvp-product__image" src={product.imageUrl ?? ""} alt={product.title} />
      <div className="mvp-product__body">
        <small className="product-category">{product.category.name}</small>
        <h3>{product.title}</h3>
        <p>{product.description}</p>
        <Link className="product-shop-link" href={`/boutiques/${product.merchant.slug}`}>Vendu par {product.merchant.name}</Link>

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
