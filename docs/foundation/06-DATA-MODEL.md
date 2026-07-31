# SunuShop - Modèle de données cible

## Principes

- PostgreSQL comme source de vérité.
- Identifiants non prédictibles.
- Montants en entier de plus petite unité, devise XOF.
- Horodatage UTC, rendu dans le fuseau local.
- Suppression logique pour les entités métier.
- Journal d'audit append-only pour actions sensibles.
- `merchant_id` obligatoire sur les données multi-tenant.

## Entités principales

### Identité

- `auth.users`: email confirmé, identité du fournisseur et dernière connexion.
- `profiles`: téléphone de contact optionnel, nom, locale et consentements.
- `merchant_accounts`: nom légal, nom public, statut KYC, propriétaire.
- `merchant_members`: marchand, utilisateur, rôle.
- `addresses`: propriétaire, région, département, commune, repère, coordonnées optionnelles.

### Catalogue

- `categories`: hiérarchie et état.
- `products`: marchand, catégorie, titre, description, statut.
- `product_variants`: SKU marchand, attributs, prix, état, garantie.
- `inventory_items`: variante, quantité disponible, quantité réservée, version.
- `media_assets`: propriétaire, type, taille, statut de modération.

### Vente

- `carts` et `cart_items`.
- `orders`: acheteur, marchand, statut, devise, totaux, zone.
- `order_items`: snapshot du produit, quantité et prix.
- `order_status_events`: ancien statut, nouveau statut, acteur, motif, date.
- `delivery_quotes`: zone, prix, promesse, expiration, fournisseur.
- `shipments`: commande, transporteur, référence, état.
- `payment_attempts`: prestataire, référence, montant, statut, idempotence.
- `refunds`: paiement, montant, raison, statut.

### Relation

- `conversations` et `messages`, liés à une commande ou un produit.
- `reviews`, uniquement pour une commande livrée.
- `disputes` et `dispute_evidence`.
- `notifications` avec canal et état.

### Monétisation

- `subscription_plans`.
- `merchant_subscriptions`.
- `subscription_invoices`.
- `entitlements`.

### Gouvernance

- `audit_events`.
- `moderation_cases`.
- `webhook_events`, avec identifiant fournisseur unique.
- `consent_events`.

## Contraintes critiques

- Un avis unique par `order_item_id` et acheteur.
- Une référence de webhook unique par fournisseur.
- Quantité réservée jamais négative et jamais supérieure à la quantité disponible.
- Transition de commande vérifiée par la machine d'état.
- Un vendeur ne lit que les données de son `merchant_id`.
- Le total d'une commande est recalculé côté serveur depuis des snapshots.

## Index initiaux

- `products(merchant_id, status, category_id)`.
- Recherche texte sur titre, vendeur et catégorie.
- `orders(merchant_id, created_at desc)`.
- `orders(buyer_id, created_at desc)`.
- `order_status_events(order_id, created_at)`.
- `messages(conversation_id, created_at)`.
- `inventory_items(variant_id)`.
- `webhook_events(provider, provider_event_id)` unique.

Les fixtures de démonstration restent dans `lib/marketplace`. Elles ne sont pas un schéma de production.
