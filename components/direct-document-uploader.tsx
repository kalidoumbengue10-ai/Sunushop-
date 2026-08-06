"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";
import type { VerificationDocumentType } from "@/lib/domain/verification";

export const documentLabels: Record<VerificationDocumentType, string> = {
  national_id_front: "CNI recto",
  national_id_back: "CNI verso",
  passport_identity: "Page d’identité du passeport",
  intent_letter: "Lettre d’intention signée",
  proof_activity: "Preuve d’activité",
  ninea: "NINEA",
  rccm: "RCCM",
  representative_mandate: "Mandat du représentant",
};

export type VerificationDocumentRow = {
  id: string;
  document_type: VerificationDocumentType;
  version: number;
  status: string;
  uploaded_at: string;
};

export function DirectDocumentUploader({
  caseId,
  type,
  latest,
  required,
}: {
  caseId: string;
  type: VerificationDocumentType;
  latest?: VerificationDocumentRow;
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
