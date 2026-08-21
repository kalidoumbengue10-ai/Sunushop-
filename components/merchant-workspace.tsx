"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  Bike,
  Boxes,
  ClipboardCheck,
  ExternalLink,
  LayoutDashboard,
  MessageSquare,
  PackageSearch,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import { formatPrice } from "@/lib/marketplace";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";
import { CourierManager } from "@/components/courier-manager";
import { MerchantMedia } from "@/components/merchant-media";
import { MerchantDashboard } from "@/components/merchant-dashboard";
import { ConversationList } from "@/components/conversation-list";
import { MerchantProductWizard, type MerchantProductEditor } from "@/components/merchant-product-wizard";
import { MerchantDeliverySettings, type MerchantDeliveryZone } from "@/components/merchant-delivery-settings";
import { LocationPicker } from "@/components/location-map";
import type { Coordinates, GeoPlace } from "@/lib/domain/geo";
import { IntentLetterForm } from "@/components/intent-letter-form";
import { DirectDocumentUploader, documentLabels, type VerificationDocumentRow } from "@/components/direct-document-uploader";
import {
  defaultMerchantTab,
  formatMerchantOrderNumber,
  merchantCanAccessTab,
  merchantStatusLabel,
  merchantTabsForRole,
  type MerchantWorkspaceRole,
  type MerchantWorkspaceTab,
} from "@/lib/domain/merchant-ui";
import {
  BILLING_CYCLES,
  billingCycleMonths,
  isBillingCycle,
  subscriptionAmountXof as calculateSubscriptionAmountXof,
  type BillingCycle,
} from "@/lib/domain/subscription";

const billingCycleOptions = (Object.keys(BILLING_CYCLES) as BillingCycle[]).map((cycle) => ({
  cycle,
  ...BILLING_CYCLES[cycle],
}));
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
  pickup_enabled?: boolean;
  pickup_address_line?: string | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  pickup_hours?: string | null;
  pickup_instructions?: string | null;
};

type VerificationCase = {
  id: string;
  status: string;
  merchant_note: string | null;
};

type DocumentRow = VerificationDocumentRow;

type MerchantOrder = {
  id: string;
  public_code: string;
  merchant_sequence: number;
  status: string;
  payment_method: string;
  payment_status: string;
  total_xof: number;
  delivery_snapshot: { methodKind?: string | null };
  deliveries: Array<{ id: string }>;
  created_at: string;
  direct_payment_declarations: Array<{
    id: string;
    external_reference: string;
    status: string;
    rejection_reason: string | null;
    confirmed_by_merchant_at: string | null;
  }>;
};

type MerchantWorkspaceProps = {
  memberRole: MerchantWorkspaceRole;
  merchant: Merchant | null;
  verificationCase: VerificationCase | null;
  documents: DocumentRow[];
  categories: Array<{ id: string; name: string; slug: string }>;
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
    billing_cycle: string;
    current_period_ends_at: string | null;
    grace_ends_at: string | null;
  } | null;
  payments: Array<{
    id: string;
    plan_id: string;
    billing_cycle: string;
    period_months: number;
      channel: string;
      destination_number: string | null;
    external_reference: string;
    amount_xof: number;
    status: string;
    created_at: string;
  }>;
  orders: MerchantOrder[];
  ordersTotal: number;
  notifications: Array<{
    id: string;
    template: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
  subscriptionPaymentNumbers: {
    wave: string | null;
    orangeMoney: string | null;
    waveLink: string | null;
  };
};
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

function nextMerchantOrderStatus(order: MerchantOrder) {
  if (order.delivery_snapshot?.methodKind === "pickup") {
    if (order.status === "ready_for_handoff") return "in_transit";
    if (order.status === "in_transit") return "delivered";
  }
  return undefined;
}

const nextMerchantOrderLabel: Record<string, string> = {
  in_transit: "Remise au livreur",
  delivered: "Livrée",
};
const orderPaymentStatusLabels: Record<string, string> = {
  awaiting_payment: "À payer", cash_due: "Espèces dues au retrait",
  pending_confirmation: "Validation en attente", paid: "Payé",
  payment_refused: "Paiement refusé", refund_pending: "Remboursement en attente",
  refunded: "Remboursé",
};

type MerchantTab = MerchantWorkspaceTab;

const merchantNavigation = [
  { id: "dashboard", label: "Vue d’ensemble", hint: "Activité et chiffres", icon: LayoutDashboard },
  { id: "commandes", label: "Commandes", hint: "Suivi des ventes", icon: ShoppingBag },
  { id: "catalogue", label: "Produits", hint: "Photos, prix et stocks", icon: Boxes },
  { id: "livraison", label: "Livraison", hint: "Zones et tarifs", icon: Truck },
  { id: "livreurs", label: "Livreurs", hint: "Équipe et affectations", icon: Bike },
  { id: "messages", label: "Messages", hint: "Discussions avec vos clients", icon: MessageSquare },
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
  messages: { eyebrow: "Relation client", title: "Messages", description: "Répondez aux questions de vos clients sur vos produits et commandes." },
  boutique: { eyebrow: "Vitrine", title: "Ma boutique", description: "Soignez la présentation visible par vos clients." },
  abonnement: { eyebrow: "Accès", title: "Abonnement", description: "Consultez votre plan et transmettez un paiement." },
  dossier: { eyebrow: "Conformité", title: "Dossier marchand", description: "Suivez la validation de vos documents SunuShop." },
};

export function MerchantWorkspace(props: MerchantWorkspaceProps) {
  const router = useRouter();
  const realtimeMerchantId = props.merchant?.id;
  const subscriptionReady = Boolean(
    props.merchant && ["active", "grace"].includes(props.merchant.subscription_status),
  );
  const [tab, setTab] = useState<MerchantTab>(
    defaultMerchantTab(props.memberRole, subscriptionReady),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showIntentLetterForm, setShowIntentLetterForm] = useState(false);
  const [optimisticDocuments, setOptimisticDocuments] = useState<
    Partial<Record<VerificationDocumentType, string>>
  >({});
  const [subscriptionPlanId, setSubscriptionPlanId] = useState(
    props.subscription?.plan_id ?? props.plans[0]?.id ?? "",
  );
  const [subscriptionCycle, setSubscriptionCycle] = useState<BillingCycle>(
    props.subscription && isBillingCycle(props.subscription.billing_cycle)
      ? props.subscription.billing_cycle
      : "monthly",
  );
  const [shopCoordinates, setShopCoordinates] = useState<Coordinates | null>(
    props.merchant?.pickup_latitude != null && props.merchant?.pickup_longitude != null
      ? { latitude: props.merchant.pickup_latitude, longitude: props.merchant.pickup_longitude }
      : null,
  );
  const [shopAddress, setShopAddress] = useState(props.merchant?.pickup_address_line ?? "");
  const [pickupEnabled, setPickupEnabled] = useState(props.merchant?.pickup_enabled ?? false);
  const [pickupHours, setPickupHours] = useState(props.merchant?.pickup_hours ?? "");
  const [pickupInstructions, setPickupInstructions] = useState(props.merchant?.pickup_instructions ?? "");
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState("all");
  const [orderPage, setOrderPage] = useState(1);
  const [merchantOrders, setMerchantOrders] = useState(props.orders);
  const [merchantOrdersTotal, setMerchantOrdersTotal] = useState(props.ordersTotal);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [ordersRevision, setOrdersRevision] = useState(0);
  const [refundOrder, setRefundOrder] = useState<MerchantOrder | null>(null);
  const [rejectedDeclaration, setRejectedDeclaration] = useState<{ orderId: string; declarationId: string; reference: string } | null>(null);

  useEffect(() => {
    if (!realtimeMerchantId) return;
    const refresh = () => router.refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30_000);
    let channel: ReturnType<ReturnType<typeof getBrowserSupabase>["channel"]> | undefined;
    try {
      const supabase = getBrowserSupabase();
      channel = supabase.channel(`merchant-orders-${realtimeMerchantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `merchant_id=eq.${realtimeMerchantId}` }, refresh)
        .subscribe();
    } catch { /* Le rafraîchissement périodique reste actif. */ }
    return () => {
      window.clearInterval(interval);
      if (channel) void channel.unsubscribe();
    };
  }, [realtimeMerchantId, router]);

  useEffect(() => {
    if (!realtimeMerchantId || tab !== "commandes") return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setOrdersLoading(true);
      setOrdersError("");
      const search = new URLSearchParams({
        merchantId: realtimeMerchantId,
        page: String(orderPage),
        limit: "15",
        status: orderStatus,
      });
      if (orderQuery.trim()) search.set("query", orderQuery.trim());
      try {
        const response = await fetch(`/api/merchant/orders?${search}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) {
          setOrdersError(payload.error?.message ?? "Les commandes n’ont pas pu être chargées.");
          return;
        }
        const result = payload.data as { items: MerchantOrder[]; total: number; totalPages: number };
        if (orderPage > result.totalPages) {
          setOrderPage(result.totalPages);
          return;
        }
        setMerchantOrders(result.items);
        setMerchantOrdersTotal(result.total);
      } catch (fetchError) {
        if ((fetchError as Error).name !== "AbortError") {
          setOrdersError("Les commandes n’ont pas pu être chargées.");
        }
      } finally {
        if (!controller.signal.aborted) setOrdersLoading(false);
      }
    }, orderQuery.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [orderPage, orderQuery, orderStatus, ordersRevision, props.orders, props.ordersTotal, realtimeMerchantId, tab]);

  const submitJson = async (
    url: string,
    body: object,
    successMessage: string,
    method: "POST" | "PATCH" = "POST",
  ) => {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch(url, {
      method,
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
    if (url.startsWith("/api/orders/")) setOrdersRevision((revision) => revision + 1);
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
        billingCycle: form.get("billingCycle"),
        channel,
        externalReference: form.get("externalReference"),
        paidAt: new Date(String(form.get("paidAt"))).toISOString(),
      },
      "Paiement transmis pour validation.",
    );
  };

  const declareRefund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!refundOrder) return;
    const form = new FormData(event.currentTarget);
    const success = await submitJson(`/api/orders/${refundOrder.id}/refunds`, {
      amountXof: Number(form.get("amountXof")),
      channel: form.get("channel"),
      destinationNumber: form.get("destinationNumber"),
      externalReference: form.get("externalReference"),
    }, "Remboursement transmis au client pour confirmation.");
    if (success) setRefundOrder(null);
  };

  const rejectPaymentDeclaration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rejectedDeclaration) return;
    const form = new FormData(event.currentTarget);
    const success = await submitJson(
      `/api/orders/${rejectedDeclaration.orderId}/payment-declarations`,
      { declarationId: rejectedDeclaration.declarationId, decision: "rejected", rejectionReason: form.get("rejectionReason") },
      "Paiement refusé avec son motif.",
      "PATCH",
    );
    if (success) setRejectedDeclaration(null);
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

  const savePickupSettings = async (successMessage: string) => {
    if (!props.merchant) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/merchant/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        merchantId: props.merchant.id,
        pickupEnabled,
        pickupAddressLine: shopAddress || null,
        pickupLatitude: shopCoordinates?.latitude ?? null,
        pickupLongitude: shopCoordinates?.longitude ?? null,
        pickupHours: pickupHours || null,
        pickupInstructions: pickupInstructions || null,
      }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Paramètres non enregistrés.");
      return;
    }
    setMessage(successMessage);
    router.refresh();
  };

  const saveLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await savePickupSettings("Localisation publique mise à jour.");
  };

  const savePickup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await savePickupSettings("Retrait en boutique mis à jour.");
  };

  if (!props.merchant) return null;
  const merchantId = props.merchant.id;
  const hasLocation = props.merchant.pickup_latitude != null && props.merchant.pickup_longitude != null;
  const hasDeliveryOption = props.zones.some((zone) => zone.active);
  const canManageMerchantSettings = ["owner", "manager"].includes(props.memberRole);
  const ordersPerPage = 15;
  const orderPageCount = Math.max(1, Math.ceil(merchantOrdersTotal / ordersPerPage));

  const latestDocuments = new Map<VerificationDocumentType, DocumentRow>();
  props.documents.forEach((document) => {
    if (!latestDocuments.has(document.document_type)) {
      latestDocuments.set(document.document_type, document);
    }
  });
  (Object.entries(optimisticDocuments) as [VerificationDocumentType, string][]).forEach(
    ([type, documentId]) => {
      if (!latestDocuments.has(type)) {
        latestDocuments.set(type, {
          id: documentId,
          document_type: type,
          version: 1,
          status: "uploaded",
          uploaded_at: new Date().toISOString(),
        });
      }
    },
  );
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
  const selectedSubscriptionPlan = props.plans.find((plan) => plan.id === subscriptionPlanId) ?? props.plans[0];
  const subscriptionMonths = billingCycleMonths(subscriptionCycle);
  const subscriptionAmountXof = calculateSubscriptionAmountXof(
    selectedSubscriptionPlan?.monthly_price_xof ?? 0,
    subscriptionCycle,
  );
  const waveCheckoutUrl = props.subscriptionPaymentNumbers.waveLink && subscriptionAmountXof > 0
    ? `${props.subscriptionPaymentNumbers.waveLink}?amount=${subscriptionAmountXof}`
    : null;
  const visibleTabs = merchantTabsForRole(props.memberRole);
  const visibleNavigation = merchantNavigation.filter(({ id }) => visibleTabs.includes(id));
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
            <span
              className="mvp-status"
              data-status={props.merchant.subscription_status}
            >
              Abonnement {merchantStatusLabel(props.merchant.subscription_status)}
            </span>
          </div>
        </header>

        {merchantCanAccessTab(props.memberRole, "dossier") && missingRequired.length > 0 && props.merchant.status !== "suspended" && (
          <div className="merchant-context-note"><PackageSearch /><p>Votre dossier documentaire est incomplet. Vous pouvez continuer à préparer votre boutique en attendant : <button type="button" className="merchant-context-note__link" onClick={() => setTab("dossier")}>terminez-le ici</button>.</p></div>
        )}

        {merchantCanAccessTab(props.memberRole, "livraison") && (props.merchant.pickup_latitude == null || props.merchant.pickup_longitude == null) && props.merchant.status !== "suspended" && (
          <div className="merchant-context-note"><PackageSearch /><p>Votre boutique n’a pas encore de position enregistrée. Tant qu’elle est absente, vos clients ne peuvent plus passer de commande en livraison : <button type="button" className="merchant-context-note__link" onClick={() => setTab("livraison")}>placez-la sur la carte</button>.</p></div>
        )}
        {message && <p className="mvp-alert merchant-global-feedback">{message}</p>}
        {error && <p className="mvp-alert mvp-alert--error merchant-global-feedback">{error}</p>}

        {!subscriptionReady && merchantCanAccessTab(props.memberRole, "abonnement") && (
          <div className="merchant-subscription-paywall" role="status">
            <div><span className="mvp-eyebrow">Abonnement requis</span><h2>Votre boutique est prête. Activez votre abonnement pour publier vos produits et recevoir des commandes.</h2><p>Préparez vos produits en brouillon dès maintenant. La publication, la visibilité sur le marché et les commandes nécessitent un abonnement actif.</p></div>
            <button className="mvp-button" onClick={() => setTab("abonnement")}>Activer mon abonnement</button>
          </div>
        )}

        {tab === "boutique" && <MerchantMedia merchantId={props.merchant.id} />}

        {tab === "dashboard" && <section className="merchant-content-surface merchant-content-surface--dashboard"><MerchantDashboard merchantId={props.merchant.id} /></section>}

        {tab === "livreurs" && (
          <CourierManager merchantId={props.merchant.id} canManagePayments={["owner", "manager"].includes(props.memberRole)} onOpenOrders={() => setTab("commandes")} />
        )}

        {tab === "messages" && (
          <section className="merchant-content-surface">
            <ConversationList view="asMerchant" />
          </section>
        )}

        {tab === "dossier" && props.verificationCase && (
          <div className="mvp-card mvp-card--full">
            <h2>Dossier de vérification</h2>
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
            {!showIntentLetterForm && (canEditDocuments || latestDocuments.has("intent_letter")) && (
              <div className="mvp-actions">
                <button type="button" className="mvp-button" onClick={() => setShowIntentLetterForm(true)}>
                  {latestDocuments.has("intent_letter") ? "Voir ou télécharger ma lettre" : "Remplir la lettre d’intention en ligne"}
                </button>
                {!latestDocuments.has("intent_letter") && (
                  <Link
                    className="mvp-button mvp-button--secondary"
                    href="/documents/lettre-intention-sunushop.html"
                    download="Lettre-intention-SunuShop.html"
                  >
                    Télécharger le modèle PDF vierge
                  </Link>
                )}
              </div>
            )}
            {showIntentLetterForm && (canEditDocuments || latestDocuments.has("intent_letter")) && (
              <IntentLetterForm
                caseId={props.verificationCase.id}
                existingDocumentId={latestDocuments.get("intent_letter")?.id}
                allowEditing={canEditDocuments}
                merchant={{
                  publicName: props.merchant.public_name,
                  kind: props.merchant.kind,
                  representativeIsLegalOwner: props.merchant.representative_is_legal_owner,
                }}
                onSaved={(documentId) =>
                  setOptimisticDocuments((current) => ({ ...current, intent_letter: documentId }))
                }
                onClose={() => setShowIntentLetterForm(false)}
              />
            )}
            {canEditDocuments ? (
              <div className="mvp-document-grid">
                {documentTypes.map((type) => (
                  <DirectDocumentUploader
                    caseId={props.verificationCase!.id}
                    type={type}
                    latest={latestDocuments.get(type)}
                    required={checklist.required.includes(type)}
                    onSaved={(documentId) =>
                      setOptimisticDocuments((current) => ({ ...current, [type]: documentId }))
                    }
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

        {tab === "catalogue" && <div className="mvp-card mvp-card--full"><MerchantProductWizard merchantId={props.merchant.id} categories={props.categories} products={props.products} deliveryReady={props.zones.some((zone) => zone.active)} subscriptionReady={subscriptionReady} onOpenSubscription={merchantCanAccessTab(props.memberRole, "abonnement") ? () => setTab("abonnement") : undefined} onOpenDelivery={merchantCanAccessTab(props.memberRole, "livraison") ? () => setTab("livraison") : undefined} /></div>}

        {tab === "livraison" && (
          <div className="mvp-card mvp-card--full">
            <div className="merchant-delivery-readiness" role="status">
              <p className="merchant-delivery-readiness__intro">Pour publier vos produits, deux étapes sont nécessaires — remplir l’une ne suffit pas sans l’autre :</p>
              <ol className="merchant-delivery-readiness__steps">
                <li className={hasLocation ? "is-done" : ""}>
                  <span>{hasLocation ? "✓" : "1"}</span>
                  {hasLocation
                    ? "Localisation de la boutique enregistrée"
                    : <>Placez votre boutique sur la carte ci-dessous et cliquez sur « Enregistrer la localisation »</>}
                </li>
                <li className={hasDeliveryOption ? "is-done" : ""}>
                  <span>{hasDeliveryOption ? "✓" : "2"}</span>
                  {hasDeliveryOption
                    ? "Retrait en boutique ou région de livraison activé"
                    : <>Plus bas, cliquez sur « Activer le retrait » ou ajoutez une région de livraison</>}
                </li>
              </ol>
            </div>
            {canManageMerchantSettings && <>
            <div className="mvp-divider" />
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
            <form className="mvp-form" onSubmit={saveLocation}>
              <h3>Adresse et localisation publique</h3>
              <p>Cette adresse et ce point seront visibles par tous les visiteurs et serviront de départ aux livraisons.</p>
              <label className="mvp-field">
                Adresse complète
                <input value={shopAddress} onChange={(event) => setShopAddress(event.target.value)} placeholder="Ex. Marché Sandaga, Avenue Blaise Diagne, Dakar" required />
              </label>
              <LocationPicker
                value={shopCoordinates}
                onChange={setShopCoordinates}
                onPlace={(place: GeoPlace) => setShopAddress(place.label)}
                label="Position publique de la boutique"
                required
              />
              <button className="mvp-button mvp-button--secondary" disabled={busy}>
                Enregistrer la localisation
              </button>
            </form>
            <div className="mvp-divider" />
            <form className="mvp-form" onSubmit={savePickup}>
              <h3>Retrait en boutique — horaires et consignes</h3>
              <p>
                Le client peut venir chercher sa commande directement à votre
                adresse, sans frais de livraison. Ces horaires sont
                facultatifs : pour activer réellement le retrait (obligatoire
                pour publier si vous ne livrez pas), utilisez le bouton «
                Activer le retrait » plus bas, dans la section Livraison.
              </p>
              <label className="mvp-field mvp-field--checkbox">
                <input
                  type="checkbox"
                  checked={pickupEnabled}
                  onChange={(event) => setPickupEnabled(event.target.checked)}
                />
                Activer le retrait en boutique (0 F)
              </label>
              <div className="mvp-form__grid">
                <label className="mvp-field">
                  Horaires
                  <input
                    value={pickupHours}
                    onChange={(event) => setPickupHours(event.target.value)}
                    placeholder="Lun–Sam, 9h–19h"
                  />
                </label>
                <label className="mvp-field mvp-field--wide">
                  Consignes pour le client
                  <textarea
                    rows={2}
                    value={pickupInstructions}
                    onChange={(event) => setPickupInstructions(event.target.value)}
                    placeholder="Ex. Demander la boutique SunuShop au 2e étage."
                  />
                </label>
              </div>
              <button className="mvp-button mvp-button--secondary" disabled={busy}>
                Enregistrer le retrait en boutique
              </button>
            </form>
            <div className="mvp-divider" />
            </>}
            <MerchantDeliverySettings merchantId={props.merchant.id} categories={props.categories} zones={props.zones} pickupSettingEnabled={props.merchant.pickup_enabled ?? false} />
          </div>
        )}

        {tab === "abonnement" && (
          <div className="mvp-card mvp-card--full">
            <h2>Abonnement marchand</h2>
            {props.subscription && (
              <p className="mvp-alert">
                Plan {planMap.get(props.subscription.plan_id)?.name} ·{" "}
                {props.subscription.billing_cycle} · {props.subscription.status}
                {props.subscription.current_period_ends_at &&
                  ` jusqu’au ${new Date(
                    props.subscription.current_period_ends_at,
                  ).toLocaleDateString("fr-SN")}`}
              </p>
            )}
            <p>
              Envoyez directement le montant au numéro SunuShop correspondant,
              puis transmettez la référence. Votre abonnement est prolongé
              uniquement après contrôle et confirmation dans le CRM.
            </p>
            <p className="mvp-alert">Orange Money permet de programmer un transfert récurrent depuis votre wallet. Cette programmation reste externe à SunuShop : chaque référence doit toujours être transmise et validée.</p>
            <div className="mvp-list">
              {props.subscriptionPaymentNumbers.wave && (
                <div className="mvp-row">
                  <strong>Wave</strong>
                  <span>{props.subscriptionPaymentNumbers.wave}</span>
                  {waveCheckoutUrl && (
                    <a className="mvp-button" href={waveCheckoutUrl} target="_blank" rel="noopener noreferrer">
                      Payer {formatPrice(subscriptionAmountXof)} avec Wave
                    </a>
                  )}
                </div>
              )}
              {props.subscriptionPaymentNumbers.orangeMoney && (
                <div className="mvp-row">
                  <strong>Orange Money</strong>
                  <span>{props.subscriptionPaymentNumbers.orangeMoney}</span>
                </div>
              )}
            </div>
            {waveCheckoutUrl && (
              <p className="mvp-alert">
                Après le paiement Wave, revenez ici pour transmettre la référence de la transaction ci-dessous : votre abonnement est activé uniquement après confirmation.
              </p>
            )}
            {!hasSubscriptionPaymentChannel && (
              <p className="mvp-alert mvp-alert--warning">
                Les numéros de paiement SunuShop ne sont pas encore configurés.
                La soumission d’un abonnement est temporairement indisponible.
              </p>
            )}
            <form className="mvp-form" onSubmit={submitPayment}>
              <label className="mvp-field">
                Plan
                <select name="planId" value={subscriptionPlanId} onChange={(event) => setSubscriptionPlanId(event.target.value)}>
                  {props.plans.map((plan) => (
                    <option value={plan.id} key={plan.id}>
                      {plan.name} · {formatPrice(plan.monthly_price_xof)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mvp-field">
                Durée et montant
                <input type="hidden" name="billingCycle" value={subscriptionCycle} />
                <div className="mvp-cycle-picker">
                  {billingCycleOptions.map((option) => (
                    <button
                      type="button"
                      key={option.cycle}
                      className={`mvp-cycle-card${subscriptionCycle === option.cycle ? " is-active" : ""}`}
                      onClick={() => setSubscriptionCycle(option.cycle)}
                      aria-pressed={subscriptionCycle === option.cycle}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.months} mois</span>
                      <span className="mvp-cycle-card__price">
                        {formatPrice(calculateSubscriptionAmountXof(selectedSubscriptionPlan?.monthly_price_xof ?? 0, option.cycle))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mvp-form__grid">
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
              <p className="mvp-alert"><strong>Montant exact à envoyer : {formatPrice(subscriptionAmountXof)}</strong><br />{selectedSubscriptionPlan?.name} · {subscriptionMonths} mois, sans remise.</p>
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
                      {payment.channel} vers {payment.destination_number ?? "numéro historique"} · {payment.billing_cycle} · {formatPrice(payment.amount_xof)}
                    </small>
                  </div>
                  <div className="mvp-actions">
                    <span
                      className="mvp-status"
                      data-status={payment.status}
                    >
                      {payment.status}
                    </span>
                    {payment.status === "approved" && (
                      <a
                        className="mvp-button mvp-button--secondary"
                        href={`/api/merchant/subscriptions/payments/${payment.id}/receipt?merchantId=${merchantId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Reçu
                      </a>
                    )}
                  </div>
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
            <div className="mvp-form__grid">
              <label className="mvp-field">Rechercher une commande
                <input type="search" value={orderQuery} onChange={(event) => { setOrderQuery(event.target.value); setOrderPage(1); }} placeholder="Code ou numéro CMD-…" />
              </label>
              <label className="mvp-field">Filtrer par état
                <select value={orderStatus} onChange={(event) => { setOrderStatus(event.target.value); setOrderPage(1); }}>
                  <option value="all">Tous les états</option>
                  <option value="pending_seller_confirmation">À confirmer</option>
                  <option value="preparing">En préparation</option>
                  <option value="ready_for_handoff">Prête à remettre</option>
                  <option value="in_transit">En livraison</option>
                  <option value="delivered">Livrée</option>
                  <option value="cancelled">Annulée</option>
                  <option value="refund_pending">Remboursement en attente</option>
                </select>
              </label>
            </div>
            <p><small>{merchantOrdersTotal} commande(s) correspondant aux filtres.</small></p>
            {ordersLoading && <p className="mvp-alert" role="status">Chargement des commandes…</p>}
            {ordersError && <p className="mvp-alert mvp-alert--error" role="alert">{ordersError}</p>}
            {rejectedDeclaration && <form className="mvp-form" onSubmit={rejectPaymentDeclaration}>
              <h3>Refuser le paiement {rejectedDeclaration.reference}</h3>
              <label className="mvp-field">Motif communiqué au client<textarea name="rejectionReason" minLength={4} maxLength={500} required /></label>
              <div className="mvp-actions"><button className="mvp-button mvp-button--danger" disabled={busy}>Confirmer le refus</button><button type="button" className="mvp-button mvp-button--secondary" onClick={() => setRejectedDeclaration(null)} disabled={busy}>Annuler</button></div>
            </form>}
            {refundOrder && <form className="mvp-form" onSubmit={declareRefund}>
              <h3>Déclarer le remboursement de {formatMerchantOrderNumber(refundOrder.merchant_sequence)}</h3>
              <div className="mvp-form__grid">
                <label className="mvp-field">Montant remboursé (FCFA)<input name="amountXof" type="number" min="1" max={refundOrder.total_xof} defaultValue={refundOrder.total_xof} required /></label>
                <label className="mvp-field">Canal<select name="channel"><option value="wave">Wave</option><option value="orange_money">Orange Money</option></select></label>
                <label className="mvp-field">Numéro du client<input name="destinationNumber" type="tel" placeholder="+221770000000" required /></label>
                <label className="mvp-field">Référence du transfert<input name="externalReference" required /></label>
              </div>
              <div className="mvp-actions"><button className="mvp-button" disabled={busy}>Transmettre au client</button><button type="button" className="mvp-button mvp-button--secondary" onClick={() => setRefundOrder(null)} disabled={busy}>Annuler</button></div>
            </form>}
            <div className="mvp-list">
              {merchantOrders.map((order) => (
                <div className="mvp-row" key={order.id}>
                  <div>
                    <Link href={`/marchand/commandes/${order.id}`}>
                      <strong>{formatMerchantOrderNumber(order.merchant_sequence)}</strong>
                    </Link>
                    <small>{order.public_code} · {formatPrice(order.total_xof)}</small>
                  </div>
                  <div className="mvp-actions">
                    <span className="mvp-status" data-status={order.status}>
                      {merchantStatusLabel(order.status)}
                    </span>
                    <span className="mvp-status" data-status={order.payment_status}>{orderPaymentStatusLabels[order.payment_status] ?? order.payment_status}</span>
                    {["paid", "refund_pending", "refunded"].includes(order.payment_status) && (
                      <a className="mvp-button mvp-button--secondary" href={`/api/orders/${order.id}/receipt`} target="_blank" rel="noopener noreferrer">
                        Reçu
                      </a>
                    )}
                    {order.direct_payment_declarations
                      .filter((declaration) => declaration.status === "pending")
                      .map((declaration) => (
                        <div className="mvp-actions" key={declaration.id}>
                          <button className="mvp-button mvp-button--secondary" disabled={busy} onClick={() => void submitJson(`/api/orders/${order.id}/payment-declarations`, { declarationId: declaration.id, decision: "confirmed" }, "Paiement confirmé.", "PATCH")}>Confirmer {declaration.external_reference}</button>
                          <button className="mvp-button mvp-button--danger" disabled={busy} onClick={() => setRejectedDeclaration({ orderId: order.id, declarationId: declaration.id, reference: declaration.external_reference })}>Refuser</button>
                        </div>
                      ))}
                    {order.payment_method === "cash_on_delivery" && order.payment_status === "cash_due" && order.status === "ready_for_handoff" && (
                      <button className="mvp-button mvp-button--secondary" disabled={busy} onClick={() => void submitJson(`/api/orders/${order.id}/cash-payment`, {}, "Espèces reçues confirmées.")}>Confirmer les espèces reçues</button>
                    )}
                    {["paid", "refund_pending"].includes(order.payment_status) && (
                      <button className="mvp-button mvp-button--secondary" disabled={busy} onClick={() => setRefundOrder(order)}>Déclarer un remboursement</button>
                    )}
                    {["pending_seller_confirmation", "confirmed", "preparing"].includes(order.status) && (order.payment_method === "cash_on_delivery" || order.payment_status === "paid") && (
                      <button
                        className="mvp-button"
                        onClick={() =>
                          submitJson(
                            `/api/orders/${order.id}/ready-for-handoff`,
                            {},
                            "Commande marquée prête.",
                          )
                        }
                      >
                        Marquer prête
                      </button>
                    )}
                    {nextMerchantOrderStatus(order) && (order.payment_method === "cash_on_delivery" || order.payment_status === "paid") && (
                      <button
                        className="mvp-button"
                        onClick={() =>
                          submitJson(
                            `/api/orders/${order.id}/status`,
                            {
                              status: nextMerchantOrderStatus(order),
                              publicMessage: "Le vendeur a confirmé le stock.",
                            },
                            "Commande confirmée.",
                          )
                        }
                      >
                        {
                          nextMerchantOrderLabel[
                            nextMerchantOrderStatus(order)!
                          ]
                        }
                      </button>
                    )}
                    {order.delivery_snapshot?.methodKind === "merchant_delivery" && ["ready_for_handoff", "in_transit"].includes(order.status) && order.deliveries.length === 0 && (
                      <button type="button" className="mvp-button" onClick={() => setTab("livreurs")}>Affecter un livreur</button>
                    )}
                  </div>
                </div>
              ))}
              {!ordersLoading && !merchantOrders.length && (
                <p className="mvp-empty">Aucune commande ne correspond à ces critères.</p>
              )}
            </div>
            {orderPageCount > 1 && <nav className="mvp-actions" aria-label="Pagination des commandes">
              <button type="button" className="mvp-button mvp-button--secondary" disabled={orderPage === 1} onClick={() => setOrderPage((page) => Math.max(1, page - 1))}>Précédent</button>
              <span>Page {orderPage} sur {orderPageCount}</span>
              <button type="button" className="mvp-button mvp-button--secondary" disabled={orderPage === orderPageCount} onClick={() => setOrderPage((page) => Math.min(orderPageCount, page + 1))}>Suivant</button>
            </nav>}
          </div>
        )}
      </main>
    </div>
  );
}
