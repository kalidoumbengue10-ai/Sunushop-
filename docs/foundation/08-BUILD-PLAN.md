# SunuShop - Plan de construction

## État actuel

Le dépôt est un prototype Next.js client-side. Il démontre catalogue, panier, livraison, paiement fictif, suivi, messages, profil et tableau marchand. Il n'a ni base de données, ni authentification, ni paiement réel.

La première restructuration isole maintenant:

- Contrats du domaine dans `lib/marketplace/types.ts`.
- Fixtures catalogue dans `lib/marketplace/catalog.ts`.
- Livraison de démonstration dans `lib/marketplace/delivery.ts`.
- Plans d'abonnement dans `lib/marketplace/subscriptions.ts`.
- Machine d'état dans `lib/marketplace/order-status.ts`.
- Recherche et fondations dans `docs/`.

## Phase 0 - Validation, 14 jours

- 15 entretiens vendeurs.
- Démonstrations concierge avec vrais catalogues.
- Test des trois niveaux de prix.
- Dix vendeurs, 200 produits, quinze commandes confirmées.
- Seuil de build: trois vendeurs payants et dix commandes livrées.

## Phase 1 - Fondations techniques

- Base PostgreSQL et migrations.
- Authentification email + mot de passe, confirmation via Resend et téléphone
  conservé comme contact.
- Marchands, membres et RBAC.
- Catalogue, variantes, inventaire et médias.
- Observabilité minimale, environnement local reproductible et staging Cloud
  optionnel lorsque le pilote l’exigera.

## Phase 2 - Transaction

- Quote serveur du panier et de la livraison.
- Commande mono-vendeur en V1.
- Réservation de stock.
- Machine d'état et journal d'événements.
- Suivi par code sécurisé.
- Notifications transactionnelles.

Le panier multi-vendeur peut rester visuel dans le prototype, mais la production V1 doit soit séparer les commandes par vendeur, soit interdire le mélange. Cette décision évite une orchestration paiement/livraison prématurée.

## Phase 3 - Monétisation

- Plans et droits.
- Paiement récurrent ou renouvellement assisté.
- Factures et période de grâce.
- Tableau d'usage vendeur.
- Zéro commission encodé comme politique de plan, pas comme hypothèse implicite.

## Phase 4 - Confiance et opérations

- KYC vendeur.
- Modération catalogue.
- Avis vérifiés.
- Litiges et preuves.
- Zones, partenaires et SLA.
- Score interne de service, puis affichage public après volume suffisant.

## Phase 5 - Croissance

- Pages boutique partageables.
- Import catalogue.
- Liens campagne par canal.
- Cohortes catégorie et région.
- SEO catégorie, boutique et zone.
- Meta Ads après preuve organique.

## Phase 6 - Réseau de livreurs, après le MVP

- Comptes et espace dédiés aux livreurs.
- Attribution d’une livraison et vue des courses actives.
- Code de remise à usage unique pour confirmer la livraison.
- Journal des prises en charge, tentatives et preuves de remise.
- Rémunération du livreur enregistrée comme snapshot sur chaque course.
- Commission SunuShop optionnelle, séparée de la vente des produits et activée
  seulement après validation des règles contractuelles et comptables.
- Vue administrateur des livreurs, courses, montants dus et incidents.

## Qualité gates

Chaque phase doit passer:

- TypeScript strict.
- ESLint sans erreur.
- Build de production.
- Tests de transitions, permissions, calculs et webhooks.
- Parcours clavier et mobile.
- États loading, empty, error et success.
- Budget performance documenté.
- Logs et alertes pour les flux critiques.

## Dette connue

- `app/shop-app.tsx` reste volumineux. Extraire les vues après validation du parcours.
- Les données sont fictives.
- `app/site-header.tsx` et deux documents Kër Ndar semblent hérités d'un autre projet. Ils ne sont pas importés par le parcours SunuShop et doivent être supprimés ou archivés seulement après confirmation de leur propriétaire.
- Le dossier `Sunushop-/` contient un dépôt imbriqué. Ne pas le supprimer sans validation explicite.

## Ordre recommandé

1. Tester le marché.
2. Décider commande mono ou multi-vendeur.
3. Choisir partenaire paiement et livraison.
4. Construire identité, catalogue et commandes.
5. Ajouter abonnement.
6. Ouvrir une cohorte nationale avec SLA par zone.
