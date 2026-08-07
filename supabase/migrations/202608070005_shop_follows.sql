begin;

-- Favoris boutiques : un client peut suivre une boutique pour la retrouver
-- rapidement dans son espace. Portée volontairement simple (chantier initial) :
-- pas de notification, juste un suivi + une liste dans l'espace client.
create table public.shop_follows (
  id uuid primary key default extensions.gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (buyer_id, merchant_id)
);

create index shop_follows_buyer_idx on public.shop_follows(buyer_id, created_at desc);

alter table public.shop_follows enable row level security;

create policy shop_follows_owner_all
  on public.shop_follows for all to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

commit;
