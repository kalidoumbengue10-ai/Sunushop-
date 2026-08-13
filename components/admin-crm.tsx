"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Store,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/admin/fetch";
import { formatPrice } from "@/lib/marketplace";

export type CrmLead = {
  id: string;
  source: string;
  full_name: string;
  business_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  business_type: string | null;
  sales_channel: string | null;
  message: string | null;
  status: LeadStatus;
  priority: "low" | "normal" | "high";
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  merchant_id?: string | null;
};

type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "onboarding"
  | "converted"
  | "rejected"
  | "archived";

type CrmLeadDetail = CrmLead & {
  crm_lead_notes: Array<{
    id: string;
    body: string;
    author_id: string;
    created_at: string;
  }>;
  crm_lead_events: Array<{
    id: string;
    event_type: string;
    from_status: LeadStatus | null;
    to_status: LeadStatus | null;
    summary: string | null;
    created_at: string;
  }>;
  merchant: {
    status: string;
    verification_status: string;
    subscription_status: string;
  } | null;
  documents: Array<{ id: string; case_id: string; document_type: string; status: string; version: number; mime_type: string; uploaded_at: string }>;
  caseId: string | null;
};

type ClientSummary = {
  kind: "client";
  id: string;
  publicName: string;
  legalName: string | null;
  contactName: string;
  email: string | null;
  phone: string;
  city: string | null;
  region: string | null;
  activity: string | null;
  status: string;
  verificationStatus: string;
  subscriptionStatus: string;
  customerSince: string;
  planId: string | null;
  planName: string | null;
  billingCycle: string | null;
  periodEndsAt: string | null;
};

type ClientDossier = {
  merchant: {
    id: string; public_name: string; legal_name: string | null; kind: string; description: string | null;
    email: string | null; phone: string; region: string | null; city: string | null; address_hint: string | null;
    ninea: string | null; rccm: string | null; status: string; verification_status: string;
    subscription_status: string; customer_since: string;
  };
  contact: null | (CrmLead & {
    crm_lead_notes: Array<{ id: string; body: string; author_id: string; created_at: string }>;
    crm_lead_events: Array<{ id: string; event_type: string; summary: string | null; created_at: string }>;
  });
  subscriptions: Array<{ id: string; plan_id: string; status: string; starts_at: string | null; current_period_ends_at: string | null; billing_cycle: string; subscription_plans: { name: string; monthly_price_xof: number } | Array<{ name: string; monthly_price_xof: number }> }>;
  subscriptionValues: Array<{ id: string; plan_id: string; origin: string; amount_xof: number; recognized_at: string }>;
  documents: Record<string, Array<{ id: string; case_id: string; document_type: string; version: number; status: string; mime_type: string; size_bytes: number; uploaded_at: string }>>;
  metrics: { paidOrdersCount: number; paidUnits: number; grossOrderVolumeXof: number; refundsXof: number; netOrderVolumeXof: number };
  topProducts: Array<{ productId: string; productName: string; units: number; revenueXof: number }>;
  topCategories: Array<{ categoryId: string; categoryName: string; units: number; revenueXof: number }>;
  recentOrders: Array<{ id: string; public_code: string; status: string; payment_status: string; total_xof: number; created_at: string }>;
  canViewDocuments: boolean;
};

// Les clients convertis ont désormais leur propre portefeuille ; le pipeline
// reste consacré aux étapes commerciales encore actionnables.
const pipelineGroups: Array<{ id: string; label: string; statuses: LeadStatus[] }> = [
  { id: "new", label: "Nouveaux", statuses: ["new"] },
  { id: "contacted", label: "Contactés", statuses: ["contacted"] },
  { id: "qualified", label: "Qualifiés", statuses: ["qualified"] },
  { id: "onboarding", label: "Accompagnement", statuses: ["onboarding"] },
];

const statusOptions: Array<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "Nouveau" },
  { value: "contacted", label: "Contacté" },
  { value: "qualified", label: "Qualifié" },
  { value: "onboarding", label: "Accompagnement" },
  { value: "rejected", label: "Non retenu" },
  { value: "archived", label: "Archivé" },
];

const priorityLabels = {
  low: "À suivre",
  normal: "Normal",
  high: "Prioritaire",
} as const;

const documentTypeLabels: Record<string, string> = {
  national_id_front: "CNI recto",
  national_id_back: "CNI verso",
  passport_identity: "Passeport",
  intent_letter: "Lettre d’intention",
  proof_activity: "Preuve d’activité",
  ninea: "NINEA",
  rccm: "RCCM",
  representative_mandate: "Mandat du représentant",
};

function statusLabel(status: LeadStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Non renseigné";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: "Africa/Dakar",
  }).format(new Date(value));
}

function relationOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function AdminCrm({
  leads,
  reload,
}: {
  leads: CrmLead[];
  reload: () => Promise<void>;
}) {
  const [segment, setSegment] = useState<"prospects" | "clients">("prospects");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [clientStatus, setClientStatus] = useState("");
  const [clientPlan, setClientPlan] = useState("");
  const [clientCity, setClientCity] = useState("");
  const [clientActivity, setClientActivity] = useState("");
  const [clientPeriod, setClientPeriod] = useState<"month" | "30days" | "year">("month");
  const [clientPage, setClientPage] = useState(1);
  const [clientPageSize, setClientPageSize] = useState(25);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientTotal, setClientTotal] = useState(0);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientDossier | null>(null);
  const [selected, setSelected] = useState<CrmLeadDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [invitationLink, setInvitationLink] = useState("");

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ segment: "clients" });
      params.set("page", String(clientPage));
      if (query.trim()) params.set("q", query.trim());
      if (clientStatus) params.set("status", clientStatus);
      if (clientPlan) params.set("plan", clientPlan);
      if (clientCity.trim()) params.set("city", clientCity.trim());
      if (clientActivity.trim()) params.set("activity", clientActivity.trim());
      const payload = await adminFetch<{ items: ClientSummary[]; total: number; pageSize: number }>(`/api/admin/crm/contacts?${params}`);
      setClients(payload.items);
      setClientTotal(payload.total);
      setClientPageSize(payload.pageSize);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Clients indisponibles.");
    } finally {
      setClientsLoading(false);
    }
  }, [clientActivity, clientCity, clientPage, clientPlan, clientStatus, query]);

  useEffect(() => {
    if (segment !== "clients") return;
    const timer = window.setTimeout(() => { void loadClients(); }, 180);
    return () => window.clearTimeout(timer);
  }, [segment, loadClients]);

  useEffect(() => {
    void adminFetch<{ total: number }>("/api/admin/crm/contacts?segment=clients")
      .then((payload) => setClientTotal(payload.total))
      .catch(() => undefined);
  }, []);

  const openClient = async (merchantId: string, period = clientPeriod) => {
    setBusy(true);
    setError("");
    try {
      const now = new Date();
      const from = period === "year"
        ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
        : period === "30days"
          ? new Date(now.getTime() - 29 * 86_400_000).toISOString()
          : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const to = new Date(now.getTime() + 86_400_000).toISOString();
      setSelectedClient(await adminFetch<ClientDossier>(`/api/admin/crm/clients/${merchantId}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dossier client indisponible.");
    } finally {
      setBusy(false);
    }
  };

  const copyValue = async (value: string, label: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const field = document.createElement("textarea");
      field.value = value;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setActionMessage(`${label} copié.`);
  };

  const openClientDocument = async (caseId: string, documentId: string) => {
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (lead.status === "converted") return false;
      if (status !== "all" && lead.status !== status) return false;
      if (!needle) return true;
      return [lead.full_name, lead.business_name, lead.email, lead.phone, lead.city, lead.business_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [leads, query, status]);

  const pipelineCounts = useMemo(
    () =>
      Object.fromEntries(
        pipelineGroups.map((group) => [group.id, leads.filter((lead) => group.statuses.includes(lead.status)).length]),
      ) as Record<string, number>,
    [leads],
  );

  const openLead = async (id: string) => {
    setBusy(true);
    setError("");
    setInvitationLink("");
    setActionMessage("");
    try {
      setSelected(await adminFetch<CrmLeadDetail>(`/api/admin/crm/leads/${id}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const refreshSelected = async () => {
    await reload();
    if (selected) await openLead(selected.id);
  };

  const updateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await adminFetch(`/api/admin/crm/leads/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: form.get("status"),
          priority: form.get("priority"),
        }),
      });
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const addNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") || "");
    setBusy(true);
    try {
      await adminFetch(`/api/admin/crm/leads/${selected.id}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      form.reset();
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const inviteToDocuments = async () => {
    if (!selected) return;
    if (!selected.phone) {
      setError("Ajoutez un numéro de téléphone avant d’envoyer l’accès documents.");
      return;
    }
    const digits = selected.phone.replace(/\D/g, "");
    const phone = digits.length === 9 ? `+221${digits}` : `+${digits}`;
    setBusy(true); setError(""); setActionMessage(""); setInvitationLink("");
    try {
      const payload = await adminFetch<{ invitationUrl?: string; emailSent?: boolean }>("/api/admin/merchant-invitations", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: selected.id,
          kind: selected.business_type === "formal" ? "formal" : "informal",
          publicName: selected.business_name,
          legalName: selected.business_type === "formal" ? selected.business_name : undefined,
          phone,
          email: selected.email,
          city: selected.city || undefined,
          representativeIsLegalOwner: true,
        }),
      });
      setInvitationLink(String(payload.invitationUrl ?? ""));
      setActionMessage(payload.emailSent ? "L’e-mail a été accepté par le serveur de messagerie. Le lien sécurisé est aussi disponible ci-dessous." : "L’accès est créé. L’e-mail sera retenté automatiquement ; utilisez le lien ci-dessous sans attendre.");
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const activateTestSubscription = async () => {
    if (!selected?.merchant_id) return;
    const confirmed = window.confirm("Activer le premier plan SunuShop disponible pendant 30 jours pour ce commerce ? Cette action ouvrira immédiatement la publication des produits.");
    if (!confirmed) return;
    setBusy(true); setError(""); setActionMessage("");
    try {
      await adminFetch("/api/admin/subscriptions/test-activation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchantId: selected.merchant_id, days: 30 }),
      });
      setActionMessage("Abonnement de test actif pendant 30 jours. Le commerçant peut maintenant publier ses produits.");
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Activation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const suspendMerchant = async () => {
    if (!selected?.caseId) return;
    const confirmed = window.confirm(`Suspendre la boutique « ${selected.business_name} » ? Elle disparaîtra immédiatement du marché et ne pourra plus vendre.`);
    if (!confirmed) return;
    setBusy(true); setError(""); setActionMessage("");
    try {
      await adminFetch(`/api/admin/verifications/${selected.caseId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome: "suspended", reasonCode: "crm_manual_suspend" }),
      });
      setActionMessage("La boutique est suspendue. Elle n’est plus visible sur le marché.");
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suspension impossible.");
    } finally {
      setBusy(false);
    }
  };

  const deleteMerchant = async () => {
    if (!selected?.merchant_id) return;
    const merchantId = selected.merchant_id;
    let previewPayload: { productCount: number; orderCount: number };
    try {
      previewPayload = await adminFetch<{ productCount: number; orderCount: number }>(`/api/admin/merchants/${merchantId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de préparer la suppression.");
      return;
    }
    const { productCount, orderCount } = previewPayload;
    const confirmed = window.confirm(
      `Supprimer définitivement la boutique « ${selected.business_name} » ?\n\n` +
        `${productCount} produit(s) et ${orderCount} commande(s) seront supprimés avec elle. Cette action est IRRÉVERSIBLE.`,
    );
    if (!confirmed) return;
    if (orderCount > 0) {
      const doubleConfirmed = window.confirm(
        `Cette boutique a ${orderCount} commande(s) enregistrée(s). Les supprimer efface aussi l’historique d’achat des clients concernés. Confirmer quand même ?`,
      );
      if (!doubleConfirmed) return;
    }
    setBusy(true); setError(""); setActionMessage("");
    try {
      await adminFetch(`/api/admin/merchants/${merchantId}`, { method: "DELETE" });
      setActionMessage("La boutique et toutes ses données ont été supprimées.");
      setSelected(null);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const deleteLead = async () => {
    if (!selected) return;
    const confirmed = window.confirm(`Supprimer définitivement la fiche « ${selected.business_name} » ? Cette action est irréversible.`);
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      await adminFetch(`/api/admin/crm/leads/${selected.id}`, { method: "DELETE" });
      setSelected(null);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Commerce", "Contact", "Email", "Téléphone", "Ville", "Activité", "Étape", "Priorité", "Reçu le"],
      ...filtered.map((lead) => [
        lead.business_name,
        lead.full_name,
        lead.email,
        lead.phone,
        lead.city,
        lead.business_type,
        statusLabel(lead.status),
        priorityLabels[lead.priority],
        formatDate(lead.created_at, true),
      ]),
    ];
    const blob = new Blob([`﻿${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sunushop-prospects-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="crm-workspace">
      <section className="crm-segment-tabs" aria-label="Type de relation commerciale">
        <button type="button" className={segment === "prospects" ? "is-active" : ""} onClick={() => { setSegment("prospects"); setQuery(""); }}>
          Prospects <strong>{leads.filter((lead) => lead.status !== "converted").length}</strong>
        </button>
        <button type="button" className={segment === "clients" ? "is-active" : ""} onClick={() => { setSegment("clients"); setQuery(""); }}>
          Clients commerçants <strong>{clientTotal}</strong>
        </button>
      </section>
      {actionMessage && <p className="admin-feedback crm-global-feedback">{actionMessage}</p>}
      {segment === "prospects" && <>
      <section className="crm-pipeline" aria-label="Étapes du suivi commercial">
        {pipelineGroups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={group.statuses.includes(status as LeadStatus) ? "is-active" : ""}
            onClick={() => setStatus(status !== "all" && group.statuses.includes(status as LeadStatus) ? "all" : group.statuses[0])}
          >
            <span>{group.label}</span>
            <strong>{pipelineCounts[group.id]}</strong>
          </button>
        ))}
      </section>

      <section className="admin-panel crm-list-panel">
        <div className="admin-panel__heading">
          <div>
            <span className="admin-kicker">Développement commercial</span>
            <h2>Prospects</h2>
            <p>Chaque demande reste visible jusqu’à son accompagnement.</p>
          </div>
          <button type="button" className="admin-secondary-button" onClick={exportCsv} disabled={!filtered.length}>
            <Download /> Exporter
          </button>
        </div>

        <div className="crm-toolbar">
          <label>
            <Search />
            <span className="sr-only">Rechercher un prospect</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Commerce, contact, ville…" />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value as LeadStatus | "all")}>
            <option value="all">Toutes les étapes</option>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        {error && <p className="admin-feedback admin-feedback--error">{error}</p>}
        <div className="crm-table" role="table" aria-label="Liste des prospects">
          <div className="crm-table__head" role="row">
            <span>Commerce</span><span>Contact</span><span>Étape</span><span>Reçu le</span><span />
          </div>
          {filtered.map((lead) => (
            <article key={lead.id} className="crm-table__row crm-contact-row crm-prospect-row" role="row">
              <button type="button" className="crm-contact-row__open" onClick={() => openLead(lead.id)} disabled={busy} aria-label={`Ouvrir la fiche de ${lead.business_name}`}><ChevronRight /></button>
              <span data-label="Commerce"><b>{lead.business_name}</b><small>{lead.business_type || "Activité à préciser"} · {lead.city || "Ville à préciser"}</small></span>
              <span data-label="Contact" className="crm-contact-cell"><b>{lead.full_name}</b><small>{lead.email}{lead.phone ? ` · ${lead.phone}` : ""}</small></span>
              <span data-label="Étape"><i className="crm-status" data-status={lead.status}>{statusLabel(lead.status)}</i><small>{priorityLabels[lead.priority]}</small></span>
              <span data-label="Reçu le"><b>{formatDate(lead.created_at)}</b><small>Mis à jour {formatDate(lead.updated_at)}</small></span>
              <div className="crm-row-actions" aria-label={`Contacter ${lead.business_name}`}>
                <button type="button" onClick={() => void copyValue(lead.email, "E-mail")} aria-label="Copier l’e-mail"><Copy /></button>
                <a href={`mailto:${lead.email}`} aria-label="Envoyer un e-mail"><Mail /></a>
                {lead.phone && <><button type="button" onClick={() => void copyValue(lead.phone!, "Téléphone")} aria-label="Copier le téléphone"><Copy /></button><a href={`tel:${lead.phone}`} aria-label="Appeler"><Phone /></a><a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label="Contacter sur WhatsApp"><MessageCircle /></a></>}
              </div>
            </article>
          ))}
          {!filtered.length && (
            <div className="crm-empty"><Sparkles /><h3>Aucun prospect dans cette vue</h3><p>Les nouvelles candidatures du site apparaîtront automatiquement ici.</p></div>
          )}
        </div>
      </section>
      </>}

      {segment === "clients" && (
        <section className="admin-panel crm-list-panel">
          <div className="admin-panel__heading">
            <div><span className="admin-kicker">Portefeuille commerçants</span><h2>Clients commerçants</h2><p>Un client reste dans ce portefeuille après sa première activation.</p></div>
            <span className="admin-count">{clientTotal} client{clientTotal > 1 ? "s" : ""}</span>
          </div>
          <div className="crm-toolbar crm-toolbar--clients">
            <label><Search /><span className="sr-only">Rechercher un client</span><input value={query} onChange={(event) => { setQuery(event.target.value); setClientPage(1); }} placeholder="Boutique, contact, e-mail, téléphone…" /></label>
            <select value={clientStatus} onChange={(event) => { setClientStatus(event.target.value); setClientPage(1); }} aria-label="Statut d’abonnement">
              <option value="">Tous les statuts</option><option value="active">Actif</option><option value="grace">Grâce</option><option value="expired">Expiré</option><option value="cancelled">Annulé</option>
            </select>
            <select value={clientPlan} onChange={(event) => { setClientPlan(event.target.value); setClientPage(1); }} aria-label="Plan d’abonnement">
              <option value="">Tous les plans</option><option value="essential">Essentiel</option><option value="pro">Pro</option><option value="network">Réseau</option>
            </select>
            <input value={clientCity} onChange={(event) => { setClientCity(event.target.value); setClientPage(1); }} placeholder="Ville" aria-label="Filtrer par ville" />
            <input value={clientActivity} onChange={(event) => { setClientActivity(event.target.value); setClientPage(1); }} placeholder="Activité" aria-label="Filtrer par activité" />
          </div>
          {error && <p className="admin-feedback admin-feedback--error">{error}</p>}
          <div className="crm-table crm-client-table" role="table" aria-label="Liste des clients commerçants" aria-busy={clientsLoading}>
            <div className="crm-table__head" role="row"><span>Commerce</span><span>Coordonnées</span><span>Abonnement</span><span>Activité</span><span>Actions</span></div>
            {clients.map((client) => (
              <article className="crm-table__row crm-contact-row" key={client.id} role="row">
                <button type="button" className="crm-contact-row__open" onClick={() => void openClient(client.id)} disabled={busy} aria-label={`Ouvrir le dossier de ${client.publicName}`}><Eye /></button>
                <span data-label="Commerce"><b>{client.publicName}</b><small>{client.contactName} · {client.city || "Ville à préciser"}</small></span>
                <span data-label="Coordonnées" className="crm-contact-cell"><b>{client.email || "E-mail non renseigné"}</b><small>{client.phone}</small></span>
                <span data-label="Abonnement"><i className="crm-status" data-status={client.subscriptionStatus}>{client.planName || "Sans plan"} · {client.subscriptionStatus}</i><small>{client.periodEndsAt ? `Jusqu’au ${formatDate(client.periodEndsAt)}` : "Période non renseignée"}</small></span>
                <span data-label="Activité"><b>{client.activity || "À préciser"}</b><small>Client depuis {formatDate(client.customerSince)}</small></span>
                <div className="crm-row-actions" aria-label={`Contacter ${client.publicName}`}>
                  {client.email && <><button type="button" onClick={() => void copyValue(client.email!, "E-mail")} aria-label="Copier l’e-mail"><Copy /></button><a href={`mailto:${client.email}`} aria-label="Envoyer un e-mail"><Mail /></a></>}
                  <button type="button" onClick={() => void copyValue(client.phone, "Téléphone")} aria-label="Copier le téléphone"><Copy /></button>
                  <a href={`tel:${client.phone}`} aria-label="Appeler"><Phone /></a>
                  <a href={`https://wa.me/${client.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label="Contacter sur WhatsApp"><MessageCircle /></a>
                </div>
              </article>
            ))}
            {!clients.length && !clientsLoading && <div className="crm-empty"><UserRoundCheck /><h3>Aucun client dans cette vue</h3><p>Les commerçants apparaissent ici dès leur première activation d’abonnement.</p></div>}
          </div>
          {clientTotal > clientPageSize && <nav className="crm-pagination" aria-label="Pagination des clients"><button type="button" disabled={clientPage === 1 || clientsLoading} onClick={() => setClientPage((page) => Math.max(1, page - 1))}>Précédent</button><span>Page {clientPage} sur {Math.ceil(clientTotal / clientPageSize)}</span><button type="button" disabled={clientPage * clientPageSize >= clientTotal || clientsLoading} onClick={() => setClientPage((page) => page + 1)}>Suivant</button></nav>}
        </section>
      )}

      {selected && (
        <div className="crm-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <aside className="crm-drawer" role="dialog" aria-modal="true" aria-labelledby="crm-lead-title">
            <header className="crm-drawer__header">
              <div><span className="admin-kicker">Fiche prospect</span><h2 id="crm-lead-title">{selected.business_name}</h2><p>{selected.full_name} · {selected.city || "Ville à préciser"}</p></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Fermer"><X /></button>
            </header>

            <div className="crm-contact-actions">
              <a href={`mailto:${selected.email}`}><Mail /> Écrire</a>
              <button type="button" onClick={() => void copyValue(selected.email, "E-mail")}><Copy /> Copier l’e-mail</button>
              {selected.phone && <a href={`tel:${selected.phone}`}><Phone /> Appeler</a>}
              {selected.phone && <button type="button" onClick={() => void copyValue(selected.phone!, "Téléphone")}><Copy /> Copier le numéro</button>}
              {selected.phone && <a href={`https://wa.me/${selected.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>}
            </div>

            <div className="crm-drawer__body">
              {actionMessage && <p className="admin-feedback">{actionMessage}</p>}
              {invitationLink && <section className="crm-invitation-fallback" aria-label="Lien d’accès aux documents"><div><strong>Lien sécurisé valable 7 jours</strong><small>À transmettre uniquement au commerçant concerné.</small></div><button type="button" onClick={async () => { await navigator.clipboard.writeText(invitationLink); setActionMessage("Lien sécurisé copié. Vous pouvez maintenant le transmettre au commerçant par WhatsApp."); }}><Copy /> Copier le lien</button>{selected.phone && <a href={`https://wa.me/${selected.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjour, voici votre lien sécurisé SunuShop pour déposer vos documents : ${invitationLink}`)}`} target="_blank" rel="noreferrer"><MessageCircle /> Envoyer par WhatsApp</a>}</section>}

              {selected.merchant_id && (
                <section className="crm-detail-card">
                  <div className="crm-detail-card__heading"><h3>Documents déposés</h3><BadgeCheck /></div>
                  <p className="crm-muted">
                    Dossier : <i className="crm-status" data-status={selected.merchant?.verification_status ?? "draft"}>{selected.merchant?.verification_status ?? "draft"}</i>
                    {" · "}Abonnement : <i className="crm-status" data-status={selected.merchant?.subscription_status ?? "pending"}>{selected.merchant?.subscription_status ?? "pending"}</i>
                  </p>
                  {selected.documents.length > 0 ? (
                    <ul className="crm-document-list">
                      {selected.documents.map((doc) => (
                        <li key={`${doc.document_type}-${doc.version}`}>
                          <span>{documentTypeLabels[doc.document_type] ?? doc.document_type}<small>Version {doc.version} · {formatDate(doc.uploaded_at)}</small></span>
                          <i className="crm-status" data-status={doc.status}>{doc.status}</i>
                          <button type="button" className="admin-text-button" onClick={() => void openClientDocument(doc.case_id, doc.id)} disabled={busy || doc.status === "purged"}><Eye /> Consulter</button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="crm-muted">Aucun document déposé pour le moment.</p>
                  )}
                  {selected.merchant?.status !== "suspended" ? (
                    <button type="button" className="admin-danger-button" onClick={suspendMerchant} disabled={busy || !selected.caseId}>
                      <ShieldAlert /> Suspendre cette boutique
                    </button>
                  ) : (
                    <p className="admin-feedback admin-feedback--error">Cette boutique est suspendue.</p>
                  )}
                </section>
              )}

              {selected.merchant_id && (
                <section className="crm-detail-card crm-danger-zone">
                  <h3>Supprimer cette boutique</h3>
                  <p className="crm-muted">
                    Action définitive réservée aux boutiques de test : la boutique, ses produits, ses commandes
                    et ses paiements associés seront supprimés. Le compte du commerçant n’est pas supprimé.
                  </p>
                  <button type="button" className="admin-danger-button" onClick={deleteMerchant} disabled={busy}>
                    <Trash2 /> Supprimer définitivement la boutique
                  </button>
                </section>
              )}

              {!['converted', 'rejected', 'archived'].includes(selected.status) && <section className="crm-detail-card crm-onboarding-action"><div><span className="admin-kicker">Accès sécurisé</span><h3>Espace de dépôt des documents</h3><p>Envoie ou renvoie le lien permettant de créer le mot de passe.</p></div><button type="button" className="admin-primary-button" onClick={inviteToDocuments} disabled={busy}><Send /> {selected.status === "onboarding" ? "Renvoyer l’accès documents" : "Envoyer l’accès documents"}</button></section>}
              {selected.merchant_id && <section className="crm-detail-card crm-test-subscription"><div><span className="admin-kicker">Test du parcours marchand</span><h3>Ouvrir la publication pendant 30 jours</h3><p>Cette activation est réservée aux tests. Elle reste enregistrée dans l’historique d’audit.</p></div><button type="button" className="admin-primary-button" onClick={activateTestSubscription} disabled={busy}><BadgeCheck /> Activer l’abonnement test</button></section>}

              <section className="crm-detail-card">
                <h3>Informations</h3>
                <dl>
                  <div><dt>Activité</dt><dd>{selected.business_type || "À préciser"}</dd></div>
                  <div><dt>Canaux actuels</dt><dd>{selected.sales_channel || "À préciser"}</dd></div>
                  <div><dt>Besoin exprimé</dt><dd>{selected.message || "Aucun message"}</dd></div>
                  <div><dt>Reçu le</dt><dd>{formatDate(selected.created_at, true)}</dd></div>
                </dl>
              </section>

              <form className="crm-detail-card crm-follow-up-form" onSubmit={updateLead}>
                <h3>Étape</h3>
                <div>
                  <label>Étape<select name="status" defaultValue={selected.status}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label>Priorité<select name="priority" defaultValue={selected.priority}><option value="low">À suivre</option><option value="normal">Normale</option><option value="high">Prioritaire</option></select></label>
                </div>
                <button className="admin-primary-button" disabled={busy}>Enregistrer <ArrowUpRight /></button>
              </form>

              <section className="crm-detail-card">
                <div className="crm-detail-card__heading"><h3>Notes de suivi</h3><UserRoundCheck /></div>
                <form className="crm-note-form" onSubmit={addNote}><textarea name="body" required minLength={2} rows={3} placeholder="Contexte de l’échange, objection, prochaine décision…" /><button className="admin-secondary-button" disabled={busy}>Ajouter la note</button></form>
                <div className="crm-note-list">
                  {[...(selected.crm_lead_notes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((note) => <article key={note.id}><p>{note.body}</p><small>{formatDate(note.created_at, true)}</small></article>)}
                  {!selected.crm_lead_notes?.length && <p className="crm-muted">Aucune note pour le moment.</p>}
                </div>
              </section>

              <section className="crm-detail-card crm-danger-zone">
                <h3>Supprimer ce prospect</h3>
                {selected.merchant_id ? (
                  <p className="crm-muted">Ce prospect a une boutique — suspendez-la plutôt que de supprimer la fiche.</p>
                ) : (
                  <p className="crm-muted">Action définitive : la fiche, ses notes et son historique seront supprimés.</p>
                )}
                <button type="button" className="admin-danger-button" onClick={deleteLead} disabled={busy || Boolean(selected.merchant_id)}>
                  <Trash2 /> Supprimer ce prospect
                </button>
              </section>
            </div>
          </aside>
        </div>
      )}

      {selectedClient && (
        <div className="crm-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedClient(null); }}>
          <aside className="crm-drawer crm-client-drawer" role="dialog" aria-modal="true" aria-labelledby="crm-client-title">
            <header className="crm-drawer__header">
              <div><span className="admin-kicker">Dossier client commerçant</span><h2 id="crm-client-title">{selectedClient.merchant.public_name}</h2><p>{selectedClient.contact?.full_name || selectedClient.merchant.legal_name || "Contact principal"} · {selectedClient.merchant.city || "Ville à préciser"}</p></div>
              <button type="button" onClick={() => setSelectedClient(null)} aria-label="Fermer"><X /></button>
            </header>

            <div className="crm-contact-actions crm-contact-actions--sticky">
              {selectedClient.merchant.email && <a href={`mailto:${selectedClient.merchant.email}`}><Mail /> Écrire</a>}
              <a href={`tel:${selectedClient.merchant.phone}`}><Phone /> Appeler</a>
              <a href={`https://wa.me/${selectedClient.merchant.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
              {selectedClient.merchant.email && <button type="button" onClick={() => void copyValue(selectedClient.merchant.email!, "E-mail")}><Copy /> Copier l’e-mail</button>}
              <button type="button" onClick={() => void copyValue(selectedClient.merchant.phone, "Téléphone")}><Copy /> Copier le numéro</button>
            </div>

            <div className="crm-drawer__body">
              <div className="crm-client-period" aria-label="Période d’activité">
                {([['month', 'Ce mois'], ['30days', '30 jours'], ['year', 'Cette année']] as const).map(([value, label]) => <button type="button" key={value} className={clientPeriod === value ? "is-active" : ""} onClick={() => { setClientPeriod(value); void openClient(selectedClient.merchant.id, value); }}>{label}</button>)}
              </div>
              <section className="crm-client-kpis">
                <article><small>Volume net payé</small><strong>{formatPrice(selectedClient.metrics.netOrderVolumeXof)}</strong></article>
                <article><small>Commandes payées</small><strong>{selectedClient.metrics.paidOrdersCount}</strong></article>
                <article><small>Unités vendues</small><strong>{selectedClient.metrics.paidUnits}</strong></article>
                <article><small>Remboursements</small><strong>{formatPrice(selectedClient.metrics.refundsXof)}</strong></article>
              </section>

              <section className="crm-detail-card">
                <div className="crm-detail-card__heading"><h3>Identité et activité</h3><Store /></div>
                <dl>
                  <div><dt>Contact</dt><dd>{selectedClient.contact?.full_name || "Non renseigné"}</dd></div>
                  <div><dt>Activité</dt><dd>{selectedClient.contact?.business_type || selectedClient.merchant.description || "À préciser"}</dd></div>
                  <div><dt>Adresse</dt><dd>{[selectedClient.merchant.address_hint, selectedClient.merchant.city, selectedClient.merchant.region].filter(Boolean).join(" · ") || "À préciser"}</dd></div>
                  <div><dt>Client depuis</dt><dd>{formatDate(selectedClient.merchant.customer_since)}</dd></div>
                  <div><dt>NINEA</dt><dd>{selectedClient.merchant.ninea || "Non renseigné"}</dd></div>
                  <div><dt>RCCM</dt><dd>{selectedClient.merchant.rccm || "Non renseigné"}</dd></div>
                </dl>
              </section>

              <section className="crm-detail-card">
                <div className="crm-detail-card__heading"><h3>Abonnements</h3><BadgeCheck /></div>
                <div className="crm-subscription-history">
                  {selectedClient.subscriptions.map((subscription) => {
                    const plan = relationOne(subscription.subscription_plans);
                    return <article key={subscription.id}><div><b>{plan?.name ?? subscription.plan_id}</b><small>{subscription.billing_cycle} · début {formatDate(subscription.starts_at)}</small></div><i className="crm-status" data-status={subscription.status}>{subscription.status}</i><small>{subscription.current_period_ends_at ? `Fin de période ${formatDate(subscription.current_period_ends_at)}` : "Période non renseignée"}</small></article>;
                  })}
                </div>
                <div className="crm-value-history">
                  {selectedClient.subscriptionValues.map((value) => <span key={value.id}><b>{formatPrice(value.amount_xof)}</b> · {value.origin.replaceAll("_", " ")} · {formatDate(value.recognized_at)}</span>)}
                </div>
              </section>

              <section className="crm-detail-card">
                <div className="crm-detail-card__heading"><h3>Documents commerçant</h3><FileText /></div>
                <p className="crm-muted">Toutes les versions restent rattachées à ce dossier tant que le compte client existe.</p>
                <div className="crm-client-documents">
                  {Object.entries(selectedClient.documents).map(([type, documents]) => (
                    <section key={type}><h4>{documentTypeLabels[type] ?? type}</h4>{documents.map((document) => (
                      <article key={document.id}><div><b>Version {document.version}</b><small>{formatDate(document.uploaded_at, true)} · {document.mime_type}</small></div><i className="crm-status" data-status={document.status}>{document.status}</i><button type="button" onClick={() => void openClientDocument(document.case_id, document.id)} disabled={busy || document.status === "purged" || !selectedClient.canViewDocuments}><Eye /> {selectedClient.canViewDocuments ? "Consulter" : "Accès restreint"}</button></article>
                    ))}</section>
                  ))}
                  {!Object.keys(selectedClient.documents).length && <p className="crm-muted">Aucun document déposé.</p>}
                </div>
              </section>

              <div className="crm-client-rankings">
                <section className="crm-detail-card"><h3>Produits les plus vendus</h3>{selectedClient.topProducts.map((product) => <article key={product.productId}><span><b>{product.productName}</b><small>{product.units} unités</small></span><strong>{formatPrice(product.revenueXof)}</strong></article>)}{!selectedClient.topProducts.length && <p className="crm-muted">Aucune vente payée sur la période.</p>}</section>
                <section className="crm-detail-card"><h3>Catégories dominantes</h3>{selectedClient.topCategories.map((category) => <article key={category.categoryId}><span><b>{category.categoryName}</b><small>{category.units} unités</small></span><strong>{formatPrice(category.revenueXof)}</strong></article>)}{!selectedClient.topCategories.length && <p className="crm-muted">Aucune catégorie vendue sur la période.</p>}</section>
              </div>

              <section className="crm-detail-card">
                <h3>Commandes récentes</h3>
                <div className="crm-client-orders">{selectedClient.recentOrders.map((order) => <article key={order.id}><span><b>{order.public_code}</b><small>{formatDate(order.created_at, true)} · {order.status.replaceAll("_", " ")}</small></span><strong>{formatPrice(order.total_xof)}</strong><i className="crm-status" data-status={order.payment_status}>{order.payment_status.replaceAll("_", " ")}</i></article>)}</div>
                {!selectedClient.recentOrders.length && <p className="crm-muted">Aucune commande sur cette période.</p>}
              </section>

              {selectedClient.contact && <section className="crm-detail-card"><div className="crm-detail-card__heading"><h3>Notes de suivi</h3><UserRoundCheck /></div><div className="crm-note-list">{[...(selectedClient.contact.crm_lead_notes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((note) => <article key={note.id}><p>{note.body}</p><small>{formatDate(note.created_at, true)}</small></article>)}{!selectedClient.contact.crm_lead_notes?.length && <p className="crm-muted">Aucune note enregistrée.</p>}</div></section>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
