"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { PasswordInput } from "@/components/password-input";
import { SenegalPhoneInput } from "@/components/senegal-phone-input";
import { DirectDocumentUploader, type VerificationDocumentRow } from "@/components/direct-document-uploader";
import {
  courierDocumentLabels,
  courierVehicleLabels,
  requiredCourierVerificationDocuments,
  type CourierVehicleType,
} from "@/lib/domain/courier-verification";

declare global {
  interface Window {
    sunuShopCourierTurnstile?: (token: string) => void;
    sunuShopCourierTurnstileError?: () => void;
    sunuShopCourierTurnstileExpired?: () => void;
  }
}

export type CourierResumeState = {
  courierId: string;
  caseId: string | null;
  displayName: string;
  phone: string;
  vehicleType: CourierVehicleType | "";
  vehicleRegistration: string;
  email: string;
  verificationStatus: string;
  submitted: boolean;
  documents: VerificationDocumentRow[];
};

type StepId = "profil" | "acces" | "documents";

const stepLabels: Record<StepId, string> = {
  profil: "Mon profil",
  acces: "Mon accès",
  documents: "Mes justificatifs",
};

const stepOrder: StepId[] = ["profil", "acces", "documents"];
const DRAFT_KEY = "sunushop:courier-signup:draft";

type Draft = {
  displayName: string;
  phone: string;
  vehicleType: CourierVehicleType | "";
  vehicleRegistration: string;
};

const emptyDraft: Draft = { displayName: "", phone: "+221", vehicleType: "", vehicleRegistration: "" };

export function CourierSignupWizard({
  turnstileSiteKey,
  resume,
}: {
  turnstileSiteKey?: string;
  resume: CourierResumeState | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>(resume ? "documents" : "profil");
  const [draft, setDraft] = useState<Draft>(() => {
    if (resume) return {
      displayName: resume.displayName,
      phone: resume.phone,
      vehicleType: resume.vehicleType,
      vehicleRegistration: resume.vehicleRegistration,
    };
    if (typeof window === "undefined") return emptyDraft;
    try {
      const stored = window.sessionStorage.getItem(DRAFT_KEY);
      return stored ? { ...emptyDraft, ...JSON.parse(stored) } : emptyDraft;
    } catch {
      return emptyDraft;
    }
  });
  const [email, setEmail] = useState(resume?.email ?? "");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ courierId: string; caseId: string | null } | null>(
    resume ? { courierId: resume.courierId, caseId: resume.caseId } : null,
  );
  const [submitted, setSubmitted] = useState(resume?.submitted ?? false);

  useEffect(() => {
    if (resume) return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // On continue sans brouillon si le stockage est indisponible.
    }
  }, [draft, resume]);

  useEffect(() => {
    window.sunuShopCourierTurnstile = (token) => { setCaptchaToken(token); setError(""); };
    window.sunuShopCourierTurnstileError = () => {
      setCaptchaToken(undefined);
      setError("Le contrôle anti-robot n’a pas pu se charger. Actualisez la page ou désactivez votre bloqueur de contenu.");
    };
    window.sunuShopCourierTurnstileExpired = () => {
      setCaptchaToken(undefined);
      setError("Le contrôle anti-robot a expiré. Validez-le de nouveau.");
    };
    return () => {
      delete window.sunuShopCourierTurnstile;
      delete window.sunuShopCourierTurnstileError;
      delete window.sunuShopCourierTurnstileExpired;
    };
  }, []);

  const stepIndex = stepOrder.indexOf(step);
  const vehicleType = (resume?.vehicleType || draft.vehicleType || "motorbike") as CourierVehicleType;
  const checklist = useMemo(() => requiredCourierVerificationDocuments(vehicleType), [vehicleType]);
  const documentTypes = [...checklist.required, ...checklist.optional];
  const latestByType = useMemo(() => {
    const map = new Map<string, VerificationDocumentRow>();
    for (const document of resume?.documents ?? []) {
      const current = map.get(document.document_type);
      if (!current || current.version < document.version) map.set(document.document_type, document);
    }
    return map;
  }, [resume?.documents]);

  const submitProfil = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStep("acces");
  };

  const submitAcces = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (created) { setStep("documents"); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/livreur/inscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: draft.displayName,
          email,
          password,
          phone: draft.phone,
          vehicleType: draft.vehicleType,
          vehicleRegistration: draft.vehicleRegistration || undefined,
          consent: true,
          captchaToken,
        }),
      });
      const payload = await response.json().catch(() => null);
      setCaptchaToken(undefined);
      window.turnstile?.reset();
      if (!response.ok) {
        setError(payload?.error?.message ?? "L’inscription n’a pas pu être finalisée. Réessayez.");
        return;
      }
      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // Sans conséquence si le stockage est indisponible.
      }
      setCreated({ courierId: payload.data.courierId, caseId: payload.data.caseId });
      setStep("documents");
    } catch {
      setError("Impossible de joindre SunuShop. Vérifiez la connexion puis réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const submitDossier = async () => {
    if (!created?.caseId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/livreur/verifications/${created.caseId}/submit`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Le dossier n’a pas pu être envoyé. Réessayez.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Impossible de joindre SunuShop. Vérifiez la connexion puis réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="merchant-application-layout">
      {turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />}
      <aside className="merchant-application-guide">
        <span className="mvp-eyebrow">Devenir livreur</span>
        <h1>Inscrivez-vous une fois, livrez pour plusieurs boutiques.</h1>
        <p>Aucun email à confirmer. Une fois votre profil vérifié, les commerçants peuvent vous inviter dans leur équipe.</p>
        <ol className="signup-wizard-steps">
          {stepOrder.map((id, index) => (
            <li key={id} data-done={index < stepIndex} data-active={id === step}>
              <button type="button" disabled={!created && index > stepIndex} onClick={() => setStep(id)} aria-current={id === step ? "step" : undefined}>
                <strong>{index < stepIndex ? <Check aria-hidden="true" size={14} /> : index + 1}</strong>
                <span>{stepLabels[id]}</span>
              </button>
            </li>
          ))}
        </ol>
        {created && <button type="button" className="mvp-button mvp-button--secondary" onClick={() => router.push("/marchand?mode=missions")}>Aller à mon espace livreur</button>}
      </aside>

      <section className="mvp-card merchant-application-card">
        {error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}

        {step === "profil" && (
          <>
            <h2>Votre profil livreur</h2>
            <p>Ces informations seront visibles par les commerçants qui souhaitent vous confier des livraisons.</p>
            <form className="mvp-form" onSubmit={submitProfil}>
              <div className="mvp-form__grid">
                <label className="mvp-field">
                  Nom et prénom
                  <input id="courier-name" name="displayName" autoComplete="name" required value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
                </label>
                <label className="mvp-field">
                  Téléphone
                  <SenegalPhoneInput id="courier-phone" required value={draft.phone} onChange={(phone) => setDraft({ ...draft, phone })} />
                </label>
                <label className="mvp-field">
                  Véhicule
                  <select id="courier-vehicle" name="vehicleType" required value={draft.vehicleType} onChange={(e) => setDraft({ ...draft, vehicleType: e.target.value as Draft["vehicleType"] })}>
                    <option value="">Choisir</option>
                    {Object.entries(courierVehicleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
                {draft.vehicleType && draft.vehicleType !== "walking" && draft.vehicleType !== "bicycle" && (
                  <label className="mvp-field">
                    Immatriculation
                    <input id="courier-registration" name="vehicleRegistration" required value={draft.vehicleRegistration} onChange={(e) => setDraft({ ...draft, vehicleRegistration: e.target.value })} />
                  </label>
                )}
              </div>
              <button className="mvp-button" disabled={busy}>Continuer</button>
            </form>
          </>
        )}

        {step === "acces" && (
          <>
            <h2>Votre accès</h2>
            <p>{created ? "Votre compte est déjà créé." : "Aucun email à confirmer : vous accédez tout de suite à votre espace livreur."}</p>
            <form className="mvp-form" onSubmit={submitAcces}>
              <label className="mvp-field">
                Adresse email
                <input id="courier-email" name="email" type="email" autoComplete="email" required readOnly={Boolean(created)} value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              {!created && (
                <label className="mvp-field">
                  Mot de passe
                  <PasswordInput id="courier-password" name="password" aria-label="Mot de passe" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
              )}
              {turnstileSiteKey && !created && (
                <div className="merchant-captcha">
                  <strong>Vérification de sécurité</strong>
                  <p>Cochez le contrôle ci-dessous si Cloudflare vous le demande.</p>
                  <div
                    className="cf-turnstile"
                    data-sitekey={turnstileSiteKey}
                    data-appearance="always"
                    data-theme="light"
                    data-size="normal"
                    data-callback="sunuShopCourierTurnstile"
                    data-error-callback="sunuShopCourierTurnstileError"
                    data-expired-callback="sunuShopCourierTurnstileExpired"
                  />
                  {!captchaToken && !error && <small>Le bouton s’activera après la validation anti-robot.</small>}
                </div>
              )}
              <div className="mvp-actions">
                <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setStep("profil")}>Retour</button>
                <button className="mvp-button" disabled={busy || Boolean(!created && turnstileSiteKey && !captchaToken)}>
                  {created ? "Continuer vers mes justificatifs" : busy ? "Création en cours…" : "Créer mon compte livreur"}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "documents" && created && (
          <>
            <h2>Vos justificatifs</h2>
            {submitted ? (
              <p className="mvp-alert">Votre dossier est envoyé. Dès qu’il sera validé, les commerçants pourront vous inviter à rejoindre leur équipe.</p>
            ) : (
              <p>Votre pièce d’identité est obligatoire{checklist.required.includes("vehicle_registration_document") ? ", ainsi que la carte grise de votre véhicule" : ""}. Vous pouvez continuer plus tard : rien n’est perdu.</p>
            )}
            <div className="mvp-document-grid">
              {documentTypes.map((type) => (
                <DirectDocumentUploader
                  key={type}
                  caseId={created.caseId ?? ""}
                  type={type}
                  label={courierDocumentLabels[type]}
                  required={checklist.required.includes(type)}
                  latest={latestByType.get(type)}
                  basePath="/api/livreur/verifications"
                  bucket="courier-verification"
                />
              ))}
            </div>
            <div className="mvp-actions">
              <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setStep("acces")}>Retour</button>
              <button type="button" className="mvp-button mvp-button--secondary" onClick={() => router.push("/marchand?mode=missions")}>Continuer plus tard</button>
              {!submitted && (
                <button type="button" className="mvp-button" disabled={busy} onClick={submitDossier}>
                  {busy ? "Envoi en cours…" : "Envoyer mon dossier"}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
