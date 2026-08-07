begin;

-- Retrait en boutique : l'enum delivery_method_kind contient déjà 'pickup'
-- mais rien ne l'exploite. merchant_accounts n'a ni coordonnées ni adresse
-- dédiée au retrait (address_hint existe mais sert au dossier KYC).

alter table public.merchant_accounts
  add column pickup_enabled boolean not null default false,
  add column pickup_address_line text,
  add column pickup_latitude numeric(9,6),
  add column pickup_longitude numeric(9,6),
  add column pickup_hours text,
  add column pickup_instructions text;

alter table public.merchant_accounts
  add constraint merchant_pickup_address_required
  check (not pickup_enabled or pickup_address_line is not null);

-- Exposer ces colonnes dans la policy de lecture publique existante, et dans
-- le grant de colonnes restreint (revoke all + grant select ciblé sur
-- merchant_accounts, voir 202607290003_rls_storage.sql).
grant select (
  pickup_enabled, pickup_address_line, pickup_latitude, pickup_longitude,
  pickup_hours, pickup_instructions
) on public.merchant_accounts to anon, authenticated;

commit;
