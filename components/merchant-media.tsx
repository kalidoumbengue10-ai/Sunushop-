"use client";

import { FormEvent, useState } from "react";

export function MerchantMedia({ merchantId }: { merchantId: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    form.set("merchantId", merchantId);
    const response = await fetch("/api/merchant/media", { method: "POST", body: form });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message ?? "Image non enregistrée.");
      return;
    }
    setMessage("La façade de votre boutique a été mise à jour.");
    event.currentTarget.reset();
  };

  return (
    <div className="mvp-card mvp-card--full">
      <h2>Façade digitale</h2>
      <p>Ajoutez un logo carré et une couverture horizontale. Aucun visuel fictif ne sera affiché à leur place.</p>
      {message && <p className="mvp-alert">{message}</p>}
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      <form className="mvp-form" onSubmit={upload}>
        <div className="mvp-form__grid">
          <label className="mvp-field">Type d’image
            <select name="kind"><option value="logo">Logo</option><option value="cover">Couverture</option></select>
          </label>
          <label className="mvp-field">Fichier JPEG, PNG ou WebP
            <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
          </label>
        </div>
        <button className="mvp-button" disabled={busy}>{busy ? "Envoi…" : "Enregistrer l’image"}</button>
      </form>
    </div>
  );
}
