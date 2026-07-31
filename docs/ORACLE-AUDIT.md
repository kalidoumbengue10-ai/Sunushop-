# Dossier ORACLE — SunuShop

## Classification

- Contexte : démonstration fictive.
- Type : application e-commerce connectée, front-office et back-office.
- Audience prioritaire : clients et commerçants au Sénégal.
- Niveau de conscience : solution / offre.
- Action principale : explorer les produits.
- Objection prioritaire : confiance dans le paiement et la livraison.
- Preuve la plus forte : démonstration interactive des parcours.
- Niveau : Connecté.
- Mode : création.

## Promesse et périmètre

SunuShop réunit des commerçants, le prêt-à-porter, l’électronique et l’alimentaire dans une expérience conçue pour le Sénégal. Le prototype montre le panier, un choix de paiement local, le suivi, les notifications, la messagerie, le profil et le dashboard marchand.

La version actuelle ne collecte aucune donnée réelle. Les comptes, paiements, positions, notifications, commandes, prix, chiffres d’affaires et avis sont des données de démonstration.

## Parcours livrés

1. Recherche, filtres et navigation par catégorie.
2. Favoris et ajout au panier.
3. Paiement simulé Wave, Orange Money ou carte.
4. Confirmation et suivi visuel d’une livraison.
5. Messagerie instantanée client-marchand.
6. Connexion réelle par email et mot de passe, avec confirmation via Resend.
7. Profil, préférences et historique des commandes.
8. Dashboard marchand : revenus, commandes, catalogue, stock et ajout de produit.

## Direction visuelle

- Palette : crème, vert profond, terracotta et jaune solaire.
- Typographie : serif éditoriale pour la promesse, sans-serif très lisible pour l’interface.
- Référence : composition e-commerce avec hero partagé, bande de confiance, promotion, catégories et cartes produits.
- ADN conservé : conteneur 1280 px, boutons capsules, rayons généreux, quatre catégories, processus en quatre étapes, surfaces superposées et comportement mobile en carrousel.
- Écart nécessaire : l’ordre exact de la landing sectorielle est adapté au parcours d’achat demandé et à l’interface applicative.

## SEO et publication

- Un seul H1 sur la vue d’accueil.
- Metadata, Open Graph, manifeste, favicon, robots et `llms.txt` présents.
- La démonstration reste `noindex, nofollow`.
- Sitemap vide tant que l’URL et le statut commercial ne sont pas validés.
- Aucun schéma marchand, produit, avis ou offre n’est publié avec des données fictives.

## Conditions avant une vraie mise en ligne

- identité juridique, coordonnées et politiques légales ;
- base de données, authentification et rôles client/marchand/admin ;
- prestataire de paiement compatible et webhooks signés ;
- fournisseur cartographique et données GPS consenties ;
- fournisseur de notifications push et gestion des préférences ;
- stockage média, modération, anti-fraude et support ;
- règles de livraison, zones, commissions, retours et remboursements ;
- tests sécurité, accessibilité, charge et reprise sur incident.

## Vérifications

- `npm run lint` : réussi.
- `npm run build` : réussi.
- rendu desktop 1440 px : contrôlé visuellement.
- rendu mobile : contrôlé visuellement.
- focus visible et réduction des animations : implémentés.
