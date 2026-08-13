"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  LayoutDashboard,
  MessageSquare,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Store,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/admin/fetch";
import { AdminCrm, type CrmLead } from "@/components/admin-crm";
import { AdminCrmMetrics } from "@/components/admin-crm-metrics";
import { CategoryAdmin } from "@/components/category-admin";
import { ConversationList } from "@/components/conversation-list";
import { MerchantInvitationPanel } from "@/components/merchant-invitation-panel";
import { formatPrice } from "@/lib/marketplace";

type AdminTab = "overview" | "crm" | "verifications" | "subscriptions" | "litiges" | "support" | "categories";

type VerificationQueueItem = {
  id: string;
  status: string;
  submitted_at: string | null;
  merchant_accounts:
    | { public_name: string; kind: string; region: string | null; city: string | null }
    | Array<{ public_name: string; kind: string; region: string | null; city: string | null }>;
};

type VerificationDetail = {
  case: { id: string; status: string; merchant_note: string | null };
  documents: Array<{ id: string; document_type: string; version: number; status: string }>;
  events: Array<{ id: number; event_type: string; public_message: string | null; created_at: string }>;
};

type PaymentItem = {
  id: string;
  plan_id: string;
  channel: string;
  destination_number: string | null;
  external_reference: string;
  amount_xof: number;
  paid_at: string;
  status: string;
  billing_cycle: "monthly" | "quarterly" | "annual";
  period_months: number;
  merchant_accounts: { public_name: string } | Array<{ public_name: string }>;
};

type BillingItem = {
  id: string; merchant_id: string; plan_id: string; billing_cycle: string; period_months: number;
  amount_xof: number; service_period_start: string; service_period_end: string; due_at: string;
  status: string; displayStatus: string; paid_at: string | null;
  merchant_accounts: { public_name: string; slug: string } | Array<{ public_name: string; slug: string }>;
  subscription_payment_submissions: { channel: string; external_reference: string } | Array<{ channel: string; external_reference: string }> | null;
};

type PlatformPaymentSetting = { channel: "wave" | "orange_money"; payment_number: string; account_holder: string | null; active: boolean; payment_link: string | null; updated_at: string };

type MerchantSearchResult = {
  id: string;
  public_name: string;
  slug: string;
  status: string;
  subscription_status: string;
};

type SubscriptionGrantItem = {
  id: string;
  merchant_id: string;
  plan_id: string;
  days: number;
  reason: string;
  current_period_ends_at: string;
  created_at: string;
  merchant_accounts: { public_name: string } | Array<{ public_name: string }>;
};

type DisputeItem = {
  id: string;
  order_id: string;
  merchant_id: string;
  status: string;
  opened_at: string;
  reason: string;
  orders: { public_code: string; buyer_id: string; total_xof: number } | Array<{ public_code: string; buyer_id: string; total_xof: number }>;
  merchant_accounts: { public_name: string } | Array<{ public_name: string }>;
};

type DeliveryDisputeItem = {
  id: string;
  order_id: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  resolution: string | null;
  opened_at: string;
  orders: { public_code: string; merchant_sequence: number } | Array<{ public_code: string; merchant_sequence: number }>;
  merchant_accounts: { public_name: string } | Array<{ public_name: string }>;
  courier_memberships: { display_name: string } | Array<{ display_name: string }>;
};

const verificationLabels: Record<string, string> = {
  draft: "À compléter",
  submitted: "Nouveau dossier",
  resubmitted: "Dossier corrigé",
  in_review: "En cours d’étude",
  needs_changes: "Informations attendues",
  approved: "Validé",
  rejected: "Non validé",
  suspended: "Suspendu",
};

const documentLabels: Record<string, string> = {
  national_id_front: "Pièce d’identité — recto",
  national_id_back: "Pièce d’identité — verso",
  passport_identity: "Passeport",
  intent_letter: "Lettre d’engagement",
  proof_activity: "Justificatif d’activité",
  ninea: "NINEA",
  rccm: "RCCM",
  representative_mandate: "Mandat du représentant",
};

function relationOne<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null) {
  if (!value) return "Date non renseignée";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Africa/Dakar" }).format(new Date(value));
}

export function AdminWorkspace({ initialTab = "overview" }: { initialTab?: AdminTab }) {
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [queue, setQueue] = useState<VerificationQueueItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [billingMonth, setBillingMonth] = useState(new Date().toISOString().slice(0, 7));
  const [billingStatus, setBillingStatus] = useState("");
  const [billingPlan, setBillingPlan] = useState("");
  const [billingCycle, setBillingCycle] = useState("");
  const [billingMerchant, setBillingMerchant] = useState("");
  const [platformSettings, setPlatformSettings] = useState<PlatformPaymentSetting[]>([]);
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [deliveryDisputes, setDeliveryDisputes] = useState<DeliveryDisputeItem[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [grants, setGrants] = useState<SubscriptionGrantItem[]>([]);
  const [merchantResults, setMerchantResults] = useState<MerchantSearchResult[]>([]);
  const [merchantQuery, setMerchantQuery] = useState("");
  const [grantMerchant, setGrantMerchant] = useState<MerchantSearchResult>();
  const [selected, setSelected] = useState<VerificationDetail>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [analyticsRefreshKey, setAnalyticsRefreshKey] = useState(0);
  const markSynced = useCallback((date = new Date()) => setLastSyncedAt(date), []);

  const loadQueue = async () => {
    const payload = await adminFetch<{ items: VerificationQueueItem[] }>("/api/admin/verifications");
    setQueue(payload.items);
  };
  const loadPayments = async () => {
    const params = new URLSearchParams({ month: billingMonth });
    if (billingStatus) params.set("status", billingStatus);
    if (billingPlan) params.set("plan", billingPlan);
    if (billingCycle) params.set("cycle", billingCycle);
    if (billingMerchant) params.set("merchant", billingMerchant);
    const payload = await adminFetch<{ items: PaymentItem[]; billingItems: BillingItem[] }>(`/api/admin/subscription-payments?${params}`);
    setPayments(payload.items);
    setBillingItems(payload.billingItems);
  };
  const loadPlatformSettings = async () => {
    const payload = await adminFetch<{ items: PlatformPaymentSetting[] }>("/api/admin/payment-settings");
    setPlatformSettings(payload.items);
  };
  const loadLeads = async () => {
    const payload = await adminFetch<{ items: CrmLead[] }>("/api/admin/crm/leads");
    setLeads(payload.items);
  };
  const loadDisputes = async () => {
    const payload = await adminFetch<{ items: DisputeItem[] }>("/api/admin/disputes");
    setDisputes(payload.items);
  };
  const loadGrants = async () => {
    const payload = await adminFetch<{ items: SubscriptionGrantItem[] }>("/api/admin/subscriptions/grants");
    setGrants(payload.items);
  };

  const loadDeliveryDisputes = async () => {
    const payload = await adminFetch<{ items: DeliveryDisputeItem[] }>("/api/admin/delivery-disputes");
    setDeliveryDisputes(payload.items);
  };

  useEffect(() => {
    // Chaque module se charge indépendamment pour préserver les accès plus restreints.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.allSettled([loadQueue(), loadPayments(), loadPlatformSettings(), loadLeads(), loadDisputes(), loadDeliveryDisputes(), loadGrants()]).then((results) => {
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length === results.length) {
        setError("Votre espace ne peut pas être chargé pour le moment.");
      } else {
        setLastSyncedAt(new Date());
      }
    });
    // Le chargement initial conserve les filtres par défaut ; les changements
    // sont appliqués explicitement par le bouton du CRM financier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => {
      setAnalyticsRefreshKey((value) => value + 1);
      void Promise.allSettled([loadQueue(), loadPayments(), loadLeads()]).then(() => setLastSyncedAt(new Date()));
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
    // Les fonctions lisent les filtres courants au retour sur la fenêtre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qualified = leads.filter((lead) => ["qualified", "onboarding"].includes(lead.status)).length;

  const openCase = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      setSelected(await adminFetch<VerificationDetail>(`/api/merchant/verifications/${id}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dossier inaccessible.");
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (caseId: string, documentId: string) => {
    setBusy(true);
    try {
      const payload = await adminFetch<{ url: string }>(`/api/admin/verifications/${caseId}/documents/${documentId}`);
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Document inaccessible.");
    } finally {
      setBusy(false);
    }
  };

  const decideCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await adminFetch(`/api/admin/verifications/${selected.case.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome: form.get("outcome"),
          reasonCode: form.get("reasonCode") || undefined,
          merchantMessage: form.get("merchantMessage") || undefined,
          internalNote: form.get("internalNote") || undefined,
        }),
      });
      setMessage("La décision a été enregistrée. Le commerçant peut poursuivre son parcours.");
      setSelected(undefined);
      await loadQueue();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally {
      setBusy(false);
    }
  };

  const decidePayment = async (id: string, approved: boolean) => {
    const rejectionReason = approved ? undefined : window.prompt("Indiquez le motif à communiquer") || undefined;
    if (!approved && !rejectionReason) return;
    setBusy(true);
    setError("");
    try {
      await adminFetch(`/api/admin/subscription-payments/${id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved, rejectionReason }),
      });
      setMessage(approved ? "Le paiement est validé et la période facturée est couverte." : "Le paiement n’a pas été validé.");
      await loadPayments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally {
      setBusy(false);
    }
  };

  const resolveDispute = async (disputeId: string, resolution: "no_refund" | "refund_required") => {
    const note = window.prompt(resolution === "refund_required" ? "Indiquez la décision et le montant à rembourser au marchand" : "Indiquez pourquoi aucun remboursement n’est requis");
    if (!note) return;
    setBusy(true);
    setError("");
    try {
      await adminFetch(`/api/admin/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution, note }),
      });
      setMessage(resolution === "refund_required" ? "Le remboursement direct a été demandé au marchand." : "Le litige est clos sans remboursement.");
      await loadDisputes();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Résolution impossible.");
    } finally {
      setBusy(false);
    }
  };

  const resolveDeliveryDispute = async (id: string, outcome: "resolved" | "dismissed") => {
    const resolution = window.prompt(outcome === "resolved" ? "Décrivez la décision communiquée aux parties" : "Pourquoi classer ce dossier sans suite ?");
    if (!resolution || resolution.trim().length < 4) return;
    setBusy(true); setError("");
    try {
      await adminFetch(`/api/admin/delivery-disputes/${id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome, resolution }),
      });
      setMessage("Le litige de livraison est clos et les coordonnées client sont de nouveau masquées au livreur.");
      await loadDeliveryDisputes();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Résolution impossible.");
    } finally { setBusy(false); }
  };

  const savePlatformSetting = async (event: FormEvent<HTMLFormElement>, channel: "wave" | "orange_money") => {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await adminFetch("/api/admin/payment-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel, paymentNumber: form.get("paymentNumber"), accountHolder: form.get("accountHolder") || null, active: form.get("active") === "on", paymentLink: form.get("paymentLink") || null }) });
      setMessage(`Numéro ${channel === "wave" ? "Wave" : "Orange Money"} SunuShop enregistré.`);
      await loadPlatformSettings();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Numéro impossible à enregistrer."); }
    finally { setBusy(false); }
  };

  const applyBillingFilters = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await loadPayments(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Échéances indisponibles."); }
    finally { setBusy(false); }
  };

  const searchMerchants = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await adminFetch<{ items: MerchantSearchResult[] }>(`/api/admin/merchants/search?q=${encodeURIComponent(merchantQuery)}`);
      setMerchantResults(payload.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Recherche impossible.");
    } finally {
      setBusy(false);
    }
  };

  const submitGrant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!grantMerchant) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await adminFetch("/api/admin/subscriptions/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          merchantId: grantMerchant.id,
          planId: form.get("planId"),
          days: Number(form.get("days")),
          reason: form.get("reason"),
        }),
      });
      setMessage(`Abonnement activé pour ${grantMerchant.public_name}.`);
      event.currentTarget.reset();
      setGrantMerchant(undefined);
      setMerchantResults([]);
      setMerchantQuery("");
      await loadGrants();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Octroi impossible.");
    } finally {
      setBusy(false);
    }
  };

  const navItems = [
    { id: "overview" as const, label: "Vue d’ensemble", icon: LayoutDashboard },
    { id: "crm" as const, label: "CRM commerçants", icon: UsersRound, badge: leads.filter((lead) => lead.status === "new").length },
    { id: "verifications" as const, label: "Dossiers commerçants", icon: FileCheck2, badge: queue.length },
    { id: "subscriptions" as const, label: "Abonnements", icon: ReceiptText, badge: payments.length },
    { id: "litiges" as const, label: "Litiges", icon: AlertTriangle, badge: disputes.length + deliveryDisputes.filter((item) => item.status === "open").length },
    { id: "support" as const, label: "Support", icon: MessageSquare },
    { id: "categories" as const, label: "Catégories", icon: Store },
  ];

  const title = {
    overview: ["Vue d’ensemble", "Les priorités du jour, au même endroit."],
    crm: ["Prospects & clients", "Contactez les commerçants et suivez leur activité au même endroit."],
    verifications: ["Dossiers commerçants", "Validez les informations avec un parcours lisible et traçable."],
    subscriptions: ["Abonnements", "Activez les accès après confirmation des paiements."],
    litiges: ["Litiges", "Arbitrez les commandes signalées et suivez les remboursements directs."],
    support: ["Support", "Répondez aux acheteurs qui contactent l’équipe SunuShop."],
    categories: ["Catégories", "Organisez la navigation et le classement des boutiques."],
  }[tab];

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand"><span>S</span><div><b>SunuShop</b><small>Pilotage</small></div></div>
        <nav aria-label="Navigation de l’administration">
          <span className="admin-sidebar__label">Votre activité</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}><Icon /><span>{item.label}</span>{Boolean(item.badge) && <i>{item.badge}</i>}</button>;
          })}
        </nav>
        <div className="admin-sidebar__footer">
          <Link href="/admin/securite"><ShieldCheck /><span><b>Sécurité du compte</b><small>Accès renforcé actif</small></span><ArrowRight /></Link>
          <Link href="/">Revenir à l’accueil</Link>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-kicker">Espace administrateur</span><h1>{title[0]}</h1><p>{title[1]}</p></div>
          <div className="admin-topbar__status"><span /><div><b>Données du CRM</b><small>{lastSyncedAt ? `Actualisées à ${lastSyncedAt.toLocaleTimeString("fr-SN", { hour: "2-digit", minute: "2-digit" })}` : "Synchronisation en cours"}</small></div><button type="button" onClick={() => { setAnalyticsRefreshKey((value) => value + 1); void Promise.allSettled([loadQueue(), loadPayments(), loadPlatformSettings(), loadLeads(), loadDisputes(), loadDeliveryDisputes(), loadGrants()]).then(() => markSynced()); }} disabled={busy} aria-label="Actualiser toutes les données"><RefreshCw /></button></div>
        </header>

        {message && <p className="admin-feedback"><CheckCircle2 /> {message}</p>}
        {error && <p className="admin-feedback admin-feedback--error">{error}</p>}

        {tab === "overview" && (
          <div className="admin-overview">
            <section className="admin-hero-card">
              <div><span>À traiter aujourd’hui</span><h2>Faites avancer les bons dossiers.</h2><p>Les nouvelles demandes, les relances et les validations prioritaires sont regroupées pour vous aider à décider rapidement.</p><button type="button" onClick={() => setTab("crm")}>Voir les prospects <ArrowRight /></button></div>
              <div className="admin-hero-card__score"><small>Opportunités en cours</small><strong>{qualified}</strong><span><TrendingUp /> prospects qualifiés</span></div>
            </section>
            <AdminCrmMetrics refreshKey={analyticsRefreshKey} onLoaded={markSynced} />
            <section className="admin-stat-grid">
              <article><span className="admin-stat-icon admin-stat-icon--orange"><UsersRound /></span><div><small>NOUVEAUX PROSPECTS</small><strong>{leads.filter((lead) => lead.status === "new").length}</strong><button onClick={() => setTab("crm")}>Ouvrir le suivi</button></div></article>
              <article><span className="admin-stat-icon admin-stat-icon--green"><FileCheck2 /></span><div><small>DOSSIERS À ÉTUDIER</small><strong>{queue.length}</strong><button onClick={() => setTab("verifications")}>Étudier les dossiers</button></div></article>
              <article><span className="admin-stat-icon admin-stat-icon--purple"><ReceiptText /></span><div><small>PAIEMENTS À CONFIRMER</small><strong>{payments.length}</strong><button onClick={() => setTab("subscriptions")}>Vérifier les paiements</button></div></article>
            </section>
            <section className="admin-overview-grid">
              <article className="admin-panel">
                <div className="admin-panel__heading"><div><span className="admin-kicker">Dernières demandes</span><h2>Prospects récents</h2></div><button className="admin-text-button" onClick={() => setTab("crm")}>Tout voir <ArrowRight /></button></div>
                <div className="admin-compact-list">{leads.filter((lead) => lead.status !== "converted").slice(0, 5).map((lead) => <button key={lead.id} onClick={() => setTab("crm")}><span className="admin-avatar">{lead.business_name.slice(0, 2).toUpperCase()}</span><span><b>{lead.business_name}</b><small>{lead.full_name} · {lead.city || "Ville à préciser"}</small></span><i className="crm-status" data-status={lead.status}>{lead.status === "new" ? "Nouveau" : lead.status === "qualified" ? "Qualifié" : "En suivi"}</i></button>)}{!leads.some((lead) => lead.status !== "converted") && <div className="admin-empty"><UsersRound /><p>Les candidatures reçues depuis le site apparaîtront ici.</p></div>}</div>
              </article>
              <article className="admin-panel admin-next-actions">
                <div className="admin-panel__heading"><div><span className="admin-kicker">Parcours commerçant</span><h2>Étapes clés</h2></div></div>
                <ol><li className="is-current"><span>1</span><div><b>Qualifier la demande</b><small>Comprendre l’activité et le besoin.</small></div></li><li><span>2</span><div><b>Accompagner l’inscription</b><small>Préparer la boutique et les informations utiles.</small></div></li><li><span>3</span><div><b>Valider le dossier</b><small>Contrôler les pièces avant l’ouverture.</small></div></li><li><span>4</span><div><b>Activer la boutique</b><small>Donner accès aux ventes et au suivi.</small></div></li></ol>
              </article>
            </section>
          </div>
        )}

        {tab === "crm" && (
          <>
            <AdminCrm leads={leads} reload={loadLeads} />
            <MerchantInvitationPanel leads={leads} reload={loadLeads} />
          </>
        )}

        {tab === "categories" && <CategoryAdmin />}

        {tab === "verifications" && (
          <section className="admin-panel admin-operation-panel">
            <div className="admin-panel__heading"><div><span className="admin-kicker">Confiance commerçant</span><h2>Dossiers à étudier</h2><p>Consultez les pièces, puis communiquez une décision compréhensible.</p></div><span className="admin-count">{queue.length} en attente</span></div>
            <div className="admin-record-list">{queue.map((item) => { const merchant = relationOne(item.merchant_accounts); return <button key={item.id} onClick={() => openCase(item.id)} disabled={busy}><span className="admin-avatar"><Store /></span><span><b>{merchant?.public_name}</b><small>{merchant?.kind === "formal" ? "Entreprise déclarée" : "Commerce indépendant"} · {[merchant?.region, merchant?.city].filter(Boolean).join(" · ") || "Localisation à préciser"}</small></span><i className="verification-status" data-status={item.status}>{verificationLabels[item.status] ?? item.status}</i><ArrowRight /></button>; })}{!queue.length && <div className="admin-empty"><CheckCircle2 /><h3>Tout est à jour</h3><p>Aucun dossier ne nécessite de décision actuellement.</p></div>}</div>
            {selected && <div className="admin-case-detail"><div className="admin-case-detail__heading"><div><span className="admin-kicker">Dossier sélectionné</span><h3>Pièces et décision</h3></div><button className="admin-secondary-button" onClick={() => setSelected(undefined)}>Fermer</button></div>{selected.case.merchant_note && <p className="admin-merchant-note">Message du commerçant : {selected.case.merchant_note}</p>}<div className="admin-document-grid">{selected.documents.map((document) => <article key={document.id}><FileCheck2 /><div><b>{documentLabels[document.document_type] ?? document.document_type}</b><small>Version {document.version} · {document.status === "accepted" ? "Acceptée" : document.status === "rejected" ? "À remplacer" : "À vérifier"}</small></div><button onClick={() => openDocument(selected.case.id, document.id)} disabled={busy}>Consulter</button></article>)}</div><form className="admin-decision-form" onSubmit={decideCase}><label>Décision<select name="outcome"><option value="in_review">Commencer l’étude</option><option value="needs_changes">Demander un complément</option><option value="approved">Valider le dossier</option><option value="rejected">Ne pas valider</option><option value="suspended">Suspendre temporairement</option></select></label><label>Motif interne<input name="reasonCode" placeholder="Ex. document illisible" /></label><label className="admin-field-wide">Message au commerçant<textarea name="merchantMessage" rows={3} placeholder="Expliquez clairement la prochaine étape." /></label><label className="admin-field-wide">Note pour l’équipe<textarea name="internalNote" rows={2} placeholder="Contexte utile pour le prochain suivi." /></label><div className="admin-field-wide"><button className="admin-primary-button" disabled={busy}>Enregistrer la décision <ArrowRight /></button></div></form></div>}
          </section>
        )}

        {tab === "subscriptions" && (
          <section className="admin-panel admin-operation-panel">
            <div className="admin-panel__heading"><div><span className="admin-kicker">Coordonnées bénéficiaire</span><h2>Numéros SunuShop</h2><p>Les abonnements restent indisponibles tant qu’aucun numéro actif n’est configuré.</p></div></div>
            <div className="admin-subscription-channels">{(["wave", "orange_money"] as const).map((channel) => { const setting = platformSettings.find((item) => item.channel === channel); return <form className="mvp-form admin-subscription-channel" key={`${channel}-${setting?.updated_at ?? "new"}`} onSubmit={(event) => void savePlatformSetting(event, channel)}><h3>{channel === "wave" ? "Wave" : "Orange Money"}</h3><label className="mvp-field">Numéro bénéficiaire<input name="paymentNumber" inputMode="tel" defaultValue={setting?.payment_number ?? ""} required /></label><label className="mvp-field">Titulaire<input name="accountHolder" defaultValue={setting?.account_holder ?? ""} /></label>{channel === "wave" && <label className="mvp-field">Lien de paiement Wave (facultatif)<input name="paymentLink" placeholder="https://pay.wave.com/m/M_sn_.../c/sn/" defaultValue={setting?.payment_link ?? ""} /></label>}<label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={setting?.active ?? false} /> Actif</label><button className="admin-primary-button" disabled={busy}>Enregistrer</button></form>; })}</div>

            <div className="admin-panel__heading"><div><span className="admin-kicker">Accès commerçants</span><h2>Paiements à confirmer</h2><p>Validez le règlement avant d’activer les services du commerce.</p></div><span className="admin-count">{payments.length} en attente</span></div>
            <div className="admin-record-list">{payments.map((payment) => { const merchant = relationOne(payment.merchant_accounts); return <div className="admin-payment-row" key={payment.id}><span className="admin-avatar"><ReceiptText /></span><span><b>{merchant?.public_name}</b><small>{payment.plan_id} · {payment.billing_cycle === "monthly" ? "mensuel" : payment.billing_cycle === "quarterly" ? "trimestriel" : "annuel"} · {payment.channel === "wave" ? "Wave" : "Orange Money"} vers {payment.destination_number ?? "numéro historique"} · réf. {payment.external_reference}</small></span><strong>{formatPrice(payment.amount_xof)}</strong><div><button className="admin-primary-button" onClick={() => decidePayment(payment.id, true)} disabled={busy}>Confirmer</button><button className="admin-danger-button" onClick={() => decidePayment(payment.id, false)} disabled={busy}>Refuser</button></div></div>; })}{!payments.length && <div className="admin-empty"><CheckCircle2 /><h3>Aucun paiement en attente</h3><p>Les prochaines demandes apparaîtront ici.</p></div>}</div>

            <div className="admin-panel__heading"><div><span className="admin-kicker">Contrôle mensuel</span><h2>Échéances d’abonnement</h2><p>Chaque ligne permet de savoir qui a payé, ce qui est couvert et ce qui reste dû.</p></div><a className="admin-secondary-button" href={`/api/admin/subscription-payments?month=${billingMonth}&status=${billingStatus}&plan=${billingPlan}&cycle=${billingCycle}&merchant=${billingMerchant}&format=csv`}>Exporter le CSV</a></div>
            <form className="admin-decision-form" onSubmit={applyBillingFilters}><label>Mois<input type="month" value={billingMonth} onChange={(event) => setBillingMonth(event.target.value)} /></label><label>Statut<select value={billingStatus} onChange={(event) => setBillingStatus(event.target.value)}><option value="">Tous</option><option value="covered">Couvert</option><option value="upcoming">À venir</option><option value="due">À payer</option><option value="pending_validation">Validation en attente</option><option value="paid">Payée</option><option value="overdue">En retard</option><option value="refused">Refusée</option><option value="expired">Expirée</option></select></label><label>Plan<select value={billingPlan} onChange={(event) => setBillingPlan(event.target.value)}><option value="">Tous</option><option value="essential">Essentiel</option><option value="pro">Pro</option><option value="network">Réseau</option></select></label><label>Cycle<select value={billingCycle} onChange={(event) => setBillingCycle(event.target.value)}><option value="">Tous</option><option value="monthly">Mensuel</option><option value="quarterly">Trimestriel</option><option value="annual">Annuel</option></select></label><label>Identifiant marchand<input value={billingMerchant} onChange={(event) => setBillingMerchant(event.target.value)} placeholder="UUID (facultatif)" /></label><div><button className="admin-secondary-button" disabled={busy}>Appliquer</button></div></form>
            <div className="admin-record-list">{billingItems.map((item) => { const merchant = relationOne(item.merchant_accounts); const submission = relationOne(item.subscription_payment_submissions ?? []); const labels: Record<string, string> = { covered: "Couvert", upcoming: "À venir", due: "À payer", pending_validation: "Validation en attente", paid: "Payée", overdue: "En retard", refused: "Refusée", expired: "Expirée" }; return <div className="admin-payment-row" key={item.id}><span className="admin-avatar"><ReceiptText /></span><span><b>{merchant?.public_name}</b><small>{item.plan_id} · {item.billing_cycle === "monthly" ? "mensuel" : item.billing_cycle === "quarterly" ? "trimestriel" : "annuel"} · du {formatDate(item.service_period_start)} au {formatDate(item.service_period_end)}</small><small>Échéance : {formatDate(item.due_at)}{submission ? ` · ${submission.channel === "wave" ? "Wave" : "Orange Money"} · réf. ${submission.external_reference}` : ""}</small></span><strong>{formatPrice(item.amount_xof)}</strong><i className="crm-status" data-status={item.displayStatus}>{labels[item.displayStatus] ?? item.displayStatus}</i></div>; })}{!billingItems.length && <div className="admin-empty"><ReceiptText /><h3>Aucune échéance pour ce filtre</h3><p>Modifiez le mois ou les filtres pour afficher d’autres périodes.</p></div>}</div>

            <div className="admin-panel__heading"><div><span className="admin-kicker">Geste commercial</span><h2>Octroyer un abonnement manuellement</h2><p>Paiement espèces, partenariat, geste commercial… le motif est conservé dans l’historique.</p></div></div>
            <form className="admin-decision-form" onSubmit={searchMerchants}>
              <label className="admin-field-wide">
                Rechercher une boutique
                <input value={merchantQuery} onChange={(event) => setMerchantQuery(event.target.value)} placeholder="Nom de la boutique" />
              </label>
              <div className="admin-field-wide"><button className="admin-secondary-button" disabled={busy}>Rechercher</button></div>
            </form>
            {merchantResults.length > 0 && !grantMerchant && (
              <div className="admin-compact-list">
                {merchantResults.map((merchant) => (
                  <button key={merchant.id} onClick={() => { setGrantMerchant(merchant); setMerchantResults([]); }}>
                    <span className="admin-avatar">{merchant.public_name.slice(0, 2).toUpperCase()}</span>
                    <span><b>{merchant.public_name}</b><small>{merchant.status} · {merchant.subscription_status}</small></span>
                  </button>
                ))}
              </div>
            )}
            {grantMerchant && (
              <form className="admin-decision-form" onSubmit={submitGrant}>
                <p className="admin-merchant-note">Boutique sélectionnée : <strong>{grantMerchant.public_name}</strong> <button type="button" className="admin-text-button" onClick={() => setGrantMerchant(undefined)}>Changer</button></p>
                <label>Plan
                  <select name="planId" defaultValue="essential">
                    <option value="essential">Essentiel</option>
                    <option value="pro">Pro</option>
                    <option value="network">Réseau</option>
                  </select>
                </label>
                <label>Durée (jours)
                  <input name="days" type="number" min={1} max={365} defaultValue={30} required />
                </label>
                <label className="admin-field-wide">Motif (obligatoire)
                  <textarea name="reason" rows={2} minLength={4} maxLength={500} required placeholder="Ex. paiement espèces confirmé par téléphone" />
                </label>
                <div className="admin-field-wide"><button className="admin-primary-button" disabled={busy}>Activer l’abonnement <ArrowRight /></button></div>
              </form>
            )}

            <div className="admin-panel__heading"><div><span className="admin-kicker">Traçabilité</span><h2>Historique des octrois</h2></div></div>
            <div className="admin-record-list">
              {grants.map((grant) => {
                const merchant = relationOne(grant.merchant_accounts);
                return (
                  <div className="admin-payment-row" key={grant.id}>
                    <span className="admin-avatar"><ReceiptText /></span>
                    <span><b>{merchant?.public_name}</b><small>{grant.plan_id} · {grant.days} jours · {formatDate(grant.created_at)}</small><small>Motif : {grant.reason}</small></span>
                  </div>
                );
              })}
              {!grants.length && <div className="admin-empty"><CheckCircle2 /><h3>Aucun octroi manuel</h3><p>Les activations manuelles apparaîtront ici avec leur motif.</p></div>}
            </div>
          </section>
        )}

        {tab === "litiges" && (
          <section className="admin-panel admin-operation-panel">
            <div className="admin-panel__heading"><div><span className="admin-kicker">Livraison · tous moyens de paiement</span><h2>Litiges de livraison</h2><p>Ces dossiers sont indépendants des transferts financiers. Les détails client restent visibles au livreur uniquement pendant leur traitement.</p></div><span className="admin-count">{deliveryDisputes.filter((item) => item.status === "open").length} en attente</span></div>
            <div className="admin-record-list">
              {deliveryDisputes.filter((item) => item.status === "open").map((dispute) => {
                const merchant = relationOne(dispute.merchant_accounts);
                const order = relationOne(dispute.orders);
                const courier = relationOne(dispute.courier_memberships);
                return <div className="admin-payment-row" key={dispute.id}><span className="admin-avatar"><AlertTriangle /></span><span><b>{order?.public_code} · N° interne {order?.merchant_sequence}</b><small>{merchant?.public_name} · livreur {courier?.display_name} · {formatDate(dispute.opened_at)}</small><small>Motif : {dispute.reason}</small></span><div><button className="admin-primary-button" onClick={() => void resolveDeliveryDispute(dispute.id, "resolved")} disabled={busy}>Enregistrer la décision</button><button className="admin-danger-button" onClick={() => void resolveDeliveryDispute(dispute.id, "dismissed")} disabled={busy}>Classer sans suite</button></div></div>;
              })}
              {!deliveryDisputes.some((item) => item.status === "open") && <div className="admin-empty"><CheckCircle2 /><h3>Aucun litige de livraison en cours</h3><p>Les signalements de livraison apparaîtront ici, quel que soit le moyen de paiement.</p></div>}
            </div>
            <div className="mvp-divider" />
            <div className="admin-panel__heading"><div><span className="admin-kicker">Service après-vente</span><h2>Commandes en litige</h2><p>Ces dossiers sont indépendants des transferts : si nécessaire, le remboursement direct sera déclaré par le marchand puis confirmé par le client.</p></div><span className="admin-count">{disputes.length} en attente</span></div>
            <div className="admin-record-list">
              {disputes.map((dispute) => {
                const merchant = relationOne(dispute.merchant_accounts);
                const order = relationOne(dispute.orders);
                return (
                  <div className="admin-payment-row" key={dispute.id}>
                    <span className="admin-avatar"><AlertTriangle /></span>
                    <span>
                      <b>{order?.public_code}</b>
                      <small>{merchant?.public_name} · {formatDate(dispute.opened_at)}</small>
                      <small>Motif : {dispute.reason}</small>
                    </span>
                    <strong>{formatPrice(order?.total_xof ?? 0)}</strong>
                    <div>
                      <button className="admin-primary-button" onClick={() => resolveDispute(dispute.id, "no_refund")} disabled={busy}>Clore sans remboursement</button>
                      <button className="admin-danger-button" onClick={() => resolveDispute(dispute.id, "refund_required")} disabled={busy}>Demander un remboursement</button>
                    </div>
                  </div>
                );
              })}
              {!disputes.length && <div className="admin-empty"><CheckCircle2 /><h3>Aucun litige en cours</h3><p>Les commandes signalées par les acheteurs apparaîtront ici.</p></div>}
            </div>
          </section>
        )}

        {tab === "support" && (
          <section className="admin-panel admin-operation-panel">
            <div className="admin-panel__heading"><div><span className="admin-kicker">Service après-vente</span><h2>Support SunuShop</h2><p>Fils ouverts par les acheteurs vers l’équipe SunuShop.</p></div></div>
            <ConversationList view="asAdmin" />
          </section>
        )}
      </main>
    </div>
  );
}
