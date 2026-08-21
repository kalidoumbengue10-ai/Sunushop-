# Exploitation SunuShop

## Environnements

Le MVP utilise un seul projet Supabase Cloud, `sunushop-production`. Le
développement et la validation des migrations se font sur la pile Supabase
locale, qui constitue un environnement jetable et reproductible.

Les parcours Playwright mutationnels se lancent uniquement avec
`npm run test:e2e`. Ce runner récupère directement les clés de la pile locale,
refuse toute URL distante, reconstruit la base et la supprime après les tests ;
il ne modifie jamais `.env.local`.

Cette organisation évite de payer et d’administrer un second projet Cloud sans
mélanger les données de test avec les pièces KYC réelles :

1. `local` : Docker + Supabase CLI, données factices et `supabase/seed.sql` ;
2. `production` : un projet Supabase Cloud, sans données de démonstration ;
3. `preview Vercel` : aucune clé de production permettant des mutations ou la
   lecture de documents KYC ;
4. `staging Cloud` : à créer plus tard seulement si l’équipe, le trafic ou les
   intégrations externes le justifient.

Workflow obligatoire :

1. utiliser le CLI livré dans le projet avec `npx supabase` ;
2. s’authentifier avec `npx supabase login` ;
3. ne lancer `supabase init` que si `supabase/config.toml` n’existe pas ;
4. lier explicitement le projet Cloud avec
   `npx supabase link --project-ref aqeymwwmpfcfidypjixi` ;
5. copier `.env.example` vers `.env.local` et utiliser les clés locales ;
6. démarrer la pile avec `npm run supabase:start` ;
7. reconstruire la base avec `npm run supabase:reset` ;
8. exécuter les tests SQL, RLS et applicatifs localement ;
9. sauvegarder la production avant toute livraison ;
10. vérifier avec `npx supabase db lint --linked` ;
11. prévisualiser avec `npx supabase db push --linked --dry-run` ;
12. appliquer uniquement avec `npx supabase db push --linked` ;
13. synchroniser Auth et les autres réglages versionnés avec
    `npx supabase config push --project-ref aqeymwwmpfcfidypjixi` ;
14. ne jamais exécuter `supabase/seed.sql` sur une production contenant des
    données réelles.

Toutes les opérations Supabase passent par le CLI : schéma, migrations, RLS,
Storage, Auth, secrets, fonctions et configuration. Le tableau de bord n’est
pas utilisé pour effectuer des changements de configuration.

Les variables Vercel sans préfixe `NEXT_PUBLIC_` restent exclusivement côté
serveur. Un second projet Cloud pourra être ajouté sans restructurer le code :
les mêmes migrations seront rejouées dans l’ordre et seules les variables
d’environnement changeront.

## Premier administrateur

L’administrateur doit d’abord créer et confirmer son compte par email depuis
`http://localhost:3000/connexion?mode=inscription&next=/admin/securite`, puis
attribuer le rôle à partir de cette même adresse :

```powershell
$env:ADMIN_EMAIL="adresse-de-l-administrateur@domaine.fr"
$env:ADMIN_ROLE="admin"
npm run admin:bootstrap
```

Le script charge les clés depuis `.env.local`, retrouve l’UUID sans passer par
le tableau de bord et refuse les rôles hors `reviewer`, `support` et `admin`.
L’administrateur termine ensuite l’activation MFA sur
`http://localhost:3000/admin/securite`, puis ouvre
`http://localhost:3000/admin`. La clé serveur ne doit être utilisée que depuis
un poste d’administration contrôlé ou une tâche serveur.

## Auth email avec Resend

La confirmation d’inscription et la récupération du mot de passe sont envoyées
par Supabase Auth au moyen du SMTP Resend. Aucun SDK Resend n’est nécessaire
dans le navigateur et la clé Resend ne doit pas être ajoutée aux variables
`NEXT_PUBLIC_*`.

Configuration actuelle du projet Supabase Cloud :

1. domaine `sunushop.fr` vérifié dans Resend, région `eu-west-1` ;
2. clé `RESEND_API_KEY` conservée uniquement dans `.env.local`, ignoré par Git ;
3. SMTP Resend activé dans `supabase/config.toml` avec `smtp.resend.com`,
   le port `465` et l’utilisateur `resend` ;
4. expéditeur `SunuShop <contact@sunushop.fr>` ;
5. confirmation email obligatoire ;
6. Site URL `https://sunushop.fr` et callback
   `https://sunushop.fr/auth/callback` ;
7. configuration appliquée au projet `aqeymwwmpfcfidypjixi` avec le CLI.
8. callbacks locaux autorisés sur
   `http://localhost:3000/auth/callback` et
   `http://127.0.0.1:3000/auth/callback`.

Avant l’ouverture du pilote :

1. personnaliser les modèles de confirmation et récupération sans information
   utilisateur sensible ;
2. tester inscription, confirmation, récupération et changement de mot de
   passe ;
3. appliquer toute évolution avec
   `npx supabase config push --project-ref aqeymwwmpfcfidypjixi`.

En local, Supabase CLI intercepte les emails dans Inbucket/Mailpit. Le projet
local ne doit pas utiliser la clé Resend de production.

## Déploiement pilote

Avant la collecte de pièces réelles :

- passer le projet Supabase production sur Pro et activer sauvegardes et
  alertes de coût ;
- définir `CRON_SECRET` dans Vercel et Supabase ;
- vérifier que `merchant-verification` est privé ;
- tester une URL signée et confirmer son expiration après cinq minutes ;
- faire les parcours E2E formel, informel, abonnement, panier à deux vendeurs et
  expiration ;
- vérifier qu’aucune clé `service_role` n’apparaît dans `.next/static`.

Les tâches Vercel de `vercel.json` recalculent les abonnements et purgent les
documents arrivés à échéance. La purge ne doit être activée en production
qu’après validation juridique/CDP des durées.

## Sauvegarde et portabilité

Les exports sont écrits sous `reports/portable-export`, ignoré par Git :

```powershell
npm run export:portable
```

L’export comprend le dump PostgreSQL, les utilisateurs Auth contrôlés et les
objets Storage avec manifestes SHA-256. Stocker l’archive dans un coffre chiffré
avec accès restreint, puis supprimer la copie locale.

Test de restauration trimestriel :

1. créer une base PostgreSQL vierge isolée ;
2. restaurer `sunushop.sql` ;
3. comparer les comptes de lignes par table et les contraintes ;
4. recopier les objets avec leur chemin exact et vérifier chaque checksum ;
5. recréer les utilisateurs via l’adaptateur du fournisseur cible, sans
   exporter ni tenter de restaurer les mots de passe ou secrets MFA ;
6. exécuter les tests RLS et les parcours E2E sur la base restaurée.

## Limites d’infrastructure locale

Le workflow local Supabase exige Docker. Sans Docker, les tests TypeScript et
les contrôles statiques SQL restent disponibles, mais les migrations et la
matrice RLS doivent être validées sur une base PostgreSQL isolée restaurée
depuis les migrations avant toute modification du projet de production.
