"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function InvitationClaim() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState("Validation de votre invitation…");

  useEffect(() => {
    if (!token) {
      // Le jeton provient de l’URL et fixe immédiatement l’état de la page.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("error");
      setMessage("Le lien d’invitation est incomplet.");
      return;
    }
    fetch("/api/invitations/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message);
        setState("done");
        setMessage(
          payload.data.kind === "courier"
            ? "Votre accès livreur est actif."
            : "Votre dossier commerçant est prêt à être complété.",
        );
      })
      .catch((error: Error) => {
        setState("error");
        setMessage(error.message || "Invitation invalide.");
      });
  }, [token]);

  return (
    <section className="mvp-card mvp-card--full">
      <span className="mvp-eyebrow">Invitation SunuShop</span>
      <h1 className="mvp-title">Accès à la boutique</h1>
      <p className={`mvp-alert ${state === "error" ? "mvp-alert--error" : ""}`}>
        {message}
      </p>
      {state === "done" && <Link className="mvp-button" href="/marchand">Ouvrir mon espace</Link>}
      {state === "error" && <Link className="mvp-button" href="/connexion?profil=vendeur&next=/marchand">Se reconnecter</Link>}
    </section>
  );
}
