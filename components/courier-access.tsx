"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Smartphone } from "lucide-react";

type InvitationPreview = {
  displayName: string;
  maskedPhone: string;
  shopName: string;
  location: string;
  expiresAt: string;
};

export function CourierInvitationAccess() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState(() => token ? "" : "Ce lien d’invitation est incomplet.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/courier/access/invitation?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "Invitation introuvable.");
        setPreview(payload.data);
      })
      .catch((caught: Error) => setError(caught.message));
  }, [token]);

  const activate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/courier/access/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Activation impossible.");
      router.replace(payload.data.next);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Activation impossible.");
    } finally { setBusy(false); }
  };

  return <section className="courier-access-card">
    <div className="courier-access-icon"><Smartphone aria-hidden="true" /></div>
    <span className="mvp-eyebrow">Accès livreur SunuShop</span>
    <h1>{preview ? `Bienvenue ${preview.displayName}` : "Ouverture de votre invitation"}</h1>
    {preview && <>
      <p className="courier-access-shop"><strong>{preview.shopName}</strong>{preview.location ? ` · ${preview.location}` : ""} souhaite vous confier des livraisons.</p>
      <p className="courier-access-hint">Accès personnel pour le numéro {preview.maskedPhone}. Aucun compte, aucun mot de passe et aucun document.</p>
      <form className="mvp-form" onSubmit={activate}>
        <button className="mvp-button courier-access-submit" disabled={busy}><Smartphone aria-hidden="true" />{busy ? "Ouverture…" : "Ouvrir ma mission"}</button>
      </form>
    </>}
    {!preview && !error && <p className="mvp-alert">Vérification du lien…</p>}
    {error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}
  </section>;
}

export function CourierAccessHelp() {
  return <section className="courier-access-card">
    <div className="courier-access-icon"><MessageCircle aria-hidden="true" /></div>
    <span className="mvp-eyebrow">Espace livreur</span><h1>Ouvrez le lien WhatsApp</h1>
    <p>Votre marchand vous envoie un lien personnel. Touchez ce lien pour ouvrir directement votre mission.</p>
    <p className="courier-access-hint">Vous n’avez rien à créer ni à mémoriser. Si vous avez perdu le message, demandez simplement un nouveau lien au marchand.</p>
  </section>;
}
