begin;

-- ---------------------------------------------------------------------------
-- Profils livreurs gérés par chaque boutique et photographie financière.
-- ---------------------------------------------------------------------------

alter table public.courier_memberships
  add column email extensions.citext,
  add column vehicle_type text,
  add column vehicle_registration text,
  add column photo_storage_path text;

alter table public.courier_memberships
  add constraint courier_vehicle_type_valid check (
    vehicle_type is null or vehicle_type in ('walking', 'bicycle', 'motorbike', 'car', 'van', 'other')
  ),
  add constraint courier_vehicle_registration_length check (
    vehicle_registration is null or char_length(vehicle_registration) between 2 and 40
  );

update public.courier_memberships cm
set email = (
  select wi.email
  from public.workspace_invitations wi
  where wi.kind = 'courier'
    and wi.merchant_id = cm.merchant_id
    and wi.claimed_by = cm.courier_user_id
  order by wi.claimed_at desc nulls last, wi.created_at desc
  limit 1
)
where cm.email is null
  and exists (
    select 1 from public.workspace_invitations wi
    where wi.kind = 'courier'
      and wi.merchant_id = cm.merchant_id
      and wi.claimed_by = cm.courier_user_id
  );

alter table public.deliveries
  add column gross_delivery_fee_xof integer not null default 0,
  add column platform_commission_rate_bps integer not null default 0,
  add column platform_commission_xof integer not null default 0,
  add column commission_status text not null default 'disabled';

alter table public.deliveries
  add constraint delivery_financial_snapshot_valid check (
    gross_delivery_fee_xof >= 0
    and platform_commission_rate_bps between 0 and 10000
    and platform_commission_xof >= 0
    and platform_commission_xof <= gross_delivery_fee_xof
    and commission_status in ('disabled', 'calculated', 'collected', 'waived')
  );

-- ---------------------------------------------------------------------------
-- Fidélité par boutique : réglages, compte, lots expirables et journal.
-- ---------------------------------------------------------------------------

create table public.merchant_loyalty_settings (
  merchant_id uuid primary key references public.merchant_accounts(id) on delete cascade,
  accrual_enabled boolean not null default false,
  earn_xof_per_point integer not null default 100,
  point_value_xof integer not null default 1,
  max_redemption_bps integer not null default 2000,
  merchant_funding_bps integer not null default 5000,
  platform_funding_bps integer not null default 5000,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint loyalty_settings_fixed_rule check (
    earn_xof_per_point = 100
    and point_value_xof = 1
    and max_redemption_bps = 2000
    and merchant_funding_bps = 5000
    and platform_funding_bps = 5000
  ),
  constraint loyalty_funding_total check (merchant_funding_bps + platform_funding_bps = 10000)
);

create table public.loyalty_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  balance_points integer not null default 0,
  lifetime_earned_points bigint not null default 0,
  lifetime_redeemed_points bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (merchant_id, buyer_id),
  constraint loyalty_lifetime_non_negative check (
    lifetime_earned_points >= 0 and lifetime_redeemed_points >= 0
  )
);

create table public.loyalty_point_lots (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.loyalty_accounts(id) on delete cascade,
  source_order_id uuid references public.orders(id) on delete set null,
  source_kind text not null,
  original_points integer not null,
  remaining_points integer not null,
  expires_at timestamptz not null,
  warning_sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint loyalty_lot_kind_valid check (source_kind in ('earned', 'redemption_refund')),
  constraint loyalty_lot_points_valid check (
    original_points > 0 and remaining_points between 0 and original_points
  )
);

create index loyalty_lots_spend_idx
  on public.loyalty_point_lots(account_id, expires_at, created_at)
  where remaining_points > 0;
create index loyalty_lots_expiry_idx
  on public.loyalty_point_lots(expires_at)
  where remaining_points > 0;

create table public.loyalty_entries (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.loyalty_accounts(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  kind text not null,
  points_delta integer not null,
  balance_after integer not null,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint loyalty_entry_kind_valid check (
    kind in ('earned', 'redeemed', 'redemption_refund', 'earned_reversal', 'expired')
  ),
  constraint loyalty_entry_delta_nonzero check (points_delta <> 0)
);

create unique index loyalty_entries_order_kind_unique
  on public.loyalty_entries(order_id, kind)
  where order_id is not null and kind <> 'expired';
create index loyalty_entries_account_idx
  on public.loyalty_entries(account_id, created_at desc);

alter table public.orders
  add column loyalty_processed_at timestamptz,
  add column loyalty_accrual_enabled boolean not null default false,
  add column loyalty_points_redeemed integer not null default 0,
  add column loyalty_discount_xof integer not null default 0,
  add column loyalty_points_earned integer not null default 0,
  add column loyalty_merchant_share_xof integer not null default 0,
  add column loyalty_platform_share_xof integer not null default 0;

alter table public.orders drop constraint order_totals_valid;
alter table public.orders
  add constraint order_totals_valid check (
    subtotal_xof >= 0
    and delivery_fee_xof >= 0
    and loyalty_points_redeemed >= 0
    and loyalty_discount_xof >= 0
    and loyalty_discount_xof <= subtotal_xof
    and loyalty_points_earned >= 0
    and loyalty_merchant_share_xof >= 0
    and loyalty_platform_share_xof >= 0
    and loyalty_merchant_share_xof + loyalty_platform_share_xof = loyalty_discount_xof
    and total_xof = subtotal_xof - loyalty_discount_xof + delivery_fee_xof
  );

create table public.loyalty_credit_payouts (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  amount_xof integer not null,
  destination_number text not null,
  service text not null,
  external_id text not null unique,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  constraint loyalty_payout_amount_positive check (amount_xof >= 1000),
  constraint loyalty_payout_service_valid check (service in ('Wave Senegal', 'Orange Money Senegal')),
  constraint loyalty_payout_status_valid check (status in ('pending', 'sent', 'paid', 'failed')),
  constraint loyalty_payout_period_valid check (period_end > period_start)
);

create table public.loyalty_contributions (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null,
  discount_xof integer not null,
  merchant_share_xof integer not null,
  platform_share_xof integer not null,
  payout_id uuid references public.loyalty_credit_payouts(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint loyalty_contribution_kind_valid check (kind in ('redemption', 'reversal')),
  constraint loyalty_contribution_sign_valid check (
    (kind = 'redemption' and discount_xof > 0 and merchant_share_xof >= 0 and platform_share_xof > 0)
    or (kind = 'reversal' and discount_xof < 0 and merchant_share_xof <= 0 and platform_share_xof < 0)
  ),
  unique (order_id, kind)
);

create index loyalty_contributions_unsettled_idx
  on public.loyalty_contributions(merchant_id, created_at)
  where payout_id is null;
create index loyalty_payouts_pending_idx
  on public.loyalty_credit_payouts(created_at)
  where status in ('pending', 'failed');

create trigger merchant_loyalty_settings_set_updated_at
before update on public.merchant_loyalty_settings
for each row execute function public.set_updated_at();
create trigger loyalty_accounts_set_updated_at
before update on public.loyalty_accounts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Fonctions transactionnelles de fidélité.
-- ---------------------------------------------------------------------------

create function public.ensure_loyalty_account(p_merchant_id uuid, p_buyer_id uuid)
returns public.loyalty_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.loyalty_accounts%rowtype;
begin
  insert into public.loyalty_accounts (merchant_id, buyer_id)
  values (p_merchant_id, p_buyer_id)
  on conflict (merchant_id, buyer_id) do update
    set updated_at = public.loyalty_accounts.updated_at
  returning * into v_account;
  return v_account;
end;
$$;

create function public.consume_loyalty_points(
  p_account_id uuid,
  p_order_id uuid,
  p_points integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.loyalty_accounts%rowtype;
  v_lot public.loyalty_point_lots%rowtype;
  v_remaining integer := p_points;
  v_take integer;
begin
  if p_points <= 0 then return 0; end if;
  select * into v_account from public.loyalty_accounts where id = p_account_id for update;
  if v_account.id is null or greatest(v_account.balance_points, 0) < p_points then
    raise exception using errcode = '23514', message = 'LOYALTY_BALANCE_INSUFFICIENT';
  end if;

  for v_lot in
    select * from public.loyalty_point_lots
    where account_id = p_account_id
      and remaining_points > 0
      and expires_at > timezone('utc', now())
    order by expires_at, created_at
    for update
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_lot.remaining_points);
    update public.loyalty_point_lots
      set remaining_points = remaining_points - v_take
      where id = v_lot.id;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining <> 0 then
    raise exception using errcode = '23514', message = 'LOYALTY_LOTS_INSUFFICIENT';
  end if;

  update public.loyalty_accounts
  set balance_points = balance_points - p_points,
      lifetime_redeemed_points = lifetime_redeemed_points + p_points
  where id = p_account_id
  returning balance_points into v_remaining;

  insert into public.loyalty_entries (account_id, order_id, kind, points_delta, balance_after)
  values (p_account_id, p_order_id, 'redeemed', -p_points, v_remaining);
  return p_points;
end;
$$;

create function public.credit_loyalty_points(
  p_account_id uuid,
  p_order_id uuid,
  p_kind text,
  p_points integer,
  p_expires_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.loyalty_accounts%rowtype;
  v_debt_offset integer;
  v_lot_points integer;
  v_balance integer;
begin
  if p_points <= 0 then return 0; end if;
  select * into v_account from public.loyalty_accounts where id = p_account_id for update;
  if v_account.id is null then raise exception 'LOYALTY_ACCOUNT_NOT_FOUND'; end if;
  v_debt_offset := least(p_points, greatest(-v_account.balance_points, 0));
  v_lot_points := p_points - v_debt_offset;

  update public.loyalty_accounts
  set balance_points = balance_points + p_points,
      lifetime_earned_points = lifetime_earned_points + case when p_kind = 'earned' then p_points else 0 end
  where id = p_account_id
  returning balance_points into v_balance;

  if v_lot_points > 0 then
    insert into public.loyalty_point_lots (
      account_id, source_order_id, source_kind, original_points, remaining_points, expires_at
    ) values (
      p_account_id, p_order_id, p_kind, v_lot_points, v_lot_points, p_expires_at
    );
  end if;

  insert into public.loyalty_entries (
    account_id, order_id, kind, points_delta, balance_after, expires_at,
    metadata
  ) values (
    p_account_id, p_order_id, p_kind, p_points, v_balance, p_expires_at,
    jsonb_build_object('debtOffset', v_debt_offset)
  );
  return p_points;
end;
$$;

create function public.award_order_loyalty(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_account public.loyalty_accounts%rowtype;
  v_points integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.status <> 'delivered' or not v_order.loyalty_accrual_enabled then return; end if;
  if exists (select 1 from public.loyalty_entries where order_id = p_order_id and kind = 'earned') then return; end if;
  v_points := floor((v_order.subtotal_xof - v_order.loyalty_discount_xof) / 100.0)::integer;
  if v_points <= 0 then return; end if;
  v_account := public.ensure_loyalty_account(v_order.merchant_id, v_order.buyer_id);
  perform public.credit_loyalty_points(
    v_account.id, v_order.id, 'earned', v_points,
    coalesce(v_order.delivered_at, timezone('utc', now())) + interval '12 months'
  );
  update public.orders set loyalty_points_earned = v_points where id = v_order.id;
end;
$$;

create function public.reverse_order_loyalty(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_account public.loyalty_accounts%rowtype;
  v_balance integer;
  v_remove integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then return; end if;
  v_account := public.ensure_loyalty_account(v_order.merchant_id, v_order.buyer_id);

  if v_order.loyalty_points_redeemed > 0
     and exists (select 1 from public.loyalty_entries where order_id = p_order_id and kind = 'redeemed')
     and not exists (select 1 from public.loyalty_entries where order_id = p_order_id and kind = 'redemption_refund') then
    perform public.credit_loyalty_points(
      v_account.id, v_order.id, 'redemption_refund', v_order.loyalty_points_redeemed,
      timezone('utc', now()) + interval '12 months'
    );
    insert into public.loyalty_contributions (
      order_id, merchant_id, buyer_id, kind, discount_xof, merchant_share_xof, platform_share_xof
    ) values (
      v_order.id, v_order.merchant_id, v_order.buyer_id, 'reversal',
      -v_order.loyalty_discount_xof, -v_order.loyalty_merchant_share_xof, -v_order.loyalty_platform_share_xof
    ) on conflict (order_id, kind) do nothing;
  end if;

  if v_order.loyalty_points_earned > 0
     and exists (select 1 from public.loyalty_entries where order_id = p_order_id and kind = 'earned')
     and not exists (select 1 from public.loyalty_entries where order_id = p_order_id and kind = 'earned_reversal') then
    update public.loyalty_point_lots
    set remaining_points = 0
    where account_id = v_account.id and source_order_id = v_order.id and source_kind = 'earned';
    update public.loyalty_accounts
    set balance_points = balance_points - v_order.loyalty_points_earned
    where id = v_account.id
    returning balance_points into v_balance;
    insert into public.loyalty_entries (account_id, order_id, kind, points_delta, balance_after)
    values (v_account.id, v_order.id, 'earned_reversal', -v_order.loyalty_points_earned, v_balance);
  end if;
end;
$$;

create function public.handle_order_loyalty_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    perform public.award_order_loyalty(new.id);
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform public.reverse_order_loyalty(new.id);
  end if;
  return new;
end;
$$;

create trigger orders_handle_loyalty_status
after update of status on public.orders
for each row execute function public.handle_order_loyalty_status();

create function public.expire_loyalty_points(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot public.loyalty_point_lots%rowtype;
  v_balance integer;
  v_count integer := 0;
begin
  for v_lot in
    select * from public.loyalty_point_lots
    where remaining_points > 0 and expires_at <= timezone('utc', now())
    order by expires_at
    limit greatest(1, least(p_limit, 5000))
    for update skip locked
  loop
    update public.loyalty_point_lots set remaining_points = 0 where id = v_lot.id;
    update public.loyalty_accounts
      set balance_points = balance_points - v_lot.remaining_points
      where id = v_lot.account_id
      returning balance_points into v_balance;
    insert into public.loyalty_entries (
      account_id, kind, points_delta, balance_after, metadata
    ) values (
      v_lot.account_id, 'expired', -v_lot.remaining_points, v_balance,
      jsonb_build_object('lotId', v_lot.id)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- La fonction historique reste le moteur de création/réservation de stock.
-- Le wrapper ci-dessous applique ensuite la fidélité dans la même transaction.
alter function public.create_order_batch(text, jsonb, jsonb)
  rename to create_order_batch_without_loyalty;

create function public.create_order_batch(
  p_idempotency_key text,
  p_recipient jsonb,
  p_groups jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_batch_id uuid;
  v_order public.orders%rowtype;
  v_group jsonb;
  v_settings public.merchant_loyalty_settings%rowtype;
  v_account public.loyalty_accounts%rowtype;
  v_points integer;
  v_discount integer;
  v_merchant_share integer;
  v_platform_share integer;
  v_apply boolean;
  v_total integer;
begin
  v_result := public.create_order_batch_without_loyalty(p_idempotency_key, p_recipient, p_groups);
  v_batch_id := (v_result ->> 'batchId')::uuid;

  for v_order in
    select * from public.orders where batch_id = v_batch_id order by created_at for update
  loop
    if v_order.loyalty_processed_at is not null then continue; end if;
    select value into v_group
    from jsonb_array_elements(p_groups)
    where value ->> 'merchantId' = v_order.merchant_id::text
    limit 1;
    v_apply := coalesce((v_group ->> 'applyLoyalty')::boolean, true);
    select * into v_settings
    from public.merchant_loyalty_settings
    where merchant_id = v_order.merchant_id;

    v_points := 0;
    v_discount := 0;
    v_merchant_share := 0;
    v_platform_share := 0;
    if v_apply then
      select * into v_account
      from public.loyalty_accounts
      where merchant_id = v_order.merchant_id and buyer_id = v_order.buyer_id
      for update;
      if v_account.id is not null then
        v_points := least(
          greatest(v_account.balance_points, 0),
          floor(v_order.subtotal_xof * 0.20)::integer
        );
        v_discount := v_points;
        if v_points > 0 then
          perform public.consume_loyalty_points(v_account.id, v_order.id, v_points);
          v_merchant_share := floor(v_discount / 2.0)::integer;
          v_platform_share := v_discount - v_merchant_share;
          insert into public.loyalty_contributions (
            order_id, merchant_id, buyer_id, kind, discount_xof, merchant_share_xof, platform_share_xof
          ) values (
            v_order.id, v_order.merchant_id, v_order.buyer_id, 'redemption',
            v_discount, v_merchant_share, v_platform_share
          ) on conflict (order_id, kind) do nothing;
        end if;
      end if;
    end if;

    update public.orders
    set loyalty_processed_at = timezone('utc', now()),
        loyalty_accrual_enabled = coalesce(v_settings.accrual_enabled, false),
        loyalty_points_redeemed = v_points,
        loyalty_discount_xof = v_discount,
        loyalty_merchant_share_xof = v_merchant_share,
        loyalty_platform_share_xof = v_platform_share,
        total_xof = subtotal_xof - v_discount + delivery_fee_xof
    where id = v_order.id;
  end loop;

  select coalesce(sum(total_xof), 0)::integer into v_total
  from public.orders where batch_id = v_batch_id;
  update public.order_batches set total_xof = v_total where id = v_batch_id;

  return jsonb_build_object(
    'batchId', v_batch_id,
    'publicCode', (select public_code from public.order_batches where id = v_batch_id),
    'totalXof', v_total,
    'orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'publicCode', o.public_code,
        'merchantId', o.merchant_id,
        'totalXof', o.total_xof,
        'status', o.status,
        'loyaltyPointsRedeemed', o.loyalty_points_redeemed,
        'loyaltyDiscountXof', o.loyalty_discount_xof,
        'loyaltyPointsEarnable', floor((o.subtotal_xof - o.loyalty_discount_xof) / 100.0)::integer
      ) order by o.created_at), '[]'::jsonb)
      from public.orders o where o.batch_id = v_batch_id
    )
  );
end;
$$;

create function public.prepare_loyalty_credit_payouts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_payout_id uuid;
  v_count integer := 0;
begin
  for v_row in
    select
      lc.merchant_id,
      sum(lc.platform_share_xof)::integer as amount_xof,
      coalesce(ma.wave_payment_number, ma.orange_money_payment_number) as destination_number,
      case when ma.wave_payment_number is not null then 'Wave Senegal' else 'Orange Money Senegal' end as service
    from public.loyalty_contributions lc
    join public.merchant_accounts ma on ma.id = lc.merchant_id
    where lc.payout_id is null
      and lc.created_at < date_trunc('month', timezone('utc', now()))
    group by lc.merchant_id, ma.wave_payment_number, ma.orange_money_payment_number
    having sum(lc.platform_share_xof) >= 1000
  loop
    if v_row.destination_number is null then continue; end if;
    v_payout_id := extensions.gen_random_uuid();
    insert into public.loyalty_credit_payouts (
      id, merchant_id, period_start, period_end, amount_xof,
      destination_number, service, external_id
    ) values (
      v_payout_id, v_row.merchant_id,
      (date_trunc('month', timezone('utc', now())) - interval '1 month')::date,
      date_trunc('month', timezone('utc', now()))::date,
      v_row.amount_xof, v_row.destination_number, v_row.service,
      'LOYALTY-' || replace(v_payout_id::text, '-', '')
    );
    update public.loyalty_contributions
    set payout_id = v_payout_id
    where merchant_id = v_row.merchant_id
      and payout_id is null
      and created_at < date_trunc('month', timezone('utc', now()));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS, stockage privé et Realtime.
-- ---------------------------------------------------------------------------

alter table public.merchant_loyalty_settings enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_point_lots enable row level security;
alter table public.loyalty_entries enable row level security;
alter table public.loyalty_contributions enable row level security;
alter table public.loyalty_credit_payouts enable row level security;

create policy loyalty_settings_public_read on public.merchant_loyalty_settings
  for select to anon, authenticated using (true);
create policy loyalty_settings_merchant_update on public.merchant_loyalty_settings
  for all to authenticated
  using (public.is_merchant_member(merchant_id, array['owner', 'manager']::public.merchant_member_role[]))
  with check (public.is_merchant_member(merchant_id, array['owner', 'manager']::public.merchant_member_role[]));
create policy loyalty_accounts_participant_read on public.loyalty_accounts
  for select to authenticated using (
    buyer_id = auth.uid() or public.is_merchant_member(merchant_id, array['owner', 'manager', 'fulfillment']::public.merchant_member_role[])
  );
create policy loyalty_lots_owner_read on public.loyalty_point_lots
  for select to authenticated using (
    exists (select 1 from public.loyalty_accounts la where la.id = account_id and la.buyer_id = auth.uid())
  );
create policy loyalty_entries_participant_read on public.loyalty_entries
  for select to authenticated using (
    exists (
      select 1 from public.loyalty_accounts la where la.id = account_id
      and (la.buyer_id = auth.uid() or public.is_merchant_member(la.merchant_id, array['owner', 'manager', 'fulfillment']::public.merchant_member_role[]))
    )
  );
create policy loyalty_contributions_merchant_read on public.loyalty_contributions
  for select to authenticated using (public.is_merchant_member(merchant_id, array['owner', 'manager']::public.merchant_member_role[]));
create policy loyalty_payouts_merchant_read on public.loyalty_credit_payouts
  for select to authenticated using (public.is_merchant_member(merchant_id, array['owner', 'manager']::public.merchant_member_role[]));

grant select on public.merchant_loyalty_settings to anon, authenticated;
grant select on public.loyalty_accounts, public.loyalty_point_lots, public.loyalty_entries,
  public.loyalty_contributions, public.loyalty_credit_payouts to authenticated;
revoke all on function public.ensure_loyalty_account(uuid, uuid) from public;
revoke all on function public.consume_loyalty_points(uuid, uuid, integer) from public;
revoke all on function public.credit_loyalty_points(uuid, uuid, text, integer, timestamptz) from public;
revoke all on function public.award_order_loyalty(uuid) from public;
revoke all on function public.reverse_order_loyalty(uuid) from public;
revoke all on function public.expire_loyalty_points(integer) from public;
revoke all on function public.prepare_loyalty_credit_payouts() from public;
revoke all on function public.create_order_batch_without_loyalty(text, jsonb, jsonb) from public;
revoke all on function public.create_order_batch(text, jsonb, jsonb) from public;
grant execute on function public.create_order_batch(text, jsonb, jsonb) to authenticated;
grant execute on function public.reverse_order_loyalty(uuid) to service_role;
grant execute on function public.expire_loyalty_points(integer) to service_role;
grant execute on function public.prepare_loyalty_credit_payouts() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-profiles', 'courier-profiles', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  alter publication supabase_realtime add table public.courier_memberships;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.loyalty_accounts;
exception when duplicate_object then null;
end $$;

commit;
