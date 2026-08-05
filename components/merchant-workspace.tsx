"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  Bike,
  Boxes,
  ClipboardCheck,
  ExternalLink,
  LayoutDashboard,
  PackageSearch,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import { formatPrice } from "@/lib/marketplace";
import { CourierManager } from "@/components/courier-manager";
import { MerchantMedia } from "@/components/merchant-media";
import { MerchantDashboard } from "@/components/merchant-dashboard";
import { MerchantProductWizard, type MerchantProductEditor } from "@/components/merchant-product-wizard";
import { MerchantDeliverySettings, type MerchantDeliveryZone } from "@/components/merchant-delivery-settings";
import { formatMerchantOrderNumber, merchantStatusLabel } from "@/lib/domain/merchant-ui";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";
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
  products: MerchantProductEditor[];
  zones: MerchantDeliveryZone[];
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
    merchant_sequence: number;
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
  const [success, setSuccess] = useState("");
  const [progress, setProgress] = useState(0);

  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError("Le document doit peser moins de 10 Mo.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (["image/heic", "image/heif"].includes(file.type.toLowerCase())) {
      setError("Le format HEIC n’est pas accepté. Enregistrez la photo au format JPEG, PNG ou PDF puis réessayez.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    setProgress(0);
    const form = new FormData();
    form.set("documentType", type);
    form.set("file", file);
    try {
      const result = await new Promise<{ ok: boolean; payload: { error?: { message?: string } } }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/merchant/verifications/${caseId}/documents`);
        xhr.timeout = 120_000;
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
          }
        };
        xhr.onload = () => {
          let payload: { error?: { message?: string } } = {};
          try {
            payload = JSON.parse(xhr.responseText) as { error?: { message?: string } };
          } catch {
            // Une réponse non JSON sera présentée avec un message compréhensible.
          }
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, payload });
        };
        xhr.onerror = () => reject(new Error("NETWORK_ERROR"));
        xhr.ontimeout = () => reject(new Error("UPLOAD_TIMEOUT"));
        xhr.send(form);
      });
      if (!result.ok) {
        setError(result.payload.error?.message ?? "Le document n’a pas pu être enregistré. Réessayez avec une connexion stable.");
        return;
      }
      setProgress(100);
      setSuccess(`${documentLabels[type]} enregistré avec succès.`);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "UPLOAD_TIMEOUT"
        ? "L’envoi a dépassé deux minutes. Vérifiez votre connexion puis réessayez."
        : "La connexion a été interrompue. Réessayez : le fichier reste disponible sur votre téléphone.");
    } finally {
      setBusy(false);
    }
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
      {success && <p className="mvp-alert">{success}</p>}
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      <button
        type="button"
        className="mvp-button mvp-button--secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? `Envoi en cours… ${progress}%` : latest || success ? "Remplacer le fichier" : "Ajouter le fichier"}
      </button>
    </div>
  );
}

function DirectDocumentUploader({
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
  const [success, setSuccess] = useState("");
  const [progress, setProgress] = useState(0);

  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError("Le document doit peser moins de 10 Mo.");
      inputRef.current && (inputRef.current.value = "");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (
      ["image/heic", "image/heif"].includes(file.type.toLowerCase()) ||
      ["heic", "heif"].includes(extension)
    ) {
      setError(
        "Le format HEIC n’est pas accepté. Enregistrez la photo au format JPEG, PNG ou PDF puis réessayez.",
      );
      inputRef.current && (inputRef.current.value = "");
      return;
    }

    const declaredMime = file.type.toLowerCase();
    const mimeType = ["image/jpeg", "image/png", "application/pdf"].includes(
      declaredMime,
    )
      ? declaredMime
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : extension === "png"
          ? "image/png"
          : extension === "pdf"
            ? "application/pdf"
            : null;
    if (!mimeType) {
      setError("Choisissez une photo JPG, PNG ou un document PDF.");
      inputRef.current && (inputRef.current.value = "");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    setProgress(10);
    try {
      const authorizationResponse = await fetch(
        `/api/merchant/verifications/${caseId}/documents/upload-url`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            documentType: type,
            fileName: file.name || "document",
            fileSize: file.size,
            mimeType,
          }),
        },
      );
      const authorization = (await authorizationResponse.json()) as {
        data?: { storagePath: string; token: string };
        error?: { message?: string };
      };
      if (!authorizationResponse.ok || !authorization.data) {
        setError(
          authorization.error?.message ??
            "L’envoi n’a pas pu être autorisé. Reconnectez-vous puis réessayez.",
        );
        return;
      }

      setProgress(25);
      const uploadFile =
        declaredMime === mimeType
          ? file
          : new File([file], file.name || "document", {
              type: mimeType,
              lastModified: file.lastModified,
            });
      const { error: storageError } = await getBrowserSupabase().storage
        .from("merchant-verification")
        .uploadToSignedUrl(
          authorization.data.storagePath,
          authorization.data.token,
          uploadFile,
          { contentType: mimeType, cacheControl: "0", upsert: false },
        );
      if (storageError) {
        throw new Error("STORAGE_UPLOAD_FAILED", { cause: storageError });
      }

      setProgress(85);
      const finalizeResponse = await fetch(
        `/api/merchant/verifications/${caseId}/documents/finalize`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            documentType: type,
            storagePath: authorization.data.storagePath,
          }),
        },
      );
      const finalized = (await finalizeResponse.json()) as {
        error?: { message?: string };
      };
      if (!finalizeResponse.ok) {
        setError(
          finalized.error?.message ??
            "Le fichier a été envoyé mais n’a pas pu être enregistré. Réessayez.",
        );
        return;
      }

      setProgress(100);
      setSuccess(`${documentLabels[type]} enregistré avec succès.`);
      inputRef.current && (inputRef.current.value = "");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "STORAGE_UPLOAD_FAILED"
          ? "La photo n’a pas pu être envoyée au stockage sécurisé. Vérifiez le réseau puis réessayez."
          : "La connexion a été interrompue. Réessayez : le fichier reste disponible sur votre téléphone.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mvp-document">
      <div className="mvp-document__heading">
        <strong>{documentLabels[type]}</strong>
        <span className={required ? "mvp-required-badge" : "mvp-optional-badge"}>
          {required ? "Obligatoire" : "Facultatif"}
        </span>
      </div>
      <small>
        {latest
          ? `Fichier reçu · version ${latest.version} · ${latest.status}`
          : "PDF, JPG ou PNG · 10 Mo maximum"}
      </small>
      <input
        ref={inputRef}
        className="mvp-document__input"
        aria-label={`${latest ? "Remplacer" : "Ajouter"} ${documentLabels[type]}`}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        onChange={(event) => upload(event.target.files?.[0])}
      />
      {success && <p className="mvp-alert">{success}</p>}
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      <button
        type="button"
        className="mvp-button mvp-button--secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy
          ? `Envoi sécurisé en cours… ${progress}%`
          : latest || success
            ? "Remplacer le fichier"
            : "Ajouter le fichier"}
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

type MerchantTab =
  | "dashboard"
  | "commandes"
  | "catalogue"
  | "livraison"
  | "livreurs"
  | "boutique"
  | "abonnement"
  | "dossier";

const merchantNavigation = [
  { id: "dashboard", label: "Vue d’ensemble", hint: "Activité et chiffres", icon: LayoutDashboard },
  { id: "commandes", label: "Commandes", hint: "Suivi des ventes", icon: ShoppingBag },
  { id: "catalogue", label: "Produits", hint: "Photos, prix et stocks", icon: Boxes },
  { id: "livraison", label: "Livraison", hint: "Zones et tarifs", icon: Truck },
  { id: "livreurs", label: "Livreurs", hint: "Équipe et affectations", icon: Bike },
  { id: "boutique", label: "Ma boutique", hint: "Image et présentation", icon: Store },
  { id: "abonnement", label: "Abonnement", hint: "Plan et paiements", icon: BadgeDollarSign },
  { id: "dossier", label: "Dossier", hint: "Documents et validation", icon: ClipboardCheck },
] satisfies Array<{ id: MerchantTab; label: string; hint: string; icon: typeof LayoutDashboard }>;

const merchantSectionTitles: Record<MerchantTab, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: "Pilotage", title: "Vue d’ensemble", description: "Les informations essentielles de votre boutique, sans surcharge." },
  commandes: { eyebrow: "Ventes", title: "Commandes", description: "Préparez et faites avancer chaque commande." },
  catalogue: { eyebrow: "Catalogue", title: "Produits", description: "Ajoutez vos photos, variantes, prix et stocks." },
  livraison: { eyebrow: "Logistique", title: "Livraison", description: "Configurez simplement les régions et leurs tarifs." },
  livreurs: { eyebrow: "Équipe", title: "Livreurs", description: "Organisez les personnes qui prennent en charge vos colis." },
  boutique: { eyebrow: "Vitrine", title: "Ma boutique", description: "Soignez la présentation visible par vos clients." },
  abonnement: { eyebrow: "Accès", title: "Abonnement", description: "Consultez votre plan et transmettez un paiement." },
  dossier: { eyebrow: "Conformité", title: "Dossier marchand", description: "Suivez la validation de vos documents SunuShop." },
};

export function MerchantWorkspace(props: MerchantWorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = useState<MerchantTab>(props.merchant?.verification_status === "approved" ? "dashboard" : "dossier");
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
  const subscriptionReady = ["active", "grace"].includes(props.merchant.subscription_status);
  const visibleNavigation = verificationOnly
    ? merchantNavigation.filter((item) => item.id === "dossier")
    : merchantNavigation;
  const currentSection = merchantSectionTitles[tab];

  return (
    <div className="merchant-app-layout">
      <aside className="merchant-sidebar">
        <div className="merchant-sidebar__brand">
          <span className="merchant-sidebar__logo">S</span>
          <div><strong>SunuShop</strong><small>Espace marchand</small></div>
        </div>
        <nav aria-label="Navigation de l’espace marchand">
          <span className="merchant-sidebar__label">Gérer ma boutique</span>
          {visibleNavigation.map(({ id, label, hint, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={tab === id ? "is-active" : ""}
              onClick={() => setTab(id)}
            >
              <Icon aria-hidden="true" />
              <span><strong>{label}</strong><small>{hint}</small></span>
            </button>
          ))}
        </nav>
        <div className="merchant-sidebar__footer">
          <span className="merchant-sidebar__status-dot" data-active={props.merchant.status === "active"} />
          <div><strong>{props.merchant.status === "active" ? "Boutique en ligne" : "Boutique en préparation"}</strong><small>{subscriptionReady ? "Abonnement actif" : "Publication verrouillée"}</small></div>
        </div>
      </aside>
      <main className="merchant-app-main">
        <header className="merchant-topbar">
          <div className="merchant-topbar__title">
            <span className="mvp-eyebrow">{currentSection.eyebrow}</span>
            <h1>{currentSection.title}</h1>
            <p>{currentSection.description}</p>
          </div>
          <div className="merchant-topbar__shop">
            <div><small>Commerce</small><h2>{props.merchant.public_name}</h2></div>
            {props.merchant.status === "active" && (
              <Link href={`/boutiques/${props.merchant.slug}`} aria-label="Voir la boutique publique">
                <ExternalLink aria-hidden="true" />
              </Link>
            )}
          </div>
          <div className="merchant-topbar__statuses">
            <span
              className="mvp-status"
              data-status={props.merchant.verification_status}
            >
              Dossier {merchantStatusLabel(props.merchant.verification_status)}
            </span>
            {!verificationOnly && <span
              className="mvp-status"
              data-status={props.merchant.subscription_status}
            >
              Abonnement {merchantStatusLabel(props.merchant.subscription_status)}
            </span>}
          </div>
        </header>

        {verificationOnly && <div className="merchant-context-note"><PackageSearch /><p>Cet espace est réservé à votre dossier documentaire. Après sa validation, vous pourrez préparer la boutique ; l’abonnement restera obligatoire pour publier.</p></div>}
        {message && <p className="mvp-alert merchant-global-feedback">{message}</p>}
        {error && <p className="mvp-alert mvp-alert--error merchant-global-feedback">{error}</p>}

        {!verificationOnly && !subscriptionReady && (
          <div className="merchant-subscription-paywall" role="status">
            <div><span className="mvp-eyebrow">Dossier validé · abonnement requis</span><h2>Vos documents sont validés. Votre boutique reste inactive.</h2><p>Préparez vos produits en brouillon dès maintenant. Pour les publier, rendre la boutique visible sur le marché et recevoir des commandes, vous devez d’abord activer un abonnement marchand.</p></div>
            <button className="mvp-button" onClick={() => setTab("abonnement")}>Activer mon abonnement</button>
          </div>
        )}

        {tab === "boutique" && <MerchantMedia merchantId={props.merchant.id} />}

        {tab === "dashboard" && <section className="merchant-content-surface merchant-content-surface--dashboard"><MerchantDashboard merchantId={props.merchant.id} /></section>}

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
                  <DirectDocumentUploader
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

        {tab === "catalogue" && <div className="mvp-card mvp-card--full"><MerchantProductWizard merchantId={props.merchant.id} categories={props.categories} products={props.products} deliveryReady={props.zones.some((zone) => zone.active)} subscriptionReady={subscriptionReady} onOpenSubscription={() => setTab("abonnement")} onOpenDelivery={() => setTab("livraison")} /></div>}

        {tab === "livraison" && (
          <div className="mvp-card mvp-card--full">
            <form className="mvp-form" onSubmit={savePaymentNumbers}>
              <h3>Coordonnées de paiement à la commande</h3>
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
            <MerchantDeliverySettings merchantId={props.merchant.id} categories={props.categories} zones={props.zones} />
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
                      <strong>{formatMerchantOrderNumber(order.merchant_sequence)}</strong>
                    </Link>
                    <small>{order.public_code} · {formatPrice(order.total_xof)}</small>
                  </div>
                  <div className="mvp-actions">
                    <span className="mvp-status" data-status={order.status}>
                      {merchantStatusLabel(order.status)}
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
      </main>
    </div>
  );
}
