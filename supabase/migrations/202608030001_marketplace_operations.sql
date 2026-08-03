begin;

create type public.workspace_invitation_kind as enum ('merchant_owner', 'courier');
create type public.workspace_invitation_status as enum (
  'pending', 'claimed', 'expired', 'revoked'
);
create type public.merchant_media_kind as enum ('logo', 'cover');
create type public.courier_membership_status as enum ('active', 'inactive');
create type public.delivery_status as enum (
  'assigned',
  'accepted',
  'at_pickup',
  'picked_up',
  'in_transit',
  'delivered',
  'failed',
  'cancelled'
);

create table public.workspace_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  kind public.workspace_invitation_kind not null,
  merchant_id uuid references public.merchant_accounts(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete set null,
  email extensions.citext not null,
  token_hash text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status public.workspace_invitation_status not null default 'pending',
  expires_at timestamptz not null,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_invitation_target check (
    (kind = 'merchant_owner' and merchant_id is null)
    or (kind = 'courier' and merchant_id is not null)
  ),
  constraint workspace_invitation_hash check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint workspace_invitation_expiry check (expires_at > created_at)
);

create unique index workspace_invitations_pending_target_idx
  on public.workspace_invitations (kind, lower(email::text), coalesce(merchant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

create table public.merchant_media (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  kind public.merchant_media_kind not null,
  storage_bucket text not null default 'merchant-branding',
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (merchant_id, kind),
  constraint merchant_media_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint merchant_media_size check (size_bytes between 1 and 10485760)
);

create table public.addresses (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  recipient_name text not null,
  phone text not null,
  region text not null,
  city text not null,
  address_hint text not null,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint addresses_label_length check (char_length(label) between 2 and 80),
  constraint addresses_recipient_length check (char_length(recipient_name) between 2 and 120),
  constraint addresses_phone_length check (char_length(phone) between 8 and 24),
  constraint addresses_hint_length check (char_length(address_hint) between 2 and 300),
  constraint addresses_coordinates check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  )
);

create unique index addresses_one_default_idx
  on public.addresses (owner_user_id)
  where is_default and archived_at is null;

create table public.courier_memberships (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  courier_user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  phone text not null,
  status public.courier_membership_status not null default 'active',
  invited_by uuid not null references public.profiles(id) on delete restrict,
  accepted_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (merchant_id, courier_user_id),
  constraint courier_display_name_length check (char_length(display_name) between 2 and 120),
  constraint courier_phone_length check (char_length(phone) between 8 and 24)
);

create table public.deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  courier_membership_id uuid not null references public.courier_memberships(id) on delete restrict,
  status public.delivery_status not null default 'assigned',
  pickup_snapshot jsonb not null,
  pickup_code_hash text not null,
  recipient_code_hash text not null,
  pickup_code_attempts integer not null default 0,
  recipient_code_attempts integer not null default 0,
  code_attempt_limit integer not null default 5,
  pickup_verified_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint delivery_code_hashes check (
    pickup_code_hash ~ '^[a-f0-9]{64}$' and recipient_code_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint delivery_attempts check (
    pickup_code_attempts >= 0 and recipient_code_attempts >= 0 and code_attempt_limit between 3 and 10
  )
);

create index deliveries_courier_status_idx
  on public.deliveries (courier_membership_id, status, created_at desc);
create index deliveries_merchant_status_idx
  on public.deliveries (merchant_id, status, created_at desc);

create table public.delivery_events (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_status public.delivery_status,
  to_status public.delivery_status not null,
  public_message text,
  internal_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index delivery_events_delivery_idx
  on public.delivery_events (delivery_id, created_at);

create trigger workspace_invitations_set_updated_at
before update on public.workspace_invitations
for each row execute function public.set_updated_at();
create trigger merchant_media_set_updated_at
before update on public.merchant_media
for each row execute function public.set_updated_at();
create trigger addresses_set_updated_at
before update on public.addresses
for each row execute function public.set_updated_at();
create trigger courier_memberships_set_updated_at
before update on public.courier_memberships
for each row execute function public.set_updated_at();
create trigger deliveries_set_updated_at
before update on public.deliveries
for each row execute function public.set_updated_at();

alter table public.workspace_invitations enable row level security;
alter table public.merchant_media enable row level security;
alter table public.addresses enable row level security;
alter table public.courier_memberships enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_events enable row level security;

create policy workspace_invitations_admin_read
  on public.workspace_invitations for select to authenticated
  using (public.has_admin_role(array['support', 'admin']::public.admin_role_kind[]) and public.has_aal2());
create policy workspace_invitations_merchant_read
  on public.workspace_invitations for select to authenticated
  using (merchant_id is not null and public.is_merchant_member(merchant_id, array['owner', 'manager']::public.merchant_member_role[]));

create policy merchant_media_public_read
  on public.merchant_media for select to anon, authenticated using (true);
create policy merchant_media_member_all
  on public.merchant_media for all to authenticated
  using (public.is_merchant_member(merchant_id, array['owner', 'manager', 'catalog']::public.merchant_member_role[]))
  with check (public.is_merchant_member(merchant_id, array['owner', 'manager', 'catalog']::public.merchant_member_role[]));

create policy addresses_owner_all
  on public.addresses for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy courier_memberships_participant_read
  on public.courier_memberships for select to authenticated
  using (
    courier_user_id = auth.uid()
    or public.is_merchant_member(merchant_id, array['owner', 'manager', 'fulfillment']::public.merchant_member_role[])
  );
create policy courier_memberships_merchant_update
  on public.courier_memberships for update to authenticated
  using (public.is_merchant_member(merchant_id, array['owner', 'manager', 'fulfillment']::public.merchant_member_role[]))
  with check (public.is_merchant_member(merchant_id, array['owner', 'manager', 'fulfillment']::public.merchant_member_role[]));

create policy deliveries_participant_read
  on public.deliveries for select to authenticated
  using (
    public.is_merchant_member(merchant_id)
    or exists (
      select 1 from public.courier_memberships cm
      where cm.id = courier_membership_id and cm.courier_user_id = auth.uid()
    )
    or exists (
      select 1 from public.orders o
      where o.id = order_id and o.buyer_id = auth.uid()
    )
  );

create policy delivery_events_participant_read
  on public.delivery_events for select to authenticated
  using (
    public.is_merchant_member(merchant_id)
    or exists (
      select 1
      from public.deliveries d
      join public.courier_memberships cm on cm.id = d.courier_membership_id
      where d.id = delivery_id and cm.courier_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.deliveries d
      join public.orders o on o.id = d.order_id
      where d.id = delivery_id and o.buyer_id = auth.uid()
    )
  );

create function public.complete_delivery_stage(
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
  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;
  if v_delivery.id is null then raise exception 'DELIVERY_NOT_FOUND'; end if;
  select * into v_order from public.orders where id = v_delivery.order_id for update;

  if p_stage = 'pickup' then
    if v_delivery.status <> 'at_pickup' or v_order.status <> 'ready_for_handoff' then
      raise exception 'DELIVERY_TRANSITION_NOT_ALLOWED';
    end if;
    update public.deliveries
      set status = 'picked_up', pickup_verified_at = timezone('utc', now())
      where id = v_delivery.id returning * into v_delivery;
    insert into public.delivery_events (
      delivery_id, merchant_id, actor_id, from_status, to_status, public_message
    ) values (
      v_delivery.id, v_delivery.merchant_id, p_actor_id, 'at_pickup', 'picked_up',
      'La commande a été retirée auprès du commerçant.'
    );
    update public.orders set status = 'in_transit' where id = v_order.id;
    insert into public.order_events (
      order_id, merchant_id, actor_id, from_status, to_status, public_message
    ) values (
      v_order.id, v_order.merchant_id, p_actor_id, v_order.status, 'in_transit',
      'Le livreur a récupéré la commande.'
    );
  elsif p_stage = 'recipient' then
    if v_delivery.status not in ('picked_up', 'in_transit') or v_order.status <> 'in_transit' then
      raise exception 'DELIVERY_TRANSITION_NOT_ALLOWED';
    end if;
    v_from := v_delivery.status;
    update public.deliveries
      set status = 'delivered', delivered_at = timezone('utc', now())
      where id = v_delivery.id returning * into v_delivery;
    insert into public.delivery_events (
      delivery_id, merchant_id, actor_id, from_status, to_status, public_message
    ) values (
      v_delivery.id, v_delivery.merchant_id, p_actor_id, v_from,
      'delivered', 'La commande a été remise au client.'
    );
    update public.orders set status = 'delivered' where id = v_order.id;
    insert into public.order_events (
      order_id, merchant_id, actor_id, from_status, to_status, public_message
    ) values (
      v_order.id, v_order.merchant_id, p_actor_id, v_order.status, 'delivered',
      'La réception a été confirmée avec le code client.'
    );
  else
    raise exception 'DELIVERY_STAGE_INVALID';
  end if;
  return v_delivery;
end;
$$;

revoke all on function public.complete_delivery_stage(uuid, text, uuid) from public;
grant execute on function public.complete_delivery_stage(uuid, text, uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'merchant-branding',
  'merchant-branding',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy merchant_branding_storage_insert_member
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'merchant-branding'
    and public.is_merchant_member(((storage.foldername(name))[1])::uuid, array['owner', 'manager', 'catalog']::public.merchant_member_role[])
  );
create policy merchant_branding_storage_update_member
  on storage.objects for update to authenticated
  using (
    bucket_id = 'merchant-branding'
    and public.is_merchant_member(((storage.foldername(name))[1])::uuid, array['owner', 'manager', 'catalog']::public.merchant_member_role[])
  );
create policy merchant_branding_storage_delete_member
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'merchant-branding'
    and public.is_merchant_member(((storage.foldername(name))[1])::uuid, array['owner', 'manager', 'catalog']::public.merchant_member_role[])
  );

grant select, insert, update on public.addresses to authenticated;
grant select on public.merchant_media, public.courier_memberships, public.deliveries, public.delivery_events to authenticated;
grant select on public.merchant_media to anon;
grant select on public.workspace_invitations to authenticated;

commit;
