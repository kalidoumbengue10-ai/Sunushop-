begin;

alter table public.inventory_items
  add column if not exists low_stock_threshold integer not null default 5,
  add constraint inventory_low_stock_threshold_non_negative
    check (low_stock_threshold >= 0);

create table public.delivery_category_rates (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_zone_id uuid not null references public.delivery_zones(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  fee_xof integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (delivery_zone_id, category_id),
  constraint delivery_category_rate_non_negative check (fee_xof >= 0)
);

create trigger delivery_category_rates_set_updated_at
  before update on public.delivery_category_rates
  for each row execute function public.set_updated_at();

alter table public.delivery_category_rates enable row level security;

create policy delivery_category_rates_public_read
  on public.delivery_category_rates for select to anon, authenticated
  using (
    exists (
      select 1
      from public.delivery_zones dz
      join public.merchant_accounts ma on ma.id = dz.merchant_id
      where dz.id = delivery_category_rates.delivery_zone_id
        and dz.active
        and ma.status = 'active'
        and ma.verification_status = 'approved'
        and ma.subscription_status in ('active', 'grace')
    )
  );

create policy delivery_category_rates_member_read
  on public.delivery_category_rates for select to authenticated
  using (public.is_merchant_member(merchant_id, null));

grant select on public.delivery_category_rates to anon, authenticated;

alter table public.orders add column if not exists merchant_sequence bigint;

with numbered as (
  select id, row_number() over (
    partition by merchant_id order by created_at, id
  ) as sequence_number
  from public.orders
)
update public.orders o
set merchant_sequence = numbered.sequence_number
from numbered
where numbered.id = o.id
  and o.merchant_sequence is null;

alter table public.orders alter column merchant_sequence set not null;
alter table public.orders
  add constraint orders_merchant_sequence_positive check (merchant_sequence > 0),
  add constraint orders_merchant_sequence_unique unique (merchant_id, merchant_sequence);

create table public.merchant_order_counters (
  merchant_id uuid primary key references public.merchant_accounts(id) on delete cascade,
  next_number bigint not null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint merchant_order_counter_positive check (next_number > 0)
);

insert into public.merchant_order_counters (merchant_id, next_number)
select ma.id, coalesce(max(o.merchant_sequence), 0) + 1
from public.merchant_accounts ma
left join public.orders o on o.merchant_id = ma.id
group by ma.id
on conflict (merchant_id) do update
set next_number = greatest(public.merchant_order_counters.next_number, excluded.next_number);

create function public.assign_merchant_order_sequence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence bigint;
begin
  if new.merchant_sequence is not null then
    return new;
  end if;

  update public.merchant_order_counters
  set next_number = next_number + 1,
      updated_at = timezone('utc', now())
  where merchant_id = new.merchant_id
  returning next_number - 1 into v_sequence;

  if v_sequence is null then
    insert into public.merchant_order_counters (merchant_id, next_number)
    values (new.merchant_id, 2)
    on conflict (merchant_id) do update
      set next_number = public.merchant_order_counters.next_number + 1,
          updated_at = timezone('utc', now())
    returning next_number - 1 into v_sequence;
  end if;

  new.merchant_sequence := v_sequence;
  return new;
end;
$$;

create trigger orders_assign_merchant_sequence
  before insert on public.orders
  for each row execute function public.assign_merchant_order_sequence();

create function public.save_merchant_product_variants(
  p_product_id uuid,
  p_category_id uuid,
  p_title text,
  p_description text,
  p_variants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_entry jsonb;
  v_variant public.product_variants%rowtype;
  v_variant_id uuid;
  v_sku text;
  v_stock integer;
  v_reserved integer;
  v_seen_ids uuid[] := array[]::uuid[];
begin
  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if v_product.id is null or not public.is_merchant_member(
    v_product.merchant_id,
    array['owner', 'manager', 'catalog']::public.merchant_member_role[]
  ) then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  if jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) < 1
     or jsonb_array_length(p_variants) > 50 then
    raise exception using errcode = '22023', message = 'VARIANT_COUNT_INVALID';
  end if;

  update public.products
  set category_id = p_category_id,
      title = trim(p_title),
      description = trim(p_description)
  where id = p_product_id;

  for v_entry in select value from jsonb_array_elements(p_variants)
  loop
    v_variant_id := nullif(v_entry ->> 'id', '')::uuid;
    v_sku := nullif(trim(v_entry ->> 'sku'), '');
    v_stock := greatest(0, coalesce((v_entry ->> 'stock')::integer, 0));

    if v_variant_id is not null then
      select * into v_variant
      from public.product_variants
      where id = v_variant_id and product_id = p_product_id
      for update;
      if v_variant.id is null then
        raise exception using errcode = 'P0002', message = 'VARIANT_NOT_FOUND';
      end if;
      v_sku := coalesce(v_sku, v_variant.sku);
      select reserved_quantity into v_reserved
      from public.inventory_items where variant_id = v_variant_id for update;
      if v_stock < coalesce(v_reserved, 0) then
        raise exception using errcode = '23514', message = 'STOCK_BELOW_RESERVED';
      end if;

      update public.product_variants
      set sku = v_sku,
          title = nullif(trim(v_entry ->> 'title'), ''),
          attributes = coalesce(v_entry -> 'attributes', '{}'::jsonb),
          price_xof = (v_entry ->> 'priceXof')::integer,
          compare_at_price_xof = nullif(v_entry ->> 'compareAtPriceXof', '')::integer,
          active = coalesce((v_entry ->> 'active')::boolean, true)
      where id = v_variant_id;
    else
      v_variant_id := extensions.gen_random_uuid();
      v_sku := coalesce(v_sku, 'AUTO-' || upper(substr(replace(v_variant_id::text, '-', ''), 1, 12)));
      insert into public.product_variants (
        id, product_id, merchant_id, sku, title, attributes,
        price_xof, compare_at_price_xof, active
      ) values (
        v_variant_id, p_product_id, v_product.merchant_id, v_sku,
        nullif(trim(v_entry ->> 'title'), ''),
        coalesce(v_entry -> 'attributes', '{}'::jsonb),
        (v_entry ->> 'priceXof')::integer,
        nullif(v_entry ->> 'compareAtPriceXof', '')::integer,
        coalesce((v_entry ->> 'active')::boolean, true)
      );
    end if;

    insert into public.inventory_items (
      variant_id, merchant_id, available_quantity, low_stock_threshold
    ) values (
      v_variant_id, v_product.merchant_id, v_stock,
      greatest(0, coalesce((v_entry ->> 'lowStockThreshold')::integer, 5))
    )
    on conflict (variant_id) do update
      set available_quantity = excluded.available_quantity,
          low_stock_threshold = excluded.low_stock_threshold,
          version = public.inventory_items.version + 1;

    v_seen_ids := array_append(v_seen_ids, v_variant_id);
  end loop;

  update public.product_variants
  set active = false
  where product_id = p_product_id
    and not (id = any(v_seen_ids));

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (auth.uid(), v_product.merchant_id, 'product.variants.save', 'product', p_product_id::text);

  return jsonb_build_object('productId', p_product_id, 'variantIds', to_jsonb(v_seen_ids));
end;
$$;

revoke all on function public.save_merchant_product_variants(uuid, uuid, text, text, jsonb) from public;
grant execute on function public.save_merchant_product_variants(uuid, uuid, text, text, jsonb) to authenticated;

create function public.apply_order_category_delivery_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zone_id uuid;
  v_fee integer;
begin
  select nullif(delivery_snapshot ->> 'zoneId', '')::uuid
  into v_zone_id
  from public.orders
  where id = new.order_id;

  if v_zone_id is null then return new; end if;

  select max(coalesce(dcr.fee_xof, dz.fee_xof))
  into v_fee
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  join public.delivery_zones dz on dz.id = v_zone_id
  left join public.delivery_category_rates dcr
    on dcr.delivery_zone_id = dz.id and dcr.category_id = p.category_id
  where oi.order_id = new.order_id;

  update public.orders
  set delivery_fee_xof = coalesce(v_fee, delivery_fee_xof),
      total_xof = subtotal_xof + coalesce(v_fee, delivery_fee_xof),
      delivery_snapshot = delivery_snapshot || jsonb_build_object(
        'feeXof', coalesce(v_fee, delivery_fee_xof),
        'pricingRule', 'highest_category_or_region_default'
      )
  where id = new.order_id;
  return new;
end;
$$;

create trigger order_items_apply_category_delivery_fee
  after insert on public.order_items
  for each row execute function public.apply_order_category_delivery_fee();

create function public.recalculate_order_batch_total()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select coalesce(sum(total_xof), 0) into new.total_xof
  from public.orders where batch_id = new.id;
  return new;
end;
$$;

create trigger order_batches_recalculate_total
  before update of total_xof on public.order_batches
  for each row execute function public.recalculate_order_batch_total();

create index orders_merchant_delivered_idx
  on public.orders(merchant_id, delivered_at desc)
  where delivered_at is not null;
create index order_items_merchant_product_idx
  on public.order_items(merchant_id, product_id, created_at desc);
create index inventory_low_stock_idx
  on public.inventory_items(merchant_id, available_quantity, low_stock_threshold);
create index delivery_category_rates_zone_idx
  on public.delivery_category_rates(delivery_zone_id, category_id);

commit;
