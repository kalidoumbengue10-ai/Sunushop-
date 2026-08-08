"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AideSupportButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "buyer_support" }),
      });
      if (response.status === 401) {
        router.push("/connexion?profil=client&next=/aide");
        return;
      }
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message ?? "Impossible d’ouvrir le support.");
        return;
      }
      router.push("/messages");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="mvp-button" onClick={start} disabled={busy}>
        {busy ? "Ouverture…" : "Discuter avec un admin SunuShop"}
      </button>
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
    </>
  );
}
