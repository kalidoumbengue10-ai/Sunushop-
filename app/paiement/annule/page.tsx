import Link from "next/link";

export default function PaiementAnnulePage() {
  return (
    <div className="mvp-card">
      <h1 className="mvp-title">Paiement annulé</h1>
      <p>
        Vous avez annulé le paiement, ou celui-ci n’a pas abouti. Aucun montant
        n’a été prélevé. Vous pouvez reprendre votre commande depuis le panier.
      </p>
      <Link className="mvp-button" href="/panier">
        Retour au panier
      </Link>
    </div>
  );
}
