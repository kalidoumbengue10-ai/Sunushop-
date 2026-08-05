begin;
create function public.create_merchant_product(
  p_merchant_id uuid,
  p_category_id uuid,
  p_title text,
  p_slug text,
  p_description text,
  p_sku text,
  p_variant_title text,
  p_price_xof integer,
  p_compare_at_price_xof integer,
  p_stock integer,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant_accounts%rowtype;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_product_limit integer;
  v_current_count integer;
begin
  if not public.is_merchant_member(
    p_merchant_id,
    array['owner', 'manager', 'catalog']::public.merchant_member_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select *
  into v_merchant
  from public.merchant_accounts
  where id = p_merchant_id
  for share;

  if v_merchant.id is null then
    raise exception using errcode = 'P0002', message = 'MERCHANT_NOT_FOUND';
  end if;

  if p_publish and (
    v_merchant.status <> 'active'
    or v_merchant.verification_status <> 'approved'
    or v_merchant.subscription_status not in ('active', 'grace')
  ) then
    raise exception using errcode = '23514', message = 'MERCHANT_NOT_PUBLISHABLE';
  end if;

  select sp.product_limit
  into v_product_limit
  from public.merchant_subscriptions ms
  join public.subscription_plans sp on sp.id = ms.plan_id
  where ms.merchant_id = p_merchant_id
    and ms.status = 'active'
  order by ms.created_at desc
  limit 1;

  v_product_limit := coalesce(v_product_limit, 20);

  select count(*)
  into v_current_count
  from public.products
  where merchant_id = p_merchant_id
    and status <> 'archived';

  if v_product_limit is not null and v_current_count >= v_product_limit then
    raise exception using errcode = '23514', message = 'PRODUCT_LIMIT_REACHED';
  end if;

  insert into public.products (
    merchant_id,
    category_id,
    slug,
    title,
    description,
    status,
    published_at
  )
  values (
    p_merchant_id,
    p_category_id,
    lower(trim(p_slug)),
    trim(p_title),
    trim(p_description),
    case when p_publish then 'published'::public.product_status else 'draft'::public.product_status end,
    case when p_publish then timezone('utc', now()) else null end
  )
  returning * into v_product;

  insert into public.product_variants (
    product_id,
    merchant_id,
    sku,
    title,
    price_xof,
    compare_at_price_xof
  )
  values (
    v_product.id,
    p_merchant_id,
    trim(p_sku),
    nullif(trim(p_variant_title), ''),
    p_price_xof,
    p_compare_at_price_xof
  )
  returning * into v_variant;

  insert into public.inventory_items (
    variant_id,
    merchant_id,
    available_quantity
  )
  values (
    v_variant.id,
    p_merchant_id,
    p_stock
  );

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (
    auth.uid(),
    p_merchant_id,
    'product.create',
    'product',
    v_product.id::text
  );

  return jsonb_build_object(
    'productId', v_product.id,
    'variantId', v_variant.id,
    'status', v_product.status
  );
end;
$$;
create function public.create_delivery_zone(
  p_merchant_id uuid,
  p_method_kind public.delivery_method_kind,
  p_method_name text,
  p_region text,
  p_city text,
  p_label text,
  p_fee_xof integer,
  p_min_delay_minutes integer,
  p_max_delay_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method public.delivery_methods%rowtype;
  v_zone public.delivery_zones%rowtype;
begin
  if not public.is_merchant_member(
    p_merchant_id,
    array['owner', 'manager', 'fulfillment']::public.merchant_member_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select *
  into v_method
  from public.delivery_methods
  where merchant_id = p_merchant_id
    and kind = p_method_kind
    and lower(name) = lower(trim(p_method_name))
  limit 1;

  if v_method.id is null then
    insert into public.delivery_methods (
      merchant_id,
      kind,
      name
    )
    values (
      p_merchant_id,
      p_method_kind,
      trim(p_method_name)
    )
    returning * into v_method;
  end if;

  insert into public.delivery_zones (
    delivery_method_id,
    merchant_id,
    region,
    city,
    label,
    fee_xof,
    min_delay_minutes,
    max_delay_minutes
  )
  values (
    v_method.id,
    p_merchant_id,
    trim(p_region),
    nullif(trim(p_city), ''),
    trim(p_label),
    p_fee_xof,
    p_min_delay_minutes,
    p_max_delay_minutes
  )
  returning * into v_zone;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (
    auth.uid(),
    p_merchant_id,
    'delivery_zone.create',
    'delivery_zone',
    v_zone.id::text
  );

  return jsonb_build_object(
    'methodId', v_method.id,
    'zoneId', v_zone.id
  );
end;
$$;
create function public.set_merchant_product_publication(
  p_product_id uuid,
  p_publish boolean
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_merchant public.merchant_accounts%rowtype;
begin
  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if v_product.id is null
    or not public.is_merchant_member(
      v_product.merchant_id,
      array['owner', 'manager', 'catalog']::public.merchant_member_role[]
    ) then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  select *
  into v_merchant
  from public.merchant_accounts
  where id = v_product.merchant_id;

  if v_product.status = 'suspended' then
    raise exception using errcode = '42501', message = 'PRODUCT_SUSPENDED';
  end if;

  if p_publish and (
    v_merchant.status <> 'active'
    or v_merchant.verification_status <> 'approved'
    or v_merchant.subscription_status not in ('active', 'grace')
  ) then
    raise exception using errcode = '23514', message = 'PRODUCT_PUBLICATION_LOCKED';
  end if;

  update public.products
  set status = case
        when p_publish then 'published'::public.product_status
        else 'draft'::public.product_status
      end,
      published_at = case
        when p_publish then coalesce(published_at, timezone('utc', now()))
        else null
      end
  where id = p_product_id
  returning * into v_product;

  insert into public.audit_events (
    actor_id,
    merchant_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    auth.uid(),
    v_product.merchant_id,
    'product.publication.update',
    'product',
    v_product.id::text,
    jsonb_build_object('published', p_publish)
  );

  return v_product;
end;
$$;
revoke all on function public.create_merchant_product(uuid, uuid, text, text, text, text, text, integer, integer, integer, boolean) from public;
revoke all on function public.create_delivery_zone(uuid, public.delivery_method_kind, text, text, text, text, integer, integer, integer) from public;
revoke all on function public.set_merchant_product_publication(uuid, boolean) from public;
grant execute on function public.create_merchant_product(uuid, uuid, text, text, text, text, text, integer, integer, integer, boolean) to authenticated;
grant execute on function public.create_delivery_zone(uuid, public.delivery_method_kind, text, text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.set_merchant_product_publication(uuid, boolean) to authenticated;
commit;
