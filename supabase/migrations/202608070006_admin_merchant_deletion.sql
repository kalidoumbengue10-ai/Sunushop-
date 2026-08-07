begin;

-- Suppression définitive d'une boutique par un admin (nettoyage des
-- boutiques de test). La majorité des tables liées à merchant_accounts sont
-- déjà en "on delete cascade" (produits, variantes, zones, membres,
-- abonnements...). Six tables sont volontairement en "on delete restrict"
-- pour ne jamais orpheliner de l'historique financier : orders, order_items,
-- direct_payment_declarations, payment_intents, payment_escrows,
-- merchant_payouts. Cette fonction les vide explicitement pour CE marchand,
-- dans l'ordre de leurs dépendances, avant de laisser le cascade faire le
-- reste. order_batches n'est supprimé que s'il ne référence plus aucune
-- autre commande (un batch peut couvrir plusieurs marchands).

create function public.admin_delete_merchant_cascade(p_merchant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_ids uuid[];
begin
  select array_agg(distinct batch_id) into v_batch_ids
  from public.orders
  where merchant_id = p_merchant_id;

  delete from public.merchant_payouts where merchant_id = p_merchant_id;
  delete from public.payment_escrows where merchant_id = p_merchant_id;
  delete from public.direct_payment_declarations where merchant_id = p_merchant_id;
  delete from public.order_items where merchant_id = p_merchant_id;
  delete from public.orders where merchant_id = p_merchant_id;
  delete from public.payment_intents where merchant_id = p_merchant_id;

  if v_batch_ids is not null then
    delete from public.order_batches
    where id = any(v_batch_ids)
      and not exists (select 1 from public.orders where batch_id = order_batches.id)
      and not exists (select 1 from public.payment_intents where order_batch_id = order_batches.id);
  end if;

  delete from public.merchant_accounts where id = p_merchant_id;
end;
$$;

revoke all on function public.admin_delete_merchant_cascade(uuid) from public;
grant execute on function public.admin_delete_merchant_cascade(uuid) to service_role;

commit;
