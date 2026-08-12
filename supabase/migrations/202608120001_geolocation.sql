begin;

alter table public.deliveries
  add column route_snapshot jsonb;

alter table public.addresses
  add constraint addresses_senegal_coordinates
  check (
    (latitude is null and longitude is null)
    or (
      latitude is not null and longitude is not null
      and latitude between 12 and 17
      and longitude between -18 and -11
    )
  ) not valid;

alter table public.merchant_accounts
  add constraint merchant_location_coordinates
  check (
    (pickup_latitude is null and pickup_longitude is null)
    or (
      pickup_latitude is not null and pickup_longitude is not null
      and pickup_latitude between 12 and 17
      and pickup_longitude between -18 and -11
    )
  ) not valid;

create function public.validate_order_geolocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latitude numeric;
  v_longitude numeric;
  v_shop public.merchant_accounts%rowtype;
begin
  if coalesce(new.delivery_snapshot ->> 'methodKind', 'merchant_delivery') = 'pickup' then
    return new;
  end if;

  if coalesce(jsonb_typeof(new.recipient_snapshot -> 'latitude'), 'null') <> 'number'
     or coalesce(jsonb_typeof(new.recipient_snapshot -> 'longitude'), 'null') <> 'number' then
    raise exception using errcode = '23514', message = 'DELIVERY_DESTINATION_REQUIRED';
  end if;

  v_latitude := (new.recipient_snapshot ->> 'latitude')::numeric;
  v_longitude := (new.recipient_snapshot ->> 'longitude')::numeric;
  if v_latitude not between 12 and 17 or v_longitude not between -18 and -11 then
    raise exception using errcode = '23514', message = 'DELIVERY_DESTINATION_INVALID';
  end if;

  if lower(trim(coalesce(new.delivery_snapshot ->> 'region', '')))
     <> lower(trim(coalesce(new.recipient_snapshot ->> 'region', ''))) then
    raise exception using errcode = '23514', message = 'DELIVERY_REGION_MISMATCH';
  end if;

  select * into v_shop from public.merchant_accounts where id = new.merchant_id;
  if v_shop.pickup_latitude is null or v_shop.pickup_longitude is null then
    raise exception using errcode = '23514', message = 'SHOP_LOCATION_REQUIRED';
  end if;

  return new;
end;
$$;

create trigger orders_validate_geolocation
before insert on public.orders
for each row execute function public.validate_order_geolocation();

create function public.clear_terminal_delivery_route()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('delivered', 'failed', 'cancelled') then
    new.route_snapshot := null;
  end if;
  return new;
end;
$$;

create trigger deliveries_clear_terminal_route
before update of status on public.deliveries
for each row execute function public.clear_terminal_delivery_route();

create function public.nearby_storefront_product_ids(
  p_latitude double precision,
  p_longitude double precision,
  p_query text default null,
  p_category_slug text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table(product_id uuid, distance_km double precision, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select
      p.id as product_id,
      p.published_at,
      case
        when m.pickup_latitude is null or m.pickup_longitude is null then null
        else 6371 * acos(least(1, greatest(-1,
          cos(radians(p_latitude)) * cos(radians(m.pickup_latitude::double precision))
          * cos(radians(m.pickup_longitude::double precision) - radians(p_longitude))
          + sin(radians(p_latitude)) * sin(radians(m.pickup_latitude::double precision))
        )))
      end as distance_km
    from public.products p
    join public.merchant_accounts m on m.id = p.merchant_id
    join public.categories c on c.id = p.category_id
    where p.status = 'published'
      and m.status = 'active'
      and m.subscription_status in ('active', 'grace')
      and (p_query is null or p.title ilike '%' || p_query || '%' or p.description ilike '%' || p_query || '%')
      and (p_category_slug is null or c.slug = p_category_slug)
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
  select product_id, distance_km, count(*) over() as total_count
  from candidates
  order by distance_km asc nulls last, published_at desc, product_id
  limit least(greatest(p_limit, 1), 60)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.validate_order_geolocation() from public;
revoke all on function public.clear_terminal_delivery_route() from public;
revoke all on function public.nearby_storefront_product_ids(double precision, double precision, text, text, integer, integer) from public;
grant execute on function public.nearby_storefront_product_ids(double precision, double precision, text, text, integer, integer) to service_role;

commit;
