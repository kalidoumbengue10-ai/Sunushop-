"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type MerchantSummary = {
  publicName: string;
  kind: "informal" | "formal";
  representativeIsLegalOwner: boolean;
};

export function IntentLetterForm({
  caseId,
  merchant,
  existingDocumentId,
  allowEditing = true,
  onSaved,
  onClose,
}: {
  caseId: string;
  merchant: MerchantSummary;
  existingDocumentId?: string | null;
  allowEditing?: boolean;
  onSaved?: (documentId: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryBirthDate, setSignatoryBirthDate] = useState("");
  const [idType, setIdType] = useState<"cni" | "passeport">("cni");
  const [idNumber, setIdNumber] = useState("");
  const [signatoryRole, setSignatoryRole] = useState(
    merchant.representativeIsLegalOwner ? "Propriétaire" : "Représentant mandaté",
  );
  const [actingFor, setActingFor] = useState<"own_account" | "company_account">(
    merchant.kind === "formal" ? "company_account" : "own_account",
  );
  const [activityDescription, setActivityDescription] = useState("");
  const [signaturePlace, setSignaturePlace] = useState("");
  const [certify, setCertify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [documentId, setDocumentId] = useState(existingDocumentId ?? "");
  const [editing, setEditing] = useState(!existingDocumentId);
  const [downloading, setDownloading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/merchant/verifications/${caseId}/documents/intent-letter`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signatoryName,
          signatoryBirthDate,
          idType,
          idNumber,
          signatoryRole,
          actingFor,
          activityDescription,
          signaturePlace,
          certify,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "La lettre n’a pas pu être enregistrée. Réessayez.");
        return;
      }
      const savedDocumentId = payload?.data?.id ?? "";
      setDocumentId(savedDocumentId);
      if (savedDocumentId) onSaved?.(savedDocumentId);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Impossible de joindre SunuShop. Vérifiez la connexion puis réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (disposition: "view" | "download") => {
    if (!documentId) return;
    setDownloading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/merchant/verifications/${caseId}/documents/${documentId}/download`,
      );
      const payload = (await response.json()) as {
        data?: { url: string; viewUrl: string; downloadUrl: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) {
        setError(payload.error?.message ?? "Le document n’a pas pu être ouvert.");
        return;
      }
      window.open(disposition === "view" ? payload.data.viewUrl : payload.data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Impossible de joindre SunuShop. Vérifiez la connexion puis réessayez.");
    } finally {
      setDownloading(false);
    }
  };

  if (documentId && !editing) {
    return (
      <div className="mvp-card intent-letter-modal">
        <div className="mvp-document__heading">
          <strong>Lettre d’intention enregistrée</strong>
          <button type="button" className="mvp-button mvp-button--secondary" onClick={onClose}>
            <X aria-hidden="true" /> Fermer
          </button>
        </div>
        <p className="mvp-alert">
          Votre lettre d’intention a été générée et ajoutée à votre dossier, avec toutes vos
          informations. Vous pouvez la consulter et la télécharger dès maintenant — c’est
          exactement la version reçue par l’équipe SunuShop.
        </p>
        {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
        <div className="mvp-actions">
          <button type="button" className="mvp-button mvp-button--secondary" disabled={downloading} onClick={() => openDocument("view")}>
            {downloading ? "Ouverture…" : "Voir le PDF"}
          </button>
          <button type="button" className="mvp-button" disabled={downloading} onClick={() => openDocument("download")}>
            Télécharger le PDF
          </button>
          {allowEditing && (
            <button type="button" className="mvp-button mvp-button--secondary" disabled={downloading} onClick={() => setEditing(true)}>
              Modifier la lettre
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mvp-card intent-letter-modal">
      <div className="mvp-document__heading">
        <strong>Remplir la lettre d’intention en ligne</strong>
        <button type="button" className="mvp-button mvp-button--secondary" onClick={onClose} aria-label="Fermer le formulaire">
          <X aria-hidden="true" />
        </button>
      </div>
      <p className="small">
        Les informations de votre boutique « {merchant.publicName} » (adresse, téléphone, NINEA/RCCM
        déjà connus) sont reprises automatiquement dans la lettre. Complétez uniquement les champs
        ci-dessous.
      </p>

      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}

      <form className="mvp-form" onSubmit={submit}>
        <div className="mvp-form__grid">
          <label className="mvp-field">
            Nom complet du signataire
            <input id="intent-signatory-name" name="signatoryName" value={signatoryName} onChange={(event) => setSignatoryName(event.target.value)} required minLength={2} maxLength={120} />
          </label>
          <label className="mvp-field">
            Date de naissance
            <input id="intent-signatory-birth-date" name="signatoryBirthDate" type="date" value={signatoryBirthDate} onChange={(event) => setSignatoryBirthDate(event.target.value)} required />
          </label>
          <label className="mvp-field">
            Type de pièce
            <select id="intent-id-type" name="idType" value={idType} onChange={(event) => setIdType(event.target.value as "cni" | "passeport")}>
              <option value="cni">CNI</option>
              <option value="passeport">Passeport</option>
            </select>
          </label>
          <label className="mvp-field">
            Numéro de pièce
            <input id="intent-id-number" name="idNumber" value={idNumber} onChange={(event) => setIdNumber(event.target.value)} required minLength={4} maxLength={40} />
          </label>
          <label className="mvp-field">
            Qualité (ex. Propriétaire, Gérant)
            <input id="intent-signatory-role" name="signatoryRole" value={signatoryRole} onChange={(event) => setSignatoryRole(event.target.value)} required minLength={2} maxLength={120} />
          </label>
          <label className="mvp-field">
            Vous agissez
            <select id="intent-acting-for" name="actingFor" value={actingFor} onChange={(event) => setActingFor(event.target.value as "own_account" | "company_account")}>
              <option value="own_account">Pour mon propre compte</option>
              <option value="company_account">Pour le compte de l’entreprise</option>
            </select>
          </label>
        </div>

        <label className="mvp-field">
          Activité principale et catégories de produits proposées
          <textarea
            id="intent-activity-description"
            name="activityDescription"
            value={activityDescription}
            onChange={(event) => setActivityDescription(event.target.value)}
            required
            minLength={10}
            maxLength={600}
            rows={4}
          />
        </label>

        <label className="mvp-field">
          Fait à (lieu de signature)
          <input id="intent-signature-place" name="signaturePlace" value={signaturePlace} onChange={(event) => setSignaturePlace(event.target.value)} required minLength={2} maxLength={120} />
        </label>

        <label className="intent-letter-certify">
          <input id="intent-certify" name="certify" type="checkbox" checked={certify} onChange={(event) => setCertify(event.target.checked)} required />
          Je certifie sur l’honneur l’exactitude des déclarations ci-dessus.
        </label>

        <button className="mvp-button" disabled={busy || !certify}>
          {busy ? "Génération en cours…" : "Générer et enregistrer ma lettre d’intention"}
        </button>
      </form>
    </div>
  );
}
