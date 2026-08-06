"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  Copy,
  Download,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

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
  documents: Array<{ document_type: string; status: string; version: number }>;
  caseId: string | null;
};

// Pipeline minimal : deux étapes visibles, adapté à un marché où il faut
// être direct. "rejected"/"archived" restent accessibles via le filtre mais
// n'apparaissent pas dans le pipeline visuel.
const pipelineGroups: Array<{ id: "a_traiter" | "boutique_ouverte"; label: string; statuses: LeadStatus[] }> = [
  { id: "a_traiter", label: "À traiter", statuses: ["new", "contacted", "qualified", "onboarding"] },
  { id: "boutique_ouverte", label: "Boutique ouverte", statuses: ["converted"] },
];

const statusOptions: Array<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "Nouveau" },
  { value: "contacted", label: "Contacté" },
  { value: "qualified", label: "Qualifié" },
  { value: "onboarding", label: "Accompagnement" },
  { value: "converted", label: "Commerçant actif" },
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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [selected, setSelected] = useState<CrmLeadDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [invitationLink, setInvitationLink] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
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
      const response = await fetch(`/api/admin/crm/leads/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Prospect inaccessible.");
      setSelected(payload.data as CrmLeadDetail);
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
      const response = await fetch(`/api/admin/crm/leads/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: form.get("status"),
          priority: form.get("priority"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Mise à jour impossible.");
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
      const response = await fetch(`/api/admin/crm/leads/${selected.id}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Note non enregistrée.");
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
      const response = await fetch("/api/admin/merchant-invitations", {
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Invitation impossible.");
      setInvitationLink(String(payload.data.invitationUrl ?? ""));
      setActionMessage(payload.data.emailSent ? "L’e-mail a été accepté par le serveur de messagerie. Le lien sécurisé est aussi disponible ci-dessous." : "L’accès est créé. L’e-mail sera retenté automatiquement ; utilisez le lien ci-dessous sans attendre.");
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
      const response = await fetch("/api/admin/subscriptions/test-activation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchantId: selected.merchant_id, days: 30 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Activation impossible.");
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
      const response = await fetch(`/api/admin/verifications/${selected.caseId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome: "suspended", reasonCode: "crm_manual_suspend" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Suspension impossible.");
      setActionMessage("La boutique est suspendue. Elle n’est plus visible sur le marché.");
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suspension impossible.");
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
      const response = await fetch(`/api/admin/crm/leads/${selected.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Suppression impossible.");
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
            <button key={lead.id} type="button" className="crm-table__row" onClick={() => openLead(lead.id)} disabled={busy} role="row">
              <span data-label="Commerce"><b>{lead.business_name}</b><small>{lead.business_type || "Activité à préciser"} · {lead.city || "Ville à préciser"}</small></span>
              <span data-label="Contact"><b>{lead.full_name}</b><small>{lead.email}</small></span>
              <span data-label="Étape"><i className="crm-status" data-status={lead.status}>{statusLabel(lead.status)}</i><small>{priorityLabels[lead.priority]}</small></span>
              <span data-label="Reçu le"><b>{formatDate(lead.created_at)}</b><small>Mis à jour {formatDate(lead.updated_at)}</small></span>
              <ChevronRight />
            </button>
          ))}
          {!filtered.length && (
            <div className="crm-empty"><Sparkles /><h3>Aucun prospect dans cette vue</h3><p>Les nouvelles candidatures du site apparaîtront automatiquement ici.</p></div>
          )}
        </div>
      </section>

      {selected && (
        <div className="crm-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <aside className="crm-drawer" role="dialog" aria-modal="true" aria-labelledby="crm-lead-title">
            <header className="crm-drawer__header">
              <div><span className="admin-kicker">Fiche prospect</span><h2 id="crm-lead-title">{selected.business_name}</h2><p>{selected.full_name} · {selected.city || "Ville à préciser"}</p></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Fermer"><X /></button>
            </header>

            <div className="crm-contact-actions">
              <a href={`mailto:${selected.email}`}><Mail /> Écrire</a>
              {selected.phone && <a href={`tel:${selected.phone}`}><Phone /> Appeler</a>}
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
                          <span>{documentTypeLabels[doc.document_type] ?? doc.document_type}</span>
                          <i className="crm-status" data-status={doc.status}>{doc.status}</i>
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
    </div>
  );
}
