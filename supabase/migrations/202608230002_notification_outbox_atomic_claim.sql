-- Corrige I4 : le cron notifications faisait un `select` puis un `update
-- status='processing'` en deux requêtes séparées. Si une exécution dépasse
-- 5 minutes (le cron tourne toutes les 5 min), deux exécutions se
-- chevauchent et peuvent sélectionner puis traiter les mêmes lignes,
-- envoyant le même email deux fois. `claim_notification_outbox` verrouille
-- les lignes sélectionnées (`for update skip locked`) et les marque
-- `processing` dans la même transaction : deux runners concurrents ne
-- peuvent jamais se voir attribuer la même notification.

begin;

create function public.claim_notification_outbox(p_limit integer default 25)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.notification_outbox
  set status = 'processing'
  where id in (
    select id from public.notification_outbox
    where channel = 'email'
      and status in ('pending', 'failed')
      and available_at <= timezone('utc', now())
      and attempts < 5
    order by created_at
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  returning *;
end;
$$;

revoke all on function public.claim_notification_outbox(integer) from public;
grant execute on function public.claim_notification_outbox(integer) to service_role;

commit;
