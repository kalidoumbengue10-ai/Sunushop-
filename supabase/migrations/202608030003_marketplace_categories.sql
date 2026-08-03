begin;

insert into public.categories (slug, name, description, position, active)
values
  ('alimentation-boissons', 'Alimentation & boissons', 'Épicerie, produits frais, boissons et spécialités locales.', 10, true),
  ('mode-accessoires', 'Mode & accessoires', 'Vêtements, chaussures, sacs, bijoux et accessoires.', 20, true),
  ('beaute-bien-etre', 'Beauté & bien-être', 'Cosmétiques, soins, parfums et produits de bien-être.', 30, true),
  ('maison-decoration', 'Maison & décoration', 'Mobilier, décoration, cuisine et équipement de la maison.', 40, true),
  ('electronique-telephonie', 'Électronique & téléphonie', 'Téléphones, accessoires, informatique et électronique.', 50, true),
  ('bebe-enfants', 'Bébé & enfants', 'Vêtements, jeux, soins et équipement pour enfants.', 60, true),
  ('sports-loisirs', 'Sports & loisirs', 'Articles de sport, loisirs, jeux et activités de plein air.', 70, true),
  ('artisanat-culture', 'Artisanat & culture', 'Créations artisanales, art, livres et produits culturels.', 80, true),
  ('autres-produits', 'Autres produits', 'Produits ne correspondant pas encore aux catégories principales.', 900, true)
on conflict (slug) do nothing;

commit;
