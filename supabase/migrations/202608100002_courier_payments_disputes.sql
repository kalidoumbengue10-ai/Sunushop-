begin;

-- Rémunération convenue par zone et photographie financière de la mission.
alter table public.delivery_zones
  add column courier_fee_xof integer,
  add constraint delivery_zone_courier_fee_non_negative
    check (courier_fee_xof is null or courier_fee_xof >= 0);

alter table public.deliveries
  add column courier_fee_xof integer,
  add column courier_payable_xof integer not null default 0,
  add column courier_payment_status text not null default 'not_due',
  add column terminal_at timestamptz;

alter table public.deliveries
  add constraint delivery_courier_financials_valid check (
    (courier_fee_xof is null or courier_fee_xof >= 0)
    and courier_payable_xof >= 0
    and courier_payment_status in ('not_due', 'review_required', 'due', 'paid', 'waived')
  );

update public.deliveries
set terminal_at = coalesce(delivered_at, updated_at)
where status in ('delivered', 'failed', 'cancelled')
  and terminal_at is null;

create table public.courier_payouts (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  courier_membership_id uuid not null references public.courier_memberships(id) on delete restrict,
  amount_xof integer not null,
  payment_method text not null,
  external_reference text,
  paid_at timestamptz not null,
  status text not null default 'recorded',
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete restrict,
  void_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint courier_payout_amount_positive check (amount_xof > 0),
  constraint courier_payout_method_valid check (
    payment_method in ('cash', 'wave', 'orange_money', 'bank_transfer', 'other')
  ),
  constraint courier_payout_status_valid check (status in ('recorded', 'voided')),
  constraint courier_payout_reference_valid check (
    payment_method = 'cash'
    or (external_reference is not null and char_length(trim(external_reference)) between 2 and 120)
  ),
  constraint courier_payout_void_valid check (
    (status = 'recorded' and voided_at is null and voided_by is null and void_reason is null)
    or
    (status = 'voided' and voided_at is not null and voided_by is not null
      and char_length(trim(void_reason)) between 4 and 500)
  )
);

alter table public.deliveries
  add column courier_payout_id uuid references public.courier_payouts(id) on delete restrict,
  add constraint delivery_courier_payout_state_valid check (
    (courier_payment_status = 'paid' and courier_payout_id is not null)
    or (courier_payment_status <> 'paid' and courier_payout_id is null)
  );

create table public.courier_payout_deliveries (
  payout_id uuid not null references public.courier_payouts(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  amount_xof integer not null check (amount_xof > 0),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (payout_id, delivery_id)
);

create index courier_payouts_membership_paid_idx
  on public.courier_payouts(courier_membership_id, paid_at desc);
create index deliveries_courier_payment_idx
  on public.deliveries(merchant_id, courier_membership_id, courier_payment_status, terminal_at desc);

-- Litige livraison indépendant du moyen de paiement. Les PII restent dans la
-- commande d'origine et ne sont jamais dupliquées dans ce dossier.
create table public.delivery_disputes (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  courier_membership_id uuid not null references public.courier_memberships(id) on delete restrict,
  reason text not null,
  status text not null default 'open',
  resolution text,
  opened_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint delivery_dispute_reason_length check (char_length(trim(reason)) between 20 and 1000),
  constraint delivery_dispute_status_valid check (status in ('open', 'resolved', 'dismissed')),
  constraint delivery_dispute_resolution_valid check (
    (status = 'open' and resolution is null and resolved_at is null and resolved_by is null)
    or
    (status <> 'open' and char_length(trim(resolution)) between 4 and 1000
      and resolved_at is not null and resolved_by is not null)
  )
);

create unique index delivery_disputes_one_open_idx
  on public.delivery_disputes(delivery_id)
  where status = 'open';
create index delivery_disputes_admin_idx
  on public.delivery_disputes(status, opened_at);

create table public.delivery_dispute_events (
  id bigint generated always as identity primary key,
  dispute_id uuid not null references public.delivery_disputes(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  message text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint delivery_dispute_event_type_valid check (event_type in ('opened', 'resolved', 'dismissed')),
  constraint delivery_dispute_event_message_length check (char_length(trim(message)) between 4 and 1000)
);

create index delivery_dispute_events_timeline_idx
  on public.delivery_dispute_events(dispute_id, created_at);

create function public.open_delivery_dispute(
  p_order_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns public.delivery_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_delivery public.deliveries%rowtype;
  v_dispute public.delivery_disputes%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.buyer_id <> p_actor_id then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_delivery from public.deliveries where order_id = p_order_id for update;
  if v_delivery.id is null or v_delivery.courier_membership_id is null then raise exception 'DELIVERY_DISPUTE_NOT_ALLOWED'; end if;
  if not (
    v_delivery.status in ('assigned', 'accepted', 'at_pickup', 'picked_up', 'in_transit')
    or (
      v_delivery.status in ('delivered', 'failed')
      and v_delivery.terminal_at between timezone('utc', now()) - interval '3 days' and timezone('utc', now())
    )
  ) then raise exception 'DELIVERY_DISPUTE_NOT_ALLOWED'; end if;
  if exists (select 1 from public.delivery_disputes where delivery_id = v_delivery.id and status = 'open') then
    raise exception 'DELIVERY_DISPUTE_ALREADY_OPEN';
  end if;
  insert into public.delivery_disputes(delivery_id, order_id, merchant_id, buyer_id, courier_membership_id, reason)
  values (v_delivery.id, v_order.id, v_order.merchant_id, p_actor_id, v_delivery.courier_membership_id, trim(p_reason))
  returning * into v_dispute;
  insert into public.delivery_dispute_events(dispute_id, actor_id, event_type, message)
  values (v_dispute.id, p_actor_id, 'opened', trim(p_reason));
  return v_dispute;
end;
$$;

create function public.resolve_delivery_dispute(
  p_dispute_id uuid,
  p_outcome text,
  p_resolution text,
  p_actor_id uuid
)
returns public.delivery_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare v_dispute public.delivery_disputes%rowtype;
begin
  if p_outcome not in ('resolved', 'dismissed') then raise exception 'DELIVERY_DISPUTE_OUTCOME_INVALID'; end if;
  if not exists (
    select 1 from public.admin_roles ar where ar.user_id = p_actor_id and ar.active and ar.role in ('support', 'admin')
  ) then raise exception 'FORBIDDEN'; end if;
  select * into v_dispute from public.delivery_disputes where id = p_dispute_id for update;
  if v_dispute.id is null then raise exception 'DELIVERY_DISPUTE_NOT_FOUND'; end if;
  if v_dispute.status <> 'open' then raise exception 'DELIVERY_DISPUTE_ALREADY_RESOLVED'; end if;
  update public.delivery_disputes
  set status = p_outcome, resolution = trim(p_resolution), resolved_at = timezone('utc', now()), resolved_by = p_actor_id
  where id = p_dispute_id returning * into v_dispute;
  insert into public.delivery_dispute_events(dispute_id, actor_id, event_type, message)
  values (v_dispute.id, p_actor_id, p_outcome, trim(p_resolution));
  return v_dispute;
end;
$$;

-- Le code client rend la rémunération convenue exigible une seule fois.
create or replace function public.complete_delivery_stage(
  p_delivery_id uuid,
  p_stage text,
  p_actor_id uuid
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
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if v_delivery.id is null then raise exception 'DELIVERY_NOT_FOUND'; end if;
  select * into v_order from public.orders where id = v_delivery.order_id for update;

  if p_stage = 'pickup' then
    if v_delivery.status <> 'at_pickup' or v_order.status <> 'ready_for_handoff' then
      raise exception 'DELIVERY_TRANSITION_NOT_ALLOWED';
    end if;
    update public.deliveries
    set status = 'picked_up', pickup_verified_at = timezone('utc', now())
    where id = v_delivery.id returning * into v_delivery;
    insert into public.delivery_events (delivery_id, merchant_id, actor_id, from_status, to_status, public_message)
    values (v_delivery.id, v_delivery.merchant_id, p_actor_id, 'at_pickup', 'picked_up',
      'La commande a été retirée auprès du commerçant.');
    update public.orders set status = 'in_transit' where id = v_order.id;
    insert into public.order_events (order_id, merchant_id, actor_id, from_status, to_status, public_message)
    values (v_order.id, v_order.merchant_id, p_actor_id, v_order.status, 'in_transit',
      'Le livreur a récupéré la commande.');
  elsif p_stage = 'recipient' then
    if v_delivery.status not in ('picked_up', 'in_transit') or v_order.status <> 'in_transit' then
      raise exception 'DELIVERY_TRANSITION_NOT_ALLOWED';
    end if;
    v_from := v_delivery.status;
    update public.deliveries
    set status = 'delivered',
        delivered_at = timezone('utc', now()),
        terminal_at = timezone('utc', now()),
        courier_payable_xof = coalesce(courier_fee_xof, 0),
        courier_payment_status = case when courier_fee_xof is null then 'review_required' else 'due' end
    where id = v_delivery.id returning * into v_delivery;
    insert into public.delivery_events (delivery_id, merchant_id, actor_id, from_status, to_status, public_message)
    values (v_delivery.id, v_delivery.merchant_id, p_actor_id, v_from, 'delivered',
      'La commande a été remise au client.');
    update public.orders set status = 'delivered', delivered_at = timezone('utc', now()) where id = v_order.id;
    insert into public.order_events (order_id, merchant_id, actor_id, from_status, to_status, public_message)
    values (v_order.id, v_order.merchant_id, p_actor_id, v_order.status, 'delivered',
      'La réception a été confirmée avec le code client.');
  else
    raise exception 'DELIVERY_STAGE_INVALID';
  end if;
  return v_delivery;
end;
$$;

create function public.set_failed_delivery_compensation(
  p_delivery_id uuid,
  p_amount_xof integer,
  p_actor_id uuid
)
returns public.deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare v_delivery public.deliveries%rowtype;
begin
  if p_amount_xof < 0 then raise exception 'COURIER_COMPENSATION_INVALID'; end if;
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if v_delivery.id is null or v_delivery.status <> 'failed' then raise exception 'DELIVERY_NOT_FAILED'; end if;
  if not exists (
    select 1 from public.merchant_members mm
    where mm.merchant_id = v_delivery.merchant_id and mm.user_id = p_actor_id
      and mm.active and mm.role in ('owner', 'manager')
  ) then raise exception 'FORBIDDEN'; end if;
  if v_delivery.courier_payment_status = 'paid' then raise exception 'COURIER_PAYMENT_ALREADY_RECORDED'; end if;
  update public.deliveries
  set courier_payable_xof = p_amount_xof,
      courier_payment_status = case when p_amount_xof = 0 then 'waived' else 'due' end
  where id = p_delivery_id returning * into v_delivery;
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, v_delivery.merchant_id, 'courier.compensation.set', 'delivery', v_delivery.id::text,
    jsonb_build_object('amountXof', p_amount_xof));
  return v_delivery;
end;
$$;

create function public.record_courier_payout(
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
  v_count integer;
  v_amount integer;
  v_payout public.courier_payouts%rowtype;
begin
  if coalesce(array_length(p_delivery_ids, 1), 0) = 0 then raise exception 'COURIER_DELIVERIES_REQUIRED'; end if;
  if not exists (
    select 1 from public.merchant_members mm where mm.merchant_id = p_merchant_id
      and mm.user_id = p_actor_id and mm.active and mm.role in ('owner', 'manager')
  ) then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.deliveries d where d.id = any(p_delivery_ids) order by d.id for update;
  select count(*), coalesce(sum(d.courier_payable_xof), 0)
  into v_count, v_amount
  from public.deliveries d
  where d.id = any(p_delivery_ids)
    and d.merchant_id = p_merchant_id
    and d.courier_membership_id = p_courier_membership_id
    and d.courier_payment_status = 'due'
    and d.courier_payout_id is null
    and d.courier_payable_xof > 0;
  if v_count <> array_length(p_delivery_ids, 1) then raise exception 'COURIER_DELIVERY_NOT_PAYABLE'; end if;
  insert into public.courier_payouts(
    merchant_id, courier_membership_id, amount_xof, payment_method,
    external_reference, paid_at, recorded_by
  ) values (
    p_merchant_id, p_courier_membership_id, v_amount, p_payment_method,
    nullif(trim(p_external_reference), ''), p_paid_at, p_actor_id
  ) returning * into v_payout;
  insert into public.courier_payout_deliveries(payout_id, delivery_id, amount_xof)
  select v_payout.id, d.id, d.courier_payable_xof
  from public.deliveries d
  where d.id = any(p_delivery_ids);
  update public.deliveries
  set courier_payment_status = 'paid', courier_payout_id = v_payout.id
  where id = any(p_delivery_ids);
  insert into public.audit_events(actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, p_merchant_id, 'courier.payout.record', 'courier_payout', v_payout.id::text,
    jsonb_build_object('amountXof', v_amount, 'deliveryIds', to_jsonb(p_delivery_ids)));
  return v_payout;
end;
$$;

create function public.void_courier_payout(
  p_payout_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns public.courier_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare v_payout public.courier_payouts%rowtype;
begin
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'COURIER_PAYOUT_VOID_REASON_REQUIRED'; end if;
  select * into v_payout from public.courier_payouts where id = p_payout_id for update;
  if v_payout.id is null then raise exception 'COURIER_PAYOUT_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.merchant_members mm where mm.merchant_id = v_payout.merchant_id
      and mm.user_id = p_actor_id and mm.active and mm.role in ('owner', 'manager')
  ) then raise exception 'FORBIDDEN'; end if;
  if v_payout.status <> 'recorded' then raise exception 'COURIER_PAYOUT_ALREADY_VOIDED'; end if;
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

-- Conserve le nettoyage administrateur opérationnel avec les nouvelles
-- relations financières et de litige en ON DELETE RESTRICT.
create or replace function public.admin_delete_merchant_cascade(p_merchant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_batch_ids uuid[];
begin
  select array_agg(distinct batch_id) into v_batch_ids
  from public.orders where merchant_id = p_merchant_id;

  delete from public.delivery_disputes where merchant_id = p_merchant_id;
  delete from public.merchant_payouts where merchant_id = p_merchant_id;
  delete from public.payment_escrows where merchant_id = p_merchant_id;
  delete from public.direct_payment_declarations where merchant_id = p_merchant_id;
  delete from public.order_items where merchant_id = p_merchant_id;
  delete from public.orders where merchant_id = p_merchant_id;
  delete from public.courier_payouts where merchant_id = p_merchant_id;
  delete from public.payment_intents where merchant_id = p_merchant_id;

  if v_batch_ids is not null then
    delete from public.order_batches
    where id = any(v_batch_ids)
      and not exists (select 1 from public.orders where batch_id = order_batches.id)
      and not exists (select 1 from public.payment_intents where order_batch_id = order_batches.id);
  end if;
  delete from public.merchant_accounts where id = p_merchant_id;
end;
$$;

alter table public.courier_payouts enable row level security;
alter table public.courier_payout_deliveries enable row level security;
alter table public.delivery_disputes enable row level security;
alter table public.delivery_dispute_events enable row level security;

create policy courier_payouts_participant_read on public.courier_payouts
for select to authenticated using (
  exists (select 1 from public.courier_memberships cm where cm.id = courier_membership_id and cm.courier_user_id = auth.uid())
  or public.is_merchant_member(merchant_id, array['owner', 'manager']::public.merchant_member_role[])
  or (public.has_admin_role(array['support', 'admin']::public.admin_role_kind[]) and public.has_aal2())
);

create policy courier_payout_deliveries_participant_read on public.courier_payout_deliveries
for select to authenticated using (
  exists (
    select 1 from public.courier_payouts cp
    where cp.id = payout_id and (
      exists (select 1 from public.courier_memberships cm where cm.id = cp.courier_membership_id and cm.courier_user_id = auth.uid())
      or public.is_merchant_member(cp.merchant_id, array['owner', 'manager']::public.merchant_member_role[])
      or (public.has_admin_role(array['support', 'admin']::public.admin_role_kind[]) and public.has_aal2())
    )
  )
);

create policy delivery_disputes_participant_read on public.delivery_disputes
for select to authenticated using (
  buyer_id = auth.uid()
  or exists (select 1 from public.courier_memberships cm where cm.id = courier_membership_id and cm.courier_user_id = auth.uid())
  or public.is_merchant_member(merchant_id, array['owner', 'manager', 'fulfillment']::public.merchant_member_role[])
  or (public.has_admin_role(array['support', 'admin']::public.admin_role_kind[]) and public.has_aal2())
);

create policy delivery_dispute_events_participant_read on public.delivery_dispute_events
for select to authenticated using (
  exists (select 1 from public.delivery_disputes dd where dd.id = dispute_id and (
    dd.buyer_id = auth.uid()
    or exists (select 1 from public.courier_memberships cm where cm.id = dd.courier_membership_id and cm.courier_user_id = auth.uid())
    or public.is_merchant_member(dd.merchant_id, array['owner', 'manager', 'fulfillment']::public.merchant_member_role[])
    or (public.has_admin_role(array['support', 'admin']::public.admin_role_kind[]) and public.has_aal2())
  ))
);

revoke all on function public.set_failed_delivery_compensation(uuid, integer, uuid) from public;
revoke all on function public.record_courier_payout(uuid, uuid, uuid[], text, text, timestamptz, uuid) from public;
revoke all on function public.void_courier_payout(uuid, text, uuid) from public;
revoke all on function public.open_delivery_dispute(uuid, text, uuid) from public;
revoke all on function public.resolve_delivery_dispute(uuid, text, text, uuid) from public;
grant execute on function public.set_failed_delivery_compensation(uuid, integer, uuid) to service_role;
grant execute on function public.record_courier_payout(uuid, uuid, uuid[], text, text, timestamptz, uuid) to service_role;
grant execute on function public.void_courier_payout(uuid, text, uuid) to service_role;
grant execute on function public.open_delivery_dispute(uuid, text, uuid) to service_role;
grant execute on function public.resolve_delivery_dispute(uuid, text, text, uuid) to service_role;

alter publication supabase_realtime add table public.courier_payouts;
alter publication supabase_realtime add table public.delivery_disputes;

commit;
