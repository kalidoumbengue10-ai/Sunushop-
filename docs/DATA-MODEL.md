# Modèle de données — SunuShop MVP

La définition exécutable est versionnée dans `supabase/migrations`. Les UUID
sont les identifiants, les dates sont en UTC et les montants sont des entiers
XOF.

## Agrégats

- identité : `profiles`, `merchant_accounts`, `merchant_members`,
  `admin_roles` ;
- KYC : `verification_cases`, `verification_documents`,
  `verification_reviews`, `verification_events` ;
- catalogue : `categories`, `products`, `product_variants`,
  `inventory_items`, `product_media` ;
- livraison : `delivery_methods`, `delivery_zones`, `delivery_quotes` ;
- vente : `carts`, `cart_items`, `order_batches`, `orders`, `order_items`,
  `order_events`, `direct_payment_declarations` ;
- abonnement : `subscription_plans`, `merchant_subscriptions`,
  `subscription_payment_submissions` ;
- exploitation : `audit_events`, `notification_outbox`, `webhook_events`,
  `rate_limit_buckets`.

Chaque donnée de boutique porte un `merchant_id`. Un panier validé crée un
`order_batch`, puis une commande indépendante par marchand dans une seule
transaction. Prix, livraison, destinataire et instructions de paiement sont
copiés dans les commandes sous forme de snapshots.

## États

KYC :

`draft → submitted → in_review → needs_changes → resubmitted → approved | rejected → suspended`

Commande :

`pending_seller_confirmation → confirmed → preparing → ready_for_handoff → in_transit → delivered`

Une commande peut aussi devenir `cancelled` ou `disputed`. Les transitions sont
validées dans PostgreSQL et historisées.

Abonnement :

`pending → active → grace → expired | cancelled`

La grâce dure trois jours et reste commandable. À expiration, la boutique est
retirée du catalogue et ne peut plus recevoir de nouvelle commande, sans perte
des commandes existantes.

## Portabilité

Le domaine React dépend d’interfaces repository. L’adaptateur Supabase est
confiné à `lib/infrastructure/supabase`. Les exports contrôlés couvrent la base,
les utilisateurs Auth et les objets Storage avec checksums.
