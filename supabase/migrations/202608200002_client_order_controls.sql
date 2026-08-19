-- Annulation autonome avant remise et archivage non destructif côté client.
-- Une commande reste conservée pour le marchand, la comptabilité et les litiges.

alter table public.orders
  add column if not exists buyer_hidden_at timestamptz;

create index if not exists orders_buyer_visible_idx
  on public.orders (buyer_id, created_at desc)
  where buyer_hidden_at is null;

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_to_status public.order_status,
  p_public_message text default null,
  p_internal_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_previous public.order_status;
  v_allowed boolean := false;
  v_is_merchant boolean;
  v_is_buyer boolean;
  v_has_active_delivery boolean := false;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  v_previous := v_order.status;
  v_is_merchant := public.is_merchant_member(
    v_order.merchant_id,
    array['owner', 'manager', 'fulfillment']::public.merchant_member_role[]
  );
  v_is_buyer := v_order.buyer_id = auth.uid();

  if not v_is_merchant
     and not v_is_buyer
     and not (public.has_admin_role(null) and public.has_aal2()) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_is_buyer and v_order.status = 'ready_for_handoff' and p_to_status = 'cancelled' then
    select exists (
      select 1
      from public.deliveries d
      where d.order_id = v_order.id
        and d.status in ('assigned', 'accepted', 'at_pickup', 'picked_up', 'in_transit')
    ) into v_has_active_delivery;
  end if;

  v_allowed := case
    when v_order.status = 'pending_seller_confirmation' and p_to_status = 'confirmed' then v_is_merchant
    when v_order.status = 'pending_seller_confirmation' and p_to_status = 'cancelled' then v_is_merchant or v_is_buyer
    when v_order.status = 'confirmed' and p_to_status = 'preparing' then v_is_merchant
    when v_order.status = 'confirmed' and p_to_status = 'cancelled' then v_is_merchant or v_is_buyer
    when v_order.status = 'preparing' and p_to_status = 'ready_for_handoff' then v_is_merchant
    when v_order.status = 'preparing' and p_to_status = 'cancelled' then v_is_merchant or v_is_buyer
    when v_order.status = 'ready_for_handoff' and p_to_status = 'in_transit' then v_is_merchant
    when v_order.status = 'ready_for_handoff' and p_to_status = 'cancelled'
      then v_is_merchant or (v_is_buyer and not v_has_active_delivery)
    when v_order.status = 'in_transit' and p_to_status = 'delivered' then v_is_merchant
    when v_order.status in ('confirmed', 'preparing', 'ready_for_handoff', 'in_transit', 'delivered')
      and p_to_status = 'disputed' then v_is_buyer or v_is_merchant
    else false
  end;

  if not v_allowed then
    raise exception using errcode = '22023', message = 'ORDER_TRANSITION_NOT_ALLOWED';
  end if;

  if p_to_status = 'cancelled' then
    update public.inventory_items ii
    set reserved_quantity = greatest(0, ii.reserved_quantity - oi.quantity),
        version = ii.version + 1
    from public.order_items oi
    where oi.order_id = v_order.id
      and oi.variant_id = ii.variant_id;
  elsif p_to_status = 'delivered' then
    update public.inventory_items ii
    set available_quantity = ii.available_quantity - oi.quantity,
        reserved_quantity = greatest(0, ii.reserved_quantity - oi.quantity),
        version = ii.version + 1
    from public.order_items oi
    where oi.order_id = v_order.id
      and oi.variant_id = ii.variant_id;
  end if;

  update public.orders
  set status = p_to_status,
      delivered_at = case when p_to_status = 'delivered' then timezone('utc', now()) else delivered_at end,
      cancelled_at = case when p_to_status = 'cancelled' then timezone('utc', now()) else cancelled_at end
  where id = v_order.id
  returning * into v_order;

  insert into public.order_events (
    order_id,
    merchant_id,
    actor_id,
    from_status,
    to_status,
    public_message,
    internal_note
  )
  values (
    v_order.id,
    v_order.merchant_id,
    auth.uid(),
    v_previous,
    p_to_status,
    p_public_message,
    p_internal_note
  );

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    v_order.merchant_id,
    case when v_is_buyer and p_to_status = 'cancelled'
      then 'order.cancelled_by_buyer'
      else 'order.transition'
    end,
    'order',
    v_order.id::text,
    jsonb_build_object('from_status', v_previous, 'to_status', p_to_status)
  );

  return v_order;
end;
$$;

revoke all on function public.transition_order_status(uuid, public.order_status, text, text) from public;
grant execute on function public.transition_order_status(uuid, public.order_status, text, text) to authenticated;

comment on column public.orders.buyer_hidden_at is
  'Masque la commande dans la liste du client sans supprimer l historique marchand.';
