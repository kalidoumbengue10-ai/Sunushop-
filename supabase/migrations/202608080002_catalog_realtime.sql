-- Permet au catalogue client de refléter en temps réel les modifications
-- faites par un marchand (prix, stock, photos, nouvelles variantes) sans
-- attendre la revalidation ISR (60 s) ni un rechargement manuel.

begin;

do $$
begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.product_variants;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.product_media;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.inventory_items;
exception when duplicate_object then null;
end $$;

commit;
