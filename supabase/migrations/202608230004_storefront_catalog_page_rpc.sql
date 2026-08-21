-- Corrige le finding perf découvert par test de charge réel sur
-- /api/storefront (p95 535ms-2s à 4-20 req/s, dégradation progressive) :
-- listPage() faisait jusqu'à 3 requêtes séquentielles (produits paginés
-- avec count(exact) sur jointure, puis delivery_zones, puis
-- merchant_accounts pickup) pour appliquer un filtre "orderable" en
-- JavaScript après coup. Sur le même modèle que
-- nearby_storefront_product_ids (202608120001_geolocation.sql), le filtre
-- orderable et le count total sont désormais calculés en une seule requête
-- SQL, dans l'ordre de tri canonique (published_at desc).

begin;

create function public.storefront_catalog_page_product_ids(
  p_query text default null,
  p_category_slug text default null,
  p_merchant_slug text default null,
  p_region text default null,
  p_city text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table(product_id uuid, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select
      p.id as product_id,
      p.published_at
    from public.products p
    join public.merchant_accounts m on m.id = p.merchant_id
    join public.categories c on c.id = p.category_id
    where p.status = 'published'
      and m.status = 'active'
      and m.subscription_status in ('active', 'grace')
      and (p_query is null or p.title ilike '%' || p_query || '%' or p.description ilike '%' || p_query || '%')
      and (p_category_slug is null or c.slug = p_category_slug)
      and (p_merchant_slug is null or m.slug = p_merchant_slug)
      and (p_region is null or m.region = p_region or m.region is null)
      and (p_city is null or m.city ilike p_city)
      and (
        m.pickup_enabled
        or exists (select 1 from public.delivery_zones dz where dz.merchant_id = m.id and dz.active)
      )
      and exists (select 1 from public.product_media pm where pm.product_id = p.id)
      and exists (
        select 1
        from public.product_variants pv
        join public.inventory_items ii on ii.variant_id = pv.id
        where pv.product_id = p.id and pv.active and ii.available_quantity - ii.reserved_quantity > 0
      )
  )
  select product_id, count(*) over() as total_count
  from candidates
  order by published_at desc, product_id
  limit least(greatest(p_limit, 1), 60)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.storefront_catalog_page_product_ids(text, text, text, text, text, integer, integer) from public;
grant execute on function public.storefront_catalog_page_product_ids(text, text, text, text, text, integer, integer) to service_role;

commit;
