-- Ferme les défauts résiduels découverts pendant la vérification de l'audit :
-- 1. mark_abandoned_carts levait une erreur dès que UPDATE ... RETURNING
--    renvoyait plusieurs lignes dans une variable scalaire.
-- 2. un claim d'outbox interrompu restait définitivement en "processing".
-- 3. le LIMIT du cron abonnements pouvait sélectionner éternellement les
--    mêmes lignes déjà dédupliquées et affamer les suivantes.

begin;

create function public.mark_abandoned_carts(
  p_inactivity_hours integer,
  p_limit integer,
  p_cart_ids uuid[]
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
      and (p_cart_ids is null or c.id = any(p_cart_ids))
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
  where id in (select id from stale_carts);

  get diagnostics v_marked = row_count;
  return coalesce(v_marked, 0);
end;
$$;

create or replace function public.mark_abandoned_carts(
  p_inactivity_hours integer default 24,
  p_limit integer default 500
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.mark_abandoned_carts(p_inactivity_hours, p_limit, null::uuid[]);
$$;

alter table public.notification_outbox
  add column if not exists processing_started_at timestamptz,
  add column if not exists suppressed_at timestamptz,
  add column if not exists suppression_reason text;

create index if not exists notification_outbox_processing_lease_idx
  on public.notification_outbox(processing_started_at)
  where status = 'processing' and suppressed_at is null;

-- Les messages historiques ont jusqu'à plusieurs semaines. Les envoyer à la
-- première activation du cron créerait une rafale de notifications obsolètes.
-- Ils restent consultables et peuvent être réactivés en mettant suppressed_at
-- et suppression_reason à null, mais le worker ne les réclame pas.
update public.notification_outbox
set
  suppressed_at = timezone('utc', now()),
  suppression_reason = 'pre_reliability_deploy_backlog'
where status in ('pending', 'failed')
  and channel = 'email'
  and suppressed_at is null;

create function public.claim_notification_outbox(
  p_limit integer,
  p_dedupe_prefix text
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.notification_outbox
  set
    status = 'processing',
    processing_started_at = timezone('utc', now())
  where id in (
    select id
    from public.notification_outbox
    where channel = 'email'
      and suppressed_at is null
      and (p_dedupe_prefix is null or dedupe_key like p_dedupe_prefix || '%')
      and attempts < 5
      and (
        (
          status in ('pending', 'failed')
          and available_at <= timezone('utc', now())
        )
        or
        (
          status = 'processing'
          and coalesce(processing_started_at, created_at)
            < timezone('utc', now()) - interval '2 minutes'
        )
      )
    order by
      case when status = 'processing' then 0 else 1 end,
      created_at
    limit greatest(1, least(p_limit, 10))
    for update skip locked
  )
  returning *;
end;
$$;

create or replace function public.claim_notification_outbox(p_limit integer default 10)
returns setof public.notification_outbox
language sql
security definer
set search_path = ''
as $$
  select * from public.claim_notification_outbox(p_limit, null::text);
$$;

-- Borne les changements d'état. Les lignes changent de statut après chaque
-- lot, donc les exécutions suivantes avancent sans curseur ni famine.
create or replace function public.refresh_subscription_states()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
  v_step integer := 0;
begin
  insert into public.notification_outbox (
    dedupe_key,
    recipient_user_id,
    channel,
    template,
    payload
  )
  select
    'subscription-reminder:'
      || ms.id::text
      || ':'
      || ms.current_period_ends_at::date::text
      || ':j-'
      || (ms.current_period_ends_at::date - current_date)::text,
    ma.owner_user_id,
    'in_app',
    case
      when ms.current_period_ends_at::date - current_date = 7
        then 'subscription_expires_j7'
      else 'subscription_expires_j2'
    end,
    jsonb_build_object(
      'merchant_id', ms.merchant_id,
      'subscription_id', ms.id,
      'current_period_ends_at', ms.current_period_ends_at
    )
  from public.merchant_subscriptions ms
  join public.merchant_accounts ma on ma.id = ms.merchant_id
  where ms.status = 'active'
    and ms.current_period_ends_at::date - current_date in (7, 2)
  on conflict (dedupe_key) do nothing;

  with candidates as (
    select id
    from public.merchant_subscriptions
    where status = 'active'
      and current_period_ends_at <= timezone('utc', now())
    order by current_period_ends_at, id
    limit 1000
    for update skip locked
  ), changed as (
    update public.merchant_subscriptions ms
    set status = 'grace'
    where ms.id in (select id from candidates)
    returning ms.merchant_id
  ), synced as (
    update public.merchant_accounts ma
    set subscription_status = 'grace'
    where ma.id in (select merchant_id from changed)
    returning ma.id
  )
  select count(*)::integer into v_step from changed;
  v_changed := v_changed + coalesce(v_step, 0);

  with candidates as (
    select id
    from public.merchant_subscriptions
    where status = 'grace'
      and grace_ends_at <= timezone('utc', now())
    order by grace_ends_at, id
    limit 1000
    for update skip locked
  ), changed as (
    update public.merchant_subscriptions ms
    set status = 'expired'
    where ms.id in (select id from candidates)
    returning ms.merchant_id
  ), synced as (
    update public.merchant_accounts ma
    set
      subscription_status = 'expired',
      status = case
        when ma.status = 'active' then 'pending'::public.merchant_status
        else ma.status
      end
    where ma.id in (select merchant_id from changed)
    returning ma.id
  )
  select count(*)::integer into v_step from changed;
  v_changed := v_changed + coalesce(v_step, 0);

  return v_changed;
end;
$$;

create or replace function public.refresh_subscription_billing_periods()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_changed integer := 0;
begin
  with candidates as (
    select id from public.subscription_billing_periods
    where status = 'upcoming' and due_at <= timezone('utc', now())
    order by due_at, id limit 1000 for update skip locked
  )
  update public.subscription_billing_periods sbp
  set status = 'due', updated_at = timezone('utc', now())
  where sbp.id in (select id from candidates);
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  with candidates as (
    select id from public.subscription_billing_periods
    where status = 'due' and due_at + interval '1 day' <= timezone('utc', now())
    order by due_at, id limit 1000 for update skip locked
  )
  update public.subscription_billing_periods sbp
  set status = 'overdue', updated_at = timezone('utc', now())
  where sbp.id in (select id from candidates);
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  with candidates as (
    select id from public.subscription_billing_periods
    where status = 'overdue' and due_at + interval '3 days' <= timezone('utc', now())
    order by due_at, id limit 1000 for update skip locked
  )
  update public.subscription_billing_periods sbp
  set status = 'expired', updated_at = timezone('utc', now())
  where sbp.id in (select id from candidates);
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  return v_count;
end;
$$;

-- Insère un lot d'e-mails réellement manquants. Le NOT EXISTS précède le
-- LIMIT : une ancienne notification déjà dédupliquée ne peut pas occuper une
-- place du lot et affamer les suivantes.
create function public.enqueue_due_subscription_notifications(
  p_dashboard_url text,
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queued integer;
begin
  with eligible as (
    select
      ms.id as subscription_id,
      ms.merchant_id,
      ma.owner_user_id,
      coalesce(nullif(trim(ma.email::text), ''), nullif(trim(pr.email::text), '')) as recipient_email,
      ms.current_period_ends_at,
      case
        when ms.status = 'expired' then 'subscription_expired'
        when ms.current_period_ends_at <= timezone('utc', now()) + interval '2 days'
          then 'subscription_expires_j2'
        else 'subscription_expires_j7'
      end as template
    from public.merchant_subscriptions ms
    join public.merchant_accounts ma on ma.id = ms.merchant_id
    left join public.profiles pr on pr.id = ma.owner_user_id
    where ms.current_period_ends_at is not null
      and (
        (
          ms.status = 'active'
          and ms.current_period_ends_at > timezone('utc', now())
          and ms.current_period_ends_at <= timezone('utc', now()) + interval '7 days'
        )
        or
        (
          ms.status = 'expired'
          and ms.updated_at >= timezone('utc', now()) - interval '2 days'
        )
      )
  ), missing as (
    select
      e.*,
      'subscription-email:'
        || e.subscription_id::text
        || ':'
        || e.template
        || ':'
        || (e.current_period_ends_at at time zone 'utc')::date::text as dedupe_key
    from eligible e
    where e.recipient_email is not null
      and not exists (
        select 1
        from public.notification_outbox no
        where no.dedupe_key = 'subscription-email:'
          || e.subscription_id::text
          || ':'
          || e.template
          || ':'
          || (e.current_period_ends_at at time zone 'utc')::date::text
      )
    order by e.current_period_ends_at, e.subscription_id
    limit greatest(1, least(p_limit, 2000))
  ), inserted as (
    insert into public.notification_outbox (
      dedupe_key,
      recipient_user_id,
      channel,
      template,
      payload
    )
    select
      m.dedupe_key,
      m.owner_user_id,
      'email',
      m.template,
      jsonb_build_object(
        'to', m.recipient_email,
        'merchantId', m.merchant_id,
        'subscriptionId', m.subscription_id,
        'currentPeriodEndsAt', m.current_period_ends_at,
        'url', p_dashboard_url
      )
    from missing m
    on conflict (dedupe_key) do nothing
    returning id
  )
  select count(*)::integer into v_queued from inserted;

  return coalesce(v_queued, 0);
end;
$$;

revoke all on function public.mark_abandoned_carts(integer, integer) from public;
revoke all on function public.mark_abandoned_carts(integer, integer, uuid[]) from public;
revoke all on function public.claim_notification_outbox(integer) from public;
revoke all on function public.claim_notification_outbox(integer, text) from public;
revoke all on function public.refresh_subscription_states() from public;
revoke all on function public.refresh_subscription_billing_periods() from public;
revoke all on function public.enqueue_due_subscription_notifications(text, integer) from public;

grant execute on function public.mark_abandoned_carts(integer, integer) to service_role;
grant execute on function public.mark_abandoned_carts(integer, integer, uuid[]) to service_role;
grant execute on function public.claim_notification_outbox(integer) to service_role;
grant execute on function public.claim_notification_outbox(integer, text) to service_role;
grant execute on function public.refresh_subscription_states() to service_role;
grant execute on function public.refresh_subscription_billing_periods() to service_role;
grant execute on function public.enqueue_due_subscription_notifications(text, integer) to service_role;

commit;
