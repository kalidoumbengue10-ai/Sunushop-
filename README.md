# SunuShop

MVP Next.js 16 d’une marketplace sénégalaise, connecté à Supabase pour Auth,
PostgreSQL et Storage. Il couvre l’inscription email confirmée via Resend, la
validation documentaire humaine des marchands, les abonnements manuels, le
catalogue, la livraison par vendeur et les commandes multi-boutiques.

## Parcours fonctionnels

- acheteur : email et mot de passe, catalogue public, panier multi-vendeur,
  devis par boutique,
  paiement à la livraison ou direct Wave/Orange Money et suivi séparé ;
- marchand : création de boutique, KYC formel ou informel, upload privé
  versionné, catalogue, images, stock, zones de livraison, abonnement et cycle
  complet des commandes ;
- équipe SunuShop : MFA TOTP, file de revue KYC, URL documentaire signée cinq
  minutes, décisions auditées et validation des paiements d’abonnement ;
- exploitation : RLS, limites anti-abus, CAPTCHA, emails Auth via Resend,
  tâches d’expiration/purge et export portable PostgreSQL/Auth/Storage.

## Démarrage

Prérequis : Node.js 20+, un projet Supabase et Docker pour la pile locale.

```powershell
npm install
Copy-Item .env.example .env.local
npm run supabase:start
npm run supabase:reset
npm run dev
```

Sans variables Supabase, l’interface présente un écran de configuration et le
site vitrine reste consultable.

## Contrôles

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

`test:e2e` démarre et reconstruit une pile Supabase locale jetable, injecte ses
clés sans modifier `.env.local`, refuse toute cible distante, puis supprime la
pile à la fin. Les scénarios qui créent des comptes ou des commandes ne doivent
jamais être lancés directement contre le projet cloud.

Les migrations sont dans `supabase/migrations` et ne doivent jamais être
remplacées par des modifications manuelles sur la base distante.

## Documentation

- `docs/OPERATIONS.md` : environnement local, production, admin, sauvegarde et
  restauration ;
- `docs/ARCHITECTURE-PORTABILITE.md` : classement des couches, migrations et
  procédure de migration vers un autre fournisseur ;
- `docs/SECURITY-CHECKLIST.md` : contrôles de sécurité avant pilote ;
- `docs/DATA-MODEL.md` : modèle de données ;
- `docs/research/sunushop/dossier-sunushop.md` : recherche marché ;
- `docs/foundation/` : fondations produit et architecture.

La clé `SUPABASE_SERVICE_ROLE_KEY`, les pièces d’identité et les exports sous
`reports/` ne doivent jamais entrer dans Git ni dans le bundle navigateur.
