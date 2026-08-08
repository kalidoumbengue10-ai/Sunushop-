create or replace function public.reorder_merchant_product_media(
  p_product_id uuid,
  p_media_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid;
  v_media_count integer;
  v_distinct_count integer;
begin
  select merchant_id into v_merchant_id
  from public.products
  where id = p_product_id;

  if v_merchant_id is null or not public.is_merchant_member(
    v_merchant_id,
    array['owner', 'manager', 'catalog']::public.merchant_member_role[]
  ) then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  if coalesce(cardinality(p_media_ids), 0) < 1 or cardinality(p_media_ids) > 8 then
    raise exception using errcode = '22023', message = 'MEDIA_ORDER_INVALID';
  end if;

  select count(*), count(distinct value)
  into v_media_count, v_distinct_count
  from unnest(p_media_ids) as requested(value);

  if v_distinct_count <> v_media_count then
    raise exception using errcode = '22023', message = 'MEDIA_ORDER_DUPLICATE';
  end if;

  if (select count(*) from public.product_media where product_id = p_product_id) <> v_media_count
     or (select count(*) from public.product_media where product_id = p_product_id and id = any(p_media_ids)) <> v_media_count then
    raise exception using errcode = '22023', message = 'MEDIA_ORDER_INCOMPLETE';
  end if;

  update public.product_media media
  set position = requested.ordinality - 1
  from unnest(p_media_ids) with ordinality as requested(id, ordinality)
  where media.id = requested.id
    and media.product_id = p_product_id;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (auth.uid(), v_merchant_id, 'product.media.reorder', 'product', p_product_id::text);

  return jsonb_build_object('productId', p_product_id, 'mediaIds', to_jsonb(p_media_ids));
end;
$$;

revoke all on function public.reorder_merchant_product_media(uuid, uuid[]) from public;
grant execute on function public.reorder_merchant_product_media(uuid, uuid[]) to authenticated;
