"use client";

import { FormEvent, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";

export function AdminMfa() {
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("Vérification du niveau de sécurité…");
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getBrowserSupabase();
    const prepareMfa = async () => {
      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) {
        setError(assuranceError.message);
        return;
      }
      if (assurance.currentLevel === "aal2") {
        setStatus("Session renforcée active.");
        return;
      }

      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();
      if (factorsError) {
        setError(factorsError.message);
        return;
      }
      const verifiedFactor = (
        factors.totp as Array<{ id: string; status: string }>
      ).find(
        (factor) => factor.status === "verified",
      );
      if (verifiedFactor) {
        setFactorId(verifiedFactor.id);
        setStatus(
          "Saisissez le code à 6 chiffres de votre application d’authentification.",
        );
        return;
      }
      setStatus("La MFA TOTP est requise pour le back-office.");
    };
    void prepareMfa();
  }, []);

  const enroll = async () => {
    setError("");
    const supabase = getBrowserSupabase();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "SunuShop Admin",
    });
    if (enrollError) {
      setError(enrollError.message);
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setStatus("Scannez le QR code puis saisissez le code à 6 chiffres.");
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const supabase = getBrowserSupabase();
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setError(challengeError.message);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    setStatus("Session renforcée active. Redirection vers le back-office…");
    setQrCode("");
    setCode("");
    window.location.assign("/admin");
  };

  return (
    <section className="mvp-card mvp-card--full">
      <span className="mvp-eyebrow">Sécurité administrative</span>
      <h1 className="mvp-title">Double authentification</h1>
      <p className="mvp-alert">{status}</p>
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      {!factorId && (
        <button className="mvp-button" onClick={enroll}>
          Configurer une application TOTP
        </button>
      )}
      {factorId && (
        <form className="mvp-form" onSubmit={verify}>
          {qrCode && (
            <>
              {/* Supabase fournit une data URL SVG produite par le serveur Auth. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} width="220" height="220" alt="QR code TOTP" />
            </>
          )}
          <label className="mvp-field">
            Code à 6 chiffres
            <input
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              required
            />
          </label>
          <button className="mvp-button" disabled={code.length !== 6}>
            {qrCode ? "Activer la MFA" : "Valider et ouvrir l’administration"}
          </button>
        </form>
      )}
    </section>
  );
}
