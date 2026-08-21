-- Le code de retrait est visible dès l'acceptation de la mission. Sa validation
-- par le marchand suffit à prouver le retrait et à démarrer le trajet client.
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
    if v_delivery.status not in ('accepted', 'at_pickup') or v_order.status <> 'ready_for_handoff' then
      raise exception 'DELIVERY_TRANSITION_NOT_ALLOWED';
    end if;
    v_from := v_delivery.status;

    update public.deliveries
    set status = 'in_transit', pickup_verified_at = timezone('utc', now())
    where id = v_delivery.id returning * into v_delivery;

    insert into public.delivery_events (
      delivery_id, merchant_id, actor_id, from_status, to_status, public_message, metadata
    ) values (
      v_delivery.id, v_delivery.merchant_id, p_actor_id, v_from, 'in_transit',
      'Le retrait a été validé par le marchand. Le livreur se dirige vers le client.',
      jsonb_build_object('simplifiedPickup', true)
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
