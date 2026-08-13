begin;

-- A merchant becomes a customer once and remains one after subscription expiry.
alter table public.merchant_accounts
  add column if not exists customer_since timestamptz;

alter table public.orders
  add column if not exists paid_at timestamptz;

update public.orders orders
set paid_at = coalesce(
  (
    select max(coalesce(declaration.reviewed_at, declaration.confirmed_by_merchant_at))
    from public.direct_payment_declarations declaration
    where declaration.order_id = orders.id and declaration.status = 'confirmed'
  ),
  case when orders.payment_method = 'cash_on_delivery' then orders.delivered_at end,
  orders.updated_at,
  orders.created_at
)
where orders.payment_status in ('paid', 'refund_pending', 'refunded')
  and orders.paid_at is null;

create function public.track_order_paid_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_status in ('paid', 'refund_pending', 'refunded')
     and new.paid_at is null then
    new.paid_at := timezone('utc', now());
  end if;
  return new;
end;
$$;

create trigger orders_track_paid_at
before insert or update on public.orders
for each row execute function public.track_order_paid_at();

create type public.subscription_value_origin as enum (
  'payment',
  'manual_grant',
  'test_activation',
  'legacy'
);

create table public.subscription_value_ledger (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id) on delete restrict,
  origin public.subscription_value_origin not null,
  source_id text not null,
  amount_xof integer not null,
  recognized_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (origin, source_id),
  constraint subscription_value_amount_non_negative check (amount_xof >= 0),
  constraint subscription_value_source_not_empty check (char_length(trim(source_id)) > 0)
);

create index subscription_value_ledger_period_idx
  on public.subscription_value_ledger(recognized_at desc, merchant_id);

alter table public.subscription_value_ledger enable row level security;

create policy subscription_value_ledger_admin_read
  on public.subscription_value_ledger for select to authenticated
  using (
    public.has_admin_role(array['admin', 'support']::public.admin_role_kind[])
    and public.has_aal2()
  );

revoke all on public.subscription_value_ledger from anon, authenticated;
grant select on public.subscription_value_ledger to authenticated;

create function public.mark_merchant_as_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_since timestamptz;
begin
  if new.status in ('active', 'grace') and new.starts_at is not null then
    v_customer_since := new.starts_at;

    update public.merchant_accounts
    set customer_since = least(coalesce(customer_since, v_customer_since), v_customer_since)
    where id = new.merchant_id;

    update public.crm_leads
    set status = 'converted',
        converted_at = coalesce(converted_at, v_customer_since)
    where merchant_id = new.merchant_id
      and status <> 'converted';
  end if;
  return new;
end;
$$;

create trigger merchant_subscription_marks_customer
after insert or update of status, starts_at on public.merchant_subscriptions
for each row execute function public.mark_merchant_as_customer();

create function public.record_subscription_payment_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'approved' then
    return new;
  end if;

  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    insert into public.subscription_value_ledger(
      merchant_id, plan_id, origin, source_id, amount_xof, recognized_at, metadata
    ) values (
      new.merchant_id,
      new.plan_id,
      'payment',
      new.id::text,
      new.amount_xof,
      coalesce(new.reviewed_at, new.paid_at, timezone('utc', now())),
      jsonb_build_object('channel', new.channel, 'billing_cycle', new.billing_cycle)
    ) on conflict (origin, source_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger subscription_payment_records_value
after insert or update of status on public.subscription_payment_submissions
for each row execute function public.record_subscription_payment_value();

create function public.record_subscription_grant_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_monthly_price integer;
begin
  select monthly_price_xof into v_monthly_price
  from public.subscription_plans where id = new.plan_id;

  insert into public.subscription_value_ledger(
    merchant_id, plan_id, origin, source_id, amount_xof, recognized_at, metadata
  ) values (
    new.merchant_id,
    new.plan_id,
    'manual_grant',
    new.id::text,
    round(v_monthly_price * new.days / 30.0)::integer,
    new.created_at,
    jsonb_build_object('days', new.days, 'reason', new.reason)
  ) on conflict (origin, source_id) do nothing;
  return new;
end;
$$;

create trigger subscription_grant_records_value
after insert on public.subscription_grants
for each row execute function public.record_subscription_grant_value();

create function public.record_test_subscription_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id text;
  v_monthly_price integer;
  v_days integer;
begin
  if new.action <> 'subscription.test_activate' or new.merchant_id is null then
    return new;
  end if;

  v_plan_id := coalesce(new.metadata ->> 'plan_id', 'essential');
  v_days := greatest(1, coalesce((new.metadata ->> 'days')::integer, 30));
  select monthly_price_xof into v_monthly_price
  from public.subscription_plans where id = v_plan_id;

  if v_monthly_price is not null then
    insert into public.subscription_value_ledger(
      merchant_id, plan_id, origin, source_id, amount_xof, recognized_at, metadata
    ) values (
      new.merchant_id,
      v_plan_id,
      'test_activation',
      new.id::text,
      round(v_monthly_price * v_days / 30.0)::integer,
      new.created_at,
      jsonb_build_object('days', v_days)
    ) on conflict (origin, source_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger test_subscription_records_value
after insert on public.audit_events
for each row execute function public.record_test_subscription_value();

-- Existing customers and financial history are made explicit once.
update public.merchant_accounts ma
set customer_since = history.first_activation
from (
  select merchant_id, min(starts_at) as first_activation
  from public.merchant_subscriptions
  where starts_at is not null
  group by merchant_id
) history
where ma.id = history.merchant_id
  and ma.customer_since is null;

update public.crm_leads lead
set status = 'converted',
    converted_at = coalesce(lead.converted_at, ma.customer_since)
from public.merchant_accounts ma
where lead.merchant_id = ma.id
  and ma.customer_since is not null
  and lead.status <> 'converted';

insert into public.subscription_value_ledger(
  merchant_id, plan_id, origin, source_id, amount_xof, recognized_at, metadata
)
select
  payment.merchant_id,
  payment.plan_id,
  'payment',
  payment.id::text,
  payment.amount_xof,
  coalesce(payment.reviewed_at, payment.paid_at),
  jsonb_build_object('channel', payment.channel, 'billing_cycle', payment.billing_cycle)
from public.subscription_payment_submissions payment
where payment.status = 'approved'
on conflict (origin, source_id) do nothing;

insert into public.subscription_value_ledger(
  merchant_id, plan_id, origin, source_id, amount_xof, recognized_at, metadata
)
select
  grant_row.merchant_id,
  grant_row.plan_id,
  'manual_grant',
  grant_row.id::text,
  round(plan.monthly_price_xof * grant_row.days / 30.0)::integer,
  grant_row.created_at,
  jsonb_build_object('days', grant_row.days, 'reason', grant_row.reason)
from public.subscription_grants grant_row
join public.subscription_plans plan on plan.id = grant_row.plan_id
on conflict (origin, source_id) do nothing;

insert into public.subscription_value_ledger(
  merchant_id, plan_id, origin, source_id, amount_xof, recognized_at, metadata
)
select
  event.merchant_id,
  coalesce(event.metadata ->> 'plan_id', subscription.plan_id),
  'test_activation',
  event.id::text,
  round(
    plan.monthly_price_xof
    * greatest(1, coalesce((event.metadata ->> 'days')::integer, 30))
    / 30.0
  )::integer,
  event.created_at,
  jsonb_build_object('days', greatest(1, coalesce((event.metadata ->> 'days')::integer, 30)))
from public.audit_events event
join public.merchant_subscriptions subscription
  on subscription.id::text = event.entity_id
join public.subscription_plans plan
  on plan.id = coalesce(event.metadata ->> 'plan_id', subscription.plan_id)
where event.action = 'subscription.test_activate'
  and event.merchant_id is not null
on conflict (origin, source_id) do nothing;

insert into public.subscription_value_ledger(
  merchant_id, plan_id, origin, source_id, amount_xof, recognized_at, metadata
)
select
  period.merchant_id,
  period.plan_id,
  'legacy',
  period.id::text,
  period.amount_xof,
  coalesce(period.paid_at, period.service_period_start),
  jsonb_build_object('billing_cycle', period.billing_cycle)
from public.subscription_billing_periods period
where period.status = 'paid'
  and not exists (
    select 1 from public.subscription_value_ledger ledger
    where ledger.merchant_id = period.merchant_id
  )
on conflict (origin, source_id) do nothing;

-- Customer documents are retained while the merchant account remains open.
create or replace function public.document_retention_candidates(
  p_rejected_days integer default 90,
  p_closed_days integer default 365
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
        ma.customer_since is null
        and vc.status = 'rejected'
        and vc.decided_at < timezone('utc', now()) - make_interval(days => p_rejected_days)
      )
      or
      (
        ma.customer_since is null
        and vc.status in ('draft', 'needs_changes')
        and vc.updated_at < timezone('utc', now()) - make_interval(days => p_rejected_days)
      )
      or
      (
        ma.status = 'closed'
        and ma.closed_at < timezone('utc', now()) - make_interval(days => p_closed_days)
      )
    );
$$;

drop function if exists public.admin_period_analytics(timestamptz, timestamptz);

create function public.admin_period_analytics(p_from timestamptz, p_to timestamptz)
returns table (
  subscription_revenue_xof bigint,
  approved_payments_count bigint,
  delivered_units bigint,
  product_revenue_xof bigint,
  paid_orders_count bigint,
  paid_units bigint,
  order_volume_xof bigint,
  refunds_xof bigint,
  subscription_breakdown jsonb,
  top_sellers jsonb,
  top_products jsonb,
  top_categories jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_admin_role(array['admin', 'support']::public.admin_role_kind[])
     or not public.has_aal2() then
    raise exception using errcode = '42501', message = 'ADMIN_MFA_REQUIRED';
  end if;

  return query
  with subscription_values as (
    select ledger.amount_xof, ledger.origin
    from public.subscription_value_ledger ledger
    where ledger.recognized_at >= p_from and ledger.recognized_at < p_to
  ),
  paid_orders as (
    select orders.id, orders.merchant_id, orders.total_xof
    from public.orders orders
    where orders.payment_status in ('paid', 'refund_pending', 'refunded')
      and orders.status <> 'cancelled'
      and orders.paid_at >= p_from
      and orders.paid_at < p_to
  ),
  paid_items as (
    select
      item.order_id,
      item.merchant_id,
      item.product_id,
      item.quantity,
      item.line_total_xof
    from public.order_items item
    join paid_orders paid on paid.id = item.order_id
  ),
  confirmed_refunds as (
    select refund.merchant_id, refund.amount_xof
    from public.order_refunds refund
    where refund.status = 'confirmed'
      and coalesce(refund.reviewed_at, refund.declared_at) >= p_from
      and coalesce(refund.reviewed_at, refund.declared_at) < p_to
  ),
  delivered_items as (
    select item.quantity, item.line_total_xof
    from public.orders orders
    join public.order_items item on item.order_id = orders.id
    where orders.delivered_at is not null
      and orders.delivered_at >= p_from and orders.delivered_at < p_to
      and orders.status <> 'disputed'
  ),
  sellers as (
    select
      merchant.id as merchant_id,
      merchant.public_name as merchant_name,
      coalesce(sum(item.quantity), 0)::bigint as units,
      coalesce(sum(item.line_total_xof), 0)::bigint as revenue_xof
    from paid_items item
    join public.merchant_accounts merchant on merchant.id = item.merchant_id
    group by merchant.id, merchant.public_name
    order by revenue_xof desc, units desc
    limit 10
  ),
  products_ranked as (
    select
      product.id as product_id,
      product.title as product_name,
      merchant.public_name as merchant_name,
      coalesce(sum(item.quantity), 0)::bigint as units,
      coalesce(sum(item.line_total_xof), 0)::bigint as revenue_xof
    from paid_items item
    join public.products product on product.id = item.product_id
    join public.merchant_accounts merchant on merchant.id = item.merchant_id
    group by product.id, product.title, merchant.public_name
    order by units desc, revenue_xof desc
    limit 10
  ),
  categories_ranked as (
    select
      category.id as category_id,
      category.name as category_name,
      coalesce(sum(item.quantity), 0)::bigint as units,
      coalesce(sum(item.line_total_xof), 0)::bigint as revenue_xof
    from paid_items item
    join public.products product on product.id = item.product_id
    join public.categories category on category.id = product.category_id
    group by category.id, category.name
    order by units desc, revenue_xof desc
    limit 10
  )
  select
    coalesce((select sum(amount_xof) from subscription_values), 0)::bigint,
    coalesce((select count(*) from subscription_values where origin = 'payment'), 0)::bigint,
    coalesce((select sum(quantity) from delivered_items), 0)::bigint,
    coalesce((select sum(line_total_xof) from delivered_items), 0)::bigint,
    coalesce((select count(*) from paid_orders), 0)::bigint,
    coalesce((select sum(quantity) from paid_items), 0)::bigint,
    greatest(
      0,
      coalesce((select sum(total_xof) from paid_orders), 0)
      - coalesce((select sum(amount_xof) from confirmed_refunds), 0)
    )::bigint,
    coalesce((select sum(amount_xof) from confirmed_refunds), 0)::bigint,
    coalesce((
      select jsonb_object_agg(origin::text, amount)
      from (
        select origin, sum(amount_xof)::bigint as amount
        from subscription_values group by origin
      ) grouped_values
    ), '{}'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'merchantId', merchant_id,
      'merchantName', merchant_name,
      'units', units,
      'revenueXof', revenue_xof
    )) from sellers), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'productId', product_id,
      'productName', product_name,
      'merchantName', merchant_name,
      'units', units,
      'revenueXof', revenue_xof
    )) from products_ranked), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'categoryId', category_id,
      'categoryName', category_name,
      'units', units,
      'revenueXof', revenue_xof
    )) from categories_ranked), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_period_analytics(timestamptz, timestamptz) from public;
grant execute on function public.admin_period_analytics(timestamptz, timestamptz) to authenticated;

commit;
