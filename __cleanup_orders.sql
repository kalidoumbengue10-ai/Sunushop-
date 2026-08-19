-- Nettoyage final des commandes de test restantes.
-- À exécuter dans Supabase Dashboard > SQL Editor (rôle postgres, bypass RLS).
-- Les leads CRM, abonnements de test et données liées ont déjà été supprimés.

begin;

delete from public.payment_escrows;
delete from public.payment_intents;
delete from public.orders;
delete from public.order_batches;

commit;

-- Vérification (doit renvoyer 0 partout) :
select
  (select count(*) from public.payment_escrows) as payment_escrows,
  (select count(*) from public.payment_intents) as payment_intents,
  (select count(*) from public.orders) as orders,
  (select count(*) from public.order_batches) as order_batches;
