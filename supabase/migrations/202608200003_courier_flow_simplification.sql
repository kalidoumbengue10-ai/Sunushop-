-- Parcours opérationnel simplifié : préparation en un clic et départ automatique
-- après validation du code de retrait, tout en conservant chaque événement métier.

create or replace function public.mark_order_ready_for_handoff(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_actor uuid := auth.uid();
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  if not public.is_merchant_member(
    v_order.merchant_id,
    array['owner', 'manager', 'fulfillment']::public.merchant_member_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_order.payment_method <> 'cash_on_delivery' and v_order.payment_status <> 'paid' then
    raise exception using errcode = '22023', message = 'ORDER_PAYMENT_REQUIRED';
  end if;

  if v_order.status not in ('pending_seller_confirmation', 'confirmed', 'preparing', 'ready_for_handoff') then
    raise exception using errcode = '22023', message = 'ORDER_TRANSITION_NOT_ALLOWED';
  end if;

  if v_order.status = 'ready_for_handoff' then
    return jsonb_build_object('id', v_order.id, 'status', v_order.status, 'alreadyReady', true);
  end if;

  if v_order.status = 'pending_seller_confirmation' then
    insert into public.order_events (
      order_id, merchant_id, actor_id, from_status, to_status, public_message, internal_note
    ) values (
      v_order.id, v_order.merchant_id, v_actor,
      'pending_seller_confirmation', 'confirmed',
      'La boutique a confirmé la commande.', 'Préparation simplifiée en un clic.'
    );
  end if;

  if v_order.status in ('pending_seller_confirmation', 'confirmed') then
    insert into public.order_events (
      order_id, merchant_id, actor_id, from_status, to_status, public_message, internal_note
    ) values (
      v_order.id, v_order.merchant_id, v_actor,
      'confirmed', 'preparing',
      'La préparation de la commande a commencé.', 'Préparation simplifiée en un clic.'
    );
  end if;

  insert into public.order_events (
    order_id, merchant_id, actor_id, from_status, to_status, public_message, internal_note
  ) values (
    v_order.id, v_order.merchant_id, v_actor,
    'preparing', 'ready_for_handoff',
    'La commande est prête à être remise.', 'Préparation simplifiée en un clic.'
  );

  update public.orders
  set status = 'ready_for_handoff'
  where id = v_order.id;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (
    v_actor, v_order.merchant_id, 'order.ready_for_handoff', 'order', v_order.id::text,
    jsonb_build_object('from_status', v_order.status, 'to_status', 'ready_for_handoff', 'simplified_flow', true)
  );

  return jsonb_build_object('id', v_order.id, 'status', 'ready_for_handoff', 'alreadyReady', false);
end;
$$;

revoke all on function public.mark_order_ready_for_handoff(uuid) from public;
grant execute on function public.mark_order_ready_for_handoff(uuid) to authenticated;

create or replace function public.complete_delivery_stage(
  p_delivery_id uuid,
  p_stage text,
  p_actor_id uuid
)
returns public.deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
  v_from public.delivery_status;
begin
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if v_delivery.id is null then raise exception 'DELIVERY_NOT_FOUND'; end if;
  select * into v_order from public.orders where id = v_delivery.order_id for update;

  if p_stage = 'pickup' then
    if v_delivery.status <> 'at_pickup' or v_order.status <> 'ready_for_handoff' then
      raise exception 'DELIVERY_TRANSITION_NOT_ALLOWED';
    end if;

    update public.deliveries
    set status = 'in_transit', pickup_verified_at = timezone('utc', now())
    where id = v_delivery.id returning * into v_delivery;

    insert into public.delivery_events (
      delivery_id, merchant_id, actor_id, from_status, to_status, public_message
    ) values (
      v_delivery.id, v_delivery.merchant_id, p_actor_id, 'at_pickup', 'picked_up',
      'La commande a été retirée auprès du commerçant.'
    );
    insert into public.delivery_events (
      delivery_id, merchant_id, actor_id, from_status, to_status, public_message
    ) values (
      v_delivery.id, v_delivery.merchant_id, p_actor_id, 'picked_up', 'in_transit',
      'Le trajet vers le client a commencé.'
    );

    update public.orders set status = 'in_transit' where id = v_order.id;
    insert into public.order_events (
      order_id, merchant_id, actor_id, from_status, to_status, public_message
    ) values (
      v_order.id, v_order.merchant_id, p_actor_id, v_order.status, 'in_transit',
      'Le livreur a récupéré la commande et se dirige vers le client.'
    );
  elsif p_stage = 'recipient' then
    if v_delivery.status not in ('picked_up', 'in_transit') or v_order.status <> 'in_transit' then
      raise exception 'DELIVERY_TRANSITION_NOT_ALLOWED';
    end if;
    v_from := v_delivery.status;
    update public.deliveries
    set status = 'delivered',
        delivered_at = timezone('utc', now()),
        terminal_at = timezone('utc', now()),
        courier_payable_xof = coalesce(courier_fee_xof, 0),
        courier_payment_status = case when courier_fee_xof is null then 'review_required' else 'due' end
    where id = v_delivery.id returning * into v_delivery;
    insert into public.delivery_events (delivery_id, merchant_id, actor_id, from_status, to_status, public_message)
    values (v_delivery.id, v_delivery.merchant_id, p_actor_id, v_from, 'delivered',
      'La commande a été remise au client.');
    update public.orders set status = 'delivered', delivered_at = timezone('utc', now()) where id = v_order.id;
    insert into public.order_events (order_id, merchant_id, actor_id, from_status, to_status, public_message)
    values (v_order.id, v_order.merchant_id, p_actor_id, v_order.status, 'delivered',
      'La réception a été confirmée avec le code client.');
  else
    raise exception 'DELIVERY_STAGE_INVALID';
  end if;
  return v_delivery;
end;
$$;

