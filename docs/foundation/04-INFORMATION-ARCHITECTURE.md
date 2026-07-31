# SunuShop - Architecture de l'information

## Espaces

### Acheteur public

- Accueil
- Catégories
  - Commerçants
  - Prêt-à-porter
  - Électronique
  - Alimentaire
- Résultats de recherche
- Boutique vendeur
- Fiche produit
- Panier
- Livraison et total
- Paiement
- Confirmation
- Suivi
- Messages
- Compte
- Aide, conditions, confidentialité

### Marchand authentifié

- Vue d'ensemble
- Catalogue
- Produits et variantes
- Stock
- Commandes
- Livraison et zones
- Messages
- Avis
- Abonnement et factures
- Équipe et rôles
- Vérification
- Paramètres

### Opérations SunuShop

- Vendeurs et KYC
- Modération catalogue
- Commandes et incidents
- Litiges
- Zones et partenaires de livraison
- Plans et abonnements
- Audit et conformité

## Taxonomie

"Commerçants" est une entrée de navigation vers les boutiques, pas une catégorie de produit. Les catégories produit de premier niveau sont Prêt-à-porter, Électronique et Alimentaire. Le modèle doit permettre d'ajouter d'autres catégories sans modifier le code client.

## Principes de navigation

- Recherche par produit, boutique, catégorie et zone.
- Retour au contexte après authentification.
- Panier et suivi accessibles sur mobile.
- Prix total et délai disponibles avant l'étape paiement.
- État vide utile pour chaque liste.
- Les données de démonstration sont identifiées comme telles.

## Structure du dépôt

```text
app/
  shop-app.tsx            prototype d'interface et orchestration locale
  faq-accordion.tsx       composant interactif ciblé
lib/
  marketplace/
    types.ts              contrats TypeScript
    catalog.ts            fixtures de démonstration
    delivery.ts           options de démonstration
    subscriptions.ts      hypothèses d'offre
    order-status.ts       machine d'état du domaine
    format.ts             formatage partagé
docs/
  foundation/             décisions produit et techniques
  research/sunushop/      recherche canonique et exports
```

La prochaine extraction concerne les vues de `shop-app.tsx`, une par composant. Elle doit intervenir après le test terrain pour éviter de figer trop tôt un prototype encore en validation.
