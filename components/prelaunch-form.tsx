"use client";

import { FormEvent, useState } from "react";

export function PrelaunchForm({ categories }: { categories: Array<{ name: string }> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/prelaunch", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactName: form.get("contactName"), shopName: form.get("shopName"), email: form.get("email"),
        phone: form.get("phone"), city: form.get("city") || undefined,
        categories: form.getAll("categories"), message: form.get("message") || undefined,
        consent: form.get("consent") === "on",
      }),
    });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Préinscription impossible.");
    setMessage(payload.data.alreadyKnown ? "Vos informations ont été actualisées." : "Votre demande a bien été transmise à SunuShop.");
    formElement.reset();
  };
  return (
    <section className="mvp-card mvp-card--full" id="preinscription">
      <span className="mvp-eyebrow">Commerçants · Pré-lancement</span>
      <h2>Présentez votre boutique</h2>
      <p>Cette première prise de contact est distincte de la candidature complète et de ses documents.</p>
      {message && <p className="mvp-alert">{message}</p>}{error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      <form className="mvp-form" onSubmit={submit}>
        <div className="mvp-form__grid">
          <label className="mvp-field">Nom et prénom<input name="contactName" required /></label>
          <label className="mvp-field">Nom de la boutique<input name="shopName" required /></label>
          <label className="mvp-field">Email<input name="email" type="email" required /></label>
          <label className="mvp-field">Téléphone<input name="phone" required /></label>
          <label className="mvp-field">Ville<input name="city" /></label>
        </div>
        <fieldset className="mvp-document"><legend>Catégories vendues</legend><div className="mvp-actions">{categories.map((category) => <label key={category.name}><input type="checkbox" name="categories" value={category.name} /> {category.name}</label>)}</div></fieldset>
        <label className="mvp-field">Votre activité<textarea name="message" maxLength={1000} /></label>
        <label><input name="consent" type="checkbox" required /> J’accepte d’être recontacté par SunuShop au sujet de ma boutique.</label>
        <button className="mvp-button" disabled={busy}>{busy ? "Envoi…" : "Envoyer ma préinscription"}</button>
      </form>
    </section>
  );
}
