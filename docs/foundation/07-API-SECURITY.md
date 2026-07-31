# SunuShop - API, sécurité et conformité

## Frontière de confiance

Le navigateur ne décide jamais du prix, du stock, de la livraison, du paiement, du rôle marchand ni du statut de commande. Il propose une intention. Le serveur valide et retourne l'état autoritatif.

## API cible

```text
GET    /api/catalog
GET    /api/merchants/:slug
GET    /api/products/:id
POST   /api/cart/quote
POST   /api/orders
GET    /api/orders/:id
POST   /api/orders/:id/confirm
POST   /api/orders/:id/status
POST   /api/orders/:id/disputes
GET    /api/merchant/orders
POST   /api/merchant/products
PATCH  /api/merchant/products/:id
POST   /api/merchant/subscriptions/checkout
POST   /api/webhooks/payments/:provider
```

## Validation

- Schéma strict pour body, query et paramètres.
- Limites explicites de longueur, quantité et taille de fichier.
- Rejet des champs inconnus sur les écritures sensibles.
- Normalisation des emails en minuscules pour les contrôles anti-abus.
- Normalisation téléphone +221 côté serveur.
- Pagination bornée.
- Noms de fichier générés côté serveur.
- MIME, taille et contenu des médias contrôlés.

## Autorisation

Rôles initiaux:

- `buyer`
- `merchant_owner`
- `merchant_manager`
- `merchant_catalog`
- `merchant_fulfillment`
- `support_agent`
- `admin`

Chaque requête marchand vérifie l'appartenance au `merchant_id`. Les actions support et admin exigent justification et audit.

## Paiement et abonnement

- Prestataire de paiement agréé.
- Création de session côté serveur.
- Webhooks signés, datés et idempotents.
- Aucun statut "paid" fondé sur un redirect navigateur.
- Rapprochement périodique des statuts.
- Secrets uniquement côté serveur et rotation documentée.
- Aucun numéro de carte stocké par SunuShop.

## Protections

- Cookies `HttpOnly`, `Secure`, `SameSite`.
- CSRF sur mutations si authentification par cookie.
- Rate limits par IP, compte, marchand et route.
- Anti-énumération sur connexion et récupération.
- Content Security Policy et en-têtes de sécurité.
- Logs structurés sans secrets, token, adresse complète ni contenu sensible.
- Alertes sur échecs webhook, abus login, pics d'annulation et exports.

## Données et Sénégal

Avant mise en production:

- Cartographie des traitements.
- Politique de confidentialité.
- Bases légales et consentements.
- Minimisation et rétention.
- Droits des personnes.
- Contrats avec sous-traitants.
- Validation des formalités auprès de la CDP selon le traitement.
- Conditions de transaction et règles vendeurs.

Références: loi sénégalaise 2008-12 sur les données personnelles, loi 2008-08 sur les transactions électroniques, textes CDP, instruction BCEAO 001-01-2024. Faire valider le dispositif par un professionnel local.

## Checklist avant ouverture

- Threat model revu.
- RBAC testé.
- Webhooks testés avec doublons et signatures invalides.
- Sauvegarde et restauration vérifiées.
- Exports et suppressions encadrés.
- Procédure incident et contact sécurité.
- Produits interdits et modération.
- Politique retours, litiges et remboursement.
