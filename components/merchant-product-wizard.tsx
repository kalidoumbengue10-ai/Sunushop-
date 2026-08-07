"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Images, Star, Trash2, UploadCloud } from "lucide-react";
import { formatPrice } from "@/lib/marketplace";
import { merchantStatusLabel } from "@/lib/domain/merchant-ui";

type VariantEditor = {
  id?: string;
  title: string;
  attributes: Record<string, string>;
  sku: string;
  priceXof: number;
  compareAtPriceXof?: number;
  stock: number;
  reserved: number;
  lowStockThreshold: number;
  active: boolean;
};

export type MerchantProductEditor = {
  id: string;
  category_id: string;
  title: string;
  description: string;
  status: string;
  product_media: Array<{ id: string; storage_path: string; alt_text: string | null; position: number; url?: string }>;
  product_variants: Array<{
    id: string;
    sku: string;
    title: string | null;
    attributes: Record<string, string>;
    price_xof: number;
    compare_at_price_xof: number | null;
    active: boolean;
    inventory_items: Array<{ available_quantity: number; reserved_quantity: number; low_stock_threshold: number }>;
  }>;
};

const emptyVariant = (): VariantEditor => ({
  title: "Standard", attributes: {}, sku: "", priceXof: 0, stock: 0,
  reserved: 0, lowStockThreshold: 5, active: true,
});

export function MerchantProductWizard({ merchantId, categories, products, deliveryReady, subscriptionReady, onOpenSubscription, onOpenDelivery }: {
  merchantId: string;
  categories: Array<{ id: string; name: string }>;
  products: MerchantProductEditor[];
  deliveryReady: boolean;
  subscriptionReady: boolean;
  onOpenSubscription: () => void;
  onOpenDelivery: () => void;
}) {
  const router = useRouter();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState<string>();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [optionOne, setOptionOne] = useState("Taille");
  const [optionOneValues, setOptionOneValues] = useState("");
  const [optionTwo, setOptionTwo] = useState("Couleur");
  const [optionTwoValues, setOptionTwoValues] = useState("");
  const [variants, setVariants] = useState<VariantEditor[]>([emptyVariant()]);
  const [photos, setPhotos] = useState<Array<{ id: string; name: string; url?: string; altText: string; position: number }>>([]);
  const [isDraggingPhotos, setIsDraggingPhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmNoVariants, setConfirmNoVariants] = useState(false);

  const sellableStock = useMemo(() => variants.reduce((sum, variant) => sum + Math.max(0, variant.stock - variant.reserved), 0), [variants]);

  const reset = () => {
    setStep(0); setProductId(undefined); setCategoryId(categories[0]?.id ?? "");
    setTitle(""); setDescription(""); setVariants([emptyVariant()]); setPhotos([]);
    setOptionOneValues(""); setOptionTwoValues(""); setMessage(""); setError(""); setConfirmNoVariants(false);
  };

  const editProduct = (product: MerchantProductEditor) => {
    setProductId(product.id); setCategoryId(product.category_id); setTitle(product.title); setDescription(product.description);
    setPhotos([...product.product_media].sort((a, b) => a.position - b.position).map((media) => ({
      id: media.id,
      name: media.storage_path.split("/").at(-1) ?? "Photo du produit",
      url: media.url,
      altText: media.alt_text ?? product.title,
      position: media.position,
    })));
    setVariants(product.product_variants.filter((variant) => variant.active).map((variant) => {
      const inventory = variant.inventory_items?.[0];
      return {
        id: variant.id, title: variant.title ?? (Object.values(variant.attributes ?? {}).join(" · ") || "Standard"),
        attributes: variant.attributes ?? {}, sku: variant.sku.startsWith("AUTO-") ? "" : variant.sku,
        priceXof: variant.price_xof, compareAtPriceXof: variant.compare_at_price_xof ?? undefined,
        stock: inventory?.available_quantity ?? 0, reserved: inventory?.reserved_quantity ?? 0,
        lowStockThreshold: inventory?.low_stock_threshold ?? 5, active: true,
      };
    }));
    setStep(1); setMessage(""); setError(""); setConfirmNoVariants(false);
  };

  const createDraft = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/merchant/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchantId, categoryId, title, description, draftOnly: true }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Le brouillon n’a pas pu être créé.");
    setProductId(payload.data.productId); setVariants([{ ...emptyVariant(), id: payload.data.variantId }]); setStep(2); setMessage("Brouillon enregistré automatiquement.");
  };

  // Combinaisons attendues d'après les champs Taille/Couleur actuels — utilisé à la
  // fois par le bouton "Générer la matrice" (aperçu explicite) et par saveVariants
  // (garde-fou : évite d'enregistrer une variante "Standard" vide si l'utilisateur a
  // rempli les axes sans avoir cliqué sur "Générer").
  const computeMatrix = () => {
    const first = optionOneValues.split(",").map((value) => value.trim()).filter(Boolean);
    const second = optionTwoValues.split(",").map((value) => value.trim()).filter(Boolean);
    if (!first.length) return null;
    const combinations = second.length ? first.flatMap((left) => second.map((right) => ({ [optionOne]: left, [optionTwo]: right }))) : first.map((left) => ({ [optionOne]: left }));
    return combinations;
  };

  const applyMatrix = (combinations: Array<Record<string, string>>) => {
    const base = variants[0] ?? emptyVariant();
    setVariants(combinations.map((attributes) => ({ ...base, id: undefined, sku: "", title: Object.values(attributes).join(" · "), attributes })));
  };

  const generateMatrix = () => {
    setConfirmNoVariants(false);
    const combinations = computeMatrix();
    if (!combinations) return setVariants([{ ...(variants[0] ?? emptyVariant()), id: undefined, title: "Standard", attributes: {} }]);
    if (combinations.length > 50) return setError("La matrice ne peut pas dépasser 50 variantes.");
    setError("");
    applyMatrix(combinations);
  };

  const updateVariant = (index: number, patch: Partial<VariantEditor>) => setVariants((current) => current.map((variant, position) => position === index ? { ...variant, ...patch } : variant));

  const hasNoAttributes = variants.every((variant) => Object.keys(variant.attributes).length === 0);

  const saveVariants = async () => {
    if (!productId) return;

    // Les axes ont été remplis mais jamais appliqués (bouton "Générer la matrice"
    // jamais cliqué) : on applique automatiquement plutôt que d'enregistrer la
    // variante "Standard" vide encore présente dans le tableau.
    let variantsToSave = variants;
    if (hasNoAttributes) {
      const combinations = computeMatrix();
      if (combinations) {
        if (combinations.length > 50) { setError("La matrice ne peut pas dépasser 50 variantes."); return; }
        const base = variants[0] ?? emptyVariant();
        variantsToSave = combinations.map((attributes) => ({ ...base, id: undefined, sku: "", title: Object.values(attributes).join(" · "), attributes }));
        setVariants(variantsToSave);
      }
    }

    const stillNoAttributes = variantsToSave.every((variant) => Object.keys(variant.attributes).length === 0);
    if (stillNoAttributes && !confirmNoVariants) {
      setError("Aucune taille, couleur ou autre option définie pour ce produit. Si c’est volontaire (produit sans variante), cliquez à nouveau sur « Enregistrer » pour confirmer.");
      setConfirmNoVariants(true);
      return;
    }
    setConfirmNoVariants(false);
    setBusy(true); setError("");
    const response = await fetch(`/api/merchant/products/${productId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
      categoryId, title, description,
      optionNames: [optionOneValues && optionOne, optionTwoValues && optionTwo].filter(Boolean),
      variants: variantsToSave.map((variant) => ({ ...variant, compareAtPriceXof: variant.compareAtPriceXof || undefined })),
    }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Les variantes n’ont pas pu être enregistrées.");
    setStep(3); setMessage("Variantes et stocks enregistrés."); router.refresh();
  };

  const uploadPhotos = async (files: File[] | FileList | null) => {
    if (!files || !productId) return;
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    if (photos.length + selectedFiles.length > 8) return setError(`Vous pouvez encore ajouter ${8 - photos.length} photo(s).`);
    const invalid = selectedFiles.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024);
    if (invalid) return setError(`${invalid.name} doit être une image JPEG, PNG ou WebP de moins de 10 Mo.`);
    setBusy(true); setError("");
    let added = 0;
    for (const file of selectedFiles) {
      const form = new FormData(); form.set("file", file); form.set("altText", title);
      const response = await fetch(`/api/merchant/products/${productId}/media`, { method: "POST", body: form });
      if (!response.ok) { const payload = await response.json(); setError(payload.error?.message ?? `Échec pour ${file.name}.`); break; }
      const payload = await response.json();
      added += 1;
      setPhotos((current) => [...current, {
        id: payload.data.id,
        name: file.name,
        url: URL.createObjectURL(file),
        altText: title,
        position: current.length,
      }]);
    }
    setBusy(false); if (added) { setMessage(`${added} photo${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""}.`); router.refresh(); }
  };

  const removePhoto = async (photoId: string) => {
    if (!productId) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/merchant/products/${productId}/media/${photoId}`, { method: "DELETE" });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "La photo n’a pas pu être supprimée.");
    setPhotos((current) => current.filter((photo) => photo.id !== photoId).map((photo, position) => ({ ...photo, position })));
    setMessage("Photo supprimée.");
    router.refresh();
  };

  const publish = async () => {
    if (!productId) return;
    setBusy(true); setError("");
    const response = await fetch("/api/merchant/products", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, publish: true }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Publication impossible.");
    setMessage("Le produit est publié."); setStep(0); router.refresh();
  };

  const publishFromList = async (selectedProductId: string) => {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/merchant/products", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: selectedProductId, publish: true }),
    });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Publication impossible.");
    setMessage("Le produit est maintenant visible sur le marché.");
    router.refresh();
  };

  const readyDrafts = products.filter((product) => {
    const hasSellableVariant = product.product_variants.some((variant) => {
      const inventory = variant.inventory_items?.[0];
      return variant.active && (inventory?.available_quantity ?? 0) > (inventory?.reserved_quantity ?? 0);
    });
    return product.status === "draft" && product.product_media.length > 0 && hasSellableVariant;
  });

  if (step === 0) return (
    <div className="merchant-catalog-space">
      <div className="merchant-section-heading"><div><span className="mvp-eyebrow">Catalogue</span><h2>Vos produits</h2><p>Photos, variantes et stocks réunis dans un même parcours.</p></div><button className="mvp-button" onClick={() => setStep(1)}>Ajouter un produit</button></div>
      {readyDrafts.length > 0 && !deliveryReady && (
        <div className="merchant-publication-blocker">
          <div>
            <strong>{readyDrafts.length} produit{readyDrafts.length > 1 ? "s sont prêts" : " est prêt"}, mais invisible sur le marché</strong>
            <p>Configurez au moins une région de livraison ou le retrait en boutique, puis publiez immédiatement.</p>
          </div>
          <button type="button" className="mvp-button" onClick={onOpenDelivery}>Configurer la livraison</button>
        </div>
      )}
      {readyDrafts.length > 0 && deliveryReady && !subscriptionReady && (
        <div className="merchant-publication-blocker">
          <div><strong>Publication bloquée par l’abonnement</strong><p>Les produits sont enregistrés, mais un abonnement actif est nécessaire pour les rendre visibles.</p></div>
          <button type="button" className="mvp-button" onClick={onOpenSubscription}>Voir l’abonnement</button>
        </div>
      )}
      {readyDrafts.length > 0 && deliveryReady && subscriptionReady && (
        <div className="merchant-ready-products">
          <div><strong>Produits prêts à être mis en vente</strong><p>Ils sont encore en brouillon et ne sont donc pas visibles sur le marché.</p></div>
          <div className="mvp-actions">
            {readyDrafts.map((product) => (
              <button type="button" className="mvp-button" disabled={busy} onClick={() => void publishFromList(product.id)} key={product.id}>
                {busy ? "Publication…" : `Publier « ${product.title} »`}
              </button>
            ))}
          </div>
        </div>
      )}
      {message && <p className="mvp-alert">{message}</p>}
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      <div className="merchant-product-list">
        {products.map((product) => { const variant = product.product_variants.find((item) => item.active); const inventory = variant?.inventory_items?.[0]; return (
          <article className="merchant-product-row" key={product.id}><div><span className="mvp-status" data-status={product.status}>{merchantStatusLabel(product.status)}</span><h3>{product.title}</h3><small>{product.product_variants.filter((item) => item.active).length} variante(s) · {product.product_media.length} photo(s) · {formatPrice(variant?.price_xof ?? 0)} · {Math.max(0, (inventory?.available_quantity ?? 0) - (inventory?.reserved_quantity ?? 0))} vendable(s)</small></div><button className="mvp-button mvp-button--secondary" onClick={() => editProduct(product)}>Modifier</button></article>
        ); })}
        {!products.length && <p className="mvp-empty">Aucun produit. L’assistant vous guide jusqu’à la publication.</p>}
      </div>
    </div>
  );

  return (
    <div className="merchant-product-wizard">
      <div className="merchant-section-heading"><div><span className="mvp-eyebrow">Assistant produit</span><h2>{productId ? title : "Nouveau produit"}</h2></div><button className="mvp-button mvp-button--secondary" onClick={reset}>Quitter l’assistant</button></div>
      <div className="merchant-wizard-steps">{["Informations", "Variantes et stock", "Photos", "Vérification"].map((label, index) => <span className={step === index + 1 ? "is-active" : step > index + 1 ? "is-complete" : ""} key={label}><b>{index + 1}</b>{label}</span>)}</div>
      {message && <p className="mvp-alert">{message}</p>}{error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      {step === 1 && <form className="mvp-form" onSubmit={productId ? (event) => { event.preventDefault(); setStep(2); } : createDraft}><div className="mvp-form__grid"><label className="mvp-field">Nom du produit<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label className="mvp-field">Catégorie<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div><label className="mvp-field">Description<textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} required /></label><button className="mvp-button" disabled={busy}>{busy ? "Enregistrement…" : "Continuer vers les variantes"}</button></form>}
      {step === 2 && <div className="mvp-form"><div className="variant-builder"><h3>Générer les combinaisons</h3><p>Définissez jusqu’à deux axes d’attributs (ex. Taille et Couleur), laissez les valeurs vides pour un produit sans option.</p><div className="mvp-form__grid"><label className="mvp-field">Axe 1 (ex. Taille)<input value={optionOne} onChange={(event) => setOptionOne(event.target.value)} /></label><label className="mvp-field">Valeurs de l’axe 1, séparées par des virgules<input value={optionOneValues} onChange={(event) => setOptionOneValues(event.target.value)} placeholder="S, M, L" /></label><label className="mvp-field">Axe 2 (ex. Couleur)<input value={optionTwo} onChange={(event) => setOptionTwo(event.target.value)} /></label><label className="mvp-field">Valeurs de l’axe 2, séparées par des virgules<input value={optionTwoValues} onChange={(event) => setOptionTwoValues(event.target.value)} placeholder="Noir, Blanc" /></label></div><button className="mvp-button mvp-button--secondary" onClick={generateMatrix}>Générer la matrice</button></div><div className="variant-table-wrap"><table className="mvp-table variant-table"><thead><tr><th>Variante</th><th>Prix</th><th>Stock physique</th><th>Réservé</th><th>Seuil d’alerte</th><th>SKU facultatif</th></tr></thead><tbody>{variants.map((variant, index) => <tr key={`${variant.title}-${index}`}><td data-label="Variante"><strong>{variant.title}</strong></td><td data-label="Prix"><input aria-label={`Prix ${variant.title}`} type="number" min="0" value={variant.priceXof} onChange={(event) => updateVariant(index, { priceXof: Number(event.target.value) })} /></td><td data-label="Stock physique"><input aria-label={`Stock ${variant.title}`} type="number" min={variant.reserved} value={variant.stock} onChange={(event) => updateVariant(index, { stock: Number(event.target.value) })} /></td><td data-label="Réservé">{variant.reserved}</td><td data-label="Seuil d’alerte"><input aria-label={`Seuil ${variant.title}`} type="number" min="0" value={variant.lowStockThreshold} onChange={(event) => updateVariant(index, { lowStockThreshold: Number(event.target.value) })} /></td><td data-label="SKU facultatif"><input aria-label={`SKU ${variant.title}`} value={variant.sku} placeholder="Généré automatiquement" onChange={(event) => updateVariant(index, { sku: event.target.value })} /></td></tr>)}</tbody></table></div><p><strong>{sellableStock}</strong> unité(s) disponibles à la vente, après réservations.</p><button className="mvp-button" disabled={busy} onClick={saveVariants}>{busy ? "Enregistrement…" : confirmNoVariants ? "Confirmer sans taille/couleur" : "Enregistrer et ajouter les photos"}</button></div>}
      {step === 3 && <div className="merchant-photo-step">
        <div className="merchant-photo-intro"><span><Images /></span><div><h3>Ajoutez les photos du produit</h3><p>La première photo devient l’image principale visible dans la boutique. Ajoutez jusqu’à 8 photos.</p></div><strong>{photos.length}/8</strong></div>
        <button
          type="button"
          className={`merchant-photo-drop ${isDraggingPhotos ? "is-dragging" : ""}`}
          onClick={() => photoInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setIsDraggingPhotos(true); }}
          onDragLeave={() => setIsDraggingPhotos(false)}
          onDrop={(event) => { event.preventDefault(); setIsDraggingPhotos(false); void uploadPhotos(event.dataTransfer.files); }}
          disabled={busy || photos.length >= 8}
        >
          <span className="merchant-photo-drop__icon">{busy ? <UploadCloud /> : <ImagePlus />}</span>
          <strong>{busy ? "Envoi des photos…" : photos.length ? "Ajouter d’autres photos" : "Déposez vos photos ici"}</strong>
          <span>ou cliquez pour parcourir vos fichiers</span>
          <small>JPEG, PNG ou WebP · 10 Mo maximum par image</small>
        </button>
        <input ref={photoInputRef} className="merchant-photo-input" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadPhotos(event.target.files); event.currentTarget.value = ""; }} disabled={busy || photos.length >= 8} />
        <div className="merchant-photo-grid">
          {photos.map((photo, index) => <figure key={photo.id}>
            <div className="merchant-photo-preview">{photo.url ? <img src={photo.url} alt={photo.altText || `Photo ${index + 1} du produit`} /> : <span><Images /></span>}{index === 0 && <b><Star /> Photo principale</b>}<button type="button" onClick={() => void removePhoto(photo.id)} disabled={busy} aria-label={`Supprimer ${photo.name}`}><Trash2 /></button></div>
            <figcaption><strong>Photo {index + 1}</strong><span>{index === 0 ? "Image de couverture" : photo.name}</span></figcaption>
          </figure>)}
        </div>
        {!photos.length && <p className="merchant-photo-help">Ajoutez au moins une photo nette pour pouvoir publier ce produit.</p>}
        <div className="merchant-wizard-actions"><button type="button" className="mvp-button mvp-button--secondary" onClick={() => setStep(2)}>Retour aux variantes</button><button type="button" className="mvp-button" disabled={!photos.length || busy} onClick={() => setStep(4)}>Vérifier le produit</button></div>
      </div>}
      {step === 4 && <div className="merchant-readiness"><h3>Prêt à publier ?</h3><ul><li className={variants.length ? "is-ready" : ""}>Au moins une variante active</li><li className={photos.length ? "is-ready" : ""}>Au moins une photo</li><li className={deliveryReady ? "is-ready" : ""}>Une région de livraison ou un retrait configuré</li><li className={subscriptionReady ? "is-ready" : ""}>Abonnement marchand actif</li></ul>{!subscriptionReady && <div className="merchant-paywall-inline"><strong>Publication verrouillée</strong><p>Vous pouvez terminer ce brouillon, mais un abonnement actif est obligatoire pour le mettre en vente.</p><button className="mvp-button mvp-button--secondary" onClick={onOpenSubscription}>Voir les abonnements</button></div>}<button className="mvp-button" disabled={!variants.length || !photos.length || !deliveryReady || !subscriptionReady || busy} onClick={publish}>{busy ? "Publication…" : "Publier le produit"}</button></div>}
    </div>
  );
}
