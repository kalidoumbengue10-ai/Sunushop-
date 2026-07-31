# Architecture et portabilité SunuShop

Ce document fixe les conventions du MVP avec un seul projet Supabase Cloud.
L’objectif est de garder une base lisible aujourd’hui et de pouvoir remplacer
PostgreSQL managé, Auth ou Storage séparément plus tard.

## 01. Environnements

| Numéro | Environnement | Données | Usage |
| --- | --- | --- | --- |
| 01 | Supabase local | Démonstration uniquement | Développement, migrations et tests RLS |
| 02 | Supabase Cloud production | Données réelles | Pilote et production |
| 03 | Sauvegarde portable | Chiffrée, hors application | Restauration et migration |

Le projet Cloud n’est jamais utilisé comme environnement de développement. Un
staging Cloud reste une évolution optionnelle et ne nécessite aucun changement
de structure.

## 02. Couches applicatives

| Numéro | Dossier | Responsabilité |
| --- | --- | --- |
| 01 | `lib/domain` | Règles métier, types, validations et transitions |
| 02 | `lib/api` | Authentification serveur, erreurs et sécurité HTTP |
| 03 | `lib/infrastructure/supabase` | Adaptateurs Supabase uniquement |
| 04 | `app/api` | Entrées HTTP validées et orchestration |
| 05 | `components` | Interface utilisateur, sans requête SQL directe |
| 06 | `supabase/migrations` | Schéma, fonctions et politiques versionnées |
| 07 | `scripts` | Administration, sauvegarde et export |

Une règle métier ne doit pas dépendre de `@supabase/supabase-js`. Les composants
React ne lisent pas directement les tables métier. Cette frontière permet de
remplacer un adaptateur sans réécrire le domaine.

## 03. Ordre des migrations

Les migrations existantes sont rejouables dans cet ordre :

| Numéro | Migration | Contenu |
| --- | --- | --- |
| 001 | `202607290001_core_schema.sql` | Types, tables, contraintes et index |
| 002 | `202607290002_domain_functions.sql` | Fonctions métier atomiques |
| 003 | `202607290003_rls_storage.sql` | RLS et sécurité Storage |
| 004 | `202607290004_application_operations.sql` | Opérations d’onboarding et KYC |
| 005 | `202607290005_merchant_catalog_operations.sql` | Catalogue marchand |
| 006 | `202607290006_payments_and_media.sql` | Paiements directs et médias |
| 007 | `202607300001_fix_verification_status_casts.sql` | Correction des enums du parcours KYC |

Conventions obligatoires pour la suite :

1. ne jamais modifier une migration déjà appliquée en production ;
2. créer une nouvelle migration avec un horodatage et un suffixe descriptif ;
3. traiter un seul sujet cohérent par migration ;
4. séparer schéma, données de référence, fonctions et politiques lorsque le
   changement devient volumineux ;
5. ajouter les index et contraintes dans la même livraison que la colonne ou la
   table concernée ;
6. rendre toute migration destructive explicite et précédée d’une sauvegarde ;
7. vérifier la reconstruction depuis zéro avant chaque déploiement.

## 04. Séparation des données

Toutes les données appartenant à une boutique portent `merchant_id`. Les
documents KYC utilisent un bucket privé et un chemin opaque versionné. Les
données de démonstration restent dans `supabase/seed.sql` et ne sont jamais
chargées dans une production contenant des données réelles.

Les catégories suivantes restent séparées :

1. identité et rôles ;
2. vérification documentaire ;
3. catalogue et stock ;
4. livraison ;
5. panier et commandes ;
6. abonnements ;
7. audit, notifications et webhooks.

## 05. Authentification portable

Le profil applicatif et les rôles sont conservés dans PostgreSQL. Aucun rôle
d’autorisation n’est placé dans des métadonnées modifiables par l’utilisateur.
L’identifiant du fournisseur Auth sert uniquement de liaison vers `profiles`.

L’authentification du MVP utilise :

1. email + mot de passe pour clients et marchands ;
2. Resend comme SMTP de Supabase pour la confirmation et la récupération ;
3. numéro de téléphone conservé comme donnée de contact, sans prétendre qu’il
   est vérifié ;
4. TOTP obligatoire pour les administrateurs et reviewers ;
5. SMS, WhatsApp ou connexion Google ajoutables plus tard derrière l’adaptateur
   Auth.

## 06. Export et migration

`npm run export:portable` produit trois exports indépendants :

1. dump PostgreSQL ;
2. liste contrôlée des utilisateurs Auth ;
3. objets Storage avec manifestes et checksums SHA-256.

Une migration future suit cet ordre :

1. geler temporairement les mutations ;
2. générer et chiffrer l’export portable ;
3. restaurer PostgreSQL sur la cible ;
4. copier Storage et vérifier les checksums ;
5. recréer ou relier les identités dans le nouveau fournisseur ;
6. remplacer uniquement les adaptateurs d’infrastructure ;
7. exécuter les tests RLS, métier et E2E ;
8. basculer les variables d’environnement ;
9. rouvrir les mutations après vérification.

## 07. Contrôles avant production

1. reconstruction locale complète avec `npm run supabase:reset` ;
2. tests TypeScript, domaine et migrations ;
3. matrice RLS acheteur, marchand A, marchand B, reviewer et admin ;
4. sauvegarde avant chaque migration distante ;
5. recherche de la clé `service_role` dans le bundle ;
6. test trimestriel de restauration ;
7. inventaire des variables d’environnement et des services externes.
