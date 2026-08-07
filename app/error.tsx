"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mvp-card">
      <h1 className="mvp-title">Une erreur est survenue</h1>
      <p>
        Quelque chose s’est mal passé pendant le chargement de cette page.
        Vous pouvez réessayer, ou revenir à l’accueil si le problème persiste.
      </p>
      <div className="mvp-actions">
        <button type="button" className="mvp-button" onClick={() => reset()}>
          Réessayer
        </button>
        <Link className="mvp-button mvp-button--secondary" href="/">
          Retour à l’accueil
        </Link>
      </div>
    </div>
  );
}
