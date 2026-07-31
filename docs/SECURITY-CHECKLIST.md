# Checklist sécurité — SunuShop

## Obligatoire avant le pilote

- [ ] développement sur Supabase local et données réelles uniquement sur le
  projet Cloud de production ;
- [ ] Supabase Pro, sauvegardes et alertes de coût activés en production ;
- [ ] migrations appliquées depuis zéro en local et `supabase db lint --linked`
  sans erreur avant livraison ;
- [ ] matrice RLS exécutée avec acheteur, marchand A, marchand B, reviewer et
  admin ;
- [ ] aucun accès croisé aux dossiers, commandes, produits privés ou buckets ;
- [ ] bucket `merchant-verification` privé, formats JPEG/PNG/PDF et taille
  maximale de 10 Mo ;
- [ ] URL documentaire signée expirant après cinq minutes ;
- [ ] `SUPABASE_SERVICE_ROLE_KEY` absente de `.next/static` et des logs ;
- [ ] CAPTCHA et limites anti-abus Auth actifs en production ;
- [ ] confirmation et récupération email configurées ; si le SMS/WhatsApp est
  réactivé, fournisseur, quotas et alertes obligatoires ;
- [ ] TOTP AAL2 obligatoire et testé pour reviewers/admins ;
- [ ] `CRON_SECRET` long et différent par environnement ;
- [ ] export PostgreSQL/Auth/Storage restauré sur un environnement isolé ;
- [ ] logs inspectés : aucune pièce, checksum, référence sensible ou contenu
  d’identité.

## Documents et vie privée

- Collecte minimale : pas d’OCR, selfie, biométrie ou reconnaissance faciale.
- Les noms de fichiers d’origine ne deviennent jamais des chemins Storage.
- Chaque version a un chemin opaque et un checksum SHA-256.
- Le marchand ne voit jamais les notes internes.
- Les consultations administratives et décisions sont auditées.
- Les durées de 90 jours après rejet/abandon et 12 mois après fermeture restent
  configurables et doivent être confirmées par un conseil juridique/CDP.
- Une procédure documentée couvre export, fermeture et suppression du compte.

## Dépendances

Au 29 juillet 2026, `npm audit` signale encore trois vulnérabilités hautes dans
les copies de PostCSS 8.4.31 et Sharp 0.34.5 embarquées par Next.js 16.2.12.
La version stable la plus récente de Next conserve ces dépendances et la
correction automatique npm propose une rétrogradation invalide vers Next 9.

Mesures temporaires :

- CSS et images optimisées de la vitrine proviennent uniquement du dépôt ;
- les médias marchands ne sont pas traités par `next/image` dans le MVP ;
- aucun source map CSS fourni par un utilisateur n’est compilé ;
- surveiller la prochaine version stable Next.js et lever cette exception dès
  qu’elle embarque PostCSS ≥ 8.5.18 et Sharp ≥ 0.35.0 ;
- bloquer la production si le périmètre évolue vers le traitement serveur
  d’images non fiables.
