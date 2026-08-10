"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Images, Star, Trash2, UploadCloud } from "lucide-react";
import { formatPrice } from "@/lib/marketplace";
import { merchantStatusLabel } from "@/lib/domain/merchant-ui";
import { computeVariantMatrix, parseVariantValues } from "@/lib/domain/variant-matrix";

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
  option_names?: string[];
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

type OptionAxis = { name: string; values: string };

const MAX_AXES = 3;

const emptyVariant = (): VariantEditor => ({
  title: "Standard", attributes: {}, sku: "", priceXof: 0, stock: 0,
  reserved: 0, lowStockThreshold: 5, active: true,
});

const emptyAxes = (): OptionAxis[] => [{ name: "Taille", values: "" }, { name: "Couleur", values: "" }];

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
  const blobUrlsRef = useRef(new Set<string>());
  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState<string>();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [axes, setAxes] = useState<OptionAxis[]>(emptyAxes());
  const [variants, setVariants] = useState<VariantEditor[]>([emptyVariant()]);
  const [photos, setPhotos] = useState<Array<{ id: string; name: string; url?: string; altText: string; position: number }>>([]);
  const [isDraggingPhotos, setIsDraggingPhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmNoVariants, setConfirmNoVariants] = useState(false);

  const sellableStock = useMemo(() => variants.reduce((sum, variant) => sum + Math.max(0, variant.stock - variant.reserved), 0), [variants]);

  const revokeBlobUrls = () => {
    for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
    blobUrlsRef.current.clear();
  };

  useEffect(() => () => revokeBlobUrls(), []);

  const reset = () => {
    revokeBlobUrls();
    setStep(0); setProductId(undefined); setCategoryId(categories[0]?.id ?? "");
    setTitle(""); setDescription(""); setVariants([emptyVariant()]); setPhotos([]);
    setAxes(emptyAxes()); setMessage(""); setError(""); setConfirmNoVariants(false);
  };

  const editProduct = (product: MerchantProductEditor, targetStep: 1 | 2 | 3 = 1) => {
    revokeBlobUrls();
    setProductId(product.id); setCategoryId(product.category_id); setTitle(product.title); setDescription(product.description);
    setPhotos([...product.product_media].sort((a, b) => a.position - b.position).map((media) => ({
      id: media.id,
      name: media.storage_path.split("/").at(-1) ?? "Photo du produit",
      url: media.url,
      altText: media.alt_text ?? product.title,
      position: media.position,
    })));
    const activeVariants = product.product_variants.filter((variant) => variant.active);
    setVariants(activeVariants.map((variant) => {
      const inventory = variant.inventory_items?.[0];
      return {
        id: variant.id, title: variant.title ?? (Object.values(variant.attributes ?? {}).join(" · ") || "Standard"),
        attributes: variant.attributes ?? {}, sku: variant.sku.startsWith("AUTO-") ? "" : variant.sku,
        priceXof: variant.price_xof, compareAtPriceXof: variant.compare_at_price_xof ?? undefined,
        stock: inventory?.available_quantity ?? 0, reserved: inventory?.reserved_quantity ?? 0,
        lowStockThreshold: inventory?.low_stock_threshold ?? 5, active: true,
      };
    }));
    // Reconstruit les axes (noms + valeurs) depuis product.option_names et les
    // attributs des variantes, pour éviter d'avoir à les ressaisir en édition.
    const storedNames = product.option_names?.filter(Boolean) ?? [];
    const namesFromAttributes = [...new Set(activeVariants.flatMap((variant) => Object.keys(variant.attributes ?? {})))];
    const names = storedNames.length ? storedNames : namesFromAttributes;
    if (names.length) {
      setAxes(names.slice(0, MAX_AXES).map((name) => ({
        name,
        values: [...new Set(activeVariants.map((variant) => variant.attributes?.[name]).filter((value): value is string => Boolean(value)))].join(", "),
      })));
    } else {
      setAxes(emptyAxes());
    }
    setStep(targetStep); setMessage(""); setError(""); setConfirmNoVariants(false);
  };

  const createDraft = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/merchant/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchantId, categoryId, title, description, draftOnly: true }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Le brouillon n’a pas pu être créé.");
    setProductId(payload.data.productId); setVariants([{ ...emptyVariant(), id: payload.data.variantId }]); setStep(2); setMessage("Brouillon enregistré automatiquement.");
  };

  // Combinaisons attendues d'après les axes actuels (1 à 3) — utilisé à la fois
  // par le bouton "Générer la matrice" (aperçu explicite) et par saveVariants
  // (garde-fou : évite d'enregistrer une variante "Standard" vide si l'utilisateur a
  // rempli les axes sans avoir cliqué sur "Générer").
  const computeMatrix = () => computeVariantMatrix(
    axes.map((axis) => ({ name: axis.name, values: parseVariantValues(axis.values) })),
  );

  const applyMatrix = (combinations: Array<Record<string, string>>) => {
    const base = variants[0] ?? emptyVariant();
    setVariants(combinations.map((attributes) => ({ ...base, id: undefined, sku: "", title: Object.values(attributes).join(" · "), attributes })));
  };

  const generateMatrix = () => {
    setConfirmNoVariants(false);
    const axisWithoutName = axes.find((axis) => !axis.name.trim() && parseVariantValues(axis.values).length);
    if (axisWithoutName) {
      setError("Donnez un nom à chaque axe qui contient des valeurs (par exemple Taille ou Couleur).");
      return;
    }
    const completedAxisNames = axes
      .filter((axis) => axis.name.trim() && parseVariantValues(axis.values).length)
      .map((axis) => axis.name.trim().toLocaleLowerCase("fr"));
    if (new Set(completedAxisNames).size !== completedAxisNames.length) {
      setError("Chaque axe doit avoir un nom différent : par exemple Taille, Couleur et Matière.");
      return;
    }
    const combinations = computeMatrix();
    if (!combinations) {
      setError("Ajoutez au moins une valeur dans le champ « Valeurs » : par exemple S, M, L ou Rouge, Noir.");
      return;
    }
    if (combinations.length > 50) return setError("La matrice ne peut pas dépasser 50 variantes.");
    setError("");
    applyMatrix(combinations);
    setMessage(`${combinations.length} variante${combinations.length > 1 ? "s" : ""} générée${combinations.length > 1 ? "s" : ""}. Vérifiez maintenant les prix et les stocks.`);
  };

  const updateVariant = (index: number, patch: Partial<VariantEditor>) => setVariants((current) => current.map((variant, position) => position === index ? { ...variant, ...patch } : variant));

  const updateAxis = (index: number, patch: Partial<OptionAxis>) => {
    setAxes((current) => current.map((axis, position) => position === index ? { ...axis, ...patch } : axis));
    setError(""); setMessage(""); setConfirmNoVariants(false);
  };
  const addAxis = () => setAxes((current) => current.length >= MAX_AXES ? current : [...current, { name: "", values: "" }]);
  const removeAxis = (index: number) => setAxes((current) => current.filter((_, position) => position !== index));

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
      setError("Aucune valeur de taille, couleur ou autre option n’a été trouvée. Saisissez par exemple S, M, L dans « Valeurs », puis générez la matrice. Si le produit n’a volontairement aucune option, cliquez à nouveau sur « Enregistrer ».");
      setConfirmNoVariants(true);
      return;
    }
    setConfirmNoVariants(false);
    setBusy(true); setError("");
    const response = await fetch(`/api/merchant/products/${productId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
      categoryId, title, description,
      optionNames: axes.filter((axis) => axis.name.trim() && axis.values.trim()).map((axis) => axis.name.trim()),
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
      const previewUrl = URL.createObjectURL(file);
      blobUrlsRef.current.add(previewUrl);
      setPhotos((current) => [...current, {
        id: payload.data.id,
        name: file.name,
        url: previewUrl,
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
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === photoId);
      if (removed?.url?.startsWith("blob:")) {
        URL.revokeObjectURL(removed.url);
        blobUrlsRef.current.delete(removed.url);
      }
      return current.filter((photo) => photo.id !== photoId).map((photo, position) => ({ ...photo, position }));
    });
    setMessage("Photo supprimée.");
    router.refresh();
  };

  const movePhoto = async (photoId: string, direction: -1 | 1) => {
    if (!productId) return;
    const currentIndex = photos.findIndex((photo) => photo.id === photoId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= photos.length) return;
    const previous = photos;
    const reordered = [...photos];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    const withPositions = reordered.map((photo, position) => ({ ...photo, position }));
    setPhotos(withPositions);
    setBusy(true); setError("");
    const response = await fetch(`/api/merchant/products/${productId}/media/order`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaIds: withPositions.map((photo) => photo.id) }),
    });
    setBusy(false);
    if (!response.ok) {
      setPhotos(previous);
      setError("L’ordre des photos n’a pas pu être enregistré.");
      return;
    }
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
          <article className="merchant-product-row" key={product.id}><div><span className="mvp-status" data-status={product.status}>{merchantStatusLabel(product.status)}</span><h3>{product.title}</h3><small>{product.product_variants.filter((item) => item.active).length} variante(s) · {product.product_media.length} photo(s) · {formatPrice(variant?.price_xof ?? 0)} · {Math.max(0, (inventory?.available_quantity ?? 0) - (inventory?.reserved_quantity ?? 0))} vendable(s)</small></div><div className="mvp-actions"><button className="mvp-button mvp-button--secondary" onClick={() => editProduct(product, 1)}>Infos</button><button className="mvp-button mvp-button--secondary" onClick={() => editProduct(product, 2)}>Variantes et stock</button><button className="mvp-button mvp-button--secondary" onClick={() => editProduct(product, 3)}>Photos</button></div></article>
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
      {step === 2 && <div className="mvp-form"><div className="variant-builder"><h3>Générer les combinaisons</h3><p>Définissez jusqu’à trois axes d’attributs (ex. Taille, Couleur, Matière), laissez les valeurs vides pour un produit sans option.</p>{axes.map((axis, index) => (<div className="mvp-form__grid variant-axis-row" key={index}><label className="mvp-field">{`Axe ${index + 1} (ex. Taille)`}<input value={axis.name} onChange={(event) => updateAxis(index, { name: event.target.value })} /></label><label className="mvp-field">Valeurs, séparées par virgule, point-virgule ou ligne<input value={axis.values} onChange={(event) => updateAxis(index, { values: event.target.value })} placeholder="S, M, L" /></label>{axes.length > 1 && <button type="button" className="mvp-button mvp-button--secondary" onClick={() => removeAxis(index)} aria-label={`Retirer l’axe ${index + 1}`}>Retirer</button>}</div>))}<div className="mvp-actions">{axes.length < MAX_AXES && <button type="button" className="mvp-button mvp-button--secondary" onClick={addAxis}>Ajouter un axe</button>}<button type="button" className="mvp-button mvp-button--secondary" onClick={generateMatrix}>Générer la matrice</button></div></div><div className="variant-table-wrap"><table className="mvp-table variant-table"><thead><tr><th>Variante</th><th>Prix</th><th>Stock physique</th><th>Réservé</th><th>Seuil d’alerte</th><th>SKU facultatif</th></tr></thead><tbody>{variants.map((variant, index) => <tr key={`${variant.title}-${index}`}><td data-label="Variante"><strong>{variant.title}</strong></td><td data-label="Prix"><input aria-label={`Prix ${variant.title}`} type="number" min="0" value={variant.priceXof} onChange={(event) => updateVariant(index, { priceXof: Number(event.target.value) })} /></td><td data-label="Stock physique"><input aria-label={`Stock ${variant.title}`} type="number" min={variant.reserved} value={variant.stock} onChange={(event) => updateVariant(index, { stock: Number(event.target.value) })} /></td><td data-label="Réservé">{variant.reserved}</td><td data-label="Seuil d’alerte"><input aria-label={`Seuil ${variant.title}`} type="number" min="0" value={variant.lowStockThreshold} onChange={(event) => updateVariant(index, { lowStockThreshold: Number(event.target.value) })} /></td><td data-label="SKU facultatif"><input aria-label={`SKU ${variant.title}`} value={variant.sku} placeholder="Généré automatiquement" onChange={(event) => updateVariant(index, { sku: event.target.value })} /></td></tr>)}</tbody></table></div><p><strong>{sellableStock}</strong> unité(s) disponibles à la vente, après réservations.</p><button type="button" className="mvp-button" disabled={busy} onClick={saveVariants}>{busy ? "Enregistrement…" : confirmNoVariants ? "Confirmer sans taille/couleur" : "Enregistrer et ajouter les photos"}</button></div>}
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
            <div className="merchant-photo-reorder">
              <button type="button" className="mvp-button mvp-button--secondary" onClick={() => void movePhoto(photo.id, -1)} disabled={busy || index === 0} aria-label={`Déplacer ${photo.name} vers l’avant`}>◀</button>
              <button type="button" className="mvp-button mvp-button--secondary" onClick={() => void movePhoto(photo.id, 1)} disabled={busy || index === photos.length - 1} aria-label={`Déplacer ${photo.name} vers l’arrière`}>▶</button>
            </div>
          </figure>)}
        </div>
        {!photos.length && <p className="merchant-photo-help">Ajoutez au moins une photo nette pour pouvoir publier ce produit.</p>}
        <div className="merchant-wizard-actions"><button type="button" className="mvp-button mvp-button--secondary" onClick={() => setStep(2)}>Retour aux variantes</button><button type="button" className="mvp-button" disabled={!photos.length || busy} onClick={() => setStep(4)}>Vérifier le produit</button></div>
      </div>}
      {step === 4 && <div className="merchant-readiness"><h3>Prêt à publier ?</h3><ul><li className={variants.length ? "is-ready" : ""}>Au moins une variante active</li><li className={photos.length ? "is-ready" : ""}>Au moins une photo</li><li className={deliveryReady ? "is-ready" : ""}>Une région de livraison ou un retrait configuré</li><li className={subscriptionReady ? "is-ready" : ""}>Abonnement marchand actif</li></ul>{!subscriptionReady && <div className="merchant-paywall-inline"><strong>Publication verrouillée</strong><p>Vous pouvez terminer ce brouillon, mais un abonnement actif est obligatoire pour le mettre en vente.</p><button className="mvp-button mvp-button--secondary" onClick={onOpenSubscription}>Voir les abonnements</button></div>}<button className="mvp-button" disabled={!variants.length || !photos.length || !deliveryReady || !subscriptionReady || busy} onClick={publish}>{busy ? "Publication…" : "Publier le produit"}</button></div>}
    </div>
  );
}
