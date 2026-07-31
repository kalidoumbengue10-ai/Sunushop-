begin;

create function public.declare_direct_payment(
  p_order_id uuid,
  p_channel public.payment_channel,
  p_external_reference text,
  p_amount_xof integer,
  p_declared_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_id uuid;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null or v_order.buyer_id <> (select auth.uid()) then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.payment_method = 'cash_on_delivery'
    or (v_order.payment_method = 'wave_direct' and p_channel <> 'wave')
    or (v_order.payment_method = 'orange_money_direct' and p_channel <> 'orange_money') then
    raise exception 'PAYMENT_CHANNEL_MISMATCH';
  end if;

  if p_amount_xof <> v_order.total_xof then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  insert into public.direct_payment_declarations (
    order_id,
    buyer_id,
    merchant_id,
    channel,
    external_reference,
    amount_xof,
    declared_at
  )
  values (
    v_order.id,
    v_order.buyer_id,
    v_order.merchant_id,
    p_channel,
    trim(p_external_reference),
    p_amount_xof,
    p_declared_at
  )
  returning id into v_id;

  insert into public.order_events (
    order_id,
    merchant_id,
    actor_id,
    from_status,
    to_status,
    public_message,
    metadata
  )
  values (
    v_order.id,
    v_order.merchant_id,
    (select auth.uid()),
    v_order.status,
    v_order.status,
    'Le client a déclaré son paiement direct.',
    jsonb_build_object('payment_declaration_id', v_id, 'channel', p_channel)
  );

  return v_id;
end;
$$;

create function public.confirm_direct_payment(p_declaration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_declaration public.direct_payment_declarations%rowtype;
  v_order public.orders%rowtype;
begin
  select *
  into v_declaration
  from public.direct_payment_declarations
  where id = p_declaration_id
  for update;

  if v_declaration.id is null
    or not public.is_merchant_member(
      v_declaration.merchant_id,
      array['owner', 'manager', 'fulfillment']::public.merchant_member_role[]
    ) then
    raise exception 'PAYMENT_DECLARATION_NOT_FOUND';
  end if;

  if v_declaration.confirmed_by_merchant_at is null then
    update public.direct_payment_declarations
    set confirmed_by_merchant_at = timezone('utc', now())
    where id = v_declaration.id;

    select * into v_order from public.orders where id = v_declaration.order_id;
    insert into public.order_events (
      order_id,
      merchant_id,
      actor_id,
      from_status,
      to_status,
      public_message,
      metadata
    )
    values (
      v_order.id,
      v_order.merchant_id,
      (select auth.uid()),
      v_order.status,
      v_order.status,
      'Le vendeur a confirmé la réception du paiement direct.',
      jsonb_build_object('payment_declaration_id', v_declaration.id)
    );
  end if;
end;
$$;

revoke all on function public.declare_direct_payment(
  uuid,
  public.payment_channel,
  text,
  integer,
  timestamptz
) from public;
revoke all on function public.confirm_direct_payment(uuid) from public;
grant execute on function public.declare_direct_payment(
  uuid,
  public.payment_channel,
  text,
  integer,
  timestamptz
) to authenticated;
grant execute on function public.confirm_direct_payment(uuid) to authenticated;

commit;
