insert into public.categories (slug, name, description, position)
values
  ('pret-a-porter', 'Prêt-à-porter', 'Mode, accessoires et créations locales.', 10),
  ('electronique', 'Électronique', 'Appareils, accessoires et équipements.', 20),
  ('alimentaire', 'Alimentaire', 'Produits alimentaires avec zones de livraison explicites.', 30)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    position = excluded.position,
    active = true;

insert into public.subscription_plans (
  id,
  name,
  monthly_price_xof,
  product_limit,
  team_member_limit,
  position
)
values
  ('essential', 'Essentiel', 4900, 100, 1, 10),
  ('pro', 'Pro', 9900, 1000, 5, 20),
  ('network', 'Réseau', 24900, null, 20, 30)
on conflict (id) do update
set name = excluded.name,
    monthly_price_xof = excluded.monthly_price_xof,
    product_limit = excluded.product_limit,
    team_member_limit = excluded.team_member_limit,
    position = excluded.position,
    active = true;
