"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/password-input";

export function PasswordUpdateForm({ next }: { next?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    const response = await fetch("/api/auth/password/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const payload = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(payload.error?.message ?? "Modification impossible.");
      return;
    }

    router.push(next ?? "/connexion?message=password-updated");
    router.refresh();
  };

  return (
    <section className="mvp-card mvp-card--full">
      <span className="mvp-eyebrow">Sécurité du compte</span>
      <h1 className="mvp-title">Choisissez un nouveau mot de passe.</h1>
      <p className="mvp-lede">
        Utilisez au moins 10 caractères et évitez un mot de passe déjà utilisé
        ailleurs.
      </p>
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      <form className="mvp-form" onSubmit={submit}>
        <label className="mvp-field">
          Nouveau mot de passe
          <PasswordInput
            aria-label="Nouveau mot de passe"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <label className="mvp-field">
          Confirmer le mot de passe
          <PasswordInput
            aria-label="Confirmer le mot de passe"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <button className="mvp-button" disabled={busy}>
          {busy ? "Modification…" : "Enregistrer le mot de passe"}
        </button>
      </form>
    </section>
  );
}
