# Audit des parcours utilisateur et couverture E2E — août 2026

## Cadre

L'audit couvre les capacités déjà exposées aux clients, marchands et livreurs,
depuis la création de leur accès jusqu'à la livraison, aux règlements, litiges
et remboursements. Les tests mutationnels sont réservés à une pile Supabase
locale reconstruite par `npm run test:e2e`. Le runner refuse une application ou
une base distante et supprime la pile locale après le run.

La production a uniquement fait l'objet d'un inventaire en lecture seule. Les
données E2E historiques qui y ont été repérées n'ont pas été supprimées.

## Matrice des parcours

| Rôle | Capacité | Preuve automatisée | Garde principale |
| --- | --- | --- | --- |
| Client | Inscription, connexion, récupération | `auth-password-visibility`, `authenticated-marketplace` | Retour exact vers la page d'origine |
| Client | Recherche, boutique, favoris, panier | `marketplace`, `authenticated-marketplace` | Erreurs visibles, stock autoritatif |
| Client | Checkout retrait/livraison et paiement direct | `checkout-delivery-region`, `payment-cartography` | Idempotence et recalcul serveur |
| Client | Commandes, code, annulation, litige, remboursement | `authenticated-marketplace`, `support-order-context` | Capacités calculées par acteur |
| Marchand | Création boutique, dossier et abonnement | `merchant-signup-steps`, `subscription-gating` | Reprise idempotente |
| Marchand | Produits, variantes, médias et publication | `authenticated-marketplace` + tests de schémas | Quota, archive et historique |
| Marchand | Commandes, paiements et remboursements | `payment-cartography`, API paginée testée unitairement | RBAC et erreurs locales |
| Marchand | Zones, livreurs, offres et règlements | `merchant-location`, `courier-mission-flow` | Une seule livraison active |
| Livreur | Invitation et ouverture directe par lien | `courier-multi-merchant`, `courier-access-responsive` | Lien personnel à usage unique |
| Livreur | Offre, retrait et remise par codes | `courier-mission-flow`, `authenticated-marketplace` | Confidentialité avant acceptation |
| Livreur | Échec et reprogrammation | `courier-mission-flow`, `security-regressions` | Pas d'annulation automatique |
| Livreur | Historique et rémunérations | `courier-mission-flow`, agrégats API | Pagination indépendante des totaux |

## Gaps corrigés dans ce chantier

- isolation stricte des E2E locaux, séparation des scénarios mutationnels et
  responsive, teardown global et vérification de l'absence de reliquats ;
- retours d'authentification client, intention de conversation, filtres de
  recherche, cohérence du panier et des adresses ;
- actions de commande séparées par acteur, permissions marchandes, états
  d'erreur actionnables et catalogue administrable sans perdre l'historique ;
- parcours livreur sur invitation, accès direct sans compte ni PIN visible, identité téléphonique globale, offres
  expirables, réaffectation atomique, reprogrammation après échec, codes et
  statistiques paginées ;
- fidélité masquée dans l'interface tant que ses règles commerciales ne sont pas
  remises en service.

### Détails techniques vérifiés

- `GET /api/merchant/orders` applique recherche, statut, pagination SQL et
  contrôle `owner`/`manager`/`fulfillment`, sans limite silencieuse à 100 ;
- `GET /api/deliveries/mine` conserve `items` et ajoute page, limite, statut et
  agrégats globaux ;
- les offres expirent côté serveur, sont annulables par le marchand et leur
  acceptation/réaffectation est transactionnelle ;
- le téléphone livreur est globalement unique et la migration refuse
  explicitement les doublons historiques ;
- compensation, annulation/contestation de règlement et contestation de
  remboursement utilisent des dialogues accessibles, validés et non des
  `prompt` ;
- les liens publics critiques restent utilisables avant l'initialisation du
  routeur client Next.js.

## Isolation, artefacts et nettoyage

Le lanceur génère un identifiant de run, reconstruit Supabase local, injecte
uniquement ses clés éphémères et refuse toute URL non loopback. Chaque run écrit
traces et captures d'échec dans un sous-dossier distinct afin de ne pas écraser
les artefacts précédents. Après succès, le teardown supprime et recompte les
comptes Auth, profils, marchands, produits, commandes, notifications, leads CRM
et objets Storage, puis le runner arrête Supabase avec `--no-backup`. En cas
d'échec, la pile locale est conservée pour diagnostic ; le run vert final la
supprime.

## Backlog explicitement hors périmètre

- avis vérifiés et workflow de retour produit/logistique inverse ;
- export, suppression de compte et préférences de notification ;
- gestion des collaborateurs et multi-boutique marchand ;
- disponibilité volontaire et modification autonome de l'identité livreur ;
- GPS temps réel, preuve photo, signature et pièces jointes aux litiges.

## Critères de sortie

- `npm run typecheck`, `npm run lint` et le build Next.js 16.2.12 sont verts ;
- 155/155 tests unitaires passent dans 35 fichiers ;
- 136/136 scénarios Playwright passent, avec les mutations exécutées une seule
  fois sur Chromium desktop ;
- contrôles 320 px, 393 px, tablette et 1440 px sans mutation supplémentaire ;
- teardown global vert, zéro compte, boutique, commande ou objet Storage
  résiduel, puis arrêt de Supabase local avec `--no-backup` ;
- aucune mutation du projet Supabase cloud.
