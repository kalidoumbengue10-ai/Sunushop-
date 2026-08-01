"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type AuthMode = "sign_in" | "sign_up" | "recover";

declare global {
  interface Window {
    sunuShopTurnstile?: (token: string) => void;
    turnstile?: { reset: () => void };
  }
}

export function AuthFlow({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedProfile = searchParams.get("profil");
  const requestedNext = searchParams.get("next");
  const profile =
    requestedProfile === "client" ||
    requestedProfile === "vendeur" ||
    requestedProfile === "partenaire" ||
    requestedProfile === "admin"
      ? requestedProfile
      : requestedNext?.startsWith("/admin")
        ? "admin"
        : "client";
  const profileConfig = {
    client: {
      label: "votre espace client",
      next: "/client",
      description:
        "Retrouvez vos commandes, vos échanges et vos achats en cours.",
    },
    vendeur: {
      label: "votre espace commerçant",
      next: "/marchand",
      description:
        "Pilotez votre boutique, vos produits et vos commandes au même endroit.",
    },
    partenaire: {
      label: "votre espace livraison",
      next: "/partenaires",
      description:
        "Organisez les prises en charge et gardez chaque livraison à jour.",
    },
    admin: {
      label: "l’espace de pilotage",
      next: "/admin/securite",
      description:
        "Suivez les prospects, les commerçants et les opérations prioritaires.",
    },
  }[profile];
  const next =
    profile === "admin"
      ? "/admin/securite"
      : requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : profileConfig.next;
  const requestedMode = searchParams.get("mode");
  const [selectedMode, setMode] = useState<AuthMode>(
    requestedMode === "inscription"
      ? "sign_up"
      : requestedMode === "recuperation"
        ? "recover"
        : "sign_in",
  );
  const mode = profile === "admin" && selectedMode === "sign_up" ? "sign_in" : selectedMode;
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    searchParams.get("message") === "password-updated"
      ? "Votre mot de passe a été modifié. Vous pouvez vous connecter."
      : "",
  );
  const [error, setError] = useState(
    searchParams.get("erreur") === "confirmation"
      ? "Le lien est invalide ou expiré. Demandez un nouvel email."
      : "",
  );

  useEffect(() => {
    window.sunuShopTurnstile = setCaptchaToken;
    return () => {
      delete window.sunuShopTurnstile;
    };
  }, []);

  const resetCaptcha = () => {
    setCaptchaToken(undefined);
    window.turnstile?.reset();
  };

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    setMessage("");
    setError("");
    resetCaptcha();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    if (mode === "sign_up" && password !== passwordConfirmation) {
      setBusy(false);
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    const endpoint = {
      sign_in: "/api/auth/password/sign-in",
      sign_up: "/api/auth/password/sign-up",
      recover: "/api/auth/password/recover",
    }[mode];
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          ...(mode === "recover" ? {} : { password }),
          ...(mode === "sign_up" ? { next } : {}),
          captchaToken,
        }),
      });
      const payload = await response.json().catch(() => null);
      setBusy(false);
      resetCaptcha();

      if (!response.ok) {
        setError(
          payload?.error?.message ??
            "Le serveur n’a pas pu traiter la demande. Réessayez.",
        );
        return;
      }

      if (mode === "recover") {
        setMessage(
          "Si cette adresse correspond à un compte, un lien de récupération vient d’être envoyé par email.",
        );
        return;
      }

      if (mode === "sign_up" && payload?.data?.confirmationRequired) {
        setMessage(
          "Compte créé. Consultez l’email envoyé par SunuShop pour confirmer votre adresse.",
        );
        setMode("sign_in");
        setPassword("");
        setPasswordConfirmation("");
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setBusy(false);
      resetCaptcha();
      setError(
        "Impossible de joindre SunuShop. Vérifiez la connexion puis réessayez.",
      );
    }
  };

  const title = {
    sign_in: "Heureux de vous revoir.",
    sign_up: "Créez votre espace.",
    recover: "Retrouvez l’accès à votre compte.",
  }[mode];

  return (
    <>
      {turnstileSiteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />
      )}
      <section className="mvp-card mvp-card--full auth-card">
        <nav className="auth-profile-tabs" aria-label="Choisir un espace">
          <Link
            href={`/connexion?profil=client&next=/client${mode === "sign_up" ? "&mode=inscription" : ""}`}
            className={profile === "client" ? "is-active" : ""}
          >
            Acheter
          </Link>
          <Link
            href={`/connexion?profil=vendeur&next=/marchand${mode === "sign_up" ? "&mode=inscription" : ""}`}
            className={profile === "vendeur" ? "is-active" : ""}
          >
            Vendre
          </Link>
          <Link
            href={`/connexion?profil=partenaire&next=/partenaires${mode === "sign_up" ? "&mode=inscription" : ""}`}
            className={profile === "partenaire" ? "is-active" : ""}
          >
            Livrer
          </Link>
          <Link
            href="/connexion?profil=admin&next=/admin/securite"
            className={profile === "admin" ? "is-active" : ""}
          >
            Équipe
          </Link>
        </nav>
        <div className="auth-intro">
          <span className="mvp-eyebrow">
            Accès à {profileConfig.label}
          </span>
          <h1 className="mvp-title">{title}</h1>
          <p className="mvp-lede">
            {mode === "recover"
              ? "Saisissez votre adresse email pour recevoir un lien sécurisé."
              : profileConfig.description}
          </p>
          {profile === "admin" && mode !== "recover" && (
            <p className="auth-admin-note">
              Accès réservé à l’équipe autorisée. Une seconde vérification
              protège les décisions sensibles.
            </p>
          )}
        </div>

        {mode !== "recover" && (
          <div
            className="mvp-actions auth-mode-actions"
            aria-label="Connexion ou inscription"
          >
            <button
              type="button"
              className={`mvp-button ${mode === "sign_in" ? "" : "mvp-button--secondary"}`}
              onClick={() => changeMode("sign_in")}
            >
              J’ai déjà un compte
            </button>
            {profile !== "admin" && (
              <button
                type="button"
                className={`mvp-button ${mode === "sign_up" ? "" : "mvp-button--secondary"}`}
                onClick={() => changeMode("sign_up")}
              >
                Je crée mon compte
              </button>
            )}
          </div>
        )}

        {message && <p className="mvp-alert auth-feedback">{message}</p>}
        {error && (
          <p className="mvp-alert mvp-alert--error auth-feedback">{error}</p>
        )}

        <form className="mvp-form auth-form" onSubmit={submit}>
          <label className="mvp-field">
            Adresse email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              required
            />
          </label>

          {mode !== "recover" && (
            <label className="mvp-field">
              Mot de passe
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                minLength={10}
                maxLength={128}
                autoComplete={
                  mode === "sign_up" ? "new-password" : "current-password"
                }
                required
              />
              <small>Au moins 10 caractères.</small>
            </label>
          )}

          {mode === "sign_up" && (
            <label className="mvp-field">
              Confirmer le mot de passe
              <input
                value={passwordConfirmation}
                onChange={(event) =>
                  setPasswordConfirmation(event.target.value)
                }
                type="password"
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
          )}

          {turnstileSiteKey && (
            <div
              className="cf-turnstile"
              data-sitekey={turnstileSiteKey}
              data-callback="sunuShopTurnstile"
            />
          )}

          <button
            className="mvp-button"
            disabled={busy || Boolean(turnstileSiteKey && !captchaToken)}
          >
            {busy
              ? "Un instant…"
              : mode === "sign_in"
                ? "Accéder à mon espace"
                : mode === "sign_up"
                  ? "Créer mon espace"
                  : "Recevoir le lien"}
          </button>

          {mode === "sign_in" && (
            <button
              type="button"
              className="mvp-button mvp-button--secondary"
              onClick={() => changeMode("recover")}
            >
              J’ai oublié mon mot de passe
            </button>
          )}
          {mode === "recover" && (
            <button
              type="button"
              className="mvp-button mvp-button--secondary"
              onClick={() => changeMode("sign_in")}
            >
              Retour à la connexion
            </button>
          )}
          <small>SunuShop ne vous demandera jamais votre mot de passe par email.</small>
        </form>
      </section>
    </>
  );
}
