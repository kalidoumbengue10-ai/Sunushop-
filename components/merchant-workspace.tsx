"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/marketplace";
import { CourierManager } from "@/components/courier-manager";
import { MerchantMedia } from "@/components/merchant-media";
import {
  requiredVerificationDocuments,
  type MerchantKind,
  type VerificationDocumentType,
} from "@/lib/domain/verification";

type Merchant = {
  id: string;
  kind: MerchantKind;
  public_name: string;
  slug: string;
  status: string;
  verification_status: string;
  subscription_status: string;
  representative_is_legal_owner: boolean;
  wave_payment_number: string | null;
  orange_money_payment_number: string | null;
};

type VerificationCase = {
  id: string;
  status: string;
  merchant_note: string | null;
};

type DocumentRow = {
  id: string;
  document_type: VerificationDocumentType;
  version: number;
  status: string;
  uploaded_at: string;
};

type MerchantWorkspaceProps = {
  merchant: Merchant | null;
  verificationCase: VerificationCase | null;
  documents: DocumentRow[];
  categories: Array<{ id: string; name: string }>;
  plans: Array<{
    id: string;
    name: string;
    monthly_price_xof: number;
    product_limit: number | null;
  }>;
  products: Array<{
    id: string;
    title: string;
    status: string;
    product_media: Array<{
      id: string;
      storage_path: string;
    }>;
    product_variants: Array<{
      id: string;
      sku: string;
      price_xof: number;
      inventory_items: Array<{
        available_quantity: number;
        reserved_quantity: number;
      }>;
    }>;
  }>;
  zones: Array<{
    id: string;
    label: string;
    region: string;
    city: string | null;
    fee_xof: number;
    min_delay_minutes: number;
    max_delay_minutes: number;
  }>;
  subscription: {
    plan_id: string;
    status: string;
    current_period_ends_at: string | null;
    grace_ends_at: string | null;
  } | null;
  payments: Array<{
    id: string;
    plan_id: string;
    channel: string;
    external_reference: string;
    amount_xof: number;
    status: string;
    created_at: string;
  }>;
  orders: Array<{
    id: string;
    public_code: string;
    status: string;
    total_xof: number;
    created_at: string;
    direct_payment_declarations: Array<{
      id: string;
      external_reference: string;
      confirmed_by_merchant_at: string | null;
    }>;
  }>;
  notifications: Array<{
    id: string;
    template: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
  subscriptionPaymentNumbers: {
    wave: string | null;
    orangeMoney: string | null;
  };
};

const documentLabels: Record<VerificationDocumentType, string> = {
  national_id_front: "CNI recto",
  national_id_back: "CNI verso",
  passport_identity: "Page d’identité du passeport",
  intent_letter: "Lettre d’intention signée",
  proof_activity: "Preuve d’activité",
  ninea: "NINEA",
  rccm: "RCCM",
  representative_mandate: "Mandat du représentant",
};

function DocumentUploader({
  caseId,
  type,
  latest,
  required,
}: {
  caseId: string;
  type: VerificationDocumentType;
  latest?: DocumentRow;
  required: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("documentType", type);
    form.set("file", file);
    const response = await fetch(
      `/api/merchant/verifications/${caseId}/documents`,
      { method: "POST", body: form },
    );
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Échec de l’envoi.");
      return;
    }
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  };

  return (
    <div className="mvp-document">
      <div className="mvp-document__heading">
        <strong>{documentLabels[type]}</strong>
        <span className={required ? "mvp-required-badge" : "mvp-optional-badge"}>
          {required ? "Obligatoire" : "Facultatif"}
        </span>
      </div>
      <small>{latest ? `Fichier reçu · version ${latest.version} · ${latest.status}` : "PDF, JPG ou PNG · 10 Mo maximum"}</small>
      <input
        ref={inputRef}
        className="mvp-document__input"
        aria-label={`${latest ? "Remplacer" : "Ajouter"} ${documentLabels[type]}`}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        onChange={(event) => upload(event.target.files?.[0])}
      />
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      <button
        type="button"
        className="mvp-button mvp-button--secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Envoi en cours…" : latest ? "Remplacer le fichier" : "Ajouter le fichier"}
      </button>
    </div>
  );
}

function ProductMediaUploader({ productId }: { productId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/merchant/products/${productId}/media`, {
      method: "POST",
      body: form,
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Image non envoyée.");
      return;
    }
    setFile(undefined);
    router.refresh();
  };

  return (
    <div>
      <input
        aria-label="Image du produit"
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={(event) => setFile(event.target.files?.[0])}
      />
      <button
        type="button"
        className="mvp-button mvp-button--secondary"
        disabled={!file || busy}
        onClick={upload}
      >
        {busy ? "Envoi…" : "Ajouter une image"}
      </button>
      {error && <small>{error}</small>}
    </div>
  );
}

const nextMerchantOrderStatus: Record<string, string | undefined> = {
  pending_seller_confirmation: "confirmed",
  confirmed: "preparing",
  preparing: "ready_for_handoff",
  ready_for_handoff: "in_transit",
  in_transit: "delivered",
};

const nextMerchantOrderLabel: Record<string, string> = {
  confirmed: "Confirmer",
  preparing: "Préparer",
  ready_for_handoff: "Prête",
  in_transit: "Remise au livreur",
  delivered: "Livrée",
};

export function MerchantWorkspace(props: MerchantWorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = useState("dossier");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submitJson = async (
    url: string,
    body: object,
    successMessage: string,
  ) => {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "L’action a échoué.");
      return false;
    }
    setMessage(successMessage);
    router.refresh();
    return true;
  };

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!props.merchant) return;
    const form = new FormData(event.currentTarget);
    const success = await submitJson(
      "/api/merchant/products",
      {
        merchantId: props.merchant.id,
        categoryId: form.get("categoryId"),
        title: form.get("title"),
        description: form.get("description"),
        sku: form.get("sku"),
        variantTitle: form.get("variantTitle") || undefined,
        priceXof: Number(form.get("priceXof")),
        stock: Number(form.get("stock")),
        publish: form.get("publish") === "on",
      },
      "Produit ajouté au catalogue.",
    );
    if (success) event.currentTarget.reset();
  };

  const setProductPublication = async (
    productId: string,
    publish: boolean,
  ) => {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/merchant/products", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, publish }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Publication impossible.");
      return;
    }
    setMessage(publish ? "Produit publié." : "Produit remis en brouillon.");
    router.refresh();
  };

  const createZone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!props.merchant) return;
    const form = new FormData(event.currentTarget);
    const success = await submitJson(
      "/api/merchant/delivery-zones",
      {
        merchantId: props.merchant.id,
        methodKind: form.get("methodKind"),
        methodName: form.get("methodName"),
        region: form.get("region"),
        city: form.get("city") || undefined,
        label: form.get("label"),
        feeXof: Number(form.get("feeXof")),
        minDelayMinutes: Number(form.get("minDelayMinutes")),
        maxDelayMinutes: Number(form.get("maxDelayMinutes")),
      },
      "Zone de livraison ajoutée.",
    );
    if (success) event.currentTarget.reset();
  };

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!props.merchant) return;
    const form = new FormData(event.currentTarget);
    const plan = props.plans.find((item) => item.id === form.get("planId"));
    if (!plan) return;
    const channel = form.get("channel");
    if (channel !== "wave" && channel !== "orange_money") {
      setError("Aucun canal de paiement SunuShop n’est disponible.");
      return;
    }
    await submitJson(
      "/api/merchant/subscriptions/payments",
      {
        merchantId: props.merchant.id,
        planId: plan.id,
        channel,
        externalReference: form.get("externalReference"),
        amountXof: plan.monthly_price_xof,
        paidAt: new Date(String(form.get("paidAt"))).toISOString(),
      },
      "Paiement transmis pour validation.",
    );
  };

  const saveRecoveryEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitJson(
      "/api/auth/email",
      { email: form.get("email") },
      "Email de confirmation envoyé.",
    );
  };

  const savePaymentNumbers = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!props.merchant) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/merchant/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        merchantId: props.merchant.id,
        wavePaymentNumber: form.get("wavePaymentNumber") || null,
        orangeMoneyPaymentNumber:
          form.get("orangeMoneyPaymentNumber") || null,
      }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Paramètres non enregistrés.");
      return;
    }
    setMessage("Coordonnées de paiement mises à jour.");
    router.refresh();
  };

  if (!props.merchant) return null;
  const verificationOnly = props.merchant.verification_status !== "approved";

  const latestDocuments = new Map<VerificationDocumentType, DocumentRow>();
  props.documents.forEach((document) => {
    if (!latestDocuments.has(document.document_type)) {
      latestDocuments.set(document.document_type, document);
    }
  });
  const checklist = requiredVerificationDocuments(
    props.merchant.kind,
    props.merchant.representative_is_legal_owner,
  );
  const documentTypes = [...checklist.required, ...checklist.optional];
  const requiredUploaded = checklist.required.filter((type) => {
    const document = latestDocuments.get(type);
    return document && ["uploaded", "accepted"].includes(document.status);
  });
  const missingRequired = checklist.required.filter(
    (type) => !requiredUploaded.includes(type),
  );
  const canEditDocuments = ["draft", "needs_changes"].includes(
    props.verificationCase?.status ?? "",
  );
  const planMap = new Map(props.plans.map((plan) => [plan.id, plan]));
  const hasSubscriptionPaymentChannel = Boolean(
    props.subscriptionPaymentNumbers.wave ||
      props.subscriptionPaymentNumbers.orangeMoney,
  );

  return (
    <div className="mvp-sidebar-layout">
      <aside className="mvp-sidebar">
        {(verificationOnly ? ["dossier"] : ["dossier", "boutique", "catalogue", "livraison", "livreurs", "abonnement", "commandes"]).map(
          (name) => (
            <button
              key={name}
              className={tab === name ? "is-active" : ""}
              onClick={() => setTab(name)}
            >
              {name[0].toUpperCase() + name.slice(1)}
            </button>
          ),
        )}
      </aside>
      <section>
        <div className="mvp-card mvp-card--full">
          <span className="mvp-eyebrow">{verificationOnly ? "Espace sécurisé · vérification" : "Espace marchand"}</span>
          <h1 className="mvp-title">{props.merchant.public_name}</h1>
          {verificationOnly && <p className="mvp-lede">Cet espace est réservé à votre dossier. Les outils boutique, produits, commandes et livreurs seront débloqués après validation par SunuShop.</p>}
          <div className="mvp-actions">
            <span
              className="mvp-status"
              data-status={props.merchant.verification_status}
            >
              Vérification {props.merchant.verification_status}
            </span>
            {!verificationOnly && <span
              className="mvp-status"
              data-status={props.merchant.subscription_status}
            >
              Abonnement {props.merchant.subscription_status}
            </span>}
            {props.merchant.status === "active" && (
              <Link
                className="mvp-button mvp-button--secondary"
                href={`/boutiques/${props.merchant.slug}`}
              >
                Voir la boutique
              </Link>
            )}
          </div>
          {message && <p className="mvp-alert">{message}</p>}
          {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
        </div>

        {tab === "boutique" && <MerchantMedia merchantId={props.merchant.id} />}

        {tab === "livreurs" && (
          <CourierManager merchantId={props.merchant.id} orders={props.orders} />
        )}

        {tab === "dossier" && props.verificationCase && (
          <div className="mvp-card mvp-card--full">
            <h2>{verificationOnly ? "Complétez votre dossier" : "Dossier de vérification"}</h2>
            <p>
              Statut :{" "}
              <span
                className="mvp-status"
                data-status={props.verificationCase.status}
              >
                {props.verificationCase.status}
              </span>
            </p>
            {props.verificationCase.merchant_note && (
              <p className="mvp-alert mvp-alert--warning">
                {props.verificationCase.merchant_note}
              </p>
            )}
            <p>
              La CNI recto-verso, la lettre d’intention remplie et la preuve
              d’activité sont obligatoires. Le passeport est facultatif.
            </p>
            <p>
              <Link
                href="/documents/lettre-intention-sunushop.html"
                download="Lettre-intention-SunuShop.html"
              >
                Télécharger le modèle de lettre d’intention
              </Link>
            </p>
            {canEditDocuments ? (
              <div className="mvp-document-grid">
                {documentTypes.map((type) => (
                  <DocumentUploader
                    caseId={props.verificationCase!.id}
                    type={type}
                    latest={latestDocuments.get(type)}
                    required={checklist.required.includes(type)}
                    key={type}
                  />
                ))}
              </div>
            ) : (
              <div className="mvp-list">
                {[...latestDocuments.values()].map((document) => (
                  <div className="mvp-row" key={document.id}>
                    <strong>{documentLabels[document.document_type]}</strong>
                    <small>
                      version {document.version} · {document.status}
                    </small>
                  </div>
                ))}
              </div>
            )}
            {canEditDocuments && (
              <div className="mvp-document-submit">
                <p><strong>{requiredUploaded.length}/{checklist.required.length} documents obligatoires ajoutés</strong></p>
                {missingRequired.length > 0 && <small>Pièces manquantes : {missingRequired.map((type) => documentLabels[type]).join(", ")}.</small>}
                <button
                  className="mvp-button"
                  disabled={busy || missingRequired.length > 0}
                  onClick={() =>
                    submitJson(
                      `/api/merchant/verifications/${props.verificationCase!.id}/submit`,
                      {},
                      "Dossier envoyé à l’équipe de vérification.",
                    )
                  }
                >
                  Soumettre le dossier complet
                </button>
              </div>
            )}
            <div className="mvp-divider" />
            <form className="mvp-form" onSubmit={saveRecoveryEmail}>
              <h3>Adresse email du compte</h3>
              <label className="mvp-field">
                Nouvelle adresse email
                <input name="email" type="email" required />
              </label>
              <button className="mvp-button mvp-button--secondary">
                Demander la modification
              </button>
            </form>
          </div>
        )}

        {tab === "catalogue" && (
          <div className="mvp-card mvp-card--full">
            <h2>Catalogue</h2>
            <form className="mvp-form" onSubmit={createProduct}>
              <div className="mvp-form__grid">
                <label className="mvp-field">
                  Catégorie
                  <select name="categoryId" required>
                    {props.categories.map((category) => (
                      <option value={category.id} key={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mvp-field">
                  Nom du produit
                  <input name="title" required />
                </label>
                <label className="mvp-field">
                  SKU
                  <input name="sku" required />
                </label>
                <label className="mvp-field">
                  Variante
                  <input name="variantTitle" />
                </label>
                <label className="mvp-field">
                  Prix XOF
                  <input name="priceXof" type="number" min="0" required />
                </label>
                <label className="mvp-field">
                  Stock
                  <input name="stock" type="number" min="0" required />
                </label>
              </div>
              <label className="mvp-field">
                Description
                <textarea name="description" required />
              </label>
              <label>
                <input
                  name="publish"
                  type="checkbox"
                  disabled={props.merchant.status !== "active"}
                />{" "}
                Publier immédiatement
              </label>
              <button className="mvp-button" disabled={busy}>
                Ajouter le produit
              </button>
            </form>
            <div className="mvp-list">
              {props.products.map((product) => {
                const variant = product.product_variants[0];
                const inventory = variant?.inventory_items?.[0];
                return (
                  <div className="mvp-row" key={product.id}>
                    <div>
                      <strong>{product.title}</strong>
                      <small>
                        {variant?.sku} ·{" "}
                        {formatPrice(variant?.price_xof ?? 0)} · stock{" "}
                        {inventory?.available_quantity ?? 0}
                      </small>
                    </div>
                    <span className="mvp-status" data-status={product.status}>
                      {product.status}
                    </span>
                    <small>
                      {product.product_media.length} image
                      {product.product_media.length > 1 ? "s" : ""}
                    </small>
                    <ProductMediaUploader productId={product.id} />
                    <button
                      type="button"
                      className="mvp-button mvp-button--secondary"
                      disabled={
                        busy ||
                        (product.status !== "published" &&
                          props.merchant!.status !== "active")
                      }
                      onClick={() =>
                        setProductPublication(
                          product.id,
                          product.status !== "published",
                        )
                      }
                    >
                      {product.status === "published"
                        ? "Dépublier"
                        : "Publier"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "livraison" && (
          <div className="mvp-card mvp-card--full">
            <h2>Retrait et livraison par zone</h2>
            <form className="mvp-form" onSubmit={savePaymentNumbers}>
              <h3>Paiements directs au vendeur</h3>
              <p>
                Ces numéros ne sont communiqués qu’après création d’une
                commande utilisant le canal correspondant.
              </p>
              <div className="mvp-form__grid">
                <label className="mvp-field">
                  Numéro Wave
                  <input
                    name="wavePaymentNumber"
                    defaultValue={props.merchant.wave_payment_number ?? ""}
                    placeholder="+221770000000"
                  />
                </label>
                <label className="mvp-field">
                  Numéro Orange Money
                  <input
                    name="orangeMoneyPaymentNumber"
                    defaultValue={
                      props.merchant.orange_money_payment_number ?? ""
                    }
                    placeholder="+221770000000"
                  />
                </label>
              </div>
              <button className="mvp-button mvp-button--secondary">
                Enregistrer les numéros
              </button>
            </form>
            <div className="mvp-divider" />
            <form className="mvp-form" onSubmit={createZone}>
              <div className="mvp-form__grid">
                <label className="mvp-field">
                  Mode
                  <select name="methodKind">
                    <option value="merchant_delivery">Livraison vendeur</option>
                    <option value="pickup">Retrait</option>
                  </select>
                </label>
                <label className="mvp-field">
                  Nom du mode
                  <input name="methodName" placeholder="Livraison standard" required />
                </label>
                <label className="mvp-field">
                  Région
                  <input name="region" required />
                </label>
                <label className="mvp-field">
                  Ville
                  <input name="city" />
                </label>
                <label className="mvp-field">
                  Libellé public
                  <input name="label" placeholder="Dakar centre" required />
                </label>
                <label className="mvp-field">
                  Tarif XOF
                  <input name="feeXof" type="number" min="0" required />
                </label>
                <label className="mvp-field">
                  Délai minimum, minutes
                  <input
                    name="minDelayMinutes"
                    type="number"
                    min="0"
                    required
                  />
                </label>
                <label className="mvp-field">
                  Délai maximum, minutes
                  <input
                    name="maxDelayMinutes"
                    type="number"
                    min="0"
                    required
                  />
                </label>
              </div>
              <button className="mvp-button">Ajouter la zone</button>
            </form>
            <div className="mvp-list">
              {props.zones.map((zone) => (
                <div className="mvp-row" key={zone.id}>
                  <div>
                    <strong>{zone.label}</strong>
                    <small>
                      {zone.region} {zone.city} · {zone.min_delay_minutes} à{" "}
                      {zone.max_delay_minutes} min
                    </small>
                  </div>
                  <strong>{formatPrice(zone.fee_xof)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "abonnement" && (
          <div className="mvp-card mvp-card--full">
            <h2>Abonnement marchand</h2>
            {props.subscription && (
              <p className="mvp-alert">
                Plan {planMap.get(props.subscription.plan_id)?.name} ·{" "}
                {props.subscription.status}
                {props.subscription.current_period_ends_at &&
                  ` jusqu’au ${new Date(
                    props.subscription.current_period_ends_at,
                  ).toLocaleDateString("fr-SN")}`}
              </p>
            )}
            <p>
              Envoyez le montant du plan au numéro SunuShop correspondant,
              puis transmettez la référence du paiement pour validation.
            </p>
            <div className="mvp-list">
              {props.subscriptionPaymentNumbers.wave && (
                <div className="mvp-row">
                  <strong>Wave</strong>
                  <span>{props.subscriptionPaymentNumbers.wave}</span>
                </div>
              )}
              {props.subscriptionPaymentNumbers.orangeMoney && (
                <div className="mvp-row">
                  <strong>Orange Money</strong>
                  <span>{props.subscriptionPaymentNumbers.orangeMoney}</span>
                </div>
              )}
            </div>
            {!hasSubscriptionPaymentChannel && (
              <p className="mvp-alert mvp-alert--warning">
                Les numéros de paiement SunuShop ne sont pas encore configurés.
                La soumission d’un abonnement est temporairement indisponible.
              </p>
            )}
            <form className="mvp-form" onSubmit={submitPayment}>
              <div className="mvp-form__grid">
                <label className="mvp-field">
                  Plan
                  <select name="planId">
                    {props.plans.map((plan) => (
                      <option value={plan.id} key={plan.id}>
                        {plan.name} · {formatPrice(plan.monthly_price_xof)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mvp-field">
                  Canal
                  <select name="channel" disabled={!hasSubscriptionPaymentChannel}>
                    {props.subscriptionPaymentNumbers.wave && (
                      <option value="wave">Wave</option>
                    )}
                    {props.subscriptionPaymentNumbers.orangeMoney && (
                      <option value="orange_money">Orange Money</option>
                    )}
                  </select>
                </label>
                <label className="mvp-field">
                  Référence du paiement
                  <input name="externalReference" required />
                </label>
                <label className="mvp-field">
                  Date et heure
                  <input name="paidAt" type="datetime-local" required />
                </label>
              </div>
              <button
                className="mvp-button"
                disabled={!hasSubscriptionPaymentChannel || busy}
              >
                Transmettre le paiement
              </button>
            </form>
            <div className="mvp-list">
              {props.payments.map((payment) => (
                <div className="mvp-row" key={payment.id}>
                  <div>
                    <strong>{payment.external_reference}</strong>
                    <small>
                      {payment.channel} · {formatPrice(payment.amount_xof)}
                    </small>
                  </div>
                  <span
                    className="mvp-status"
                    data-status={payment.status}
                  >
                    {payment.status}
                  </span>
                </div>
              ))}
            </div>
            {props.notifications.length > 0 && (
              <>
                <div className="mvp-divider" />
                <h3>Rappels</h3>
                <div className="mvp-list">
                  {props.notifications.map((notification) => (
                    <div className="mvp-row" key={notification.id}>
                      <strong>
                        {notification.template === "subscription_expires_j7"
                          ? "Votre abonnement expire dans 7 jours"
                          : notification.template ===
                              "subscription_expires_j2"
                            ? "Votre abonnement expire dans 2 jours"
                            : "Notification d’abonnement"}
                      </strong>
                      <small>
                        {new Date(notification.created_at).toLocaleDateString(
                          "fr-SN",
                        )}
                      </small>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "commandes" && (
          <div className="mvp-card mvp-card--full">
            <h2>Commandes</h2>
            <div className="mvp-list">
              {props.orders.map((order) => (
                <div className="mvp-row" key={order.id}>
                  <div>
                    <Link href={`/commandes/${order.id}`}>
                      <strong>{order.public_code}</strong>
                    </Link>
                    <small>{formatPrice(order.total_xof)}</small>
                  </div>
                  <div className="mvp-actions">
                    <span className="mvp-status" data-status={order.status}>
                      {order.status.replaceAll("_", " ")}
                    </span>
                    {order.direct_payment_declarations
                      .filter(
                        (declaration) =>
                          !declaration.confirmed_by_merchant_at,
                      )
                      .map((declaration) => (
                        <button
                          key={declaration.id}
                          className="mvp-button mvp-button--secondary"
                          onClick={async () => {
                            await fetch(
                              `/api/orders/${order.id}/payment-declarations`,
                              {
                                method: "PATCH",
                                headers: {
                                  "content-type": "application/json",
                                },
                                body: JSON.stringify({
                                  declarationId: declaration.id,
                                }),
                              },
                            );
                            router.refresh();
                          }}
                        >
                          Confirmer paiement {declaration.external_reference}
                        </button>
                      ))}
                    {nextMerchantOrderStatus[order.status] && (
                      <button
                        className="mvp-button"
                        onClick={() =>
                          submitJson(
                            `/api/orders/${order.id}/status`,
                            {
                              status: nextMerchantOrderStatus[order.status],
                              publicMessage: "Le vendeur a confirmé le stock.",
                            },
                            "Commande confirmée.",
                          )
                        }
                      >
                        {
                          nextMerchantOrderLabel[
                            nextMerchantOrderStatus[order.status]!
                          ]
                        }
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!props.orders.length && (
                <p className="mvp-empty">Aucune commande pour le moment.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
