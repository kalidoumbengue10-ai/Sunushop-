"use client";

import { FormEvent, useEffect, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    sunuShopMerchantTurnstile?: (token: string) => void;
    sunuShopMerchantTurnstileError?: () => void;
    sunuShopMerchantTurnstileExpired?: () => void;
    turnstile?: { reset: () => void };
  }
}

export function MerchantApplicationForm({ categories, turnstileSiteKey }: { categories: Array<{ name: string }>; turnstileSiteKey?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  useEffect(() => {
    window.sunuShopMerchantTurnstile = (token) => { setCaptchaToken(token); setError(""); };
    window.sunuShopMerchantTurnstileError = () => { setCaptchaToken(undefined); setError("Le contrôle anti-robot n’a pas pu se charger. Actualisez la page ou désactivez votre bloqueur de contenu."); };
    window.sunuShopMerchantTurnstileExpired = () => { setCaptchaToken(undefined); setError("Le contrôle anti-robot a expiré. Validez-le de nouveau."); };
    return () => {
      delete window.sunuShopMerchantTurnstile;
      delete window.sunuShopMerchantTurnstileError;
      delete window.sunuShopMerchantTurnstileExpired;
    };
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const response = await fetch("/api/candidatures/marchands", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactName: form.get("contactName"), shopName: form.get("shopName"), email: form.get("email"), phone: form.get("phone"),
        city: form.get("city") || undefined, businessType: form.get("businessType"), salesChannel: form.get("salesChannel"),
        categories: form.getAll("categories"), message: form.get("message") || undefined, consent: form.get("consent") === "on", captchaToken,
      }),
    });
    const payload = await response.json().catch(() => null); setBusy(false); setCaptchaToken(undefined); window.turnstile?.reset();
    if (!response.ok) return setError(payload?.error?.message ?? "La candidature n’a pas pu être envoyée.");
    setMessage(payload.data.alreadyKnown ? "Votre dossier a été actualisé. Notre équipe reviendra vers vous par email." : "Votre candidature est bien arrivée dans notre CRM. Nous l’étudions avant de vous inviter à déposer les justificatifs.");
    formElement.reset();
  };
  return (
    <><>{turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />}</><section className="merchant-application-layout">
      <aside className="merchant-application-guide">
        <span className="mvp-eyebrow">Candidature commerçant</span><h1>Présentez votre commerce à SunuShop.</h1>
        <p>Ce formulaire ouvre votre dossier. Il ne crée pas de compte automatiquement.</p>
        <ol>
          <li><strong>1. Étude du commerce</strong><span>Notre équipe vérifie vos coordonnées et votre activité.</span></li>
          <li><strong>2. Invitation sécurisée</strong><span>Si le dossier est retenu, vous recevez un lien personnel valable 7 jours.</span></li>
          <li><strong>3. Justificatifs</strong><span>Depuis votre espace, vous déposez identité, lettre d’intention et preuves d’activité.</span></li>
        </ol>
        <a className="mvp-button mvp-button--secondary" href="/documents/lettre-intention-sunushop.html" download="Lettre-intention-SunuShop.html">Télécharger la lettre d’intention</a>
        <small>Vous pourrez la remplir, la signer puis la joindre à votre dossier après acceptation initiale.</small>
      </aside>
      <section className="mvp-card merchant-application-card">
        <h2>Votre commerce</h2><p>Ces informations nous permettent d’étudier votre demande.</p>
        {message && <p className="mvp-alert" role="status">{message}</p>}{error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}
        <form className="mvp-form" onSubmit={submit}>
          <div className="mvp-form__grid">
            <label className="mvp-field">Nom et prénom<input name="contactName" autoComplete="name" required /></label>
            <label className="mvp-field">Nom du commerce<input name="shopName" required /></label>
            <label className="mvp-field">Adresse email<input name="email" type="email" autoComplete="email" required /></label>
            <label className="mvp-field">Téléphone<input name="phone" type="tel" inputMode="tel" placeholder="+221 77 000 00 00" required /></label>
            <label className="mvp-field">Ville<input name="city" autoComplete="address-level2" /></label>
            <label className="mvp-field">Statut de l’activité<select name="businessType" required><option value="">Choisir</option><option value="informal">Commerçant individuel / activité informelle</option><option value="formal">Entreprise enregistrée</option></select></label>
          </div>
          <label className="mvp-field">Comment vendez-vous aujourd’hui ?<input name="salesChannel" placeholder="En boutique, WhatsApp, Instagram…" required /></label>
          <fieldset className="mvp-document"><legend>Catégories de produits</legend>{categories.length ? <div className="application-category-grid">{categories.map((category) => <label key={category.name}><input type="checkbox" name="categories" value={category.name} /> <span>{category.name}</span></label>)}</div> : <p className="application-category-empty">Les catégories sont momentanément indisponibles. Vous pouvez préciser vos produits dans la présentation ci-dessous.</p>}</fieldset>
          <label className="mvp-field">Présentez brièvement votre activité<textarea name="message" rows={4} maxLength={1000} placeholder="Produits proposés, ancienneté, zone de clientèle…" /></label>
          <label className="application-consent"><input name="consent" type="checkbox" required /><span>J’accepte que SunuShop utilise ces informations pour étudier ma candidature et me recontacter.</span></label>
          {turnstileSiteKey && <div className="merchant-captcha"><strong>Vérification de sécurité</strong><p>Cochez le contrôle ci-dessous si Cloudflare vous le demande.</p><div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-appearance="always" data-theme="light" data-size="normal" data-callback="sunuShopMerchantTurnstile" data-error-callback="sunuShopMerchantTurnstileError" data-expired-callback="sunuShopMerchantTurnstileExpired" />{!captchaToken && !error && <small>Le bouton d’envoi s’activera après la validation anti-robot.</small>}</div>}
          <button className="mvp-button" disabled={busy || Boolean(turnstileSiteKey && !captchaToken)}>{busy ? "Envoi du dossier…" : turnstileSiteKey && !captchaToken ? "Validez le contrôle ci-dessus" : "Envoyer ma candidature"}</button>
        </form>
      </section>
    </section></>
  );
}
