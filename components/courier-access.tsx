"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Smartphone } from "lucide-react";
import { SenegalPhoneInput } from "@/components/senegal-phone-input";

type InvitationPreview = {
  displayName: string;
  maskedPhone: string;
  shopName: string;
  location: string;
  expiresAt: string;
  mode: "set_pin" | "enter_pin";
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
    const values = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/courier/access/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, pin: values.get("pin"), pinConfirmation: values.get("pinConfirmation") }),
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
      <p className="courier-access-hint">Accès lié au numéro {preview.maskedPhone}. Aucun formulaire d’inscription ni mot de passe compliqué.</p>
      <form className="mvp-form" onSubmit={activate}>
        <label className="mvp-field">{preview.mode === "set_pin" ? "Choisissez votre PIN à 6 chiffres" : "Votre PIN à 6 chiffres"}<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete={preview.mode === "set_pin" ? "new-password" : "current-password"} required /></label>
        {preview.mode === "set_pin" && <label className="mvp-field">Confirmez le PIN<input name="pinConfirmation" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="new-password" required /></label>}
        <button className="mvp-button courier-access-submit" disabled={busy}><KeyRound aria-hidden="true" />{busy ? "Ouverture…" : preview.mode === "set_pin" ? "Activer et voir mes missions" : "Ouvrir mon espace"}</button>
      </form>
    </>}
    {!preview && !error && <p className="mvp-alert">Vérification du lien…</p>}
    {error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}
  </section>;
}

export function CourierPinLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState("+221");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const pin = String(new FormData(event.currentTarget).get("pin") ?? "");
    try {
      const response = await fetch("/api/courier/access/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, pin }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Connexion impossible.");
      router.replace(payload.data.next); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Connexion impossible."); }
    finally { setBusy(false); }
  };
  return <section className="courier-access-card">
    <div className="courier-access-icon"><KeyRound aria-hidden="true" /></div>
    <span className="mvp-eyebrow">Espace livreur</span><h1>Mes missions</h1>
    <p>Votre téléphone et votre PIN suffisent pour retrouver toutes vos boutiques.</p>
    {error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}
    <form className="mvp-form" onSubmit={submit}>
      <label className="mvp-field">Téléphone<SenegalPhoneInput value={phone} onChange={setPhone} required /></label>
      <label className="mvp-field">PIN à 6 chiffres<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="current-password" required /></label>
      <button className="mvp-button courier-access-submit" disabled={busy}>{busy ? "Connexion…" : "Voir mes missions"}</button>
    </form>
    <p className="courier-access-hint">PIN oublié ? Demandez à l’un de vos marchands de renvoyer votre lien d’accès.</p>
  </section>;
}
