begin;

insert into public.categories (slug, name, description, position, active)
values
  ('restaurant', 'Restaurant', 'Plats préparés, restauration rapide et livraison de repas.', 45, true)
on conflict (slug) do nothing;

commit;
