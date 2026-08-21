# Audit backend SunuShop — août 2026

Audit complet du backend (sécurité + performance + fiabilité sous charge), mené avec le référentiel `backend-orsayn` et complété par des domaines absents de ce référentiel à l'ouverture de l'audit (load testing, concurrence, Realtime à l'échelle, rétention, résilience des appels sortants, migrations). Chaque correctif ci-dessous a été validé par un test qui passe (unitaire, E2E, ou mesure de charge avant/après) — pas seulement par lecture de code.

## Contexte

- Marketplace de livraison (Sénégal), Next.js 16 + Supabase. 127 routes API, 69 tables, 107 policies RLS, 95 fonctions RPC.
- Tests exécutés contre le projet Supabase **cloud de production** (`sunushop-production`) — pas d'instance locale disponible (Docker non démarré). Toute donnée créée par les tests de charge/E2E est préfixée et purgée avec vérification à zéro.
- Aucun outil de charge n'était installé (pas de k6/autocannon/artillery) : un harnais Node natif a été écrit (`scripts/loadtest/`).

## Points forts confirmés (à ne pas régresser)

- RLS activée sur 68/68 tables, avec un test de non-régression statique (`supabase/migrations.test.ts`).
- `set search_path = ''` sur ~116/117 fonctions `security definer`.
- MFA obligatoire (aal2) sur tout `/api/admin`.
- Zéro SQL brut, zéro secret en dur dans le code, zéro spread sur `update`/`insert`.
- Tokens d'invitation hashés + révocation, codes de livraison HMAC avec verrouillage anti-brute-force.
- Rate-limiting en base à clés hashées SHA-256.
- Index trigram GIN sur la recherche produit/boutique.
- Un test E2E RLS direct (clé anon) existait déjà pour le gating d'abonnement — généralisé dans cette session.

## Findings et correctifs

### CRITIQUE

**Secret de repli public sur l'authentification livreur** — [lib/domain/courier-access.ts](../lib/domain/courier-access.ts)
Le secret dérivant le mot de passe technique Supabase Auth des livreurs pouvait retomber sur `DELIVERY_CODE_SECRET`, puis sur une chaîne littérale du dépôt sans garde de production. `COURIER_PIN_SECRET` n'était dans aucun fichier d'environnement.
*Scénario* : sans secret dédié au déploiement, un attaquant connaissant le fallback public pouvait calculer l'e-mail technique (`sha256(téléphone)`) et le mot de passe (`HMAC(secret_public, téléphone:pin)`), puis appeler directement `supabase.auth.signInWithPassword` — hors du rate-limit applicatif (8 tentatives/15 min).
*Correctif* : `COURIER_PIN_SECRET` est désormais le seul secret accepté et devient obligatoire en production (minimum 32 caractères), sans repli sur `DELIVERY_CODE_SECRET`. Il est documenté dans `.env.example` avec note de rotation.
*Preuve* : 4 tests unitaires (`lib/domain/courier-access.test.ts`) couvrent l'absence en production, le secret trop court, la dérivation et le refus explicite d'utiliser `DELIVERY_CODE_SECRET` comme fallback. La base cloud ne contenait aucun membership livreur actif à préserver lors de ce durcissement.

### IMPORTANT

**Injection de métacaractères PostgREST via `region`/`city`/`query`** — [lib/infrastructure/supabase/repositories.ts](../lib/infrastructure/supabase/repositories.ts)
`region` était injecté dans un `.or(...)` construit à la main en n'échappant que la virgule, sans validation de longueur ni de jeu de caractères.
*Correctif* : schémas zod `storefrontQuerySchema`/`searchQuerySchema` avec regex excluant `,()."`, appliqués aux deux routes publiques.
*Preuve* : test unitaire avec le vecteur d'injection réel, **et** vérification en conditions HTTP réelles (`curl` contre le serveur dev pointé sur le cloud) : 400 sur l'injection, 200 sur le trafic légitime. Test E2E dédié (`e2e/security-regressions.spec.ts`).

**Piège `.single()` sur la route de détail de commande (découvert par le test E2E lui-même)** — [app/api/orders/[id]/route.ts](../app/api/orders/[id]/route.ts)
Non identifié en amont ; révélé en écrivant le test IDOR : quand la RLS bloque l'accès à un acheteur non autorisé (0 ligne), `.single()` lève `PGRST116`, remonté en 500 générique au lieu d'un 404.
*Correctif* : `.maybeSingle()` + vérification explicite `!order → 404`, avant de lancer les requêtes dépendantes.
*Preuve* : `e2e/security-regressions.spec.ts` — IDOR entre deux acheteurs réels, commande inexistante, contenu de la commande d'autrui jamais exposé.

**Vitrine publique : `merchant_media` chargée intégralement à chaque affichage + p95 de plusieurs secondes** — [app/api/storefront/route.ts](../app/api/storefront/route.ts), [lib/infrastructure/supabase/repositories.ts](../lib/infrastructure/supabase/repositories.ts)
La route la plus visitée du site faisait jusqu'à 3 requêtes séquentielles (produits paginés avec `count: exact` sur jointure, puis deux requêtes de filtrage `orderable` après coup).
*Correctif* : `merchant_media` filtrée par `merchantIds` de la page ; filtrage `orderable` et comptage fusionnés dans une RPC SQL unique (`storefront_catalog_page_product_ids`, migration `202608230004`), sur le même modèle que `nearby_storefront_product_ids` déjà existante.
*Preuve mesurée (charge, 4 req/s, 15 s)* :

| Métrique | Avant | Après |
|---|---|---|
| p50 | 535 ms | 580 ms |
| **p95** | **4823 ms** | **717 ms** |
| p99 | 5393 ms | 940 ms |

Stress test (2→20 req/s) confirmé sans erreur dans les deux cas, avec une queue de latence systématiquement plus courte après correctif (p99 : 1971 ms → 1487 ms).

**Trois crons sur quatre sans `LIMIT`, aucun sans `maxDuration`** — [app/api/cron/abandoned-carts](../app/api/cron/abandoned-carts/route.ts), [app/api/cron/subscriptions](../app/api/cron/subscriptions/route.ts), [document_retention_candidates](../supabase/migrations/202608230001_cron_bounded_operations.sql)
Au-delà d'un certain volume, ces crons dépassent le timeout et cessent silencieusement de traiter quoi que ce soit.
*Correctif* : agrégation `abandoned-carts` déplacée en RPC SQL bornée (`mark_abandoned_carts`) ; comptage multi-lignes fiabilisé avec `GET DIAGNOSTICS ROW_COUNT` ; transitions d'abonnement bornées par lots de 1 000 ; génération des e-mails déplacée dans une RPC SQL qui applique la déduplication avant le `LIMIT` ; `LIMIT` ajouté à `document_retention_candidates` ; `maxDuration` déclaré sur les 4 crons + le nouveau cron de rétention.
*Preuve* : les 5 routes cron appelées avec le vrai `CRON_SECRET` contre le cloud, toutes 200. Un E2E additionnel marque exactement deux paniers dans un même lot et démontre qu'un abonnement déjà dédupliqué n'affame pas le suivant.

**Outbox de notifications sans claim atomique** — [app/api/cron/notifications/route.ts](../app/api/cron/notifications/route.ts)
`select` puis `update status='processing'` en deux requêtes séparées : deux exécutions chevauchantes (probable dès que Resend ralentit, cron toutes les 5 min) pouvaient traiter la même notification deux fois.
*Correctif* : RPC `claim_notification_outbox` (`for update skip locked`), select et update dans la même transaction, lots plafonnés à 10 et envoi avec une concurrence de 5. Un bail `processing_started_at` permet de reprendre après 2 minutes un worker interrompu ; chaque envoi utilise une clé d'idempotence stable `outbox/<id>` chez le fournisseur.
*Preuve la plus forte de cette session* : deux appels `Promise.all` strictement simultanés sur la RPC cloud ont réclamé deux lots de 10 lignes **strictement disjoints** — zéro chevauchement — puis une ligne placée sous bail expiré a été récupérée. Les 624 anciens e-mails `pending`/`failed` ont été placés en quarantaine récupérable (`suppressed_at`, motif `pre_reliability_deploy_backlog`) : 0 e-mail historique restait éligible après migration, tandis que les 10 notifications `in_app` ont été conservées.

**Realtime : deux abonnements sans filtre, fanout sur toute la plateforme** — [components/courier-workspace.tsx](../components/courier-workspace.tsx)
`delivery_disputes` et `courier_payouts` étaient abonnés sans clause `filter`, alors que les deux tables portent `courier_membership_id` comme `deliveries` (déjà filtrée). Chaque livreur connecté recevait les événements de tous les livreurs de la plateforme.
*Correctif* : filtre `courier_membership_id=in.(...)` ajouté aux deux abonnements.
Complément (`components/courier-manager.tsx`) : 5 abonnements déclenchant chacun un rechargement complet (4 endpoints) — debounce ajouté (coalescence sur 800 ms).

**Aucun timeout sur les appels sortants** — [lib/notifications/email.ts](../lib/notifications/email.ts), [lib/api/security.ts](../lib/api/security.ts)
Resend et Turnstile n'avaient pas de `AbortSignal.timeout`, contrairement à OpenRouteService (8 s, exemplaire). 7 routes envoient un email en synchrone.
*Correctif* : timeout 8 s sur Resend, 5 s sur Turnstile (chemin critique d'inscription).

**Tables techniques sans rétention** — `rate_limit_buckets`, `webhook_events`
Croissance non bornée, jamais purgées.
*Correctif* : fonctions `purge_expired_rate_limit_buckets` et `purge_processed_webhook_events` (bornées par `LIMIT`), nouveau cron `/api/cron/data-retention` (02:30 quotidien). `audit_events` délibérément exclu (piste d'audit, jamais purgée — décision confirmée avec l'utilisateur).
*Preuve mesurée* : premier passage de purge contre le cloud, **922 lignes expirées supprimées** de `rate_limit_buckets`.

**Helper de comparaison constant-time dupliqué 4 fois**
`timingSafeEqual` réimplémenté séparément dans `lib/api/cron.ts`, `app/api/crm/leads/ingest/route.ts`, `app/api/webhooks/resend/route.ts`, `lib/domain/delivery-code.ts`.
*Correctif* : helper unique `lib/api/constant-time.ts`, les 4 sites l'importent. Testé unitairement (égalité, inégalité même longueur, longueurs différentes, tampon vide).

### MINEUR (corrigé)

- `orders/[id]/delivery-code/resend` : rate-limit ajouté (5/15 min par acheteur) — coût email + renouvellement de code à volonté auparavant non borné.
- `merchant/analytics` : période bornée à 400 jours (zod) + rate-limit (20/min par marchand) — agrégation JS jusqu'à 15 000 lignes par appel, sans plafond ni coût de rappel.
- `RESEND_WEBHOOK_SECRET` documenté dans `.env.example` (absent, webhook silencieusement fail-closed).

### MINEUR (documenté, non corrigé dans cette session)

- Pas de CI (lint/typecheck/test non automatisés) — hors périmètre backend strict.
- `supabase/migrations.test.ts` fragile (assertions sur chaînes littérales, y compris des commentaires) — détecte les suppressions, pas les régressions sémantiques.
- Pagination par `.limit()` fixe sur plusieurs listes admin/marchand (200-5000) sans curseur — acceptable au volume actuel, à revisiter si le volume de commandes/paiements grandit significativement.

## Hors périmètre de cet audit

Sept échecs relevés en lançant la suite E2E complète (`access-menu`, `authenticated-marketplace`, `marketplace`, `merchant-location`, `merchant-signup-steps`, `payment-cartography`, `support-messaging`) sont **antérieurs à cette session** et relèvent de la refonte UI du parcours livreur en cours par ailleurs (page de commande, menu de connexion, carte MapLibre, formulaire d'inscription, messagerie support). Vérifié explicitement par isolation : un test rejoué à l'identique sans les correctifs de cet audit échoue exactement au même point.

## Outillage livré

- `scripts/loadtest/runner.mjs` — charge/stress/endurance sans dépendance externe, garde-fous (plafond débit, arrêt auto sur taux d'erreur).
- `scripts/loadtest/cleanup.mjs` — purge par préfixe `loadtest-<runId>` avec vérification post-purge à zéro.
- `e2e/security-regressions.spec.ts` — 5 tests : IDOR (RLS directe), commande inexistante, injection PostgREST (route réelle), brute-force PIN livreur.
- `e2e/backend-reliability.spec.ts` — 3 tests cloud : traitement multi-lignes des paniers, claims d'outbox concurrents + reprise de bail, déduplication des notifications d'abonnement avant la limite du lot.
- `lib/domain/courier-access.test.ts`, `lib/domain/schemas.test.ts`, `lib/api/constant-time.test.ts` — régressions unitaires sur C1, I1, M1, M3.

## Skill backend-orsayn enrichi

6 nouveaux sous-skills créés dans `backend-orsayn` (Desktop + hermes, synchronisés), chacun adossé à un finding réel de cet audit et à un test qui passe : `load-testing-capacity`, `concurrency-jobs-outbox`, `realtime-subscriptions-scale`, `data-retention-growth`, `resilience-outbound-calls`, `migrations-zero-downtime`. Le skill maître et l'orchestration d'audit ont été mis à jour (14 sous-skills, incohérences de comptage corrigées, ligne marketplace ajoutée à la matrice d'adaptation).

## Vérification

```bash
npm run typecheck && npm run lint && npm test    # 137 tests unitaires, 31 fichiers, tous verts
npx playwright test e2e/backend-reliability.spec.ts --project=chromium-desktop    # 3/3
npx playwright test e2e/security-regressions.spec.ts --project=chromium-desktop   # 5/5
npx playwright test e2e/subscription-gating.spec.ts --project=chromium-desktop    # RLS 4 couches, verte
node scripts/loadtest/runner.mjs --scenario=stress --route="/api/storefront?limit=24" --start-rps=2 --max-rps=20 --step-seconds=8
node scripts/loadtest/cleanup.mjs --all-loadtest --dry-run   # confirme 0 donnée résiduelle
```

## État du déploiement au 21 août 2026

- Migration Supabase `202608230005_backend_audit_reliability_followup.sql` appliquée avec succès au projet cloud et confirmée dans l'historique distant.
- Contrôle post-migration : 624 e-mails historiques en quarantaine récupérable, 0 e-mail historique éligible, 10 notifications `in_app` intactes, 0 ligne bloquée en `processing`.
- Contrôle post-E2E : 0 marchand, notification outbox ou compte Auth résiduel portant les préfixes de l'audit ; 0 donnée `loadtest-*` résiduelle.
- Le code applicatif n'est **pas encore redéployé sur Vercel** : le projet local est lié à `sunushop-app`, mais aucune session/clé Vercel n'est disponible dans cet environnement et `COURIER_PIN_SECRET` n'est pas provisionné. Avant le prochain déploiement de production, générer un secret distinct d'au moins 32 caractères, l'ajouter à Vercel sous ce nom, puis redéployer. La migration SQL reste rétrocompatible avec l'application actuellement déployée.
