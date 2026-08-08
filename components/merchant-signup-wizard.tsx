"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { DirectDocumentUploader } from "@/components/direct-document-uploader";
import { IntentLetterForm } from "@/components/intent-letter-form";
import { requiredVerificationDocuments } from "@/lib/domain/verification";

declare global {
  interface Window {
    sunuShopSignupTurnstile?: (token: string) => void;
    sunuShopSignupTurnstileError?: () => void;
    sunuShopSignupTurnstileExpired?: () => void;
    turnstile?: { reset: () => void };
  }
}

type ResumeState = {
  merchantId: string;
  caseId: string | null;
  kind: "informal" | "formal";
  publicName: string;
  representativeIsLegalOwner: boolean;
};

type StepId = "commerce" | "acces" | "identite" | "lettre";

const stepLabels: Record<StepId, string> = {
  commerce: "Mon commerce",
  acces: "Mon accès",
  identite: "Ma pièce d'identité",
  lettre: "Ma lettre d'intention",
};

const stepOrder: StepId[] = ["commerce", "acces", "identite", "lettre"];

const DRAFT_KEY = "sunushop:signup:draft";

type Draft = {
  contactName: string;
  shopName: string;
  phone: string;
  city: string;
  businessType: "informal" | "formal" | "";
  legalName: string;
  salesChannel: string;
  categories: string[];
};

const emptyDraft: Draft = {
  contactName: "",
  shopName: "",
  phone: "",
  city: "",
  businessType: "",
  legalName: "",
  salesChannel: "",
  categories: [],
};

export function MerchantSignupWizard({
  categories,
  turnstileSiteKey,
  resume,
}: {
  categories: Array<{ name: string }>;
  turnstileSiteKey?: string;
  resume: ResumeState | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>(resume ? "identite" : "commerce");
  const [draft, setDraft] = useState<Draft>(() => {
    if (resume || typeof window === "undefined") return emptyDraft;
    try {
      const stored = window.sessionStorage.getItem(DRAFT_KEY);
      return stored ? { ...emptyDraft, ...JSON.parse(stored) } : emptyDraft;
    } catch {
      return emptyDraft;
    }
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ merchantId: string; caseId: string | null } | null>(
    resume ? { merchantId: resume.merchantId, caseId: resume.caseId } : null,
  );
  const [showIntentLetter, setShowIntentLetter] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (resume) return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Idem : on continue sans brouillon si le stockage est indisponible.
    }
  }, [draft, resume]);

  useEffect(() => {
    window.sunuShopSignupTurnstile = (token) => {
      setCaptchaToken(token);
      setError("");
    };
    window.sunuShopSignupTurnstileError = () => {
      setCaptchaToken(undefined);
      setError("Le contrôle anti-robot n’a pas pu se charger. Actualisez la page ou désactivez votre bloqueur de contenu.");
    };
    window.sunuShopSignupTurnstileExpired = () => {
      setCaptchaToken(undefined);
      setError("Le contrôle anti-robot a expiré. Validez-le de nouveau.");
    };
    return () => {
      delete window.sunuShopSignupTurnstile;
      delete window.sunuShopSignupTurnstileError;
      delete window.sunuShopSignupTurnstileExpired;
    };
  }, []);

  const stepIndex = stepOrder.indexOf(step);

  const submitCommerce = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStep("acces");
  };

  const submitAcces = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/marchand/inscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactName: draft.contactName,
          shopName: draft.shopName,
          email,
          password,
          phone: draft.phone,
          city: draft.city || undefined,
          businessType: draft.businessType,
          legalName: draft.legalName || undefined,
          salesChannel: draft.salesChannel,
          categories: draft.categories,
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
      setCreated({ merchantId: payload.data.merchantId, caseId: payload.data.caseId });
      setStep("identite");
    } catch {
      setError("Impossible de joindre SunuShop. Vérifiez la connexion puis réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const finishLater = () => router.push("/marchand");

  const submitDossier = async () => {
    if (!created?.caseId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/merchant/verifications/${created.caseId}/submit`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Le dossier n’a pas pu être envoyé. Réessayez.");
        return;
      }
      setSubmitted(true);
      router.push("/marchand?bienvenue=1");
    } catch {
      setError("Impossible de joindre SunuShop. Vérifiez la connexion puis réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const merchantKind = resume?.kind ?? (draft.businessType || "informal");
  const representativeIsLegalOwner = resume?.representativeIsLegalOwner ?? true;
  const checklist = useMemo(
    () => requiredVerificationDocuments(merchantKind as "informal" | "formal", representativeIsLegalOwner),
    [merchantKind, representativeIsLegalOwner],
  );
  const documentTypes = [...checklist.required, ...checklist.optional].filter((type) => type !== "intent_letter");

  return (
    <section className="merchant-application-layout">
      {turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />}
      <aside className="merchant-application-guide">
        <span className="mvp-eyebrow">Créer ma boutique</span>
        <h1>Ouvrez votre boutique SunuShop en une seule fois.</h1>
        <p>Un seul parcours, sans email à confirmer. Vous vendez dès votre premier paiement d’abonnement.</p>
        <ol className="signup-wizard-steps">
          {stepOrder.map((id, index) => (
            <li key={id} data-done={index < stepIndex} data-active={id === step}>
              <strong>{index < stepIndex ? <Check aria-hidden="true" size={14} /> : index + 1}</strong>
              <span>{stepLabels[id]}</span>
            </li>
          ))}
        </ol>
        {step !== "commerce" && created && (
          <button type="button" className="mvp-button mvp-button--secondary" onClick={finishLater}>
            Continuer plus tard
          </button>
        )}
      </aside>

      <section className="mvp-card merchant-application-card">
        {error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}

        {step === "commerce" && (
          <>
            <h2>Votre commerce</h2>
            <p>Ces informations nous permettent de préparer votre boutique.</p>
            <form className="mvp-form" onSubmit={submitCommerce}>
              <div className="mvp-form__grid">
                <label className="mvp-field">
                  Nom et prénom
                  <input id="signup-contact-name" name="contactName" autoComplete="name" required value={draft.contactName} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} />
                </label>
                <label className="mvp-field">
                  Nom du commerce
                  <input id="signup-shop-name" name="shopName" required value={draft.shopName} onChange={(e) => setDraft({ ...draft, shopName: e.target.value })} />
                </label>
                <label className="mvp-field">
                  Téléphone
                  <input id="signup-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+221 77 000 00 00" required value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                </label>
                <label className="mvp-field">
                  Ville
                  <input id="signup-city" name="city" autoComplete="address-level2" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
                </label>
                <label className="mvp-field">
                  Statut de l’activité
                  <select id="signup-business-type" name="businessType" required value={draft.businessType} onChange={(e) => setDraft({ ...draft, businessType: e.target.value as Draft["businessType"] })}>
                    <option value="">Choisir</option>
                    <option value="informal">Commerçant individuel / activité informelle</option>
                    <option value="formal">Entreprise enregistrée</option>
                  </select>
                </label>
                {draft.businessType === "formal" && (
                  <label className="mvp-field">
                    Raison sociale
                    <input id="signup-legal-name" name="legalName" required value={draft.legalName} onChange={(e) => setDraft({ ...draft, legalName: e.target.value })} />
                  </label>
                )}
              </div>
              <label className="mvp-field">
                Comment vendez-vous aujourd’hui ?
                <input id="signup-sales-channel" name="salesChannel" placeholder="En boutique, WhatsApp, Instagram…" required value={draft.salesChannel} onChange={(e) => setDraft({ ...draft, salesChannel: e.target.value })} />
              </label>
              {categories.length > 0 && (
                <fieldset className="application-category-fieldset">
                  <legend>Catégories de produits</legend>
                  <div className="application-category-grid">
                    {categories.map((category) => (
                      <label key={category.name}>
                        <input
                          name="categories"
                          type="checkbox"
                          checked={draft.categories.includes(category.name)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              categories: e.target.checked
                                ? [...draft.categories, category.name]
                                : draft.categories.filter((name) => name !== category.name),
                            })
                          }
                        />{" "}
                        <span>{category.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <button className="mvp-button">Continuer</button>
            </form>
          </>
        )}

        {step === "acces" && (
          <>
            <h2>Votre accès</h2>
            <p>Aucun email à confirmer : vous accédez tout de suite à votre boutique.</p>
            <form className="mvp-form" onSubmit={submitAcces}>
              <label className="mvp-field">
                Adresse email
                <input id="signup-email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="mvp-field">
                Mot de passe
                <input id="signup-password" name="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              {turnstileSiteKey && (
                <div className="merchant-captcha">
                  <strong>Vérification de sécurité</strong>
                  <p>Cochez le contrôle ci-dessous si Cloudflare vous le demande.</p>
                  <div
                    className="cf-turnstile"
                    data-sitekey={turnstileSiteKey}
                    data-appearance="always"
                    data-theme="light"
                    data-size="normal"
                    data-callback="sunuShopSignupTurnstile"
                    data-error-callback="sunuShopSignupTurnstileError"
                    data-expired-callback="sunuShopSignupTurnstileExpired"
                  />
                  {!captchaToken && !error && <small>Le bouton s’activera après la validation anti-robot.</small>}
                </div>
              )}
              <div className="mvp-actions">
                <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setStep("commerce")}>
                  Retour
                </button>
                <button className="mvp-button" disabled={busy || Boolean(turnstileSiteKey && !captchaToken)}>
                  {busy ? "Création en cours…" : "Créer ma boutique"}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "identite" && created && (
          <>
            <h2>Votre pièce d’identité</h2>
            {resume && (
              <p className="mvp-alert">
                Vous reprenez une boutique déjà créée ({resume.publicName}). Les étapes « Mon commerce » et « Mon accès » sont déjà enregistrées.
              </p>
            )}
            <p>La CNI recto-verso et la preuve d’activité sont obligatoires. Vous pouvez continuer plus tard : rien n’est perdu.</p>
            <div className="mvp-document-grid">
              {documentTypes.map((type) => (
                <DirectDocumentUploader key={type} caseId={created.caseId ?? ""} type={type} required={checklist.required.includes(type)} />
              ))}
            </div>
            <div className="mvp-actions">
              {!resume && (
                <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setStep("acces")}>
                  Retour
                </button>
              )}
              <button type="button" className="mvp-button mvp-button--secondary" onClick={finishLater}>
                Continuer plus tard
              </button>
              <button type="button" className="mvp-button" onClick={() => setStep("lettre")}>
                Continuer
              </button>
            </div>
          </>
        )}

        {step === "lettre" && created?.caseId && (
          <>
            {!showIntentLetter && !submitted && (
              <>
                <h2>Votre lettre d’intention</h2>
                <p>Dernière étape : remplissez votre lettre d’intention en ligne, elle est générée automatiquement.</p>
                <div className="mvp-actions">
                  <button type="button" className="mvp-button mvp-button--secondary" onClick={() => setStep("identite")}>
                    Retour
                  </button>
                  <button type="button" className="mvp-button mvp-button--secondary" onClick={finishLater}>
                    Continuer plus tard
                  </button>
                  <button type="button" className="mvp-button" onClick={() => setShowIntentLetter(true)}>
                    Remplir la lettre d’intention
                  </button>
                </div>
                <p className="small">
                  Vous préférez la remplir à la main ?{" "}
                  <a href="/documents/lettre-intention-sunushop.html" download="Lettre-intention-SunuShop.html">
                    Télécharger le modèle vierge
                  </a>
                  , puis déposez-la depuis l’étape « Ma pièce d’identité » de votre espace marchand.
                </p>
              </>
            )}
            {showIntentLetter && (
              <IntentLetterForm
                caseId={created.caseId}
                merchant={{
                  publicName: resume?.publicName ?? draft.shopName,
                  kind: merchantKind as "informal" | "formal",
                  representativeIsLegalOwner,
                }}
                onClose={() => setShowIntentLetter(false)}
              />
            )}
            {!showIntentLetter && (
              <div className="mvp-document-submit">
                <button className="mvp-button" disabled={busy} onClick={submitDossier}>
                  {busy ? "Envoi en cours…" : "Envoyer mon dossier et accéder à ma boutique"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}
