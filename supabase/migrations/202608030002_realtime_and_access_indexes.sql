begin;

create index if not exists courier_memberships_user_status_idx
  on public.courier_memberships (courier_user_id, status, updated_at desc);
create index if not exists merchant_members_user_active_idx
  on public.merchant_members (user_id, active, merchant_id);
create index if not exists addresses_owner_active_idx
  on public.addresses (owner_user_id, created_at desc)
  where archived_at is null;

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.deliveries;
exception when duplicate_object then null;
end $$;

commit;
