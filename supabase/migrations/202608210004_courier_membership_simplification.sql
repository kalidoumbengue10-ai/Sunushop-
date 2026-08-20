begin;

-- ---------------------------------------------------------------------------
-- courier_memberships devient une table de liaison boutique <-> livreur, le
-- profil vivant désormais dans courier_profiles. Les colonnes dupliquées
-- (nom, téléphone, véhicule, moyens de paiement) restent en place : elles sont
-- lues directement par les règlements, les litiges et les écrans livreur déjà
-- en production. Un trigger les tient synchronisées depuis le profil, ce qui
-- permettra de les retirer plus tard sans big-bang.
-- ---------------------------------------------------------------------------

alter table public.courier_memberships
  add column courier_profile_id uuid references public.courier_profiles(id) on delete cascade,
  add column invited_at timestamptz not null default timezone('utc', now()),
  add column responded_at timestamptz;

-- L'acceptation devient un évènement distinct de la création de la ligne :
-- une invitation en attente n'a pas encore de date d'acceptation.
alter table public.courier_memberships
  alter column accepted_at drop not null,
  alter column accepted_at drop default;

create index courier_memberships_profile_idx
  on public.courier_memberships (courier_profile_id, status);

-- Backfill : un profil par livreur déjà activé, alimenté par sa fiche la plus
-- ancienne. Ces livreurs travaillent déjà pour des boutiques : les repasser en
-- 'pending_verification' les bloquerait rétroactivement, on les considère
-- vérifiés et un contrôle manuel pourra les rétrograder si nécessaire.
insert into public.courier_profiles (
  user_id, display_name, phone, email, vehicle_type, vehicle_registration,
  photo_storage_path, wave_payment_number, orange_money_payment_number,
  preferred_payment_channel, verification_status, verified_at, created_at
)
select distinct on (cm.courier_user_id)
  cm.courier_user_id,
  cm.display_name,
  cm.phone,
  cm.email,
  cm.vehicle_type::public.courier_vehicle_type,
  cm.vehicle_registration,
  cm.photo_storage_path,
  cm.wave_payment_number,
  cm.orange_money_payment_number,
  cm.preferred_payment_channel,
  'verified',
  timezone('utc', now()),
  cm.created_at
from public.courier_memberships cm
where cm.courier_user_id is not null
order by cm.courier_user_id, cm.created_at asc
on conflict (user_id) do nothing;

update public.courier_memberships cm
set courier_profile_id = cp.id
from public.courier_profiles cp
where cp.user_id = cm.courier_user_id
  and cm.courier_profile_id is null;

-- Les fiches jamais activées (courier_user_id null) n'ont aucun compte à
-- rattacher : elles restent en place pour la traçabilité, mais leur invitation
-- par e-mail ne sera plus jamais consommée par le nouveau parcours.
update public.workspace_invitations
set status = 'expired'
where kind = 'courier' and status = 'pending';

-- ---------------------------------------------------------------------------
-- Synchronisation profil -> fiches boutique.
-- ---------------------------------------------------------------------------

create function public.sync_courier_membership_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.courier_memberships
  set display_name = new.display_name,
      phone = new.phone,
      email = new.email,
      vehicle_type = new.vehicle_type::text,
      vehicle_registration = new.vehicle_registration,
      photo_storage_path = new.photo_storage_path,
      wave_payment_number = new.wave_payment_number,
      orange_money_payment_number = new.orange_money_payment_number,
      preferred_payment_channel = new.preferred_payment_channel
  where courier_profile_id = new.id;
  return new;
end;
$$;

create trigger courier_profiles_sync_memberships
  after update on public.courier_profiles
  for each row execute function public.sync_courier_membership_from_profile();

revoke all on function public.sync_courier_membership_from_profile() from public;

commit;
