"use client";

import { useState } from "react";
import { LogOut, ShieldAlert } from "lucide-react";

export function InvitationAccountSwitch({ currentEmail, invitedEmail }: {
  currentEmail: string;
  invitedEmail: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const switchAccount = async () => {
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/sign-out", { method: "POST" });
    if (!response.ok) {
      setBusy(false);
      setError("La déconnexion a échoué. Ouvrez le lien dans une fenêtre privée.");
      return;
    }
    window.location.reload();
  };

  return (
    <section className="mvp-card mvp-card--full invitation-account-switch">
      <span className="invitation-account-switch__icon"><ShieldAlert /></span>
      <span className="mvp-eyebrow">Invitation marchand</span>
      <h1 className="mvp-title">Changez de compte pour continuer.</h1>
      <p className="mvp-lede">
        Ce navigateur est connecté avec <strong>{currentEmail}</strong>, mais cette invitation est destinée à <strong>{invitedEmail}</strong>.
      </p>
      <p>Déconnectez le compte actuel, puis créez ou ouvrez le compte associé à l’adresse invitée. Le lien sécurisé restera conservé.</p>
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      <button type="button" className="mvp-button" onClick={switchAccount} disabled={busy}>
        <LogOut /> {busy ? "Changement de compte…" : "Utiliser l’adresse invitée"}
      </button>
    </section>
  );
}
