begin;

-- Les anciennes tables PayTech sont volontairement conservées pour l'audit.
-- Tous les nouveaux flux financiers passent par des déclarations directes.

drop trigger if exists orders_set_escrow_releasable_at on public.orders;

alter table public.orders
  add column if not exists payment_status text;

update public.orders o
set payment_status = case
  when o.payment_method = 'cash_on_delivery' and o.status = 'delivered' then 'paid'
  when o.payment_method = 'cash_on_delivery' then 'cash_due'
  when exists (
    select 1 from public.direct_payment_declarations d
    where d.order_id = o.id and d.confirmed_by_merchant_at is not null
  ) then 'paid'
  when exists (
    select 1 from public.direct_payment_declarations d where d.order_id = o.id
  ) then 'pending_confirmation'
  when o.payment_method = 'paytech' and exists (
    select 1 from public.payment_intents pi
    where pi.order_batch_id = o.batch_id and pi.status = 'paid'
  ) then 'paid'
  else 'awaiting_payment'
end
where payment_status is null;

alter table public.orders
  alter column payment_status set default 'awaiting_payment',
  alter column payment_status set not null,
  add constraint orders_payment_status_valid check (
    payment_status in (
      'awaiting_payment', 'cash_due', 'pending_confirmation', 'paid',
      'payment_refused', 'refund_pending', 'refunded'
    )
  );

alter table public.direct_payment_declarations
  add column if not exists status text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.direct_payment_declarations
set status = case when confirmed_by_merchant_at is null then 'pending' else 'confirmed' end,
    reviewed_at = confirmed_by_merchant_at
where status is null;

with ranked as (
  select id, row_number() over (partition by order_id order by created_at desc, id desc) as position
  from public.direct_payment_declarations where status = 'pending'
)
update public.direct_payment_declarations d
set status = 'rejected', reviewed_at = timezone('utc', now()),
    rejection_reason = 'Déclaration antérieure remplacée lors de la migration.'
from ranked r where r.id = d.id and r.position > 1;

alter table public.direct_payment_declarations
  alter column status set default 'pending',
  alter column status set not null,
  add constraint direct_payment_status_valid check (status in ('pending', 'confirmed', 'rejected')),
  add constraint direct_payment_review_valid check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null and rejection_reason is null)
    or (status = 'confirmed' and reviewed_at is not null and rejection_reason is null)
    or (status = 'rejected' and reviewed_at is not null
      and char_length(trim(rejection_reason)) between 4 and 500)
  );

create unique index direct_payment_one_pending_per_order_idx
  on public.direct_payment_declarations(order_id)
  where status = 'pending';

create table public.order_refunds (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  amount_xof integer not null,
  channel public.payment_channel not null,
  external_reference text not null,
  destination_number text not null,
  status text not null default 'pending_confirmation',
  declared_by uuid not null references public.profiles(id) on delete restrict,
  declared_at timestamptz not null default timezone('utc', now()),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  contest_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_refund_amount_positive check (amount_xof > 0),
  constraint order_refund_direct_channel check (channel in ('wave', 'orange_money')),
  constraint order_refund_status_valid check (status in ('pending_confirmation', 'confirmed', 'contested')),
  constraint order_refund_reference_length check (char_length(trim(external_reference)) between 2 and 120),
  constraint order_refund_review_valid check (
    (status = 'pending_confirmation' and reviewed_at is null and reviewed_by is null and contest_reason is null)
    or (status = 'confirmed' and reviewed_at is not null and reviewed_by is not null and contest_reason is null)
    or (status = 'contested' and reviewed_at is not null and reviewed_by is not null
      and char_length(trim(contest_reason)) between 4 and 500)
  ),
  unique (destination_number, channel, external_reference)
);

create index order_refunds_order_idx on public.order_refunds(order_id, created_at desc);

create table public.order_disputes (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  status text not null default 'open',
  resolution text,
  resolution_note text,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  opened_at timestamptz not null default timezone('utc', now()),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  constraint order_dispute_status_valid check (status in ('open', 'refund_required', 'no_refund', 'resolved')),
  constraint order_dispute_reason_length check (char_length(trim(reason)) between 20 and 1000)
);

create unique index order_disputes_one_open_idx
  on public.order_disputes(order_id)
  where status in ('open', 'refund_required');

create table public.platform_payment_settings (
  channel public.payment_channel primary key,
  payment_number text not null,
  account_holder text,
  active boolean not null default true,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint platform_payment_direct_channel check (channel in ('wave', 'orange_money')),
  constraint platform_payment_number_format check (payment_number ~ '^\+[1-9][0-9]{7,14}$'),
  constraint platform_payment_holder_length check (account_holder is null or char_length(trim(account_holder)) between 2 and 120)
);

alter table public.merchant_subscriptions
  add column if not exists billing_cycle text not null default 'monthly';
alter table public.merchant_subscriptions
  add constraint merchant_subscription_cycle_valid check (billing_cycle in ('monthly', 'quarterly', 'annual'));

alter table public.subscription_payment_submissions
  add column if not exists billing_cycle text not null default 'monthly',
  add column if not exists period_months integer not null default 1,
  add column if not exists destination_number text;
alter table public.subscription_payment_submissions
  add constraint subscription_submission_cycle_valid check (billing_cycle in ('monthly', 'quarterly', 'annual')),
  add constraint subscription_submission_months_valid check (period_months in (1, 3, 12)),
  add constraint subscription_submission_destination_format check (
    destination_number is null or destination_number ~ '^\+[1-9][0-9]{7,14}$'
  );

create table public.subscription_billing_periods (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  subscription_id uuid references public.merchant_subscriptions(id) on delete set null,
  plan_id text not null references public.subscription_plans(id) on delete restrict,
  billing_cycle text not null,
  period_months integer not null,
  amount_xof integer not null,
  service_period_start timestamptz not null,
  service_period_end timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'upcoming',
  payment_submission_id uuid unique references public.subscription_payment_submissions(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subscription_billing_cycle_valid check (billing_cycle in ('monthly', 'quarterly', 'annual')),
  constraint subscription_billing_months_valid check (period_months in (1, 3, 12)),
  constraint subscription_billing_amount_positive check (amount_xof > 0),
  constraint subscription_billing_dates_valid check (service_period_end > service_period_start),
  constraint subscription_billing_status_valid check (
    status in ('upcoming', 'due', 'pending_validation', 'paid', 'overdue', 'refused', 'expired')
  )
);

alter table public.subscription_payment_submissions
  add column if not exists billing_period_id uuid references public.subscription_billing_periods(id) on delete set null;

-- Reconstitue la période actuellement connue afin que le CRM ne démarre pas
-- sans historique le jour de la bascule.
with latest_subscription as (
  select distinct on (ms.merchant_id) ms.*
  from public.merchant_subscriptions ms
  where ms.status <> 'cancelled'
  order by ms.merchant_id, ms.created_at desc
), legacy_rows as (
  select
    ms.*,
    case ms.billing_cycle when 'quarterly' then 3 when 'annual' then 12 else 1 end as months,
    sp.monthly_price_xof,
    legacy_payment.id as payment_id,
    legacy_payment.paid_at as legacy_paid_at
  from latest_subscription ms
  join public.subscription_plans sp on sp.id = ms.plan_id
  left join lateral (
    select s.id, s.paid_at
    from public.subscription_payment_submissions s
    where s.merchant_id = ms.merchant_id and s.status = 'approved'
    order by s.reviewed_at desc nulls last, s.created_at desc
    limit 1
  ) legacy_payment on true
)
insert into public.subscription_billing_periods(
  merchant_id, subscription_id, plan_id, billing_cycle, period_months, amount_xof,
  service_period_start, service_period_end, due_at, status, payment_submission_id, paid_at
)
select
  merchant_id, id, plan_id, billing_cycle, months, monthly_price_xof * months,
  coalesce(starts_at, created_at),
  coalesce(current_period_ends_at, coalesce(starts_at, created_at) + make_interval(months => legacy_rows.months)),
  coalesce(starts_at, created_at),
  case status when 'active' then 'paid' when 'grace' then 'paid' when 'expired' then 'expired' else 'due' end,
  payment_id,
  case when status in ('active', 'grace') then coalesce(legacy_paid_at, starts_at, created_at) else null end
from legacy_rows;

update public.subscription_payment_submissions s
set billing_period_id = b.id
from public.subscription_billing_periods b
where b.payment_submission_id = s.id and s.billing_period_id is null;

insert into public.subscription_billing_periods(
  merchant_id, subscription_id, plan_id, billing_cycle, period_months, amount_xof,
  service_period_start, service_period_end, due_at, status
)
select
  b.merchant_id, b.subscription_id, b.plan_id, b.billing_cycle, b.period_months, b.amount_xof,
  b.service_period_end, b.service_period_end + make_interval(months => b.period_months),
  b.service_period_end, 'upcoming'
from public.subscription_billing_periods b
join public.merchant_subscriptions ms on ms.id = b.subscription_id
where b.status = 'paid' and ms.status in ('active', 'grace');

create index subscription_billing_month_idx
  on public.subscription_billing_periods(due_at, status, merchant_id);
create unique index subscription_billing_one_open_idx
  on public.subscription_billing_periods(merchant_id)
  where status in ('upcoming', 'due', 'pending_validation', 'overdue');

alter table public.courier_memberships
  add column if not exists wave_payment_number text,
  add column if not exists orange_money_payment_number text,
  add column if not exists preferred_payment_channel text;
alter table public.courier_memberships
  add constraint courier_wave_number_format check (wave_payment_number is null or wave_payment_number ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint courier_om_number_format check (orange_money_payment_number is null or orange_money_payment_number ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint courier_preferred_channel_valid check (
    preferred_payment_channel is null or preferred_payment_channel in ('wave', 'orange_money')
  ),
  add constraint courier_preferred_number_present check (
    preferred_payment_channel is null
    or (preferred_payment_channel = 'wave' and wave_payment_number is not null)
    or (preferred_payment_channel = 'orange_money' and orange_money_payment_number is not null)
  );

alter table public.courier_payouts
  add column if not exists destination_number text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists contest_reason text;

alter table public.courier_payouts drop constraint if exists courier_payout_status_valid;
alter table public.courier_payouts drop constraint if exists courier_payout_void_valid;
update public.courier_payouts
set status = 'confirmed', reviewed_by = recorded_by, reviewed_at = paid_at
where status = 'recorded';
alter table public.courier_payouts
  add constraint courier_payout_status_valid check (status in ('pending_confirmation', 'confirmed', 'contested', 'voided')),
  add constraint courier_payout_review_valid check (
    (status = 'pending_confirmation' and reviewed_at is null and reviewed_by is null and contest_reason is null and voided_at is null)
    or (status = 'confirmed' and reviewed_at is not null and reviewed_by is not null and contest_reason is null and voided_at is null)
    or (status = 'contested' and reviewed_at is not null and reviewed_by is not null
      and char_length(trim(contest_reason)) between 4 and 500 and voided_at is null)
    or (status = 'voided' and voided_at is not null and voided_by is not null
      and char_length(trim(void_reason)) between 4 and 500)
  );

create unique index courier_payout_reference_beneficiary_idx
  on public.courier_payouts(destination_number, payment_method, external_reference)
  where destination_number is not null and external_reference is not null;

alter table public.deliveries drop constraint if exists delivery_courier_financials_valid;
alter table public.deliveries drop constraint if exists delivery_courier_payout_state_valid;
alter table public.deliveries
  add constraint delivery_courier_financials_valid check (
    (courier_fee_xof is null or courier_fee_xof >= 0)
    and courier_payable_xof >= 0
    and courier_payment_status in ('not_due', 'review_required', 'due', 'payment_declared', 'paid', 'waived')
  ),
  add constraint delivery_courier_payout_state_valid check (
    (courier_payment_status in ('payment_declared', 'paid') and courier_payout_id is not null)
    or (courier_payment_status not in ('payment_declared', 'paid') and courier_payout_id is null)
  );

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.order_refunds enable row level security;
alter table public.order_disputes enable row level security;
alter table public.platform_payment_settings enable row level security;
alter table public.subscription_billing_periods enable row level security;

create policy order_refunds_participant_read on public.order_refunds
  for select to authenticated using (
    buyer_id = auth.uid()
    or public.is_merchant_member(merchant_id, null)
    or (public.has_admin_role(array['support', 'admin']::public.admin_role_kind[]) and public.has_aal2())
  );
create policy order_disputes_participant_read on public.order_disputes
  for select to authenticated using (
    buyer_id = auth.uid()
    or public.is_merchant_member(merchant_id, null)
    or (public.has_admin_role(array['support', 'admin']::public.admin_role_kind[]) and public.has_aal2())
  );
create policy platform_payment_settings_admin_all on public.platform_payment_settings
  for all to authenticated
  using (public.has_admin_role(array['admin']::public.admin_role_kind[]) and public.has_aal2())
  with check (public.has_admin_role(array['admin']::public.admin_role_kind[]) and public.has_aal2());
create policy platform_payment_settings_merchant_read on public.platform_payment_settings
  for select to authenticated using (
    exists (select 1 from public.merchant_members mm where mm.user_id = auth.uid() and mm.active)
  );
create policy subscription_billing_participant_read on public.subscription_billing_periods
  for select to authenticated using (
    public.is_merchant_member(merchant_id, null)
    or (public.has_admin_role(array['support', 'admin']::public.admin_role_kind[]) and public.has_aal2())
  );

revoke all on public.order_refunds, public.order_disputes, public.platform_payment_settings,
  public.subscription_billing_periods from anon, authenticated;
grant select on public.order_refunds, public.order_disputes, public.platform_payment_settings,
  public.subscription_billing_periods to authenticated;

-- ---------------------------------------------------------------------------
-- Commandes : contrôle des moyens et validation des paiements directs.
-- ---------------------------------------------------------------------------

create function public.enforce_direct_order_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.payment_method = 'paytech' then
      raise exception using errcode = '23514', message = 'PAYTECH_DISABLED';
    end if;
    if new.payment_method = 'cash_on_delivery' then
      if coalesce(new.delivery_snapshot ->> 'methodKind', '') <> 'pickup' then
        raise exception using errcode = '23514', message = 'CASH_PICKUP_ONLY';
      end if;
      new.payment_status := 'cash_due';
    elsif new.payment_method in ('wave_direct', 'orange_money_direct') then
      if nullif(new.payment_instructions_snapshot ->> 'number', '') is null then
        raise exception using errcode = '23514', message = 'PAYMENT_NUMBER_MISSING';
      end if;
      new.payment_instructions_snapshot := new.payment_instructions_snapshot
        || jsonb_build_object('amountXof', new.total_xof);
      new.payment_status := 'awaiting_payment';
    end if;
  elsif new.status is distinct from old.status
    and new.status in ('confirmed', 'preparing', 'ready_for_handoff', 'in_transit', 'delivered')
    and old.payment_method in ('wave_direct', 'orange_money_direct')
    and old.payment_status <> 'paid' then
    raise exception using errcode = '23514', message = 'DIRECT_PAYMENT_NOT_CONFIRMED';
  elsif new.status is distinct from old.status
    and new.status in ('in_transit', 'delivered')
    and old.payment_method = 'cash_on_delivery'
    and coalesce(old.delivery_snapshot ->> 'methodKind', '') = 'pickup'
    and old.payment_status <> 'paid' then
    raise exception using errcode = '23514', message = 'CASH_PAYMENT_NOT_CONFIRMED';
  elsif new.status is distinct from old.status
    and new.status = 'delivered'
    and old.payment_method = 'cash_on_delivery'
    and coalesce(old.delivery_snapshot ->> 'methodKind', '') <> 'pickup' then
    -- Grand-père des anciennes livraisons en espèces, créées avant la bascule.
    new.payment_status := 'paid';
  end if;
  return new;
end;
$$;

create trigger orders_enforce_direct_payment
before insert or update of status on public.orders
for each row execute function public.enforce_direct_order_payment();

create or replace function public.declare_direct_payment(
  p_order_id uuid,
  p_channel public.payment_channel,
  p_external_reference text,
  p_amount_xof integer,
  p_declared_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_id uuid;
begin
  if p_channel not in ('wave', 'orange_money') then
    raise exception using errcode = '23514', message = 'DIRECT_PAYMENT_CHANNEL_REQUIRED';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.buyer_id <> auth.uid() then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.payment_method not in ('wave_direct', 'orange_money_direct')
    or (v_order.payment_method = 'wave_direct' and p_channel <> 'wave')
    or (v_order.payment_method = 'orange_money_direct' and p_channel <> 'orange_money') then
    raise exception using errcode = '23514', message = 'PAYMENT_CHANNEL_MISMATCH';
  end if;
  if v_order.payment_status in ('paid', 'refund_pending', 'refunded') then
    raise exception using errcode = '23514', message = 'PAYMENT_ALREADY_CONFIRMED';
  end if;
  if p_amount_xof <> v_order.total_xof then
    raise exception using errcode = '23514', message = 'PAYMENT_AMOUNT_MISMATCH';
  end if;
  if char_length(trim(p_external_reference)) < 4 then
    raise exception using errcode = '23514', message = 'PAYMENT_REFERENCE_REQUIRED';
  end if;

  insert into public.direct_payment_declarations(
    order_id, buyer_id, merchant_id, channel, external_reference,
    amount_xof, declared_at, status
  ) values (
    v_order.id, v_order.buyer_id, v_order.merchant_id, p_channel,
    trim(p_external_reference), p_amount_xof, p_declared_at, 'pending'
  ) returning id into v_id;

  update public.orders set payment_status = 'pending_confirmation' where id = v_order.id;
  insert into public.order_events(order_id, merchant_id, actor_id, from_status, to_status, public_message, metadata)
  values (v_order.id, v_order.merchant_id, auth.uid(), v_order.status, v_order.status,
    'Le client a déclaré son transfert direct.',
    jsonb_build_object('payment_declaration_id', v_id, 'channel', p_channel));
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id)
  values (auth.uid(), v_order.merchant_id, 'direct_payment.declare', 'direct_payment_declaration', v_id::text);
  return v_id;
end;
$$;

create function public.review_direct_payment(
  p_declaration_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns public.direct_payment_declarations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_declaration public.direct_payment_declarations%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_declaration from public.direct_payment_declarations
  where id = p_declaration_id for update;
  if v_declaration.id is null or not public.is_merchant_member(
    v_declaration.merchant_id,
    array['owner', 'manager', 'fulfillment']::public.merchant_member_role[]
  ) then raise exception using errcode = 'P0002', message = 'PAYMENT_DECLARATION_NOT_FOUND'; end if;
  if v_declaration.status <> 'pending' then
    raise exception using errcode = '23514', message = 'PAYMENT_DECLARATION_ALREADY_REVIEWED';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception using errcode = '23514', message = 'PAYMENT_DECISION_INVALID';
  end if;
  if p_decision = 'rejected' and char_length(trim(coalesce(p_rejection_reason, ''))) < 4 then
    raise exception using errcode = '23514', message = 'PAYMENT_REJECTION_REASON_REQUIRED';
  end if;

  update public.direct_payment_declarations
  set status = p_decision,
      reviewed_by = auth.uid(), reviewed_at = timezone('utc', now()),
      confirmed_by_merchant_at = case when p_decision = 'confirmed' then timezone('utc', now()) else null end,
      rejection_reason = case when p_decision = 'rejected' then trim(p_rejection_reason) else null end,
      updated_at = timezone('utc', now())
  where id = v_declaration.id returning * into v_declaration;

  update public.orders
  set payment_status = case when p_decision = 'confirmed' then 'paid' else 'payment_refused' end
  where id = v_declaration.order_id returning * into v_order;

  insert into public.order_events(order_id, merchant_id, actor_id, from_status, to_status, public_message, metadata)
  values (v_order.id, v_order.merchant_id, auth.uid(), v_order.status, v_order.status,
    case when p_decision = 'confirmed' then 'Le marchand a confirmé la réception du paiement.'
      else 'Le marchand a refusé la déclaration de paiement.' end,
    jsonb_build_object('payment_declaration_id', v_declaration.id, 'decision', p_decision));
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_order.merchant_id, 'direct_payment.' || p_decision,
    'direct_payment_declaration', v_declaration.id::text,
    jsonb_build_object('reason', v_declaration.rejection_reason));
  return v_declaration;
end;
$$;

create or replace function public.confirm_direct_payment(p_declaration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.review_direct_payment(p_declaration_id, 'confirmed', null);
end;
$$;

create function public.record_pickup_cash_payment(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or not public.is_merchant_member(v_order.merchant_id,
    array['owner', 'manager', 'fulfillment']::public.merchant_member_role[]) then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.payment_method <> 'cash_on_delivery'
    or coalesce(v_order.delivery_snapshot ->> 'methodKind', '') <> 'pickup' then
    raise exception using errcode = '23514', message = 'CASH_PICKUP_ONLY';
  end if;
  if v_order.status <> 'ready_for_handoff' then
    raise exception using errcode = '23514', message = 'CASH_NOT_YET_COLLECTIBLE';
  end if;
  update public.orders set payment_status = 'paid' where id = p_order_id returning * into v_order;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id)
  values (auth.uid(), v_order.merchant_id, 'cash_payment.confirm', 'order', v_order.id::text);
  return v_order;
end;
$$;

create function public.declare_order_refund(
  p_order_id uuid, p_amount_xof integer, p_channel public.payment_channel,
  p_external_reference text, p_destination_number text
)
returns public.order_refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_refund public.order_refunds%rowtype;
  v_committed integer;
begin
  if p_channel not in ('wave', 'orange_money') then
    raise exception using errcode = '23514', message = 'DIRECT_REFUND_CHANNEL_REQUIRED';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or not public.is_merchant_member(v_order.merchant_id,
    array['owner', 'manager']::public.merchant_member_role[]) then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.payment_status not in ('paid', 'refund_pending') then
    raise exception using errcode = '23514', message = 'ORDER_NOT_PAID';
  end if;
  select coalesce(sum(amount_xof), 0)::integer into v_committed
  from public.order_refunds where order_id = p_order_id and status in ('pending_confirmation', 'confirmed');
  if p_amount_xof <= 0 or v_committed + p_amount_xof > v_order.total_xof then
    raise exception using errcode = '23514', message = 'REFUND_AMOUNT_INVALID';
  end if;
  insert into public.order_refunds(
    order_id, merchant_id, buyer_id, amount_xof, channel, external_reference,
    destination_number, declared_by
  ) values (
    v_order.id, v_order.merchant_id, v_order.buyer_id, p_amount_xof, p_channel,
    trim(p_external_reference), p_destination_number, auth.uid()
  ) returning * into v_refund;
  update public.orders set payment_status = 'refund_pending' where id = v_order.id;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_order.merchant_id, 'refund.declare', 'order_refund', v_refund.id::text,
    jsonb_build_object('amountXof', p_amount_xof, 'channel', p_channel));
  return v_refund;
end;
$$;

create function public.review_order_refund(
  p_refund_id uuid, p_decision text, p_contest_reason text default null
)
returns public.order_refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.order_refunds%rowtype;
  v_confirmed integer;
  v_pending integer;
  v_total integer;
begin
  select * into v_refund from public.order_refunds where id = p_refund_id for update;
  if v_refund.id is null or v_refund.buyer_id <> auth.uid() then
    raise exception using errcode = 'P0002', message = 'REFUND_NOT_FOUND';
  end if;
  if v_refund.status <> 'pending_confirmation' then
    raise exception using errcode = '23514', message = 'REFUND_ALREADY_REVIEWED';
  end if;
  if p_decision not in ('confirmed', 'contested') then
    raise exception using errcode = '23514', message = 'REFUND_DECISION_INVALID';
  end if;
  if p_decision = 'contested' and char_length(trim(coalesce(p_contest_reason, ''))) < 4 then
    raise exception using errcode = '23514', message = 'REFUND_CONTEST_REASON_REQUIRED';
  end if;
  update public.order_refunds
  set status = p_decision, reviewed_by = auth.uid(), reviewed_at = timezone('utc', now()),
      contest_reason = case when p_decision = 'contested' then trim(p_contest_reason) else null end,
      updated_at = timezone('utc', now())
  where id = p_refund_id returning * into v_refund;
  select total_xof into v_total from public.orders where id = v_refund.order_id;
  select coalesce(sum(amount_xof), 0)::integer into v_confirmed
  from public.order_refunds where order_id = v_refund.order_id and status = 'confirmed';
  select count(*)::integer into v_pending
  from public.order_refunds where order_id = v_refund.order_id and status = 'pending_confirmation';
  update public.orders
  set payment_status = case
    when v_confirmed >= v_total then 'refunded'
    when v_pending > 0 then 'refund_pending'
    else 'paid'
  end
  where id = v_refund.order_id;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_refund.merchant_id, 'refund.' || p_decision, 'order_refund', v_refund.id::text,
    jsonb_build_object('reason', v_refund.contest_reason));
  return v_refund;
end;
$$;

drop function if exists public.open_order_dispute(uuid, text);
create function public.open_order_dispute(p_order_id uuid, p_reason text)
returns public.order_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.orders%rowtype; v_dispute public.order_disputes%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.buyer_id <> auth.uid() then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 20 then
    raise exception using errcode = '23514', message = 'DISPUTE_REASON_REQUIRED';
  end if;
  insert into public.order_disputes(order_id, merchant_id, buyer_id, reason, opened_by)
  values (v_order.id, v_order.merchant_id, v_order.buyer_id, trim(p_reason), auth.uid())
  returning * into v_dispute;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id)
  values (auth.uid(), v_order.merchant_id, 'order_dispute.open', 'order_dispute', v_dispute.id::text);
  return v_dispute;
end;
$$;

create function public.resolve_direct_order_dispute(
  p_dispute_id uuid, p_resolution text, p_note text
)
returns public.order_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare v_dispute public.order_disputes%rowtype;
begin
  if not (public.has_admin_role(array['support', 'admin']::public.admin_role_kind[]) and public.has_aal2()) then
    raise exception using errcode = '42501', message = 'ADMIN_AAL2_REQUIRED';
  end if;
  if p_resolution not in ('refund_required', 'no_refund') or char_length(trim(coalesce(p_note, ''))) < 4 then
    raise exception using errcode = '23514', message = 'DISPUTE_RESOLUTION_INVALID';
  end if;
  select * into v_dispute from public.order_disputes where id = p_dispute_id for update;
  if v_dispute.id is null or v_dispute.status <> 'open' then
    raise exception using errcode = 'P0002', message = 'DISPUTE_NOT_FOUND';
  end if;
  update public.order_disputes
  set status = p_resolution, resolution = p_resolution, resolution_note = trim(p_note),
      resolved_by = auth.uid(), resolved_at = timezone('utc', now())
  where id = p_dispute_id returning * into v_dispute;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_dispute.merchant_id, 'order_dispute.resolve', 'order_dispute', v_dispute.id::text,
    jsonb_build_object('resolution', p_resolution, 'note', trim(p_note)));
  return v_dispute;
end;
$$;

-- ---------------------------------------------------------------------------
-- Abonnements : échéances mensuelles, trimestrielles et annuelles.
-- ---------------------------------------------------------------------------

drop function if exists public.submit_subscription_payment(uuid, text, public.payment_channel, text, integer, timestamptz);
create function public.submit_subscription_payment(
  p_merchant_id uuid,
  p_plan_id text,
  p_billing_cycle text,
  p_channel public.payment_channel,
  p_external_reference text,
  p_amount_xof integer,
  p_paid_at timestamptz
)
returns public.subscription_payment_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_subscription public.merchant_subscriptions%rowtype;
  v_submission public.subscription_payment_submissions%rowtype;
  v_period public.subscription_billing_periods%rowtype;
  v_months integer;
  v_start timestamptz;
  v_expected integer;
  v_destination_number text;
begin
  if not public.is_merchant_member(p_merchant_id,
    array['owner', 'manager']::public.merchant_member_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  v_months := case p_billing_cycle when 'monthly' then 1 when 'quarterly' then 3 when 'annual' then 12 else null end;
  if v_months is null then raise exception using errcode = '23514', message = 'BILLING_CYCLE_INVALID'; end if;
  if p_channel not in ('wave', 'orange_money') then
    raise exception using errcode = '23514', message = 'PAYMENT_CHANNEL_MISMATCH';
  end if;
  select s.payment_number into v_destination_number
  from public.platform_payment_settings s where s.channel = p_channel and s.active;
  if v_destination_number is null then
    raise exception using errcode = '23514', message = 'PAYMENT_CHANNEL_UNAVAILABLE';
  end if;
  select * into v_plan from public.subscription_plans where id = p_plan_id and active;
  if v_plan.id is null then raise exception using errcode = 'P0002', message = 'SUBSCRIPTION_PLAN_NOT_FOUND'; end if;
  v_expected := v_plan.monthly_price_xof * v_months;
  if p_amount_xof <> v_expected then raise exception using errcode = '23514', message = 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if char_length(trim(p_external_reference)) < 4 then raise exception using errcode = '23514', message = 'PAYMENT_REFERENCE_REQUIRED'; end if;

  select * into v_subscription from public.merchant_subscriptions
  where merchant_id = p_merchant_id order by created_at desc limit 1 for update;
  v_start := greatest(timezone('utc', now()), coalesce(v_subscription.current_period_ends_at, timezone('utc', now())));

  select * into v_period from public.subscription_billing_periods
  where merchant_id = p_merchant_id and status in ('upcoming', 'due', 'overdue')
  order by due_at limit 1 for update;
  if v_period.id is null then
    insert into public.subscription_billing_periods(
      merchant_id, subscription_id, plan_id, billing_cycle, period_months, amount_xof,
      service_period_start, service_period_end, due_at, status
    ) values (
      p_merchant_id, v_subscription.id, p_plan_id, p_billing_cycle, v_months, v_expected,
      v_start, v_start + make_interval(months => v_months), v_start, 'pending_validation'
    ) returning * into v_period;
  else
    update public.subscription_billing_periods
    set plan_id = p_plan_id, billing_cycle = p_billing_cycle, period_months = v_months,
        amount_xof = v_expected, service_period_start = v_start,
        service_period_end = v_start + make_interval(months => v_months),
        status = 'pending_validation', updated_at = timezone('utc', now())
    where id = v_period.id returning * into v_period;
  end if;

  insert into public.subscription_payment_submissions(
    merchant_id, subscription_id, plan_id, submitted_by, channel, external_reference,
    amount_xof, paid_at, billing_cycle, period_months, billing_period_id, destination_number
  ) values (
    p_merchant_id, v_subscription.id, p_plan_id, auth.uid(), p_channel,
    trim(p_external_reference), v_expected, p_paid_at, p_billing_cycle, v_months, v_period.id,
    v_destination_number
  ) returning * into v_submission;
  update public.subscription_billing_periods
  set payment_submission_id = v_submission.id where id = v_period.id;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_merchant_id, 'subscription_payment.submit', 'subscription_payment_submission',
    v_submission.id::text, jsonb_build_object('billingCycle', p_billing_cycle, 'amountXof', v_expected));
  return v_submission;
end;
$$;

create or replace function public.review_subscription_payment(
  p_submission_id uuid,
  p_approved boolean,
  p_rejection_reason text default null
)
returns public.subscription_payment_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.subscription_payment_submissions%rowtype;
  v_subscription public.merchant_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_period public.subscription_billing_periods%rowtype;
  v_start timestamptz;
  v_end timestamptz;
begin
  if not (public.has_admin_role(array['admin']::public.admin_role_kind[]) and public.has_aal2()) then
    raise exception using errcode = '42501', message = 'ADMIN_AAL2_REQUIRED';
  end if;
  select * into v_submission from public.subscription_payment_submissions
  where id = p_submission_id for update;
  if v_submission.id is null then raise exception using errcode = 'P0002', message = 'PAYMENT_SUBMISSION_NOT_FOUND'; end if;
  if v_submission.status <> 'pending' then raise exception using errcode = '23514', message = 'PAYMENT_ALREADY_REVIEWED'; end if;
  if not p_approved and char_length(trim(coalesce(p_rejection_reason, ''))) < 2 then
    raise exception using errcode = '23514', message = 'REJECTION_REASON_REQUIRED';
  end if;
  select * into v_plan from public.subscription_plans where id = v_submission.plan_id;
  if v_submission.amount_xof <> v_plan.monthly_price_xof * v_submission.period_months then
    raise exception using errcode = '23514', message = 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  if not p_approved then
    update public.subscription_payment_submissions
    set status = 'rejected', reviewer_id = auth.uid(), reviewed_at = timezone('utc', now()),
        rejection_reason = trim(p_rejection_reason)
    where id = p_submission_id returning * into v_submission;
    update public.subscription_billing_periods
    set status = 'refused', updated_at = timezone('utc', now())
    where id = v_submission.billing_period_id;
  else
    select * into v_subscription from public.merchant_subscriptions
    where merchant_id = v_submission.merchant_id order by created_at desc limit 1 for update;
    v_start := greatest(timezone('utc', now()), coalesce(v_subscription.current_period_ends_at, timezone('utc', now())));
    v_end := v_start + make_interval(months => v_submission.period_months);
    if v_subscription.id is null then
      insert into public.merchant_subscriptions(
        merchant_id, plan_id, status, starts_at, current_period_ends_at, grace_ends_at, billing_cycle
      ) values (
        v_submission.merchant_id, v_submission.plan_id, 'active', timezone('utc', now()),
        v_end, v_end + interval '3 days', v_submission.billing_cycle
      ) returning * into v_subscription;
    else
      update public.merchant_subscriptions
      set plan_id = v_submission.plan_id, status = 'active', billing_cycle = v_submission.billing_cycle,
          starts_at = coalesce(starts_at, timezone('utc', now())), current_period_ends_at = v_end,
          grace_ends_at = v_end + interval '3 days', cancelled_at = null
      where id = v_subscription.id returning * into v_subscription;
    end if;
    update public.subscription_payment_submissions
    set subscription_id = v_subscription.id, status = 'approved', reviewer_id = auth.uid(),
        reviewed_at = timezone('utc', now()), rejection_reason = null
    where id = p_submission_id returning * into v_submission;
    update public.subscription_billing_periods
    set subscription_id = v_subscription.id, service_period_start = v_start, service_period_end = v_end,
        status = 'paid', paid_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where id = v_submission.billing_period_id returning * into v_period;
    update public.merchant_accounts set subscription_status = 'active', status = 'active'
    where id = v_submission.merchant_id;
    insert into public.subscription_billing_periods(
      merchant_id, subscription_id, plan_id, billing_cycle, period_months, amount_xof,
      service_period_start, service_period_end, due_at, status
    ) values (
      v_submission.merchant_id, v_subscription.id, v_submission.plan_id,
      v_submission.billing_cycle, v_submission.period_months,
      v_plan.monthly_price_xof * v_submission.period_months,
      v_end, v_end + make_interval(months => v_submission.period_months), v_end, 'upcoming'
    );
  end if;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_submission.merchant_id,
    case when p_approved then 'subscription_payment.approve' else 'subscription_payment.reject' end,
    'subscription_payment_submission', v_submission.id::text,
    jsonb_build_object('billingCycle', v_submission.billing_cycle));
  return v_submission;
end;
$$;

create function public.refresh_subscription_billing_periods()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer := 0; v_changed integer;
begin
  update public.subscription_billing_periods
  set status = 'due', updated_at = timezone('utc', now())
  where status = 'upcoming' and due_at <= timezone('utc', now());
  get diagnostics v_changed = row_count; v_count := v_count + v_changed;
  update public.subscription_billing_periods
  set status = 'overdue', updated_at = timezone('utc', now())
  where status = 'due' and due_at + interval '1 day' <= timezone('utc', now());
  get diagnostics v_changed = row_count; v_count := v_count + v_changed;
  update public.subscription_billing_periods
  set status = 'expired', updated_at = timezone('utc', now())
  where status = 'overdue' and due_at + interval '3 days' <= timezone('utc', now());
  get diagnostics v_changed = row_count; v_count := v_count + v_changed;
  return v_count;
end;
$$;

create function public.set_platform_payment_setting(
  p_channel public.payment_channel, p_payment_number text,
  p_account_holder text, p_active boolean
)
returns public.platform_payment_settings
language plpgsql
security definer
set search_path = ''
as $$
declare v_setting public.platform_payment_settings%rowtype;
begin
  if not (public.has_admin_role(array['admin']::public.admin_role_kind[]) and public.has_aal2()) then
    raise exception using errcode = '42501', message = 'ADMIN_AAL2_REQUIRED';
  end if;
  if p_channel not in ('wave', 'orange_money') then
    raise exception using errcode = '23514', message = 'PLATFORM_PAYMENT_CHANNEL_INVALID';
  end if;
  insert into public.platform_payment_settings(channel, payment_number, account_holder, active, updated_by)
  values (p_channel, p_payment_number, nullif(trim(p_account_holder), ''), p_active, auth.uid())
  on conflict (channel) do update set payment_number = excluded.payment_number,
    account_holder = excluded.account_holder, active = excluded.active,
    updated_by = auth.uid(), updated_at = timezone('utc', now())
  returning * into v_setting;
  insert into public.audit_events(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform_payment_setting.update', 'platform_payment_setting', p_channel::text,
    jsonb_build_object('active', p_active));
  return v_setting;
end;
$$;

create function public.update_merchant_payment_numbers(
  p_merchant_id uuid, p_wave_number text, p_orange_money_number text
)
returns public.merchant_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant public.merchant_accounts%rowtype;
begin
  if not public.is_merchant_member(p_merchant_id,
    array['owner', 'manager']::public.merchant_member_role[]) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  update public.merchant_accounts
  set wave_payment_number = p_wave_number, orange_money_payment_number = p_orange_money_number
  where id = p_merchant_id returning * into v_merchant;
  if v_merchant.id is null then raise exception using errcode = 'P0002', message = 'MERCHANT_NOT_FOUND'; end if;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id)
  values (auth.uid(), p_merchant_id, 'merchant.payment_settings.update', 'merchant_account', p_merchant_id::text);
  return v_merchant;
end;
$$;

create function public.update_courier_payment_profile(
  p_wave_number text, p_orange_money_number text, p_preferred_channel text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if p_preferred_channel is not null and p_preferred_channel not in ('wave', 'orange_money') then
    raise exception using errcode = '23514', message = 'COURIER_PAYMENT_CHANNEL_INVALID';
  end if;
  update public.courier_memberships
  set wave_payment_number = p_wave_number,
      orange_money_payment_number = p_orange_money_number,
      preferred_payment_channel = p_preferred_channel
  where courier_user_id = auth.uid();
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception using errcode = 'P0002', message = 'COURIER_NOT_FOUND'; end if;
  insert into public.audit_events(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'courier.payment_profile.update', 'profile', auth.uid()::text,
    jsonb_build_object('membershipsUpdated', v_count, 'preferredChannel', p_preferred_channel));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Livreurs : déclaration marchand puis confirmation du bénéficiaire.
-- ---------------------------------------------------------------------------

create or replace function public.record_courier_payout(
  p_merchant_id uuid,
  p_courier_membership_id uuid,
  p_delivery_ids uuid[],
  p_payment_method text,
  p_external_reference text,
  p_paid_at timestamptz,
  p_actor_id uuid
)
returns public.courier_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer; v_amount integer; v_number text;
  v_membership public.courier_memberships%rowtype;
  v_payout public.courier_payouts%rowtype;
begin
  if p_payment_method not in ('wave', 'orange_money') then raise exception 'COURIER_DIRECT_PAYMENT_REQUIRED'; end if;
  if char_length(trim(coalesce(p_external_reference, ''))) < 2 then raise exception 'COURIER_PAYOUT_REFERENCE_REQUIRED'; end if;
  if coalesce(array_length(p_delivery_ids, 1), 0) = 0 then raise exception 'COURIER_DELIVERIES_REQUIRED'; end if;
  if not exists (select 1 from public.merchant_members mm where mm.merchant_id = p_merchant_id
    and mm.user_id = p_actor_id and mm.active and mm.role in ('owner', 'manager')) then raise exception 'FORBIDDEN'; end if;
  select * into v_membership from public.courier_memberships
  where id = p_courier_membership_id and merchant_id = p_merchant_id and status = 'active' for share;
  if v_membership.id is null then raise exception 'COURIER_NOT_FOUND'; end if;
  v_number := case when p_payment_method = 'wave' then v_membership.wave_payment_number
    else v_membership.orange_money_payment_number end;
  if v_number is null then raise exception 'COURIER_PAYMENT_NUMBER_MISSING'; end if;
  perform 1 from public.deliveries d where d.id = any(p_delivery_ids) order by d.id for update;
  select count(*), coalesce(sum(d.courier_payable_xof), 0) into v_count, v_amount
  from public.deliveries d where d.id = any(p_delivery_ids)
    and d.merchant_id = p_merchant_id and d.courier_membership_id = p_courier_membership_id
    and d.courier_payment_status = 'due' and d.courier_payout_id is null and d.courier_payable_xof > 0;
  if v_count <> array_length(p_delivery_ids, 1) then raise exception 'COURIER_DELIVERY_NOT_PAYABLE'; end if;
  insert into public.courier_payouts(
    merchant_id, courier_membership_id, amount_xof, payment_method, external_reference,
    paid_at, recorded_by, destination_number, status
  ) values (
    p_merchant_id, p_courier_membership_id, v_amount, p_payment_method,
    trim(p_external_reference), p_paid_at, p_actor_id, v_number, 'pending_confirmation'
  ) returning * into v_payout;
  insert into public.courier_payout_deliveries(payout_id, delivery_id, amount_xof)
  select v_payout.id, d.id, d.courier_payable_xof from public.deliveries d where d.id = any(p_delivery_ids);
  update public.deliveries set courier_payment_status = 'payment_declared', courier_payout_id = v_payout.id
  where id = any(p_delivery_ids);
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, p_merchant_id, 'courier.payout.declare', 'courier_payout', v_payout.id::text,
    jsonb_build_object('amountXof', v_amount, 'deliveryIds', to_jsonb(p_delivery_ids), 'channel', p_payment_method));
  return v_payout;
end;
$$;

create function public.review_courier_payout(
  p_payout_id uuid, p_decision text, p_contest_reason text default null
)
returns public.courier_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare v_payout public.courier_payouts%rowtype;
begin
  select cp.* into v_payout from public.courier_payouts cp
  join public.courier_memberships cm on cm.id = cp.courier_membership_id
  where cp.id = p_payout_id and cm.courier_user_id = auth.uid() for update of cp;
  if v_payout.id is null then raise exception 'COURIER_PAYOUT_NOT_FOUND'; end if;
  if v_payout.status <> 'pending_confirmation' then raise exception 'COURIER_PAYOUT_ALREADY_REVIEWED'; end if;
  if p_decision not in ('confirmed', 'contested') then raise exception 'COURIER_PAYOUT_DECISION_INVALID'; end if;
  if p_decision = 'contested' and char_length(trim(coalesce(p_contest_reason, ''))) < 4 then
    raise exception 'COURIER_PAYOUT_CONTEST_REASON_REQUIRED';
  end if;
  update public.courier_payouts
  set status = p_decision, reviewed_by = auth.uid(), reviewed_at = timezone('utc', now()),
      contest_reason = case when p_decision = 'contested' then trim(p_contest_reason) else null end
  where id = p_payout_id returning * into v_payout;
  if p_decision = 'confirmed' then
    update public.deliveries set courier_payment_status = 'paid' where courier_payout_id = p_payout_id;
  else
    update public.deliveries set courier_payment_status = 'due', courier_payout_id = null where courier_payout_id = p_payout_id;
  end if;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_payout.merchant_id, 'courier.payout.' || p_decision,
    'courier_payout', v_payout.id::text, jsonb_build_object('reason', v_payout.contest_reason));
  return v_payout;
end;
$$;

create or replace function public.void_courier_payout(
  p_payout_id uuid, p_reason text, p_actor_id uuid
)
returns public.courier_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare v_payout public.courier_payouts%rowtype;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 4 then raise exception 'COURIER_PAYOUT_VOID_REASON_REQUIRED'; end if;
  select * into v_payout from public.courier_payouts where id = p_payout_id for update;
  if v_payout.id is null then raise exception 'COURIER_PAYOUT_NOT_FOUND'; end if;
  if not exists (select 1 from public.merchant_members mm where mm.merchant_id = v_payout.merchant_id
    and mm.user_id = p_actor_id and mm.active and mm.role in ('owner', 'manager')) then raise exception 'FORBIDDEN'; end if;
  if v_payout.status not in ('pending_confirmation', 'contested') then raise exception 'COURIER_PAYOUT_NOT_VOIDABLE'; end if;
  update public.deliveries set courier_payment_status = 'due', courier_payout_id = null
  where courier_payout_id = v_payout.id;
  update public.courier_payouts
  set status = 'voided', voided_at = timezone('utc', now()), voided_by = p_actor_id, void_reason = trim(p_reason)
  where id = v_payout.id returning * into v_payout;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, v_payout.merchant_id, 'courier.payout.void', 'courier_payout', v_payout.id::text,
    jsonb_build_object('reason', trim(p_reason)));
  return v_payout;
end;
$$;

-- Gel fidélité : les soldes sont conservés sans nouveau mouvement.
create or replace function public.award_order_loyalty(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Programme volontairement suspendu : le solde existant reste intact.
  return;
end;
$$;

create function public.freeze_loyalty_entries()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind in ('earned', 'redeemed', 'expired') then
    raise exception using errcode = '23514', message = 'LOYALTY_PROGRAM_FROZEN';
  end if;
  return new;
end;
$$;
create trigger loyalty_entries_freeze
before insert on public.loyalty_entries
for each row execute function public.freeze_loyalty_entries();

create trigger direct_payment_declarations_set_updated_at
before update on public.direct_payment_declarations
for each row execute function public.set_updated_at();
create trigger order_refunds_set_updated_at
before update on public.order_refunds
for each row execute function public.set_updated_at();
create trigger platform_payment_settings_set_updated_at
before update on public.platform_payment_settings
for each row execute function public.set_updated_at();
create trigger subscription_billing_periods_set_updated_at
before update on public.subscription_billing_periods
for each row execute function public.set_updated_at();

revoke all on function public.review_direct_payment(uuid, text, text) from public;
revoke all on function public.open_order_dispute(uuid, text) from public;
revoke all on function public.record_pickup_cash_payment(uuid) from public;
revoke all on function public.declare_order_refund(uuid, integer, public.payment_channel, text, text) from public;
revoke all on function public.review_order_refund(uuid, text, text) from public;
revoke all on function public.resolve_direct_order_dispute(uuid, text, text) from public;
revoke all on function public.submit_subscription_payment(uuid, text, text, public.payment_channel, text, integer, timestamptz) from public;
revoke all on function public.refresh_subscription_billing_periods() from public;
revoke all on function public.review_courier_payout(uuid, text, text) from public;
revoke all on function public.set_platform_payment_setting(public.payment_channel, text, text, boolean) from public;
revoke all on function public.update_merchant_payment_numbers(uuid, text, text) from public;
revoke all on function public.update_courier_payment_profile(text, text, text) from public;

grant execute on function public.review_direct_payment(uuid, text, text) to authenticated;
grant execute on function public.open_order_dispute(uuid, text) to authenticated;
grant execute on function public.record_pickup_cash_payment(uuid) to authenticated;
grant execute on function public.declare_order_refund(uuid, integer, public.payment_channel, text, text) to authenticated;
grant execute on function public.review_order_refund(uuid, text, text) to authenticated;
grant execute on function public.resolve_direct_order_dispute(uuid, text, text) to authenticated;
grant execute on function public.submit_subscription_payment(uuid, text, text, public.payment_channel, text, integer, timestamptz) to authenticated;
grant execute on function public.refresh_subscription_billing_periods() to service_role;
grant execute on function public.review_courier_payout(uuid, text, text) to authenticated;
grant execute on function public.set_platform_payment_setting(public.payment_channel, text, text, boolean) to authenticated;
grant execute on function public.update_merchant_payment_numbers(uuid, text, text) to authenticated;
grant execute on function public.update_courier_payment_profile(text, text, text) to authenticated;

-- Les anciennes données PayTech restent consultables, sans nouveau flux.
revoke execute on function public.create_order_payment_intent(uuid, text, integer) from authenticated;
revoke execute on function public.confirm_order_reception(uuid) from authenticated;
revoke execute on function public.resolve_order_dispute(uuid, text, text) from authenticated;
revoke execute on function public.capture_order_payment(text, text, integer, text, text) from service_role;
revoke execute on function public.mark_escrow_refunded(uuid) from service_role;
revoke execute on function public.release_due_escrows(integer) from service_role;
revoke execute on function public.mark_payout_sent(text) from service_role;
revoke execute on function public.mark_payout_paid(text, text) from service_role;
revoke execute on function public.mark_payout_failed(text, text) from service_role;
revoke execute on function public.activate_subscription_from_payment(text, integer, text) from service_role;
revoke insert, update, delete on public.payment_intents, public.payment_escrows, public.merchant_payouts from authenticated, service_role;
grant select on public.payment_intents, public.payment_escrows, public.merchant_payouts to service_role;

commit;
