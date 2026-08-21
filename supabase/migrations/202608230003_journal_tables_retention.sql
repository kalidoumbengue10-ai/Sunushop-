-- Corrige I7 : rate_limit_buckets et webhook_events grossissent sans jamais
-- être purgés. rate_limit_buckets gagne une ligne par (clé hashée x action)
-- et n'est jamais nettoyée : la table qui protège des abus devient
-- elle-même un goulot de lecture/écriture. webhook_events n'a de valeur que
-- pour l'idempotence à court terme une fois l'événement traité.
--
-- audit_events n'est volontairement PAS purgée ici : c'est une piste
-- d'audit (voir sub-skill data-compliance-legal, règle 5 : « append-only,
-- non purgée par le cron de rétention »). Un partitionnement/archivage à
-- froid reste possible plus tard sans supprimer de ligne.

begin;

-- Purge les fenêtres de rate-limit expirées depuis plus de p_retention_hours.
-- Une fenêtre expirée n'a plus d'utilité : consume_rate_limit en recrée une
-- nouvelle dès la prochaine requête sur la clé.
create function public.purge_expired_rate_limit_buckets(
  p_retention_hours integer default 24,
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with expired as (
    select key_hash, action
    from public.rate_limit_buckets
    where updated_at < timezone('utc', now()) - make_interval(hours => greatest(1, p_retention_hours))
    limit greatest(1, least(p_limit, 20000))
  )
  delete from public.rate_limit_buckets rb
  using expired e
  where rb.key_hash = e.key_hash and rb.action = e.action;

  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.purge_expired_rate_limit_buckets(integer, integer) from public;
grant execute on function public.purge_expired_rate_limit_buckets(integer, integer) to service_role;

-- Purge les événements webhook traités (processed_at ou failed_at renseigné)
-- depuis plus de p_retention_days. Les événements non résolus ne sont
-- jamais purgés, quel que soit leur âge : ils restent visibles pour
-- investigation.
create function public.purge_processed_webhook_events(
  p_retention_days integer default 30,
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with stale as (
    select id
    from public.webhook_events
    where (processed_at is not null or failed_at is not null)
      and created_at < timezone('utc', now()) - make_interval(days => greatest(1, p_retention_days))
    order by id
    limit greatest(1, least(p_limit, 20000))
  )
  delete from public.webhook_events we
  using stale s
  where we.id = s.id;

  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.purge_processed_webhook_events(integer, integer) from public;
grant execute on function public.purge_processed_webhook_events(integer, integer) to service_role;

commit;
