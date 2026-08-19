import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { MvpShell } from "@/components/mvp-shell";

export default async function PaymentDeclaredPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <section className="mvp-card mvp-card--full payment-declaration-confirmation">
            <CheckCircle2 aria-hidden="true" size={52} />
            <span className="mvp-eyebrow">Paiement déclaré</span>
            <h1 className="mvp-title">Votre référence a bien été transmise</h1>
            <p className="mvp-lede">
              Le commerçant va vérifier le transfert. Le statut de la commande se mettra à jour automatiquement après sa validation.
            </p>
            <div className="mvp-actions">
              <Link className="mvp-button" href={`/commandes/${id}`}>Retour au suivi de la commande</Link>
              <Link className="mvp-button mvp-button--secondary" href="/client/commandes">Voir toutes mes commandes</Link>
            </div>
          </section>
        </div>
      </main>
    </MvpShell>
  );
}
