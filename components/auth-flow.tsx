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
      label: "Espace client",
      next: "/client",
      description:
        "Retrouvez vos commandes et poursuivez vos achats avec la même adresse email.",
    },
    vendeur: {
      label: "Espace vendeur",
      next: "/marchand",
      description:
        "Accédez à votre boutique, vos produits et vos commandes.",
    },
    partenaire: {
      label: "Espace partenaire",
      next: "/partenaires",
      description:
        "Rejoignez votre espace de coordination SunuShop.",
    },
    admin: {
      label: "Espace administrateur",
      next: "/admin/securite",
      description:
        "Accédez aux opérations SunuShop après vérification de votre code MFA.",
    },
  }[profile];
  const next =
    profile === "admin"
      ? "/admin/securite"
      : requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : profileConfig.next;
  const requestedMode = searchParams.get("mode");
  const [mode, setMode] = useState<AuthMode>(
    requestedMode === "inscription"
      ? "sign_up"
      : requestedMode === "recuperation"
        ? "recover"
        : "sign_in",
  );
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

  useEffect(() => {
    if (profile === "admin" && mode === "sign_up") {
      setMode("sign_in");
      setPassword("");
      setPasswordConfirmation("");
      setMessage("");
      setError("");
    }
  }, [mode, profile]);

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
    sign_in: "Connectez-vous à SunuShop.",
    sign_up: "Créez votre compte.",
    recover: "Réinitialisez votre mot de passe.",
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
            Client
          </Link>
          <Link
            href={`/connexion?profil=vendeur&next=/marchand${mode === "sign_up" ? "&mode=inscription" : ""}`}
            className={profile === "vendeur" ? "is-active" : ""}
          >
            Vendeur
          </Link>
          <Link
            href={`/connexion?profil=partenaire&next=/partenaires${mode === "sign_up" ? "&mode=inscription" : ""}`}
            className={profile === "partenaire" ? "is-active" : ""}
          >
            Partenaire
          </Link>
          <Link
            href="/connexion?profil=admin&next=/admin/securite"
            className={profile === "admin" ? "is-active" : ""}
          >
            Admin
          </Link>
        </nav>
        <div className="auth-intro">
          <span className="mvp-eyebrow">
            Connexion sécurisée · {profileConfig.label}
          </span>
          <h1 className="mvp-title">{title}</h1>
          <p className="mvp-lede">
            {mode === "recover"
              ? "Saisissez votre adresse email pour recevoir un lien sécurisé."
              : profileConfig.description}
          </p>
          {profile === "admin" && mode !== "recover" && (
            <p className="auth-admin-note">
              Accès réservé aux administrateurs autorisés. Un code à six
              chiffres sera demandé après le mot de passe.
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
              Se connecter
            </button>
            {profile !== "admin" && (
              <button
                type="button"
                className={`mvp-button ${mode === "sign_up" ? "" : "mvp-button--secondary"}`}
                onClick={() => changeMode("sign_up")}
              >
                Créer un compte
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
              ? "Traitement…"
              : mode === "sign_in"
                ? "Se connecter"
                : mode === "sign_up"
                  ? "Créer mon compte"
                  : "Envoyer le lien"}
          </button>

          {mode === "sign_in" && (
            <button
              type="button"
              className="mvp-button mvp-button--secondary"
              onClick={() => changeMode("recover")}
            >
              Mot de passe oublié
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
          <small>
            Les emails de confirmation et de récupération sont acheminés par
            Resend. SunuShop ne vous demandera jamais votre mot de passe par
            email.
          </small>
        </form>
      </section>
    </>
  );
}
