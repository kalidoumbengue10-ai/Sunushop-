begin;

-- create_order_batch_without_loyalty acceptait n'importe quelle delivery_zone
-- active appartenant au marchand pour un groupe methodKind='merchant_delivery',
-- sans vérifier que la méthode associée à cette zone est bien de type
-- merchant_delivery. Une zone de type pickup (ex. région "Retrait boutique")
-- pouvait donc être retenue comme zone de livraison à domicile, ce qui
-- produisait ensuite un DELIVERY_REGION_MISMATCH côté trigger de commande
-- puisque sa région ne correspond jamais à une région Sénégal réelle.
create or replace function public.create_order_batch_without_loyalty(
  p_idempotency_key text,
  p_recipient jsonb,
  p_groups jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer uuid := auth.uid();
  v_batch public.order_batches%rowtype;
  v_group jsonb;
  v_item jsonb;
  v_merchant public.merchant_accounts%rowtype;
  v_zone public.delivery_zones%rowtype;
  v_method public.delivery_methods%rowtype;
  v_variant record;
  v_order public.orders%rowtype;
  v_order_items jsonb;
  v_subtotal integer;
  v_batch_total integer := 0;
  v_quantity integer;
  v_payment_method public.order_payment_method;
  v_method_kind text;
  v_delivery_fee integer;
  v_delivery_snapshot jsonb;
  v_orders jsonb := '[]'::jsonb;
begin
  if v_buyer is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) < 12 then
    raise exception using errcode = '23514', message = 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if jsonb_typeof(p_groups) <> 'array'
     or jsonb_array_length(p_groups) < 1
     or jsonb_array_length(p_groups) > 10 then
    raise exception using errcode = '23514', message = 'INVALID_ORDER_GROUPS';
  end if;

  select *
  into v_batch
  from public.order_batches
  where buyer_id = v_buyer
    and idempotency_key = p_idempotency_key;

  if v_batch.id is not null then
    return jsonb_build_object(
      'batchId', v_batch.id,
      'publicCode', v_batch.public_code,
      'orders', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', o.id,
          'publicCode', o.public_code,
          'merchantId', o.merchant_id,
          'totalXof', o.total_xof,
          'status', o.status
        ) order by o.created_at), '[]'::jsonb)
        from public.orders o
        where o.batch_id = v_batch.id
      )
    );
  end if;

  insert into public.order_batches (
    buyer_id,
    public_code,
    idempotency_key,
    order_count,
    total_xof
  )
  values (
    v_buyer,
    public.generate_public_code('BATCH'),
    p_idempotency_key,
    jsonb_array_length(p_groups),
    0
  )
  returning * into v_batch;

  for v_group in select * from jsonb_array_elements(p_groups)
  loop
    select *
    into v_merchant
    from public.merchant_accounts
    where id = (v_group ->> 'merchantId')::uuid
      and status = 'active'
      and subscription_status in ('active', 'grace')
    for share;

    if v_merchant.id is null then
      raise exception using errcode = '23514', message = 'MERCHANT_NOT_ORDERABLE';
    end if;

    v_method_kind := coalesce(v_group ->> 'methodKind', 'merchant_delivery');

    if v_method_kind = 'pickup' then
      -- Retrait en boutique : ni zone ni frais ne viennent du client. Le
      -- frais est forcé à 0 ici, en base, quoi que le client ait posté.
      if not v_merchant.pickup_enabled then
        raise exception using errcode = '23514', message = 'PICKUP_NOT_AVAILABLE';
      end if;
      if v_merchant.pickup_address_line is null then
        raise exception using errcode = '23514', message = 'SHOP_ADDRESS_REQUIRED';
      end if;

      v_delivery_fee := 0;
      v_delivery_snapshot := jsonb_build_object(
        'methodKind', 'pickup',
        'pickupAddress', v_merchant.pickup_address_line,
        'pickupHours', v_merchant.pickup_hours,
        'pickupInstructions', v_merchant.pickup_instructions,
        'shopPhone', v_merchant.phone,
        'shopEmail', v_merchant.email,
        'latitude', v_merchant.pickup_latitude,
        'longitude', v_merchant.pickup_longitude
      );
    else
      select dz.*
      into v_zone
      from public.delivery_zones dz
      join public.delivery_methods dm on dm.id = dz.delivery_method_id
      where dz.id = (v_group ->> 'deliveryZoneId')::uuid
        and dz.merchant_id = v_merchant.id
        and dz.active
        and dm.kind = 'merchant_delivery';

      if v_zone.id is null then
        raise exception using errcode = '23514', message = 'DELIVERY_ZONE_UNAVAILABLE';
      end if;

      select dm.*
      into v_method
      from public.delivery_methods dm
      where dm.id = v_zone.delivery_method_id
        and dm.active;

      if v_method.id is null then
        raise exception using errcode = '23514', message = 'DELIVERY_METHOD_UNAVAILABLE';
      end if;

      v_delivery_fee := v_zone.fee_xof;
      v_delivery_snapshot := jsonb_build_object(
        'methodId', v_method.id,
        'methodKind', v_method.kind,
        'methodName', v_method.name,
        'zoneId', v_zone.id,
        'zoneLabel', v_zone.label,
        'region', v_zone.region,
        'city', v_zone.city,
        'feeXof', v_zone.fee_xof,
        'minDelayMinutes', v_zone.min_delay_minutes,
        'maxDelayMinutes', v_zone.max_delay_minutes
      );
    end if;

    v_payment_method := (v_group ->> 'paymentMethod')::public.order_payment_method;

    if v_payment_method = 'wave_direct' and v_merchant.wave_payment_number is null then
      raise exception using errcode = '23514', message = 'WAVE_UNAVAILABLE';
    end if;
    if v_payment_method = 'orange_money_direct' and v_merchant.orange_money_payment_number is null then
      raise exception using errcode = '23514', message = 'ORANGE_MONEY_UNAVAILABLE';
    end if;

    v_subtotal := 0;
    v_order_items := '[]'::jsonb;

    if jsonb_typeof(v_group -> 'items') <> 'array'
       or jsonb_array_length(v_group -> 'items') < 1 then
      raise exception using errcode = '23514', message = 'ORDER_ITEMS_REQUIRED';
    end if;

    for v_item in select * from jsonb_array_elements(v_group -> 'items')
    loop
      v_quantity := (v_item ->> 'quantity')::integer;
      if v_quantity < 1 or v_quantity > 99 then
        raise exception using errcode = '23514', message = 'INVALID_QUANTITY';
      end if;

      select
        pv.id as variant_id,
        pv.product_id,
        pv.merchant_id,
        pv.sku,
        pv.title as variant_title,
        pv.attributes,
        pv.price_xof,
        p.title as product_title,
        p.slug as product_slug,
        ii.available_quantity,
        ii.reserved_quantity
      into v_variant
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      join public.inventory_items ii on ii.variant_id = pv.id
      where pv.id = (v_item ->> 'variantId')::uuid
        and pv.merchant_id = v_merchant.id
        and pv.active
        and p.status = 'published'
      for update of ii;

      if v_variant.variant_id is null then
        raise exception using errcode = '23514', message = 'VARIANT_UNAVAILABLE';
      end if;

      if v_variant.available_quantity - v_variant.reserved_quantity < v_quantity then
        raise exception using errcode = '23514', message = 'INSUFFICIENT_STOCK';
      end if;

      v_subtotal := v_subtotal + (v_variant.price_xof * v_quantity);
      v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
        'variantId', v_variant.variant_id,
        'productId', v_variant.product_id,
        'sku', v_variant.sku,
        'unitPriceXof', v_variant.price_xof,
        'quantity', v_quantity,
        'productSnapshot', jsonb_build_object(
          'title', v_variant.product_title,
          'slug', v_variant.product_slug,
          'variantTitle', v_variant.variant_title,
          'attributes', v_variant.attributes
        )
      ));
    end loop;

    insert into public.orders (
      batch_id,
      buyer_id,
      merchant_id,
      public_code,
      payment_method,
      subtotal_xof,
      delivery_fee_xof,
      total_xof,
      delivery_snapshot,
      recipient_snapshot,
      payment_instructions_snapshot,
      seller_confirm_by
    )
    values (
      v_batch.id,
      v_buyer,
      v_merchant.id,
      public.generate_public_code('SUNU'),
      v_payment_method,
      v_subtotal,
      v_delivery_fee,
      v_subtotal + v_delivery_fee,
      v_delivery_snapshot,
      p_recipient,
      case v_payment_method
        when 'wave_direct' then jsonb_build_object('channel', 'wave', 'number', v_merchant.wave_payment_number)
        when 'orange_money_direct' then jsonb_build_object('channel', 'orange_money', 'number', v_merchant.orange_money_payment_number)
        else jsonb_build_object('channel', 'cash_on_delivery')
      end,
      timezone('utc', now()) + interval '2 hours'
    )
    returning * into v_order;

    insert into public.order_items (
      order_id,
      merchant_id,
      product_id,
      variant_id,
      product_snapshot,
      sku_snapshot,
      unit_price_xof,
      quantity
    )
    select
      v_order.id,
      v_order.merchant_id,
      (entry ->> 'productId')::uuid,
      (entry ->> 'variantId')::uuid,
      entry -> 'productSnapshot',
      entry ->> 'sku',
      (entry ->> 'unitPriceXof')::integer,
      (entry ->> 'quantity')::integer
    from jsonb_array_elements(v_order_items) entry;

    update public.inventory_items ii
    set reserved_quantity = ii.reserved_quantity + source.quantity,
        version = ii.version + 1
    from (
      select
        (entry ->> 'variantId')::uuid as variant_id,
        (entry ->> 'quantity')::integer as quantity
      from jsonb_array_elements(v_order_items) entry
    ) source
    where ii.variant_id = source.variant_id;

    insert into public.order_events (
      order_id,
      merchant_id,
      actor_id,
      to_status,
      public_message
    )
    values (
      v_order.id,
      v_order.merchant_id,
      v_buyer,
      'pending_seller_confirmation',
      'La commande attend la confirmation du vendeur.'
    );

    v_batch_total := v_batch_total + v_order.total_xof;
    v_orders := v_orders || jsonb_build_array(jsonb_build_object(
      'id', v_order.id,
      'publicCode', v_order.public_code,
      'merchantId', v_order.merchant_id,
      'totalXof', v_order.total_xof,
      'status', v_order.status
    ));
  end loop;

  update public.order_batches
  set total_xof = v_batch_total
  where id = v_batch.id
  returning * into v_batch;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_buyer,
    'order_batch.create',
    'order_batch',
    v_batch.id::text,
    jsonb_build_object('order_count', v_batch.order_count, 'total_xof', v_batch.total_xof)
  );

  return jsonb_build_object(
    'batchId', v_batch.id,
    'publicCode', v_batch.public_code,
    'totalXof', v_batch.total_xof,
    'orders', v_orders
  );
end;
$$;

commit;
