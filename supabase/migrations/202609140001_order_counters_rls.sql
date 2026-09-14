-- `merchant_order_counters` est la seule table métier de `public` restée sans
-- RLS. Elle n'est aujourd'hui atteignable par aucun client : le `revoke all on
-- all tables in schema public from anon, authenticated` de 202607290003 la
-- précède et aucun grant ne lui a jamais été accordé. La protection repose
-- donc uniquement sur l'absence de privilège SQL — un futur `grant select on
-- all tables`, ou un grant ajouté par erreur, exposerait immédiatement le
-- volume de commandes de chaque boutique (donnée concurrentielle) via
-- PostgREST.
--
-- On verrouille les deux niveaux : RLS active sans aucune policy permissive
-- (donc aucune ligne visible pour anon/authenticated, y compris si un grant
-- réapparaît) et retrait explicite des privilèges.
--
-- Volontairement sans `force row level security` : le trigger
-- `assign_merchant_order_sequence` est `security definer` et s'exécute donc en
-- tant que `postgres`, propriétaire de la table. `force` soumettrait ce
-- propriétaire à RLS et, faute de policy, ferait échouer l'attribution du
-- numéro de commande à chaque insertion dans `orders`. Le rôle `service_role`
-- utilisé par le backend contourne RLS par construction (BYPASSRLS).
begin;

alter table public.merchant_order_counters enable row level security;

revoke all on public.merchant_order_counters from anon, authenticated;

commit;
