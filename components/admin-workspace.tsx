"use client";

import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
  Store,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminCrm, type CrmLead } from "@/components/admin-crm";
import { AdminCrmMetrics } from "@/components/admin-crm-metrics";
import { CategoryAdmin } from "@/components/category-admin";
import { MerchantInvitationPanel } from "@/components/merchant-invitation-panel";
import { formatPrice } from "@/lib/marketplace";

type AdminTab = "overview" | "crm" | "verifications" | "subscriptions" | "categories";

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
  external_reference: string;
  amount_xof: number;
  paid_at: string;
  status: string;
  merchant_accounts: { public_name: string } | Array<{ public_name: string }>;
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
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [selected, setSelected] = useState<VerificationDetail>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadQueue = async () => {
    const response = await fetch("/api/admin/verifications");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "Dossiers indisponibles.");
    setQueue(payload.data.items as VerificationQueueItem[]);
  };
  const loadPayments = async () => {
    const response = await fetch("/api/admin/subscription-payments");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "Abonnements indisponibles.");
    setPayments(payload.data.items as PaymentItem[]);
  };
  const loadLeads = async () => {
    const response = await fetch("/api/admin/crm/leads");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "Prospects indisponibles.");
    setLeads(payload.data.items as CrmLead[]);
  };

  useEffect(() => {
    // Chaque module se charge indépendamment pour préserver les accès plus restreints.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.allSettled([loadQueue(), loadPayments(), loadLeads()]).then((results) => {
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length === results.length) {
        setError("Votre espace ne peut pas être chargé pour le moment.");
      }
    });
  }, []);

  const followUps = useMemo(
    () => leads.filter((lead) => lead.next_follow_up_at && !lead.converted_at && new Date(lead.next_follow_up_at) <= new Date()).length,
    [leads],
  );
  const qualified = leads.filter((lead) => ["qualified", "onboarding"].includes(lead.status)).length;

  const openCase = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/merchant/verifications/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Dossier inaccessible.");
      setSelected(payload.data as VerificationDetail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dossier inaccessible.");
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (caseId: string, documentId: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/verifications/${caseId}/documents/${documentId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Document inaccessible.");
      window.open(payload.data.url, "_blank", "noopener,noreferrer");
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
      const response = await fetch(`/api/admin/verifications/${selected.case.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome: form.get("outcome"),
          reasonCode: form.get("reasonCode") || undefined,
          merchantMessage: form.get("merchantMessage") || undefined,
          internalNote: form.get("internalNote") || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Décision impossible.");
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
      const response = await fetch(`/api/admin/subscription-payments/${id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved, rejectionReason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Décision impossible.");
      setMessage(approved ? "L’accès du commerçant est maintenant actif pour 30 jours." : "Le paiement n’a pas été validé.");
      await loadPayments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally {
      setBusy(false);
    }
  };

  const navItems = [
    { id: "overview" as const, label: "Vue d’ensemble", icon: LayoutDashboard },
    { id: "crm" as const, label: "Prospects", icon: UsersRound, badge: leads.filter((lead) => lead.status === "new").length },
    { id: "verifications" as const, label: "Dossiers commerçants", icon: FileCheck2, badge: queue.length },
    { id: "subscriptions" as const, label: "Abonnements", icon: ReceiptText, badge: payments.length },
    { id: "categories" as const, label: "Catégories", icon: Store },
  ];

  const title = {
    overview: ["Vue d’ensemble", "Les priorités du jour, au même endroit."],
    crm: ["Prospects", "Transformez chaque demande en prochaine étape claire."],
    verifications: ["Dossiers commerçants", "Validez les informations avec un parcours lisible et traçable."],
    subscriptions: ["Abonnements", "Activez les accès après confirmation des paiements."],
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
          <div className="admin-topbar__status"><span /><div><b>Services opérationnels</b><small>Dernière synchronisation à l’instant</small></div></div>
        </header>

        {message && <p className="admin-feedback"><CheckCircle2 /> {message}</p>}
        {error && <p className="admin-feedback admin-feedback--error">{error}</p>}

        {tab === "overview" && (
          <div className="admin-overview">
            <section className="admin-hero-card">
              <div><span>À traiter aujourd’hui</span><h2>Faites avancer les bons dossiers.</h2><p>Les nouvelles demandes, les relances et les validations prioritaires sont regroupées pour vous aider à décider rapidement.</p><button type="button" onClick={() => setTab("crm")}>Voir les prospects <ArrowRight /></button></div>
              <div className="admin-hero-card__score"><small>Opportunités en cours</small><strong>{qualified}</strong><span><TrendingUp /> prospects qualifiés</span></div>
            </section>
            <AdminCrmMetrics />
            <section className="admin-stat-grid">
              <article><span className="admin-stat-icon admin-stat-icon--orange"><UsersRound /></span><div><small>NOUVEAUX PROSPECTS</small><strong>{leads.filter((lead) => lead.status === "new").length}</strong><button onClick={() => setTab("crm")}>Ouvrir le suivi</button></div></article>
              <article><span className="admin-stat-icon admin-stat-icon--blue"><CalendarClock /></span><div><small>RELANCES À FAIRE</small><strong>{followUps}</strong><button onClick={() => setTab("crm")}>Voir les échéances</button></div></article>
              <article><span className="admin-stat-icon admin-stat-icon--green"><FileCheck2 /></span><div><small>DOSSIERS À ÉTUDIER</small><strong>{queue.length}</strong><button onClick={() => setTab("verifications")}>Étudier les dossiers</button></div></article>
              <article><span className="admin-stat-icon admin-stat-icon--purple"><ReceiptText /></span><div><small>PAIEMENTS À CONFIRMER</small><strong>{payments.length}</strong><button onClick={() => setTab("subscriptions")}>Vérifier les paiements</button></div></article>
            </section>
            <section className="admin-overview-grid">
              <article className="admin-panel">
                <div className="admin-panel__heading"><div><span className="admin-kicker">Dernières demandes</span><h2>Prospects récents</h2></div><button className="admin-text-button" onClick={() => setTab("crm")}>Tout voir <ArrowRight /></button></div>
                <div className="admin-compact-list">{leads.slice(0, 5).map((lead) => <button key={lead.id} onClick={() => setTab("crm")}><span className="admin-avatar">{lead.business_name.slice(0, 2).toUpperCase()}</span><span><b>{lead.business_name}</b><small>{lead.full_name} · {lead.city || "Ville à préciser"}</small></span><i className="crm-status" data-status={lead.status}>{lead.status === "new" ? "Nouveau" : lead.status === "qualified" ? "Qualifié" : "En suivi"}</i></button>)}{!leads.length && <div className="admin-empty"><UsersRound /><p>Les candidatures reçues depuis le site apparaîtront ici.</p></div>}</div>
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
            <div className="admin-panel__heading"><div><span className="admin-kicker">Accès commerçants</span><h2>Paiements à confirmer</h2><p>Validez le règlement avant d’activer les services du commerce.</p></div><span className="admin-count">{payments.length} en attente</span></div>
            <div className="admin-record-list">{payments.map((payment) => { const merchant = relationOne(payment.merchant_accounts); return <div className="admin-payment-row" key={payment.id}><span className="admin-avatar"><ReceiptText /></span><span><b>{merchant?.public_name}</b><small>{payment.plan_id} · {payment.channel === "wave" ? "Wave" : "Orange Money"} · {payment.external_reference}</small></span><strong>{formatPrice(payment.amount_xof)}</strong><div><button className="admin-primary-button" onClick={() => decidePayment(payment.id, true)} disabled={busy}>Confirmer</button><button className="admin-danger-button" onClick={() => decidePayment(payment.id, false)} disabled={busy}>Refuser</button></div></div>; })}{!payments.length && <div className="admin-empty"><CheckCircle2 /><h3>Aucun paiement en attente</h3><p>Les prochaines demandes apparaîtront ici.</p></div>}</div>
          </section>
        )}
      </main>
    </div>
  );
}
