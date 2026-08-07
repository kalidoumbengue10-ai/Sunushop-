"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type StatusPayload = {
  status: string;
  orderBatchId: string | null;
  kind: string;
};

export default function PaiementSuccesPage() {
  return (
    <Suspense
      fallback={
        <div className="mvp-card">
          <h1 className="mvp-title">Confirmation du paiement</h1>
          <p>Vérification de votre paiement en cours…</p>
        </div>
      }
    >
      <PaiementSuccesContent />
    </Suspense>
  );
}

function PaiementSuccesContent() {
  // Page cliente : searchParams se lit via useSearchParams (next/navigation),
  // pas via une prop "searchParams" en Promise — ce contrat n'existe que pour
  // les Server Components et vaut toujours undefined ici, ce qui faisait
  // échouer la lecture de ?ref= alors qu'il était bien présent dans l'URL.
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") ?? undefined;
  const [payload, setPayload] = useState<StatusPayload>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ref) {
      setError("Référence de paiement manquante dans le lien de retour. Si le paiement a été débité, retrouvez-le dans « Mes commandes ».");
    }
  }, [ref]);

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const response = await fetch(`/api/payments/paytech/status?ref=${encodeURIComponent(ref)}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Statut indisponible.");
        if (cancelled) return;
        setPayload(body.data as StatusPayload);
        attempts += 1;
        // Sur mobile, le paiement se termine dans l'app Wave/OM via deep
        // link : le navigateur passe en arrière-plan et les setTimeout y
        // sont ralentis ou suspendus. On complète le comptage par tentatives
        // avec une reprise explicite au retour au premier plan (visibilitychange).
        if (body.data.status === "pending" && attempts < 20) {
          timeoutId = setTimeout(poll, 3000);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Statut indisponible.");
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      // Retour au premier plan (ex. après le paiement dans l'app Wave) :
      // on relance immédiatement une vérification et on réinitialise le
      // compteur de tentatives, sans attendre le prochain setTimeout.
      if (timeoutId) clearTimeout(timeoutId);
      attempts = 0;
      poll();
    };

    poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisible);
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
          met à jour automatiquement — si vous avez terminé le paiement dans
          l’application Wave ou Orange Money, revenez sur cet onglet ou
          actualisez pour voir le résultat.
        </p>
        <div className="mvp-actions">
          <button type="button" className="mvp-button" onClick={() => window.location.reload()}>
            Actualiser
          </button>
          <Link href="/commandes" className="mvp-button mvp-button--secondary">
            Voir mes commandes
          </Link>
        </div>
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
