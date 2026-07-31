"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { formatPrice } from "@/lib/marketplace";

type VerificationQueueItem = {
  id: string;
  status: string;
  submitted_at: string | null;
  merchant_accounts:
    | { public_name: string; kind: string; region: string | null; city: string | null }
    | Array<{
        public_name: string;
        kind: string;
        region: string | null;
        city: string | null;
      }>;
};

type VerificationDetail = {
  case: {
    id: string;
    status: string;
    merchant_note: string | null;
  };
  documents: Array<{
    id: string;
    document_type: string;
    version: number;
    status: string;
  }>;
  events: Array<{
    id: number;
    event_type: string;
    public_message: string | null;
    created_at: string;
  }>;
};

type PaymentItem = {
  id: string;
  plan_id: string;
  channel: string;
  external_reference: string;
  amount_xof: number;
  paid_at: string;
  status: string;
  merchant_accounts:
    | { public_name: string }
    | Array<{ public_name: string }>;
};

function relationOne<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

export function AdminWorkspace() {
  const [tab, setTab] = useState<"kyc" | "payments">("kyc");
  const [queue, setQueue] = useState<VerificationQueueItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [selected, setSelected] = useState<VerificationDetail>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadQueue = async () => {
    const response = await fetch("/api/admin/verifications");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message);
    setQueue(payload.data.items as VerificationQueueItem[]);
  };

  const loadPayments = async () => {
    const response = await fetch("/api/admin/subscription-payments");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message);
    setPayments(payload.data.items as PaymentItem[]);
  };

  useEffect(() => {
    // Chargement réseau initial, les mises à jour ont lieu après résolution.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([loadQueue(), loadPayments()]).catch((caught: Error) =>
      setError(caught.message || "Accès administrateur refusé."),
    );
  }, []);

  const openCase = async (id: string) => {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/merchant/verifications/${id}`);
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Dossier inaccessible.");
      return;
    }
    setSelected(payload.data as VerificationDetail);
  };

  const openDocument = async (caseId: string, documentId: string) => {
    setBusy(true);
    const response = await fetch(
      `/api/admin/verifications/${caseId}/documents/${documentId}`,
    );
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Document inaccessible.");
      return;
    }
    window.open(payload.data.url, "_blank", "noopener,noreferrer");
  };

  const decideCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/admin/verifications/${selected.case.id}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome: form.get("outcome"),
          reasonCode: form.get("reasonCode") || undefined,
          merchantMessage: form.get("merchantMessage") || undefined,
          internalNote: form.get("internalNote") || undefined,
        }),
      },
    );
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Décision impossible.");
      return;
    }
    setMessage("Décision KYC enregistrée et auditée.");
    setSelected(undefined);
    await loadQueue();
  };

  const decidePayment = async (id: string, approved: boolean) => {
    const rejectionReason = approved
      ? undefined
      : window.prompt("Motif du rejet du paiement") || undefined;
    if (!approved && !rejectionReason) return;
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/admin/subscription-payments/${id}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved, rejectionReason }),
      },
    );
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Décision impossible.");
      return;
    }
    setMessage(
      approved
        ? "Abonnement activé pour 30 jours."
        : "Paiement rejeté.",
    );
    await loadPayments();
  };

  return (
    <div className="mvp-sidebar-layout">
      <aside className="mvp-sidebar">
        <button
          className={tab === "kyc" ? "is-active" : ""}
          onClick={() => setTab("kyc")}
        >
          Vérifications
        </button>
        <button
          className={tab === "payments" ? "is-active" : ""}
          onClick={() => setTab("payments")}
        >
          Abonnements
        </button>
        <Link href="/admin/securite" className="mvp-button">
          Sécurité MFA
        </Link>
      </aside>
      <section>
        <div className="mvp-card mvp-card--full">
          <span className="mvp-eyebrow">Back-office protégé</span>
          <h1 className="mvp-title">Opérations SunuShop</h1>
          <p className="mvp-lede">
            Chaque consultation documentaire et décision sensible est tracée.
          </p>
          {message && <p className="mvp-alert">{message}</p>}
          {error && (
            <p className="mvp-alert mvp-alert--error">
              {error}{" "}
              {error.toLowerCase().includes("authentification") && (
                <Link href="/admin/securite">Configurer la MFA</Link>
              )}
            </p>
          )}
        </div>

        {tab === "kyc" && (
          <div className="mvp-card mvp-card--full">
            <h2>File de vérification</h2>
            <div className="mvp-list">
              {queue.map((item) => {
                const merchant = relationOne(item.merchant_accounts);
                return (
                  <button
                    className="mvp-row"
                    key={item.id}
                    onClick={() => openCase(item.id)}
                    disabled={busy}
                  >
                    <div>
                      <strong>{merchant?.public_name}</strong>
                      <small>
                        {merchant?.kind} · {merchant?.region} {merchant?.city}
                      </small>
                    </div>
                    <span className="mvp-status" data-status={item.status}>
                      {item.status}
                    </span>
                  </button>
                );
              })}
              {!queue.length && (
                <p className="mvp-empty">Aucun dossier en attente.</p>
              )}
            </div>

            {selected && (
              <>
                <div className="mvp-divider" />
                <h3>Dossier {selected.case.id}</h3>
                <div className="mvp-list">
                  {selected.documents.map((document) => (
                    <div className="mvp-row" key={document.id}>
                      <div>
                        <strong>{document.document_type}</strong>
                        <small>
                          version {document.version} · {document.status}
                        </small>
                      </div>
                      <button
                        className="mvp-button mvp-button--secondary"
                        onClick={() =>
                          openDocument(selected.case.id, document.id)
                        }
                      >
                        Ouvrir 5 min
                      </button>
                    </div>
                  ))}
                </div>
                <form className="mvp-form" onSubmit={decideCase}>
                  <label className="mvp-field">
                    Décision
                    <select name="outcome">
                      <option value="in_review">Prendre en charge</option>
                      <option value="needs_changes">
                        Demander des corrections
                      </option>
                      <option value="approved">Approuver</option>
                      <option value="rejected">Rejeter</option>
                      <option value="suspended">Suspendre</option>
                    </select>
                  </label>
                  <label className="mvp-field">
                    Code motif
                    <input name="reasonCode" placeholder="DOCUMENT_ILLISIBLE" />
                  </label>
                  <label className="mvp-field">
                    Message visible par le marchand
                    <textarea name="merchantMessage" />
                  </label>
                  <label className="mvp-field">
                    Note interne
                    <textarea name="internalNote" />
                  </label>
                  <div className="mvp-actions">
                    <button className="mvp-button" disabled={busy}>
                      Enregistrer la décision
                    </button>
                    <button
                      type="button"
                      className="mvp-button mvp-button--secondary"
                      onClick={() => setSelected(undefined)}
                    >
                      Fermer
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}

        {tab === "payments" && (
          <div className="mvp-card mvp-card--full">
            <h2>Paiements d’abonnement</h2>
            <div className="mvp-list">
              {payments.map((payment) => {
                const merchant = relationOne(payment.merchant_accounts);
                return (
                  <div className="mvp-row" key={payment.id}>
                    <div>
                      <strong>{merchant?.public_name}</strong>
                      <small>
                        {payment.plan_id} · {payment.channel} ·{" "}
                        {payment.external_reference} ·{" "}
                        {formatPrice(payment.amount_xof)}
                      </small>
                    </div>
                    <div className="mvp-actions">
                      <button
                        className="mvp-button"
                        onClick={() => decidePayment(payment.id, true)}
                        disabled={busy}
                      >
                        Approuver
                      </button>
                      <button
                        className="mvp-button mvp-button--danger"
                        onClick={() => decidePayment(payment.id, false)}
                        disabled={busy}
                      >
                        Rejeter
                      </button>
                    </div>
                  </div>
                );
              })}
              {!payments.length && (
                <p className="mvp-empty">Aucun paiement en attente.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
