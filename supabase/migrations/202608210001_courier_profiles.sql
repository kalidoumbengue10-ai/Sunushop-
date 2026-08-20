begin;

-- ---------------------------------------------------------------------------
-- Profil livreur transversal : un compte = un profil, indépendant de toute
-- boutique. Jusqu'ici les données du livreur (nom, téléphone, véhicule,
-- moyens de paiement) étaient dupliquées dans chaque ligne
-- courier_memberships, donc réécrites boutique par boutique. Le livreur peut
-- désormais s'inscrire seul, puis être invité par plusieurs commerçants.
-- ---------------------------------------------------------------------------

create type public.courier_verification_status as enum (
  'pending_verification',
  'verified',
  'rejected',
  'suspended'
);

create type public.courier_vehicle_type as enum (
  'walking',
  'bicycle',
  'motorbike',
  'car',
  'van',
  'other'
);

create table public.courier_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  display_name text not null,
  phone text not null,
  email extensions.citext,
  vehicle_type public.courier_vehicle_type,
  vehicle_registration text,
  photo_storage_path text,
  wave_payment_number text,
  orange_money_payment_number text,
  preferred_payment_channel text,
  verification_status public.courier_verification_status not null default 'pending_verification',
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint courier_profile_display_name_length check (char_length(display_name) between 2 and 120),
  constraint courier_profile_phone_length check (char_length(phone) between 8 and 24),
  constraint courier_profile_vehicle_registration_length check (
    vehicle_registration is null or char_length(vehicle_registration) between 2 and 40
  ),
  constraint courier_profile_wave_number_format check (
    wave_payment_number is null or wave_payment_number ~ '^\+[1-9][0-9]{7,14}$'
  ),
  constraint courier_profile_om_number_format check (
    orange_money_payment_number is null or orange_money_payment_number ~ '^\+[1-9][0-9]{7,14}$'
  ),
  constraint courier_profile_preferred_channel_valid check (
    preferred_payment_channel is null or preferred_payment_channel in ('wave', 'orange_money')
  ),
  constraint courier_profile_preferred_channel_has_number check (
    preferred_payment_channel is null
    or (preferred_payment_channel = 'wave' and wave_payment_number is not null)
    or (preferred_payment_channel = 'orange_money' and orange_money_payment_number is not null)
  )
);

-- La recherche commerçant se fait par correspondance exacte sur le téléphone.
create index courier_profiles_phone_idx on public.courier_profiles (phone);
create index courier_profiles_verification_idx
  on public.courier_profiles (verification_status, updated_at desc);

create trigger courier_profiles_set_updated_at
  before update on public.courier_profiles
  for each row execute function public.set_updated_at();

alter table public.courier_profiles enable row level security;

-- Aucune policy de lecture large : le vivier ne doit jamais être parcourable
-- depuis un client authentifié. La recherche du commerçant passe uniquement
-- par un endpoint serveur en service role, qui ne renvoie qu'une
-- correspondance exacte (0 ou 1 résultat), jamais une liste.
create policy courier_profiles_self_read
  on public.courier_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy courier_profiles_self_update
  on public.courier_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on public.courier_profiles to authenticated;
grant update (display_name, phone, vehicle_type, vehicle_registration) on public.courier_profiles to authenticated;

commit;
