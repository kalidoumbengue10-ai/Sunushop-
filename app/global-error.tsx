"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="fr">
      <body>
        <div style={{ padding: "2rem", textAlign: "center", fontFamily: "sans-serif" }}>
          <h1>Une erreur est survenue</h1>
          <p>Quelque chose s’est mal passé. Merci de réessayer.</p>
          <button type="button" onClick={() => reset()}>
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
