"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type Branding = { logoUrl: string | null; coverUrl: string | null };

export function MerchantMedia({ merchantId, initialMedia }: { merchantId: string; initialMedia: Branding }) {
  const [media, setMedia] = useState(initialMedia);
  const [kind, setKind] = useState<"logo" | "cover">("logo");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = event.target.files?.[0];
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    try {
      const form = new FormData(event.currentTarget);
      form.set("merchantId", merchantId);
      const response = await fetch("/api/merchant/media", { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "Image non enregistrée.");
      setMedia((current) => ({ ...current, [kind === "logo" ? "logoUrl" : "coverUrl"]: payload.data.publicUrl }));
      setMessage(`${kind === "logo" ? "Le logo" : "La couverture"} de votre boutique a été mis à jour.`);
      event.currentTarget.reset();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setKind("logo");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Image non enregistrée.");
    } finally {
      setBusy(false);
    }
  };

  const selectedUrl = previewUrl ?? (kind === "logo" ? media.logoUrl : media.coverUrl);
  return (
    <div className="mvp-card mvp-card--full">
      <h2>Façade digitale</h2>
      <p>Ajoutez un logo carré et une couverture horizontale, au format JPEG, PNG ou WebP (10 Mo maximum).</p>
      <div className="mvp-form__grid">
        <div><strong>Logo actuel</strong>{media.logoUrl ? <img className="merchant-branding-preview merchant-branding-preview--logo" src={media.logoUrl} alt="Logo actuel de la boutique" /> : <div className="merchant-branding-preview merchant-branding-placeholder">Aucun logo</div>}</div>
        <div><strong>Couverture actuelle</strong>{media.coverUrl ? <img className="merchant-branding-preview merchant-branding-preview--cover" src={media.coverUrl} alt="Couverture actuelle de la boutique" /> : <div className="merchant-branding-preview merchant-branding-placeholder">Aucune couverture</div>}</div>
      </div>
      {message && <p className="mvp-alert" role="status">{message}</p>}
      {error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}
      <form className="mvp-form" onSubmit={upload}>
        <div className="mvp-form__grid">
          <label className="mvp-field">Type d’image
            <select name="kind" value={kind} onChange={(event) => { setKind(event.target.value as "logo" | "cover"); setPreviewUrl(null); }}><option value="logo">Logo</option><option value="cover">Couverture</option></select>
          </label>
          <label className="mvp-field">Fichier JPEG, PNG ou WebP
            <input name="file" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} required />
          </label>
        </div>
        {selectedUrl && <div><strong>{previewUrl ? "Prévisualisation avant envoi" : "Image sélectionnée"}</strong><img className={`merchant-branding-preview merchant-branding-preview--${kind}`} src={selectedUrl} alt={`Prévisualisation ${kind === "logo" ? "du logo" : "de la couverture"}`} /></div>}
        <button className="mvp-button" disabled={busy}>{busy ? "Envoi…" : "Enregistrer l’image"}</button>
      </form>
    </div>
  );
}
