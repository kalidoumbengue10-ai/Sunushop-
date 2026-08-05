-- Les seeds locaux ne sont pas exécutés automatiquement sur le projet hébergé.
-- Cette migration garantit donc la présence du catalogue d'abonnements en production.
insert into public.subscription_plans (
  id,
  name,
  monthly_price_xof,
  product_limit,
  team_member_limit,
  active,
  position
) values
  ('essential', 'Essentiel', 4900, 100, 1, true, 10),
  ('pro', 'Pro', 9900, 1000, 5, true, 20),
  ('network', 'Réseau', 24900, null, 20, true, 30)
on conflict (id) do update
set name = excluded.name,
    monthly_price_xof = excluded.monthly_price_xof,
    product_limit = excluded.product_limit,
    team_member_limit = excluded.team_member_limit,
    active = true,
    position = excluded.position;

create or replace function public.admin_activate_test_subscription(
  p_merchant_id uuid,
  p_plan_id text default null,
  p_days integer default 30
)
returns public.merchant_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant_accounts%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_subscription public.merchant_subscriptions%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if not public.has_admin_role(array['admin']::public.admin_role_kind[])
     or not public.has_aal2() then
    raise exception using errcode = '42501', message = 'ADMIN_MFA_REQUIRED';
  end if;

  if p_days < 1 or p_days > 90 then
    raise exception using errcode = '22023', message = 'TEST_SUBSCRIPTION_DURATION_INVALID';
  end if;

  select * into v_merchant
  from public.merchant_accounts
  where id = p_merchant_id
  for update;

  if v_merchant.id is null then
    raise exception using errcode = 'P0002', message = 'MERCHANT_NOT_FOUND';
  end if;

  if v_merchant.verification_status <> 'approved' then
    raise exception using errcode = '23514', message = 'MERCHANT_DOCUMENTS_NOT_APPROVED';
  end if;

  select * into v_plan
  from public.subscription_plans
  where active
    and (p_plan_id is null or id = p_plan_id)
  order by position, monthly_price_xof, id
  limit 1;

  if v_plan.id is null then
    raise exception using errcode = 'P0002', message = 'SUBSCRIPTION_PLAN_NOT_FOUND';
  end if;

  select * into v_subscription
  from public.merchant_subscriptions
  where merchant_id = p_merchant_id
    and status in ('pending', 'active', 'grace')
  order by created_at desc
  limit 1
  for update;

  if v_subscription.id is null then
    insert into public.merchant_subscriptions (
      merchant_id, plan_id, status, starts_at, current_period_ends_at, grace_ends_at
    ) values (
      p_merchant_id, v_plan.id, 'active', v_now,
      v_now + make_interval(days => p_days),
      v_now + make_interval(days => p_days + 3)
    ) returning * into v_subscription;
  else
    update public.merchant_subscriptions
    set plan_id = v_plan.id,
        status = 'active',
        starts_at = v_now,
        current_period_ends_at = v_now + make_interval(days => p_days),
        grace_ends_at = v_now + make_interval(days => p_days + 3),
        cancelled_at = null,
        updated_at = v_now
    where id = v_subscription.id
    returning * into v_subscription;
  end if;

  update public.merchant_accounts
  set subscription_status = 'active', status = 'active'
  where id = p_merchant_id;

  insert into public.notification_outbox (
    dedupe_key, recipient_user_id, channel, template, payload
  ) values (
    'test-subscription:' || v_subscription.id::text || ':' || v_subscription.current_period_ends_at::text,
    v_merchant.owner_user_id,
    'in_app',
    'subscription_activated',
    jsonb_build_object(
      'merchant_id', p_merchant_id,
      'plan_id', v_plan.id,
      'plan_name', v_plan.name,
      'test_activation', true,
      'current_period_ends_at', v_subscription.current_period_ends_at
    )
  ) on conflict (dedupe_key) do nothing;

  insert into public.audit_events (
    actor_id, merchant_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), p_merchant_id, 'subscription.test_activate',
    'merchant_subscription', v_subscription.id::text,
    jsonb_build_object('plan_id', v_plan.id, 'days', p_days)
  );

  return v_subscription;
end;
$$;

revoke all on function public.admin_activate_test_subscription(uuid, text, integer) from public;
grant execute on function public.admin_activate_test_subscription(uuid, text, integer) to authenticated;
