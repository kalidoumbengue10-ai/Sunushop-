-- Persiste les noms d'axes de variantes (ex. "Taille", "Couleur") sur le
-- produit lui-même. Jusqu'ici le wizard marchand envoyait `optionNames`
-- mais la RPC `save_merchant_product_variants` ne l'acceptait pas : les axes
-- étaient perdus à chaque enregistrement et devaient être retapés à
-- l'édition suivante.

alter table public.products
  add column option_names text[] not null default '{}';

drop function if exists public.save_merchant_product_variants(uuid, uuid, text, text, jsonb);

create function public.save_merchant_product_variants(
  p_product_id uuid,
  p_category_id uuid,
  p_title text,
  p_description text,
  p_variants jsonb,
  p_option_names text[] default '{}'
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
      description = trim(p_description),
      option_names = coalesce(p_option_names, '{}'::text[])
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

revoke all on function public.save_merchant_product_variants(uuid, uuid, text, text, jsonb, text[]) from public;
grant execute on function public.save_merchant_product_variants(uuid, uuid, text, text, jsonb, text[]) to authenticated;
