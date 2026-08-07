"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type StatusPayload = {
  status: string;
  orderBatchId: string | null;
  kind: string;
};

export default function PaiementSuccesPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const [ref, setRef] = useState<string>();
  const [payload, setPayload] = useState<StatusPayload>();
  const [error, setError] = useState("");

  useEffect(() => {
    searchParams.then((params) => setRef(params.ref));
  }, [searchParams]);

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/payments/paytech/status?ref=${encodeURIComponent(ref)}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Statut indisponible.");
        if (cancelled) return;
        setPayload(body.data as StatusPayload);
        attempts += 1;
        if (body.data.status === "pending" && attempts < 20) {
          setTimeout(poll, 3000);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Statut indisponible.");
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [ref]);

  if (error) {
    return (
      <div className="mvp-card">
        <p className="mvp-alert mvp-alert--error">{error}</p>
        <Link href="/marche">Retour au marché</Link>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="mvp-card">
        <h1 className="mvp-title">Confirmation du paiement</h1>
        <p>Vérification de votre paiement en cours…</p>
      </div>
    );
  }

  if (payload.status === "paid") {
    return (
      <div className="mvp-card">
        <h1 className="mvp-title">Paiement confirmé</h1>
        <p>
          Votre paiement a été confirmé par PayTech. Les fonds sont retenus par
          SunuShop jusqu’à ce que vous confirmiez avoir reçu votre commande.
        </p>
        {payload.orderBatchId && (
          <Link className="mvp-button" href="/commandes">
            Voir mes commandes
          </Link>
        )}
      </div>
    );
  }

  if (payload.status === "pending") {
    return (
      <div className="mvp-card">
        <h1 className="mvp-title">Paiement en cours de confirmation</h1>
        <p>
          Nous attendons la confirmation définitive de PayTech. Cette page se
          mettra à jour automatiquement — vous pouvez aussi retrouver votre
          commande plus tard depuis votre espace.
        </p>
        <Link href="/commandes">Voir mes commandes</Link>
      </div>
    );
  }

  return (
    <div className="mvp-card">
      <h1 className="mvp-title">Paiement non confirmé</h1>
      <p>
        Ce paiement n’a pas pu être confirmé ({payload.status}). Aucun montant
        n’a été débité si vous avez annulé l’opération. Réessayez ou contactez
        le service client SunuShop.
      </p>
      <Link href="/panier">Revenir au panier</Link>
    </div>
  );
}
