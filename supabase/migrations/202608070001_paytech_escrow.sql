begin;

-- Escrow PayTech : l'argent des commandes arrive sur le compte PayTech de
-- SunuShop, y reste bloqué (payment_escrows.status = 'held') jusqu'à
-- confirmation client ou auto-release J+N, puis est reversé au marchand via
-- transferFund (merchant_payouts). Séparation stricte intent / escrow /
-- payout : trois tables, trois responsabilités, trois cycles de vie.

create type public.payment_intent_status as enum ('pending', 'paid', 'cancelled', 'failed', 'refunded');
create type public.escrow_status as enum ('held', 'released', 'refunded', 'disputed');
create type public.payout_status as enum ('pending', 'sent', 'paid', 'failed');

create table public.payment_intents (
  id uuid primary key default extensions.gen_random_uuid(),
  kind text not null,
  ref_command text not null unique,
  order_batch_id uuid references public.order_batches(id) on delete restrict,
  merchant_id uuid references public.merchant_accounts(id) on delete restrict,
  plan_id text references public.subscription_plans(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  amount_xof integer not null,
  currency text not null default 'XOF',
  paytech_token text,
  redirect_url text,
  status public.payment_intent_status not null default 'pending',
  payment_method text,
  client_phone text,
  created_at timestamptz not null default timezone('utc', now()),
  paid_at timestamptz,
  cancelled_at timestamptz,
  constraint payment_intent_kind check (kind in ('order', 'subscription')),
  constraint payment_intent_currency_xof check (currency = 'XOF'),
  constraint payment_intent_amount_positive check (amount_xof > 0),
  constraint payment_intent_kind_order check (
    kind <> 'order' or order_batch_id is not null
  ),
  constraint payment_intent_kind_subscription check (
    kind <> 'subscription' or (merchant_id is not null and plan_id is not null)
  )
);

create index payment_intents_buyer_idx on public.payment_intents(buyer_id, created_at desc);
create index payment_intents_merchant_idx on public.payment_intents(merchant_id, created_at desc);
create index payment_intents_batch_idx on public.payment_intents(order_batch_id);

create table public.payment_escrows (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  payment_intent_id uuid not null references public.payment_intents(id) on delete restrict,
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  amount_xof integer not null,
  status public.escrow_status not null default 'held',
  held_at timestamptz not null default timezone('utc', now()),
  releasable_at timestamptz,
  released_at timestamptz,
  released_by text,
  refunded_at timestamptz,
  dispute_opened_at timestamptz,
  dispute_reason text,
  dispute_resolved_at timestamptz,
  dispute_resolution text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint escrow_amount_positive check (amount_xof > 0),
  constraint escrow_released_by check (released_by is null or released_by in ('client', 'auto', 'admin')),
  constraint escrow_dispute_resolution check (dispute_resolution is null or dispute_resolution in ('release', 'refund'))
);

create index payment_escrows_merchant_idx on public.payment_escrows(merchant_id, status);
create index payment_escrows_releasable_idx
  on public.payment_escrows(releasable_at)
  where status = 'held';
create index payment_escrows_disputed_idx
  on public.payment_escrows(dispute_opened_at)
  where status = 'disputed';

create table public.merchant_payouts (
  id uuid primary key default extensions.gen_random_uuid(),
  escrow_id uuid not null unique references public.payment_escrows(id) on delete restrict,
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  amount_xof integer not null,
  destination_number text not null,
  service text not null,
  external_id text not null unique,
  id_transfer text,
  status public.payout_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  constraint payout_amount_positive check (amount_xof > 0),
  constraint payout_service check (service in ('Wave Senegal', 'Orange Money Senegal')),
  constraint payout_attempts_non_negative check (attempts >= 0)
);

create index merchant_payouts_merchant_idx on public.merchant_payouts(merchant_id, status);
create index merchant_payouts_pending_idx
  on public.merchant_payouts(created_at)
  where status = 'pending';

-- webhook_events existe déjà (202607290001_core_schema.sql) mais n'est
-- jamais alimentée. On ajoute la colonne payload pour l'audit complet des
-- IPN reçues (le hash seul ne permet pas de rejouer une investigation).
alter table public.webhook_events
  add column if not exists payload jsonb;

-- RLS : aucune écriture cliente sur les tables financières. Tout passe par
-- le client admin (service role) après vérification serveur, ou par des RPC
-- security definer.
alter table public.payment_intents enable row level security;
alter table public.payment_escrows enable row level security;
alter table public.merchant_payouts enable row level security;

create policy payment_intents_participant_read
  on public.payment_intents for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or (merchant_id is not null and public.is_merchant_member(merchant_id, null))
    or (
      public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
      and public.has_aal2()
    )
  );

create policy payment_escrows_participant_read
  on public.payment_escrows for select to authenticated
  using (
    public.is_merchant_member(merchant_id, null)
    or exists (
      select 1 from public.orders o
      where o.id = payment_escrows.order_id
        and o.buyer_id = (select auth.uid())
    )
    or (
      public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
      and public.has_aal2()
    )
  );

create policy merchant_payouts_participant_read
  on public.merchant_payouts for select to authenticated
  using (
    public.is_merchant_member(merchant_id, null)
    or (
      public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
      and public.has_aal2()
    )
  );

-- webhook_events : accès service-role exclusif, aucune policy authenticated/anon.
revoke all on public.payment_intents, public.payment_escrows, public.merchant_payouts, public.webhook_events
  from anon, authenticated;
grant select on public.payment_intents, public.payment_escrows, public.merchant_payouts to authenticated;

-- ---------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------

create function public.create_order_payment_intent(
  p_order_batch_id uuid,
  p_ref_command text,
  p_amount_xof integer
)
returns public.payment_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer uuid := auth.uid();
  v_batch public.order_batches%rowtype;
  v_computed_total integer;
  v_intent public.payment_intents%rowtype;
begin
  if v_buyer is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_batch
  from public.order_batches
  where id = p_order_batch_id
    and buyer_id = v_buyer
  for share;

  if v_batch.id is null then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  select coalesce(sum(o.total_xof), 0) into v_computed_total
  from public.orders o
  where o.batch_id = v_batch.id;

  -- Le montant n'est JAMAIS pris depuis le corps de la requête : il est
  -- toujours recalculé en base à partir des commandes réelles du batch.
  if v_computed_total <> p_amount_xof or v_computed_total <> v_batch.total_xof then
    raise exception using errcode = '23514', message = 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  insert into public.payment_intents (
    kind,
    ref_command,
    order_batch_id,
    buyer_id,
    amount_xof
  )
  values (
    'order',
    p_ref_command,
    v_batch.id,
    v_buyer,
    v_computed_total
  )
  returning * into v_intent;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_buyer,
    'payment_intent.create',
    'payment_intent',
    v_intent.id::text,
    jsonb_build_object('order_batch_id', v_batch.id, 'amount_xof', v_computed_total)
  );

  return v_intent;
end;
$$;

create function public.capture_order_payment(
  p_ref_command text,
  p_paytech_token text,
  p_amount_xof integer,
  p_payment_method text default null,
  p_client_phone text default null
)
returns public.payment_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.payment_intents%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_intent
  from public.payment_intents
  where ref_command = p_ref_command
    and kind = 'order'
  for update;

  if v_intent.id is null then
    raise exception using errcode = 'P0002', message = 'PAYMENT_INTENT_NOT_FOUND';
  end if;

  -- Idempotence : un second appel (rejeu d'IPN) sur un intent déjà payé ne
  -- doit ni recréer d'escrow, ni re-transitionner les commandes.
  if v_intent.status = 'paid' then
    return v_intent;
  end if;

  if v_intent.status <> 'pending' then
    raise exception using errcode = '23514', message = 'PAYMENT_ALREADY_CAPTURED';
  end if;

  if v_intent.amount_xof <> p_amount_xof then
    raise exception using errcode = '23514', message = 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  update public.payment_intents
  set status = 'paid',
      paid_at = timezone('utc', now()),
      paytech_token = p_paytech_token,
      payment_method = p_payment_method,
      client_phone = p_client_phone
  where id = v_intent.id
  returning * into v_intent;

  for v_order in
    select * from public.orders
    where batch_id = v_intent.order_batch_id
    for update
  loop
    insert into public.payment_escrows (
      order_id,
      payment_intent_id,
      merchant_id,
      amount_xof,
      status
    )
    values (
      v_order.id,
      v_intent.id,
      v_order.merchant_id,
      v_order.total_xof,
      'held'
    )
    on conflict (order_id) do nothing;

    if v_order.status = 'pending_seller_confirmation' then
      update public.orders
      set status = 'confirmed'
      where id = v_order.id;

      insert into public.order_events (
        order_id, merchant_id, actor_id, from_status, to_status, public_message, metadata
      )
      values (
        v_order.id, v_order.merchant_id, null, 'pending_seller_confirmation', 'confirmed',
        'Paiement reçu par SunuShop. Les fonds sont retenus jusqu’à confirmation de réception.',
        jsonb_build_object('payment_intent_id', v_intent.id)
      );
    end if;
  end loop;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_intent.buyer_id,
    'payment_intent.capture',
    'payment_intent',
    v_intent.id::text,
    jsonb_build_object('ref_command', p_ref_command, 'amount_xof', p_amount_xof)
  );

  return v_intent;
end;
$$;

create function public.confirm_order_reception(p_order_id uuid)
returns public.payment_escrows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_escrow public.payment_escrows%rowtype;
  v_merchant public.merchant_accounts%rowtype;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null or v_order.buyer_id <> (select auth.uid()) then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  if v_order.status <> 'delivered' then
    raise exception using errcode = '23514', message = 'ORDER_NOT_DELIVERED';
  end if;

  select * into v_escrow
  from public.payment_escrows
  where order_id = p_order_id
  for update;

  if v_escrow.id is null then
    raise exception using errcode = 'P0002', message = 'PAYMENT_INTENT_NOT_FOUND';
  end if;

  if v_escrow.status = 'disputed' then
    raise exception using errcode = '23514', message = 'ESCROW_DISPUTED';
  end if;

  if v_escrow.status <> 'held' then
    raise exception using errcode = '23514', message = 'ESCROW_NOT_RELEASABLE';
  end if;

  select * into v_merchant
  from public.merchant_accounts
  where id = v_escrow.merchant_id;

  update public.payment_escrows
  set status = 'released',
      released_at = timezone('utc', now()),
      released_by = 'client'
  where id = v_escrow.id
  returning * into v_escrow;

  insert into public.merchant_payouts (
    escrow_id,
    merchant_id,
    amount_xof,
    destination_number,
    service
  )
  values (
    v_escrow.id,
    v_escrow.merchant_id,
    v_escrow.amount_xof,
    coalesce(v_merchant.wave_payment_number, v_merchant.orange_money_payment_number),
    case
      when v_merchant.wave_payment_number is not null then 'Wave Senegal'
      when v_merchant.orange_money_payment_number is not null then 'Orange Money Senegal'
      else null
    end
  );

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (
    (select auth.uid()),
    v_escrow.merchant_id,
    'escrow.release.client',
    'payment_escrow',
    v_escrow.id::text
  );

  return v_escrow;
end;
$$;

create function public.open_order_dispute(p_order_id uuid, p_reason text)
returns public.payment_escrows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_escrow public.payment_escrows%rowtype;
begin
  if p_reason is null or char_length(trim(p_reason)) < 20 then
    raise exception using errcode = '23514', message = 'DISPUTE_REASON_REQUIRED';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null or v_order.buyer_id <> (select auth.uid()) then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  select * into v_escrow
  from public.payment_escrows
  where order_id = p_order_id
  for update;

  if v_escrow.id is null then
    raise exception using errcode = 'P0002', message = 'PAYMENT_INTENT_NOT_FOUND';
  end if;

  if v_escrow.status = 'disputed' then
    raise exception using errcode = '23514', message = 'DISPUTE_ALREADY_OPEN';
  end if;

  if v_escrow.status <> 'held' then
    raise exception using errcode = '23514', message = 'ESCROW_NOT_HELD';
  end if;

  -- Gel des fonds : l'escrow passe en disputed, il est alors exclu de
  -- release_due_escrows (voir sa clause where status = 'held').
  update public.payment_escrows
  set status = 'disputed',
      dispute_opened_at = timezone('utc', now()),
      dispute_reason = trim(p_reason)
  where id = v_escrow.id
  returning * into v_escrow;

  -- La commande est dans un statut permettant 'disputed' d'après la machine
  -- à états existante (lib/marketplace/order-status.ts) : confirmed,
  -- preparing, ready_for_handoff, in_transit, delivered -> disputed.
  update public.orders
  set status = 'disputed'
  where id = v_order.id
    and status in ('confirmed', 'preparing', 'ready_for_handoff', 'in_transit', 'delivered');

  insert into public.order_events (
    order_id, merchant_id, actor_id, from_status, to_status, public_message
  )
  values (
    v_order.id, v_order.merchant_id, (select auth.uid()), v_order.status, 'disputed',
    'Le client a signalé un problème. Les fonds sont gelés en attente d’arbitrage.'
  );

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    v_escrow.merchant_id,
    'escrow.dispute.open',
    'payment_escrow',
    v_escrow.id::text,
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_escrow;
end;
$$;

create function public.resolve_order_dispute(
  p_order_id uuid,
  p_resolution text,
  p_note text default null
)
returns public.payment_escrows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escrow public.payment_escrows%rowtype;
  v_merchant public.merchant_accounts%rowtype;
begin
  if not public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
     or not public.has_aal2() then
    raise exception using errcode = '42501', message = 'ADMIN_MFA_REQUIRED';
  end if;

  if p_resolution not in ('release', 'refund') then
    raise exception using errcode = '22023', message = 'INVALID_DISPUTE_RESOLUTION';
  end if;

  select * into v_escrow
  from public.payment_escrows
  where order_id = p_order_id
  for update;

  if v_escrow.id is null then
    raise exception using errcode = 'P0002', message = 'PAYMENT_INTENT_NOT_FOUND';
  end if;

  if v_escrow.status <> 'disputed' then
    raise exception using errcode = '23514', message = 'ESCROW_NOT_HELD';
  end if;

  -- L'ordre reste 'disputed' en permanence : c'est une trace historique, pas
  -- un statut opérationnel. lib/marketplace/order-status.ts ne définit aucune
  -- transition sortante depuis 'disputed' et ce n'est pas modifié ici.
  -- dispute_resolution / dispute_resolved_at sur payment_escrows portent le
  -- sous-état visible côté UI ("litige résolu — remboursé" / "— marchand payé").
  if p_resolution = 'release' then
    select * into v_merchant
    from public.merchant_accounts
    where id = v_escrow.merchant_id;

    update public.payment_escrows
    set status = 'released',
        released_at = timezone('utc', now()),
        released_by = 'admin',
        dispute_resolved_at = timezone('utc', now()),
        dispute_resolution = 'release'
    where id = v_escrow.id
    returning * into v_escrow;

    insert into public.merchant_payouts (
      escrow_id, merchant_id, amount_xof, destination_number, service
    )
    values (
      v_escrow.id,
      v_escrow.merchant_id,
      v_escrow.amount_xof,
      coalesce(v_merchant.wave_payment_number, v_merchant.orange_money_payment_number),
      case
        when v_merchant.wave_payment_number is not null then 'Wave Senegal'
        when v_merchant.orange_money_payment_number is not null then 'Orange Money Senegal'
        else null
      end
    )
    on conflict (escrow_id) do nothing;
  else
    -- refund : l'escrow reste 'disputed' jusqu'à ce que l'IPN refund_complete
    -- (déclenché par la route admin qui appelle refundPayment côté PayTech)
    -- le fasse passer à 'refunded'. On trace seulement la décision ici.
    update public.payment_escrows
    set dispute_resolution = 'refund'
    where id = v_escrow.id
    returning * into v_escrow;
  end if;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    v_escrow.merchant_id,
    'escrow.dispute.resolve',
    'payment_escrow',
    v_escrow.id::text,
    jsonb_build_object('resolution', p_resolution, 'note', p_note)
  );

  return v_escrow;
end;
$$;

create function public.mark_escrow_refunded(p_order_id uuid)
returns public.payment_escrows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escrow public.payment_escrows%rowtype;
begin
  select * into v_escrow
  from public.payment_escrows
  where order_id = p_order_id
  for update;

  if v_escrow.id is null then
    raise exception using errcode = 'P0002', message = 'PAYMENT_INTENT_NOT_FOUND';
  end if;

  if v_escrow.status = 'refunded' then
    return v_escrow;
  end if;

  update public.payment_escrows
  set status = 'refunded',
      refunded_at = timezone('utc', now()),
      dispute_resolved_at = coalesce(dispute_resolved_at, timezone('utc', now())),
      dispute_resolution = coalesce(dispute_resolution, 'refund')
  where id = v_escrow.id
  returning * into v_escrow;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (null, v_escrow.merchant_id, 'escrow.refund.complete', 'payment_escrow', v_escrow.id::text);

  return v_escrow;
end;
$$;

create function public.release_due_escrows(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escrow record;
  v_merchant public.merchant_accounts%rowtype;
  v_released integer := 0;
  v_skipped integer := 0;
begin
  for v_escrow in
    select *
    from public.payment_escrows
    where status = 'held'
      and releasable_at is not null
      and releasable_at <= timezone('utc', now())
    order by releasable_at
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  loop
    select * into v_merchant
    from public.merchant_accounts
    where id = v_escrow.merchant_id;

    if v_merchant.wave_payment_number is null and v_merchant.orange_money_payment_number is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update public.payment_escrows
    set status = 'released',
        released_at = timezone('utc', now()),
        released_by = 'auto'
    where id = v_escrow.id;

    insert into public.merchant_payouts (
      escrow_id, merchant_id, amount_xof, destination_number, service
    )
    values (
      v_escrow.id,
      v_escrow.merchant_id,
      v_escrow.amount_xof,
      coalesce(v_merchant.wave_payment_number, v_merchant.orange_money_payment_number),
      case
        when v_merchant.wave_payment_number is not null then 'Wave Senegal'
        else 'Orange Money Senegal'
      end
    )
    on conflict (escrow_id) do nothing;

    insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
    values (null, v_escrow.merchant_id, 'escrow.release.auto', 'payment_escrow', v_escrow.id::text);

    v_released := v_released + 1;
  end loop;

  return jsonb_build_object('released', v_released, 'skipped', v_skipped);
end;
$$;

create function public.mark_payout_sent(p_external_id text)
returns public.merchant_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.merchant_payouts%rowtype;
begin
  select * into v_payout
  from public.merchant_payouts
  where external_id = p_external_id
  for update;

  if v_payout.id is null then
    raise exception using errcode = 'P0002', message = 'PAYOUT_NOT_FOUND';
  end if;

  if v_payout.status <> 'pending' then
    raise exception using errcode = '23514', message = 'PAYOUT_ALREADY_SENT';
  end if;

  update public.merchant_payouts
  set status = 'sent',
      sent_at = timezone('utc', now()),
      attempts = attempts + 1
  where id = v_payout.id
  returning * into v_payout;

  return v_payout;
end;
$$;

create function public.mark_payout_paid(p_external_id text, p_id_transfer text default null)
returns public.merchant_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.merchant_payouts%rowtype;
begin
  select * into v_payout
  from public.merchant_payouts
  where external_id = p_external_id
  for update;

  if v_payout.id is null then
    raise exception using errcode = 'P0002', message = 'PAYOUT_NOT_FOUND';
  end if;

  if v_payout.status = 'paid' then
    return v_payout;
  end if;

  update public.merchant_payouts
  set status = 'paid',
      paid_at = timezone('utc', now()),
      id_transfer = coalesce(p_id_transfer, id_transfer)
  where id = v_payout.id
  returning * into v_payout;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (null, v_payout.merchant_id, 'payout.paid', 'merchant_payout', v_payout.id::text);

  return v_payout;
end;
$$;

create function public.mark_payout_failed(p_external_id text, p_error text default null)
returns public.merchant_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.merchant_payouts%rowtype;
begin
  select * into v_payout
  from public.merchant_payouts
  where external_id = p_external_id
  for update;

  if v_payout.id is null then
    raise exception using errcode = 'P0002', message = 'PAYOUT_NOT_FOUND';
  end if;

  update public.merchant_payouts
  set status = 'failed',
      failed_at = timezone('utc', now()),
      last_error = p_error
  where id = v_payout.id
  returning * into v_payout;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (null, v_payout.merchant_id, 'payout.failed', 'merchant_payout', v_payout.id::text, jsonb_build_object('error', p_error));

  return v_payout;
end;
$$;

-- Trigger : quand une commande passe à 'delivered', poser releasable_at sur
-- son escrow (delivered_at + PAYTECH_ESCROW_RELEASE_DAYS). Le nombre de
-- jours est un paramètre applicatif (lib/config/env.ts paytechConfig) : on
-- fige 3 jours ici en valeur par défaut documentée, ajustable via une future
-- migration si le pilote change de politique.
create function public.set_escrow_releasable_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'delivered' and (old.status is distinct from 'delivered') then
    update public.payment_escrows
    set releasable_at = coalesce(new.delivered_at, timezone('utc', now())) + interval '3 days'
    where order_id = new.id
      and status = 'held';
  end if;
  return new;
end;
$$;

create trigger orders_set_escrow_releasable_at
  after update of status on public.orders
  for each row execute function public.set_escrow_releasable_at();

revoke all on function public.create_order_payment_intent(uuid, text, integer) from public;
revoke all on function public.capture_order_payment(text, text, integer, text, text) from public;
revoke all on function public.confirm_order_reception(uuid) from public;
revoke all on function public.open_order_dispute(uuid, text) from public;
revoke all on function public.resolve_order_dispute(uuid, text, text) from public;
revoke all on function public.mark_escrow_refunded(uuid) from public;
revoke all on function public.release_due_escrows(integer) from public;
revoke all on function public.mark_payout_sent(text) from public;
revoke all on function public.mark_payout_paid(text, text) from public;
revoke all on function public.mark_payout_failed(text, text) from public;
revoke all on function public.set_escrow_releasable_at() from public;

grant execute on function public.create_order_payment_intent(uuid, text, integer) to authenticated;
grant execute on function public.confirm_order_reception(uuid) to authenticated;
grant execute on function public.open_order_dispute(uuid, text) to authenticated;
grant execute on function public.resolve_order_dispute(uuid, text, text) to authenticated;

-- capture_order_payment, mark_escrow_refunded, release_due_escrows et les
-- mark_payout_* ne sont appelées que par le service role (IPN, cron) : pas
-- de grant à authenticated.
grant execute on function public.capture_order_payment(text, text, integer, text, text) to service_role;
grant execute on function public.mark_escrow_refunded(uuid) to service_role;
grant execute on function public.release_due_escrows(integer) to service_role;
grant execute on function public.mark_payout_sent(text) to service_role;
grant execute on function public.mark_payout_paid(text, text) to service_role;
grant execute on function public.mark_payout_failed(text, text) to service_role;

commit;
