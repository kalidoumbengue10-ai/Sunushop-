-- Index trigrammes pour la recherche produit/boutique (ilike '%...%'),
-- sans quoi ces requêtes dégénèrent en balayage séquentiel dès que le
-- catalogue grossit.

begin;

create extension if not exists pg_trgm;

create index if not exists products_title_trgm_idx
  on public.products using gin (title gin_trgm_ops);
create index if not exists products_description_trgm_idx
  on public.products using gin (description gin_trgm_ops);
create index if not exists merchant_accounts_public_name_trgm_idx
  on public.merchant_accounts using gin (public_name gin_trgm_ops);

commit;
