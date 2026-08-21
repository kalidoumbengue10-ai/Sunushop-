begin;

-- A phone number identifies one courier account globally. Fail loudly before
-- creating the index so a cloud drift cannot silently bind two accounts.
do $$
declare
  v_duplicate text;
begin
  select phone into v_duplicate
  from public.courier_profiles
  group by phone
  having count(*) > 1
  limit 1;

  if v_duplicate is not null then
    raise exception using
      errcode = '23505',
      message = 'COURIER_PHONE_DUPLICATE',
      detail = format('The courier phone %s belongs to more than one profile.', v_duplicate),
      hint = 'Merge the duplicate courier profiles before applying this migration.';
  end if;
end;
$$;

create unique index if not exists courier_profiles_phone_unique_idx
  on public.courier_profiles (phone);

-- Offers are deliberately short-lived: exact customer details must not remain
-- unlockable from an old notification.
alter table public.delivery_offers
  add column if not exists expires_at timestamptz;

update public.delivery_offers
set expires_at = created_at + interval '15 minutes'
where expires_at is null;

alter table public.delivery_offers
  alter column expires_at set default (timezone('utc', now()) + interval '15 minutes'),
  alter column expires_at set not null,
  drop constraint if exists delivery_offer_status_valid;

alter table public.delivery_offers
  add constraint delivery_offer_status_valid
  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired'));

create index if not exists delivery_offers_expiry_idx
  on public.delivery_offers (expires_at)
  where status = 'pending';

-- Keep delivery history while enforcing only one live attempt per order.
alter table public.deliveries
  drop constraint if exists deliveries_order_id_key;

create unique index if not exists deliveries_one_active_order_idx
  on public.deliveries (order_id)
  where status in ('assigned', 'accepted', 'at_pickup', 'picked_up', 'in_transit');

-- Accepting an offer is also the reassignment boundary. A previous attempt may
-- be replaced only before pickup; it is cancelled and audited in this same
-- transaction. Failed/cancelled attempts remain as immutable history.
create or replace function public.accept_delivery_offer(
  p_offer_id uuid,
  p_delivery_id uuid,
  p_pickup_code_hash text,
  p_recipient_code_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.delivery_offers%rowtype;
  v_order public.orders%rowtype;
  v_membership public.courier_memberships%rowtype;
  v_merchant public.merchant_accounts%rowtype;
  v_previous public.deliveries%rowtype;
  v_existing uuid;
begin
  select * into v_offer
  from public.delivery_offers
  where id = p_offer_id
  for update;

  if v_offer.id is null then raise exception 'DELIVERY_OFFER_NOT_FOUND'; end if;

  select * into v_membership
  from public.courier_memberships
  where id = v_offer.courier_membership_id;

  if v_membership.courier_user_id <> auth.uid() then
    raise exception 'DELIVERY_OFFER_NOT_FOUND';
  end if;

  if v_offer.status = 'accepted' then
    select id into v_existing
    from public.deliveries
    where delivery_offer_id = p_offer_id;
    if v_existing is not null then return v_existing; end if;
  end if;

  if v_offer.status <> 'pending' then
    raise exception 'DELIVERY_OFFER_ALREADY_ANSWERED';
  end if;
  if v_offer.expires_at <= timezone('utc', now()) then
    raise exception 'DELIVERY_OFFER_EXPIRED';
  end if;
  if v_membership.status <> 'active' then
    raise exception 'COURIER_MEMBERSHIP_INACTIVE';
  end if;

  select * into v_order
  from public.orders
  where id = v_offer.order_id
  for update;

  if v_order.status <> 'ready_for_handoff' then
    raise exception 'ORDER_TRANSITION_NOT_ALLOWED';
  end if;

  select * into v_previous
  from public.deliveries
  where order_id = v_order.id
    and status in ('assigned', 'accepted', 'at_pickup', 'picked_up', 'in_transit')
  for update;

  if v_previous.id is not null then
    if v_previous.status in ('picked_up', 'in_transit') then
      raise exception 'DELIVERY_TRANSITION_NOT_ALLOWED';
    end if;

    update public.deliveries
    set status = 'cancelled',
        terminal_at = timezone('utc', now()),
        courier_payment_status = 'not_due',
        courier_payable_xof = 0
    where id = v_previous.id;

    insert into public.delivery_events(
      delivery_id, merchant_id, actor_id, from_status, to_status,
      public_message, metadata
    ) values (
      v_previous.id, v_previous.merchant_id, auth.uid(), v_previous.status,
      'cancelled', 'La mission a ete remplacee avant le retrait.',
      jsonb_build_object('replacementOfferId', p_offer_id)
    );
  end if;

  select * into v_merchant
  from public.merchant_accounts
  where id = v_offer.merchant_id;

  insert into public.deliveries(
    id, order_id, merchant_id, courier_membership_id, delivery_offer_id, status,
    pickup_snapshot, pickup_code_hash, recipient_code_hash,
    gross_delivery_fee_xof, courier_fee_xof, platform_commission_rate_bps,
    platform_commission_xof, commission_status, assigned_by,
    route_snapshot, route_distance_meters, route_duration_seconds
  ) values (
    p_delivery_id, v_offer.order_id, v_offer.merchant_id, v_offer.courier_membership_id,
    v_offer.id, 'accepted', jsonb_build_object(
      'name', v_merchant.public_name, 'phone', v_merchant.phone,
      'region', v_merchant.region, 'city', v_merchant.city,
      'addressHint', coalesce(v_merchant.pickup_address_line, v_merchant.address_hint),
      'latitude', v_merchant.pickup_latitude, 'longitude', v_merchant.pickup_longitude,
      'hours', v_merchant.pickup_hours, 'instructions', v_merchant.pickup_instructions
    ), p_pickup_code_hash, p_recipient_code_hash, v_offer.client_delivery_fee_xof,
    v_offer.courier_fee_xof, 0, 0, 'disabled', v_offer.created_by,
    v_offer.route_snapshot, v_offer.distance_meters, v_offer.duration_seconds
  );

  update public.delivery_offers
  set status = 'accepted', responded_at = timezone('utc', now())
  where id = v_offer.id;

  update public.delivery_offers
  set status = 'cancelled', cancelled_at = timezone('utc', now())
  where order_id = v_offer.order_id and status = 'pending' and id <> v_offer.id;

  insert into public.delivery_events(
    delivery_id, merchant_id, actor_id, to_status, public_message, metadata
  ) values (
    p_delivery_id, v_offer.merchant_id, auth.uid(), 'accepted',
    'Le livreur a accepte la mission.', jsonb_build_object('offerId', p_offer_id)
  );

  return p_delivery_id;
end;
$$;

revoke all on function public.accept_delivery_offer(uuid, uuid, text, text) from public;
grant execute on function public.accept_delivery_offer(uuid, uuid, text, text) to authenticated;

create or replace function public.cancel_delivery_offer(
  p_offer_id uuid,
  p_actor_id uuid
)
returns public.delivery_offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.delivery_offers%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_actor_id then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_offer
  from public.delivery_offers
  where id = p_offer_id
  for update;

  if v_offer.id is null then raise exception 'DELIVERY_OFFER_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.merchant_members mm
    where mm.merchant_id = v_offer.merchant_id
      and mm.user_id = p_actor_id
      and mm.active
      and mm.role in ('owner', 'manager', 'fulfillment')
  ) then raise exception 'FORBIDDEN'; end if;
  if v_offer.status <> 'pending' then
    raise exception 'DELIVERY_OFFER_ALREADY_ANSWERED';
  end if;

  update public.delivery_offers
  set status = 'cancelled', cancelled_at = timezone('utc', now())
  where id = v_offer.id
  returning * into v_offer;
  return v_offer;
end;
$$;

revoke all on function public.cancel_delivery_offer(uuid, uuid) from public;
grant execute on function public.cancel_delivery_offer(uuid, uuid) to authenticated;

-- Failure closes only the current attempt and reopens the order for a new
-- offer. It never cancels/refunds the order automatically.
create or replace function public.report_delivery_failure(
  p_delivery_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_details text
)
returns public.deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
  v_from public.delivery_status;
begin
  if auth.uid() is null or auth.uid() <> p_actor_id then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

  if v_delivery.id is null then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.courier_memberships cm
    where cm.id = v_delivery.courier_membership_id
      and cm.courier_user_id = p_actor_id
  ) then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_delivery.status not in ('picked_up', 'in_transit') then
    raise exception 'DELIVERY_TRANSITION_NOT_ALLOWED';
  end if;

  select * into v_order
  from public.orders
  where id = v_delivery.order_id
  for update;

  v_from := v_delivery.status;

  update public.deliveries
  set status = 'failed',
      failure_reason = trim(p_details),
      terminal_at = timezone('utc', now()),
      courier_payment_status = 'review_required',
      courier_payable_xof = 0
  where id = p_delivery_id
  returning * into v_delivery;

  update public.orders
  set status = 'ready_for_handoff'
  where id = v_order.id;

  insert into public.delivery_events(
    delivery_id, merchant_id, actor_id, from_status, to_status,
    public_message, metadata
  ) values (
    v_delivery.id, v_delivery.merchant_id, p_actor_id, v_from,
    'failed', trim(p_details), jsonb_build_object('failureReason', p_reason, 'reprogrammable', true)
  );

  insert into public.order_events(
    order_id, merchant_id, actor_id, from_status, to_status,
    public_message, metadata
  ) values (
    v_order.id, v_order.merchant_id, p_actor_id, v_order.status,
    'ready_for_handoff', 'La livraison a echoue et doit etre reprogrammee.',
    jsonb_build_object('deliveryId', v_delivery.id, 'failureReason', p_reason)
  );

  return v_delivery;
end;
$$;

revoke all on function public.report_delivery_failure(uuid, uuid, text, text) from public;
grant execute on function public.report_delivery_failure(uuid, uuid, text, text) to authenticated;

-- Authorization, attempt accounting and state completion share one row lock.
-- Invalid attempts return a result instead of raising so the increment commits.
create or replace function public.verify_delivery_code_atomic(
  p_delivery_id uuid,
  p_stage text,
  p_code text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_expected text;
  v_attempts integer;
  v_completed public.deliveries%rowtype;
begin
  if p_stage not in ('pickup', 'recipient') then
    raise exception 'DELIVERY_STAGE_INVALID';
  end if;
  if auth.uid() is null or auth.uid() <> p_actor_id then
    raise exception 'DELIVERY_NOT_FOUND';
  end if;

  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;
  if v_delivery.id is null then raise exception 'DELIVERY_NOT_FOUND'; end if;

  if p_stage = 'pickup' then
    if not exists (
      select 1 from public.merchant_members mm
      where mm.merchant_id = v_delivery.merchant_id
        and mm.user_id = p_actor_id
        and mm.active
        and mm.role in ('owner', 'manager', 'fulfillment')
    ) then raise exception 'DELIVERY_NOT_FOUND'; end if;
    v_expected := v_delivery.pickup_code_hash;
    v_attempts := v_delivery.pickup_code_attempts;
  else
    if not exists (
      select 1 from public.courier_memberships cm
      where cm.id = v_delivery.courier_membership_id
        and cm.courier_user_id = p_actor_id
    ) then raise exception 'DELIVERY_NOT_FOUND'; end if;
    v_expected := v_delivery.recipient_code_hash;
    v_attempts := v_delivery.recipient_code_attempts;
  end if;

  if v_attempts >= v_delivery.code_attempt_limit then
    return jsonb_build_object('verified', false, 'locked', true, 'attempts', v_attempts);
  end if;

  if encode(extensions.digest(p_code, 'sha256'), 'hex') <> v_expected then
    v_attempts := least(v_attempts + 1, v_delivery.code_attempt_limit);
    if p_stage = 'pickup' then
      update public.deliveries set pickup_code_attempts = v_attempts where id = p_delivery_id;
    else
      update public.deliveries set recipient_code_attempts = v_attempts where id = p_delivery_id;
    end if;
    return jsonb_build_object(
      'verified', false,
      'locked', v_attempts >= v_delivery.code_attempt_limit,
      'attempts', v_attempts
    );
  end if;

  select * into v_completed
  from public.complete_delivery_stage(p_delivery_id, p_stage, p_actor_id);
  return jsonb_build_object(
    'verified', true,
    'locked', false,
    'attempts', v_attempts,
    'delivery', to_jsonb(v_completed)
  );
end;
$$;

revoke all on function public.verify_delivery_code_atomic(uuid, text, text, uuid) from public;
grant execute on function public.verify_delivery_code_atomic(uuid, text, text, uuid) to authenticated;

-- Exact aggregates are independent from the paginated history returned by the
-- HTTP route.
create or replace function public.courier_delivery_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with memberships as (
    select cm.id, cm.merchant_id, ma.public_name
    from public.courier_memberships cm
    join public.merchant_accounts ma on ma.id = cm.merchant_id
    where cm.courier_user_id = auth.uid()
  ), delivery_stats as (
    select
      m.id as membership_id,
      m.merchant_id,
      m.public_name,
      count(d.id) filter (where d.status in ('assigned', 'accepted', 'at_pickup'))::integer as upcoming,
      count(d.id) filter (where d.status in ('picked_up', 'in_transit'))::integer as active,
      count(d.id) filter (where d.status = 'delivered')::integer as delivered,
      count(d.id) filter (where d.status = 'delivered' and d.delivered_at >= date_trunc('month', timezone('utc', now())))::integer as delivered_this_month,
      count(d.id) filter (where d.status = 'failed')::integer as failed,
      coalesce(sum(d.courier_payable_xof) filter (where d.courier_payment_status = 'due'), 0)::integer as due_xof
    from memberships m
    left join public.deliveries d on d.courier_membership_id = m.id
    group by m.id, m.merchant_id, m.public_name
  ), payout_stats as (
    select
      cp.courier_membership_id as membership_id,
      coalesce(sum(cp.amount_xof) filter (where cp.status = 'confirmed'), 0)::integer as paid_xof,
      coalesce(sum(cp.amount_xof) filter (
        where cp.status = 'confirmed'
          and cp.paid_at >= date_trunc('month', timezone('utc', now()))
      ), 0)::integer as paid_this_month_xof
    from public.courier_payouts cp
    join memberships m on m.id = cp.courier_membership_id
    group by cp.courier_membership_id
  ), rows as (
    select ds.*, coalesce(ps.paid_xof, 0) as paid_xof,
      coalesce(ps.paid_this_month_xof, 0) as paid_this_month_xof
    from delivery_stats ds
    left join payout_stats ps on ps.membership_id = ds.membership_id
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'upcoming', coalesce(sum(upcoming), 0),
      'active', coalesce(sum(active), 0),
      'deliveredThisMonth', coalesce(sum(delivered_this_month), 0),
      'deliveredTotal', coalesce(sum(delivered), 0),
      'failedTotal', coalesce(sum(failed), 0),
      'dueXof', coalesce(sum(due_xof), 0),
      'paidThisMonthXof', coalesce(sum(paid_this_month_xof), 0)
    ),
    'shopStats', coalesce(jsonb_agg(jsonb_build_object(
      'membershipId', membership_id,
      'merchantId', merchant_id,
      'shopName', public_name,
      'active', upcoming + active,
      'delivered', delivered,
      'failed', failed,
      'dueXof', due_xof,
      'paidXof', paid_xof
    ) order by public_name), '[]'::jsonb)
  )
  from rows;
$$;

revoke all on function public.courier_delivery_dashboard_stats() from public;
grant execute on function public.courier_delivery_dashboard_stats() to authenticated;

commit;
