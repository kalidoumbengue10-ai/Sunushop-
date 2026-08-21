-- Corrige trois goulots d'étranglement de crons identifiés en audit :
-- 1. abandoned-carts scannait toute la table `carts` + tous les
--    `cart_items` et filtrait en JavaScript, sans LIMIT.
-- 2. `cart_items` n'avait aucun index sur `cart_id` malgré la FK, ce qui
--    pénalise à la fois la requête ci-dessous et toute jointure panier.
-- 3. `document_retention_candidates` n'avait pas de LIMIT : au-delà d'un
--    certain volume, le cron dépasse le timeout et ne purge plus rien,
--    silencieusement.

begin;

create index if not exists cart_items_cart_id_idx on public.cart_items (cart_id);

-- Marque abandonnés les paniers actifs dont aucun article n'a bougé depuis
-- `p_inactivity_hours`, borné par `p_limit`. Toute l'agrégation (dernière
-- activité par panier) se fait en SQL plutôt qu'en JavaScript côté route.
create function public.mark_abandoned_carts(
  p_inactivity_hours integer default 24,
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := timezone('utc', now()) - make_interval(hours => greatest(1, p_inactivity_hours));
  v_marked integer;
begin
  with stale_carts as (
    select c.id
    from public.carts c
    where c.status = 'active'
      and exists (select 1 from public.cart_items ci where ci.cart_id = c.id)
      and not exists (
        select 1 from public.cart_items ci
        where ci.cart_id = c.id and ci.updated_at >= v_cutoff
      )
    order by c.id
    limit greatest(1, least(p_limit, 2000))
  )
  update public.carts
  set status = 'abandoned'
  where id in (select id from stale_carts)
  returning 1 into v_marked;

  get diagnostics v_marked = row_count;
  return coalesce(v_marked, 0);
end;
$$;

revoke all on function public.mark_abandoned_carts(integer, integer) from public;
grant execute on function public.mark_abandoned_carts(integer, integer) to service_role;

-- document_retention_candidates existante (2 paramètres) remplacée par une
-- version à 3 paramètres (p_limit ajouté) : la signature change, donc la
-- fonction d'origine doit être supprimée avant recréation plutôt que
-- remplacée par `create or replace` (qui créerait une surcharge distincte).
drop function if exists public.document_retention_candidates(integer, integer);

create function public.document_retention_candidates(
  p_rejected_days integer default 90,
  p_closed_days integer default 365,
  p_limit integer default 200
)
returns table (
  document_id uuid,
  storage_bucket text,
  storage_path text
)
language sql
security definer
set search_path = ''
as $$
  select vd.id, vd.storage_bucket, vd.storage_path
  from public.verification_documents vd
  join public.verification_cases vc on vc.id = vd.case_id
  join public.merchant_accounts ma on ma.id = vd.merchant_id
  where vd.status <> 'purged'
    and vd.storage_path is not null
    and (
      (
        vc.status = 'rejected'
        and vc.decided_at < timezone('utc', now()) - make_interval(days => p_rejected_days)
      )
      or
      (
        vc.status in ('draft', 'needs_changes')
        and vc.updated_at < timezone('utc', now()) - make_interval(days => p_rejected_days)
      )
      or
      (
        ma.status = 'closed'
        and ma.closed_at < timezone('utc', now()) - make_interval(days => p_closed_days)
      )
    )
  order by vd.id
  limit greatest(1, least(p_limit, 1000));
$$;

revoke all on function public.document_retention_candidates(integer, integer, integer) from public;
grant execute on function public.document_retention_candidates(integer, integer, integer) to service_role;

commit;
