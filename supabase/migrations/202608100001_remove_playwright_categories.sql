begin;

-- Les anciens scénarios Playwright créaient une catégorie par exécution. Une
-- exécution interrompue avant `afterAll` laissait alors cette donnée visible
-- aux futurs marchands. Les produits éventuellement conservés sont rattachés
-- à la catégorie de repli avant suppression.
insert into public.categories (slug, name, description, position, active)
values (
  'autres-produits',
  'Autres produits',
  'Produits ne correspondant pas encore aux catégories principales.',
  900,
  true
)
on conflict (slug) do update
set active = true;

update public.products
set category_id = (
  select id
  from public.categories
  where slug = 'autres-produits'
)
where category_id in (
  select id
  from public.categories
  where slug::text like 'e2e-%'
);

delete from public.categories
where slug::text like 'e2e-%';

commit;
