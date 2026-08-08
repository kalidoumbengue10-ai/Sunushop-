"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartConversationButton({
  merchantId,
  orderId,
  productId,
  subject,
  label = "Contacter la boutique",
  className = "mvp-button mvp-button--secondary",
}: {
  merchantId: string;
  orderId?: string;
  productId?: string;
  subject?: string;
  label?: string;
  className?: string;
}) {
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
        body: JSON.stringify({ kind: "buyer_merchant", merchantId, orderId, productId, subject }),
      });
      if (response.status === 401) {
        router.push(`/connexion?profil=client&next=/messages`);
        return;
      }
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message ?? "Impossible d’ouvrir la conversation.");
        return;
      }
      router.push("/messages");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="start-conversation">
      <button type="button" className={className} onClick={start} disabled={busy}>
        {busy ? "Ouverture…" : label}
      </button>
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
    </div>
  );
}
