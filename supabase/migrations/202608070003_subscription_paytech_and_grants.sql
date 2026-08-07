begin;

-- Chantier 5 : paiement d'abonnement automatique par PayTech (IPN) et
-- traçabilité de l'activation manuelle CRM (octroi avec motif obligatoire).

create table public.subscription_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id) on delete restrict,
  days integer not null,
  reason text not null,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  current_period_ends_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint subscription_grant_days check (days between 1 and 365),
  constraint subscription_grant_reason check (char_length(reason) >= 4)
);

create index subscription_grants_merchant_idx on public.subscription_grants(merchant_id, created_at desc);

alter table public.subscription_grants enable row level security;

create policy subscription_grants_admin_read
  on public.subscription_grants for select to authenticated
  using (
    public.has_admin_role(array['admin']::public.admin_role_kind[])
    and public.has_aal2()
  );

revoke all on public.subscription_grants from anon, authenticated;
grant select on public.subscription_grants to authenticated;

-- activate_subscription_from_payment : réutilise la logique de période déjà
-- écrite dans review_subscription_payment / admin_activate_test_subscription
-- (+30 jours, +33 jours de grâce, cumul depuis current_period_ends_at si
-- renouvellement anticipé).
create function public.activate_subscription_from_payment(
  p_ref_command text,
  p_amount_xof integer,
  p_paytech_token text
)
returns public.merchant_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.payment_intents%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_subscription public.merchant_subscriptions%rowtype;
  v_period_start timestamptz;
begin
  select * into v_intent
  from public.payment_intents
  where ref_command = p_ref_command
    and kind = 'subscription'
  for update;

  if v_intent.id is null then
    raise exception using errcode = 'P0002', message = 'PAYMENT_INTENT_NOT_FOUND';
  end if;

  -- Idempotence : un rejeu d'IPN sur un intent déjà payé ne doit pas
  -- prolonger une seconde fois la période d'abonnement.
  if v_intent.status = 'paid' then
    select * into v_subscription
    from public.merchant_subscriptions
    where merchant_id = v_intent.merchant_id
    order by created_at desc
    limit 1;
    return v_subscription;
  end if;

  if v_intent.status <> 'pending' then
    raise exception using errcode = '23514', message = 'PAYMENT_ALREADY_CAPTURED';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = v_intent.plan_id
    and active;

  if v_plan.id is null then
    raise exception using errcode = 'P0002', message = 'SUBSCRIPTION_PLAN_NOT_FOUND';
  end if;

  if v_intent.amount_xof <> p_amount_xof or v_plan.monthly_price_xof <> p_amount_xof then
    raise exception using errcode = '23514', message = 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  update public.payment_intents
  set status = 'paid',
      paid_at = timezone('utc', now()),
      paytech_token = p_paytech_token
  where id = v_intent.id;

  select * into v_subscription
  from public.merchant_subscriptions
  where merchant_id = v_intent.merchant_id
    and status in ('pending', 'active', 'grace')
  order by created_at desc
  limit 1
  for update;

  v_period_start := greatest(
    timezone('utc', now()),
    coalesce(v_subscription.current_period_ends_at, timezone('utc', now()))
  );

  if v_subscription.id is null then
    insert into public.merchant_subscriptions (
      merchant_id, plan_id, status, starts_at, current_period_ends_at, grace_ends_at
    )
    values (
      v_intent.merchant_id, v_plan.id, 'active', timezone('utc', now()),
      timezone('utc', now()) + interval '30 days',
      timezone('utc', now()) + interval '33 days'
    )
    returning * into v_subscription;
  else
    update public.merchant_subscriptions
    set plan_id = v_plan.id,
        status = 'active',
        starts_at = coalesce(starts_at, timezone('utc', now())),
        current_period_ends_at = v_period_start + interval '30 days',
        grace_ends_at = v_period_start + interval '33 days'
    where id = v_subscription.id
    returning * into v_subscription;
  end if;

  update public.merchant_accounts
  set subscription_status = 'active',
      status = case when status = 'suspended' then 'suspended'::public.merchant_status else 'active'::public.merchant_status end
  where id = v_intent.merchant_id;

  insert into public.notification_outbox (
    dedupe_key, recipient_user_id, channel, template, payload
  )
  select
    'subscription-paytech:' || v_subscription.id::text || ':' || v_subscription.current_period_ends_at::text,
    owner_user_id, 'in_app', 'subscription_activated',
    jsonb_build_object('merchant_id', id, 'plan_id', v_plan.id)
  from public.merchant_accounts
  where id = v_intent.merchant_id
  on conflict (dedupe_key) do nothing;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (
    null,
    v_intent.merchant_id,
    'subscription.paytech_activate',
    'merchant_subscription',
    v_subscription.id::text,
    jsonb_build_object('plan_id', v_plan.id, 'ref_command', p_ref_command)
  );

  return v_subscription;
end;
$$;

-- admin_grant_subscription : octroi manuel CRM avec motif obligatoire et
-- historique interrogeable (subscription_grants), en plus de
-- admin_activate_test_subscription qui reste utilisée par le bouton de test
-- existant (components/admin-crm.tsx).
create function public.admin_grant_subscription(
  p_merchant_id uuid,
  p_plan_id text,
  p_days integer,
  p_reason text
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

  if p_days < 1 or p_days > 365 then
    raise exception using errcode = '22023', message = 'TEST_SUBSCRIPTION_DURATION_INVALID';
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 4 then
    raise exception using errcode = '23514', message = 'GRANT_REASON_REQUIRED';
  end if;

  select * into v_merchant
  from public.merchant_accounts
  where id = p_merchant_id
  for update;

  if v_merchant.id is null then
    raise exception using errcode = 'P0002', message = 'MERCHANT_NOT_FOUND';
  end if;

  if v_merchant.status = 'suspended' then
    raise exception using errcode = '42501', message = 'MERCHANT_SUSPENDED';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = p_plan_id
    and active;

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

  insert into public.subscription_grants (
    merchant_id, plan_id, days, reason, granted_by, current_period_ends_at
  ) values (
    p_merchant_id, v_plan.id, p_days, trim(p_reason), auth.uid(), v_subscription.current_period_ends_at
  );

  insert into public.notification_outbox (
    dedupe_key, recipient_user_id, channel, template, payload
  ) values (
    'subscription-grant:' || v_subscription.id::text || ':' || v_subscription.current_period_ends_at::text,
    v_merchant.owner_user_id,
    'in_app',
    'subscription_activated',
    jsonb_build_object(
      'merchant_id', p_merchant_id,
      'plan_id', v_plan.id,
      'plan_name', v_plan.name,
      'current_period_ends_at', v_subscription.current_period_ends_at
    )
  ) on conflict (dedupe_key) do nothing;

  insert into public.audit_events (
    actor_id, merchant_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), p_merchant_id, 'subscription.admin_grant',
    'merchant_subscription', v_subscription.id::text,
    jsonb_build_object('plan_id', v_plan.id, 'days', p_days, 'reason', trim(p_reason))
  );

  return v_subscription;
end;
$$;

revoke all on function public.activate_subscription_from_payment(text, integer, text) from public;
revoke all on function public.admin_grant_subscription(uuid, text, integer, text) from public;

grant execute on function public.activate_subscription_from_payment(text, integer, text) to service_role;
grant execute on function public.admin_grant_subscription(uuid, text, integer, text) to authenticated;

commit;
