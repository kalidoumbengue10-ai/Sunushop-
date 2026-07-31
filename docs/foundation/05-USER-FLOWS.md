# SunuShop - Parcours utilisateurs

## Découverte et commande

1. L'acheteur arrive par la marketplace ou un lien partagé par un vendeur.
2. Il voit le vendeur, le produit, les variantes, le stock et les conditions.
3. Il ajoute au panier.
4. Il crée son compte ou se connecte par email et mot de passe.
5. Il choisit une zone ou un point de remise.
6. Le serveur recalcule prix, livraison, disponibilité et délai.
7. L'acheteur confirme son téléphone de contact et son adresse.
8. Il choisit le paiement proposé pour cette commande.
9. La commande est confirmée par le vendeur.
10. Les événements de préparation et livraison alimentent le suivi.
11. La réception ouvre l'avis et clôt le délai de service.

## Onboarding vendeur

1. Email confirmé, mot de passe et compte.
2. Identité du responsable et informations de boutique.
3. Catégories et produits autorisés.
4. Zones de remise ou livraison, tarifs et délais.
5. Import de cinq produits pendant l'essai accompagné.
6. Vérification et publication.
7. Partage du lien dans les canaux existants.
8. Première commande accompagnée.
9. Choix du plan avant la fin de l'essai.

## Confirmation de commande

1. Statut `pending_confirmation`.
2. Le vendeur confirme stock et délai.
3. En cas de succès, statut `confirmed`.
4. Sinon, annulation avec motif et déclenchement du flux de remboursement par le prestataire si nécessaire.
5. Toute transition produit un événement immutable avec acteur et horodatage.

## Incident

1. L'acheteur ou le vendeur ouvre un incident depuis la commande.
2. Le type, les preuves et le résultat attendu sont collectés.
3. La commande passe à `disputed` si elle avait été remise au transport.
4. L'équipe autorisée instruit le cas.
5. La résolution ne réécrit pas l'historique; elle ajoute des événements.

## Abonnement vendeur

1. Le vendeur voit usage, limites et prochaine échéance.
2. Il choisit un plan.
3. Le serveur crée la session chez le prestataire.
4. Le webhook signé confirme l'abonnement.
5. Les droits changent de façon idempotente.
6. Un échec de paiement ouvre une période de grâce sans supprimer les données.

## Récupération et erreurs

- Stock changé: recalcul et confirmation explicite.
- Tarif de zone indisponible: bloquer le paiement, proposer remise ou contact.
- Webhook dupliqué: ignorer par clé d'idempotence.
- Paiement inconnu: statut en attente, jamais "payé" côté client seul.
- Livraison en retard: alerte, raison, nouveau délai et canal de recours.
