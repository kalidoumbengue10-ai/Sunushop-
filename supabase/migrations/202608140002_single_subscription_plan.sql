begin;

-- SunuShop ne propose qu'une seule offre d'abonnement (4 900 F/mois, déclinée
-- en cycles mensuel/trimestriel/annuel). Les plans Pro et Réseau sont
-- désactivés plutôt que supprimés : ils restent référencés par d'éventuels
-- abonnements historiques (merchant_subscriptions.plan_id) et peuvent être
-- réactivés plus tard sans perte de données.
update public.subscription_plans
set active = false
where id in ('pro', 'network');

commit;
