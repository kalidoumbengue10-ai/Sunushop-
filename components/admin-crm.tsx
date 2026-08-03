"use client";

import {
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Send,
  Sparkles,
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
  crm_tasks: Array<{
    id: string;
    title: string;
    assigned_to: string | null;
    due_at: string | null;
    completed_at: string | null;
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
};

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

function statusLabel(status: LeadStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Non planifié";
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

  const counts = useMemo(
    () => Object.fromEntries(statusOptions.map((option) => [option.value, leads.filter((lead) => lead.status === option.value).length])) as Record<LeadStatus, number>,
    [leads],
  );

  const openLead = async (id: string) => {
    setBusy(true);
    setError("");
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
    const followUp = String(form.get("nextFollowUpAt") || "");
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/crm/leads/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: form.get("status"),
          priority: form.get("priority"),
          nextFollowUpAt: followUp ? new Date(followUp).toISOString() : null,
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

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const dueAt = String(values.get("dueAt") || "");
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/crm/leads/${selected.id}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: values.get("title"),
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Relance non enregistrée.");
      form.reset();
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = async (taskId: string, completed: boolean) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/crm/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Relance non mise à jour.");
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
    setBusy(true); setError(""); setActionMessage("");
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
      setActionMessage(payload.data.emailSent ? "L’accès documents a été envoyé par email." : "L’accès est créé. L’email est placé dans la file de reprise.");
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Commerce", "Contact", "Email", "Téléphone", "Ville", "Activité", "Étape", "Priorité", "Prochaine relance"],
      ...filtered.map((lead) => [
        lead.business_name,
        lead.full_name,
        lead.email,
        lead.phone,
        lead.city,
        lead.business_type,
        statusLabel(lead.status),
        priorityLabels[lead.priority],
        lead.next_follow_up_at ? formatDate(lead.next_follow_up_at, true) : "",
      ]),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`], { type: "text/csv;charset=utf-8" });
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
        {statusOptions.slice(0, 5).map((option) => (
          <button
            key={option.value}
            type="button"
            className={status === option.value ? "is-active" : ""}
            onClick={() => setStatus(status === option.value ? "all" : option.value)}
          >
            <span>{option.label}</span>
            <strong>{counts[option.value]}</strong>
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
            <span>Commerce</span><span>Contact</span><span>Étape</span><span>Relance</span><span />
          </div>
          {filtered.map((lead) => (
            <button key={lead.id} type="button" className="crm-table__row" onClick={() => openLead(lead.id)} disabled={busy} role="row">
              <span data-label="Commerce"><b>{lead.business_name}</b><small>{lead.business_type || "Activité à préciser"} · {lead.city || "Ville à préciser"}</small></span>
              <span data-label="Contact"><b>{lead.full_name}</b><small>{lead.email}</small></span>
              <span data-label="Étape"><i className="crm-status" data-status={lead.status}>{statusLabel(lead.status)}</i><small>{priorityLabels[lead.priority]}</small></span>
              <span data-label="Relance"><b>{lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : "À planifier"}</b><small>Mis à jour {formatDate(lead.updated_at)}</small></span>
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
              {!['converted', 'rejected', 'archived'].includes(selected.status) && <section className="crm-detail-card crm-onboarding-action"><div><span className="admin-kicker">Accès sécurisé</span><h3>Espace de dépôt des documents</h3><p>Envoie ou renvoie le lien permettant de créer le mot de passe. Avant validation KYC, le commerçant ne verra que son dossier.</p></div><button type="button" className="admin-primary-button" onClick={inviteToDocuments} disabled={busy}><Send /> {selected.status === "onboarding" ? "Renvoyer l’accès documents" : "Envoyer l’accès documents"}</button></section>}
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
                <h3>Prochaine étape</h3>
                <div>
                  <label>Étape<select name="status" defaultValue={selected.status}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label>Priorité<select name="priority" defaultValue={selected.priority}><option value="low">À suivre</option><option value="normal">Normale</option><option value="high">Prioritaire</option></select></label>
                </div>
                <label>Prochaine relance<input name="nextFollowUpAt" type="datetime-local" defaultValue={selected.next_follow_up_at?.slice(0, 16) ?? ""} /></label>
                <button className="admin-primary-button" disabled={busy}>Enregistrer le suivi <ArrowUpRight /></button>
              </form>

              <section className="crm-detail-card">
                <div className="crm-detail-card__heading"><h3>Relances</h3><CalendarClock /></div>
                <div className="crm-task-list">
                  {selected.crm_tasks?.map((task) => (
                    <button key={task.id} type="button" className={task.completed_at ? "is-complete" : ""} onClick={() => toggleTask(task.id, !task.completed_at)} disabled={busy}>
                      <span>{task.completed_at ? <Check /> : <CalendarClock />}</span><span><b>{task.title}</b><small>{task.due_at ? formatDate(task.due_at, true) : "Sans échéance"}</small></span>
                    </button>
                  ))}
                </div>
                <form className="crm-inline-form" onSubmit={addTask}><input name="title" required minLength={2} placeholder="Ex. Appeler pour présenter l’offre" /><input name="dueAt" type="datetime-local" /><button disabled={busy}><ClipboardCheck /> Planifier</button></form>
              </section>

              <section className="crm-detail-card">
                <div className="crm-detail-card__heading"><h3>Notes de suivi</h3><UserRoundCheck /></div>
                <form className="crm-note-form" onSubmit={addNote}><textarea name="body" required minLength={2} rows={3} placeholder="Contexte de l’échange, objection, prochaine décision…" /><button className="admin-secondary-button" disabled={busy}>Ajouter la note</button></form>
                <div className="crm-note-list">
                  {[...(selected.crm_lead_notes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((note) => <article key={note.id}><p>{note.body}</p><small>{formatDate(note.created_at, true)}</small></article>)}
                  {!selected.crm_lead_notes?.length && <p className="crm-muted">Aucune note pour le moment.</p>}
                </div>
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
