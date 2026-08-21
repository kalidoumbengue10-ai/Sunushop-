begin;

-- Le livreur est créé par un commerçant et active un accès léger avec un PIN.
-- Les tables KYC existantes sont conservées pour l'historique, mais ne
-- conditionnent plus l'invitation ou l'affectation d'une mission.
alter table public.courier_profiles
  add column if not exists pin_configured_at timestamptz,
  add column if not exists pin_reset_at timestamptz,
  add column if not exists last_access_at timestamptz;

update public.courier_profiles
set verification_status = 'verified',
    verified_at = coalesce(verified_at, timezone('utc', now()))
where verification_status <> 'verified';

-- Un e-mail n'est plus obligatoire : le téléphone est le contact principal.
alter table public.workspace_invitations
  alter column email drop not null,
  add column if not exists courier_membership_id uuid
    references public.courier_memberships(id) on delete cascade;

create unique index if not exists workspace_invitations_pending_courier_membership_idx
  on public.workspace_invitations (courier_membership_id)
  where kind = 'courier' and status = 'pending' and courier_membership_id is not null;

-- Une offre précède désormais la livraison. Elle ne contient que les données
-- nécessaires à la décision du livreur ; les coordonnées exactes du client
-- restent portées par la commande et ne sont révélées qu'après acceptation.
create table public.delivery_offers (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_membership_id uuid not null references public.courier_memberships(id) on delete restrict,
  status text not null default 'pending',
  distance_meters integer not null,
  duration_seconds integer not null,
  client_delivery_fee_xof integer not null,
  courier_fee_xof integer not null,
  route_snapshot jsonb,
  idempotency_key text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  responded_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint delivery_offer_status_valid check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  constraint delivery_offer_distance_valid check (distance_meters > 0),
  constraint delivery_offer_duration_valid check (duration_seconds > 0),
  constraint delivery_offer_client_fee_valid check (client_delivery_fee_xof >= 0),
  constraint delivery_offer_courier_fee_valid check (courier_fee_xof > 0),
  constraint delivery_offer_idempotency_unique unique (merchant_id, idempotency_key)
);

create unique index delivery_offers_one_pending_order_idx
  on public.delivery_offers (order_id)
  where status = 'pending';
create index delivery_offers_courier_queue_idx
  on public.delivery_offers (courier_membership_id, status, created_at desc);
create index delivery_offers_merchant_queue_idx
  on public.delivery_offers (merchant_id, status, created_at desc);

create trigger delivery_offers_set_updated_at
  before update on public.delivery_offers
  for each row execute function public.set_updated_at();

alter table public.delivery_offers enable row level security;

create policy delivery_offers_participant_read
  on public.delivery_offers for select to authenticated
  using (
    public.is_merchant_member(merchant_id)
    or exists (
      select 1 from public.courier_memberships cm
      where cm.id = courier_membership_id and cm.courier_user_id = (select auth.uid())
    )
  );

grant select on public.delivery_offers to authenticated;

alter table public.deliveries
  add column if not exists delivery_offer_id uuid unique references public.delivery_offers(id) on delete set null,
  add column if not exists route_distance_meters integer,
  add column if not exists route_duration_seconds integer,
  add column if not exists recipient_code_version integer not null default 0;

-- L'acceptation verrouille l'offre et crée la livraison dans la même
-- transaction. Un double toucher retourne simplement la livraison existante.
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
  v_existing uuid;
begin
  select * into v_offer from public.delivery_offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'DELIVERY_OFFER_NOT_FOUND'; end if;
  select * into v_membership from public.courier_memberships where id = v_offer.courier_membership_id;
  if v_membership.courier_user_id <> auth.uid() then raise exception 'DELIVERY_OFFER_NOT_FOUND'; end if;
  if v_offer.status = 'accepted' then
    select id into v_existing from public.deliveries where delivery_offer_id = p_offer_id;
    if v_existing is not null then return v_existing; end if;
  end if;
  if v_offer.status <> 'pending' then raise exception 'DELIVERY_OFFER_ALREADY_ANSWERED'; end if;
  select * into v_order from public.orders where id = v_offer.order_id for update;
  if v_order.status <> 'ready_for_handoff' then raise exception 'ORDER_TRANSITION_NOT_ALLOWED'; end if;
  if exists (select 1 from public.deliveries where order_id = v_order.id) then raise exception 'DELIVERY_ALREADY_EXISTS'; end if;
  select * into v_merchant from public.merchant_accounts where id = v_offer.merchant_id;

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
    v_offer.route_snapshot, v_offer.distance_meters,
    v_offer.duration_seconds
  );
  update public.delivery_offers set status = 'accepted', responded_at = timezone('utc', now()) where id = v_offer.id;
  update public.courier_memberships set status = 'active', accepted_at = coalesce(accepted_at, timezone('utc', now())), responded_at = timezone('utc', now()) where id = v_offer.courier_membership_id;
  insert into public.delivery_events(delivery_id, merchant_id, actor_id, to_status, public_message, metadata)
  values (p_delivery_id, v_offer.merchant_id, auth.uid(), 'accepted', 'Le livreur a accepté la mission.', jsonb_build_object('offerId', p_offer_id));
  return p_delivery_id;
end;
$$;

revoke all on function public.accept_delivery_offer(uuid, uuid, text, text) from public;
grant execute on function public.accept_delivery_offer(uuid, uuid, text, text) to authenticated;

create or replace function public.invalidate_courier_sessions(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

revoke all on function public.invalidate_courier_sessions(uuid) from public;
grant execute on function public.invalidate_courier_sessions(uuid) to service_role;

-- Les coordonnées de paiement sont globales. Le trigger déjà en place les
-- recopie sur les memberships afin de conserver la compatibilité des écrans
-- et fonctions de règlement actuels.
create or replace function public.update_courier_payment_profile(
  p_wave_number text,
  p_orange_money_number text,
  p_preferred_channel text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_count integer;
begin
  select id into v_profile_id
  from public.courier_profiles
  where user_id = auth.uid();

  if v_profile_id is null then
    raise exception using errcode = 'P0002', message = 'COURIER_PROFILE_NOT_FOUND';
  end if;
  if p_preferred_channel not in ('wave', 'orange_money') and p_preferred_channel is not null then
    raise exception using errcode = '22023', message = 'COURIER_PAYMENT_CHANNEL_INVALID';
  end if;
  if p_preferred_channel = 'wave' and p_wave_number is null then
    raise exception using errcode = '23514', message = 'COURIER_WAVE_NUMBER_REQUIRED';
  end if;
  if p_preferred_channel = 'orange_money' and p_orange_money_number is null then
    raise exception using errcode = '23514', message = 'COURIER_ORANGE_MONEY_NUMBER_REQUIRED';
  end if;

  update public.courier_profiles
  set wave_payment_number = p_wave_number,
      orange_money_payment_number = p_orange_money_number,
      preferred_payment_channel = p_preferred_channel
  where id = v_profile_id;

  select count(*) into v_count
  from public.courier_memberships
  where courier_profile_id = v_profile_id;
  return v_count;
end;
$$;

revoke all on function public.update_courier_payment_profile(text, text, text) from public;
grant execute on function public.update_courier_payment_profile(text, text, text) to authenticated;

-- Suivi du prestataire d'e-mail distinct du simple état de la file interne.
alter table public.notification_outbox
  add column if not exists provider_message_id text,
  add column if not exists delivery_state text not null default 'queued',
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add constraint notification_delivery_state_valid
    check (delivery_state in ('queued', 'accepted', 'delivered', 'bounced', 'failed'));

commit;
