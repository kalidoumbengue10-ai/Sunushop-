begin;
alter table public.merchant_accounts
  add column representative_is_legal_owner boolean not null default true,
  add column wave_payment_number text,
  add column orange_money_payment_number text;
create function public.is_merchant_member(
  p_merchant_id uuid,
  p_roles public.merchant_member_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant_members mm
    where mm.merchant_id = p_merchant_id
      and mm.user_id = auth.uid()
      and mm.active
      and (p_roles is null or mm.role = any(p_roles))
  );
$$;
create function public.has_admin_role(
  p_roles public.admin_role_kind[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = auth.uid()
      and ar.active
      and (p_roles is null or ar.role = any(p_roles))
  );
$$;
create function public.has_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
create function public.generate_public_code(p_prefix text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_code text;
begin
  v_code := upper(p_prefix || '-' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12));
  return v_code;
end;
$$;
create function public.latest_verification_document_exists(
  p_case_id uuid,
  p_type public.verification_document_type
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.verification_documents vd
    where vd.case_id = p_case_id
      and vd.document_type = p_type
      and vd.status in ('uploaded', 'accepted')
      and vd.storage_path is not null
  );
$$;
create function public.verification_case_is_complete(p_case_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant_accounts%rowtype;
  v_identity_ok boolean;
begin
  select ma.*
  into v_merchant
  from public.verification_cases vc
  join public.merchant_accounts ma on ma.id = vc.merchant_id
  where vc.id = p_case_id;

  if v_merchant.id is null then
    return false;
  end if;

  v_identity_ok :=
    public.latest_verification_document_exists(p_case_id, 'passport_identity')
    or (
      public.latest_verification_document_exists(p_case_id, 'national_id_front')
      and public.latest_verification_document_exists(p_case_id, 'national_id_back')
    );

  if not v_identity_ok
     or not public.latest_verification_document_exists(p_case_id, 'intent_letter')
     or not public.latest_verification_document_exists(p_case_id, 'proof_activity') then
    return false;
  end if;

  if v_merchant.kind = 'formal' then
    if not public.latest_verification_document_exists(p_case_id, 'ninea')
       or not public.latest_verification_document_exists(p_case_id, 'rccm') then
      return false;
    end if;

    if not v_merchant.representative_is_legal_owner
       and not public.latest_verification_document_exists(p_case_id, 'representative_mandate') then
      return false;
    end if;
  end if;

  return true;
end;
$$;
create function public.submit_verification_case(p_case_id uuid)
returns public.verification_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.verification_cases%rowtype;
  v_next_status public.verification_status;
begin
  select *
  into v_case
  from public.verification_cases
  where id = p_case_id
  for update;

  if v_case.id is null then
    raise exception using errcode = 'P0002', message = 'VERIFICATION_CASE_NOT_FOUND';
  end if;

  if not public.is_merchant_member(
    v_case.merchant_id,
    array['owner', 'manager']::public.merchant_member_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_case.status not in ('draft', 'needs_changes') then
    raise exception using errcode = '22023', message = 'INVALID_VERIFICATION_STATUS';
  end if;

  if not public.verification_case_is_complete(p_case_id) then
    raise exception using errcode = '23514', message = 'VERIFICATION_DOCUMENTS_INCOMPLETE';
  end if;

  v_next_status := case when v_case.status = 'needs_changes' then 'resubmitted' else 'submitted' end;

  update public.verification_cases
  set status = v_next_status,
      submission_version = submission_version
        + case when v_next_status = 'resubmitted' then 1 else 0 end,
      submitted_at = timezone('utc', now()),
      merchant_note = null
  where id = p_case_id
  returning * into v_case;

  update public.merchant_accounts
  set status = 'pending',
      verification_status = v_next_status
  where id = v_case.merchant_id;

  insert into public.verification_events (
    case_id,
    merchant_id,
    actor_id,
    event_type,
    from_status,
    to_status,
    public_message
  )
  values (
    v_case.id,
    v_case.merchant_id,
    auth.uid(),
    'case_submitted',
    case when v_next_status = 'resubmitted' then 'needs_changes' else 'draft' end,
    v_next_status,
    'Votre dossier a été transmis à l’équipe SunuShop.'
  );

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (auth.uid(), v_case.merchant_id, 'verification.submit', 'verification_case', v_case.id::text);

  return v_case;
end;
$$;
create function public.review_verification_case(
  p_case_id uuid,
  p_outcome public.verification_status,
  p_reason_code text default null,
  p_merchant_message text default null,
  p_internal_note text default null
)
returns public.verification_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.verification_cases%rowtype;
  v_previous public.verification_status;
begin
  if not public.has_admin_role(array['reviewer', 'admin']::public.admin_role_kind[])
     or not public.has_aal2() then
    raise exception using errcode = '42501', message = 'REVIEWER_MFA_REQUIRED';
  end if;

  if p_outcome not in ('in_review', 'needs_changes', 'approved', 'rejected', 'suspended') then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_OUTCOME';
  end if;

  select *
  into v_case
  from public.verification_cases
  where id = p_case_id
  for update;

  if v_case.id is null then
    raise exception using errcode = 'P0002', message = 'VERIFICATION_CASE_NOT_FOUND';
  end if;

  if v_case.assigned_reviewer_id is not null
     and v_case.assigned_reviewer_id <> auth.uid()
     and not public.has_admin_role(array['admin']::public.admin_role_kind[]) then
    raise exception using errcode = '42501', message = 'CASE_ASSIGNED_TO_ANOTHER_REVIEWER';
  end if;

  if p_outcome = 'approved' and not public.verification_case_is_complete(p_case_id) then
    raise exception using errcode = '23514', message = 'VERIFICATION_DOCUMENTS_INCOMPLETE';
  end if;

  if p_outcome in ('needs_changes', 'rejected', 'suspended')
     and (p_reason_code is null or p_merchant_message is null) then
    raise exception using errcode = '23514', message = 'REVIEW_REASON_REQUIRED';
  end if;

  v_previous := v_case.status;

  update public.verification_cases
  set status = p_outcome,
      assigned_reviewer_id = auth.uid(),
      review_started_at = coalesce(review_started_at, timezone('utc', now())),
      decided_at = case when p_outcome in ('approved', 'rejected', 'suspended') then timezone('utc', now()) else null end,
      decision_code = p_reason_code,
      merchant_note = p_merchant_message,
      internal_note = p_internal_note
  where id = p_case_id
  returning * into v_case;

  update public.merchant_accounts
  set verification_status = p_outcome,
      status = case
        when p_outcome = 'approved' and subscription_status in ('active', 'grace') then 'active'::public.merchant_status
        when p_outcome = 'suspended' then 'suspended'::public.merchant_status
        else 'pending'::public.merchant_status
      end
  where id = v_case.merchant_id;

  if p_outcome = 'approved' then
    update public.verification_documents
    set status = 'accepted',
        reviewed_at = timezone('utc', now())
    where case_id = p_case_id
      and status = 'uploaded';
  end if;

  insert into public.verification_reviews (
    case_id,
    reviewer_id,
    outcome,
    reason_code,
    merchant_message,
    internal_note
  )
  values (
    p_case_id,
    auth.uid(),
    p_outcome,
    p_reason_code,
    p_merchant_message,
    p_internal_note
  );

  insert into public.verification_events (
    case_id,
    merchant_id,
    actor_id,
    event_type,
    from_status,
    to_status,
    public_message
  )
  values (
    p_case_id,
    v_case.merchant_id,
    auth.uid(),
    'case_reviewed',
    v_previous,
    p_outcome,
    p_merchant_message
  );

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    v_case.merchant_id,
    'verification.review',
    'verification_case',
    p_case_id::text,
    jsonb_build_object('outcome', p_outcome, 'reason_code', p_reason_code)
  );

  return v_case;
end;
$$;
create function public.review_subscription_payment(
  p_submission_id uuid,
  p_approved boolean,
  p_rejection_reason text default null
)
returns public.subscription_payment_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.subscription_payment_submissions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_subscription public.merchant_subscriptions%rowtype;
  v_period_start timestamptz;
begin
  if not public.has_admin_role(array['admin']::public.admin_role_kind[])
     or not public.has_aal2() then
    raise exception using errcode = '42501', message = 'ADMIN_MFA_REQUIRED';
  end if;

  select *
  into v_submission
  from public.subscription_payment_submissions
  where id = p_submission_id
  for update;

  if v_submission.id is null then
    raise exception using errcode = 'P0002', message = 'PAYMENT_SUBMISSION_NOT_FOUND';
  end if;

  if v_submission.status <> 'pending' then
    raise exception using errcode = '22023', message = 'PAYMENT_ALREADY_REVIEWED';
  end if;

  if not p_approved and p_rejection_reason is null then
    raise exception using errcode = '23514', message = 'REJECTION_REASON_REQUIRED';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where id = v_submission.plan_id
    and active;

  if v_plan.id is null then
    raise exception using errcode = 'P0002', message = 'SUBSCRIPTION_PLAN_NOT_FOUND';
  end if;

  if p_approved and v_submission.amount_xof <> v_plan.monthly_price_xof then
    raise exception using errcode = '23514', message = 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  if p_approved then
    select *
    into v_subscription
    from public.merchant_subscriptions
    where merchant_id = v_submission.merchant_id
      and status in ('pending', 'active', 'grace')
    order by created_at desc
    limit 1
    for update;

    v_period_start := greatest(
      timezone('utc', now()),
      coalesce(v_subscription.current_period_ends_at, timezone('utc', now()))
    );

    if v_subscription.id is null then
      insert into public.merchant_subscriptions (
        merchant_id,
        plan_id,
        status,
        starts_at,
        current_period_ends_at,
        grace_ends_at
      )
      values (
        v_submission.merchant_id,
        v_submission.plan_id,
        'active',
        timezone('utc', now()),
        timezone('utc', now()) + interval '30 days',
        timezone('utc', now()) + interval '33 days'
      )
      returning * into v_subscription;
    else
      update public.merchant_subscriptions
      set plan_id = v_submission.plan_id,
          status = 'active',
          starts_at = coalesce(starts_at, timezone('utc', now())),
          current_period_ends_at = v_period_start + interval '30 days',
          grace_ends_at = v_period_start + interval '33 days'
      where id = v_subscription.id
      returning * into v_subscription;
    end if;

    update public.subscription_payment_submissions
    set status = 'approved',
        subscription_id = v_subscription.id,
        reviewer_id = auth.uid(),
        reviewed_at = timezone('utc', now()),
        rejection_reason = null
    where id = p_submission_id
    returning * into v_submission;

    update public.merchant_accounts
    set subscription_status = 'active',
        status = case
          when verification_status = 'approved' then 'active'::public.merchant_status
          else 'pending'::public.merchant_status
        end
    where id = v_submission.merchant_id;

    insert into public.notification_outbox (recipient_user_id, channel, template, payload)
    select owner_user_id, 'in_app', 'subscription_activated',
      jsonb_build_object('merchant_id', id, 'plan_id', v_submission.plan_id)
    from public.merchant_accounts
    where id = v_submission.merchant_id;
  else
    update public.subscription_payment_submissions
    set status = 'rejected',
        reviewer_id = auth.uid(),
        reviewed_at = timezone('utc', now()),
        rejection_reason = p_rejection_reason
    where id = p_submission_id
    returning * into v_submission;
  end if;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    v_submission.merchant_id,
    case when p_approved then 'subscription_payment.approve' else 'subscription_payment.reject' end,
    'subscription_payment_submission',
    p_submission_id::text,
    jsonb_build_object('plan_id', v_submission.plan_id)
  );

  return v_submission;
end;
$$;
create function public.refresh_subscription_states()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
  v_row record;
begin
  insert into public.notification_outbox (
    dedupe_key,
    recipient_user_id,
    channel,
    template,
    payload
  )
  select
    'subscription-reminder:'
      || ms.id::text
      || ':'
      || ms.current_period_ends_at::date::text
      || ':j-'
      || (ms.current_period_ends_at::date - current_date)::text,
    ma.owner_user_id,
    'in_app',
    case
      when ms.current_period_ends_at::date - current_date = 7
        then 'subscription_expires_j7'
      else 'subscription_expires_j2'
    end,
    jsonb_build_object(
      'merchant_id', ms.merchant_id,
      'subscription_id', ms.id,
      'current_period_ends_at', ms.current_period_ends_at
    )
  from public.merchant_subscriptions ms
  join public.merchant_accounts ma on ma.id = ms.merchant_id
  where ms.status = 'active'
    and ms.current_period_ends_at::date - current_date in (7, 2)
  on conflict (dedupe_key) do nothing;

  for v_row in
    update public.merchant_subscriptions
    set status = 'grace'
    where status = 'active'
      and current_period_ends_at <= timezone('utc', now())
    returning merchant_id
  loop
    update public.merchant_accounts
    set subscription_status = 'grace'
    where id = v_row.merchant_id;
    v_changed := v_changed + 1;
  end loop;

  for v_row in
    update public.merchant_subscriptions
    set status = 'expired'
    where status = 'grace'
      and grace_ends_at <= timezone('utc', now())
    returning merchant_id
  loop
    update public.merchant_accounts
    set subscription_status = 'expired',
        status = case when status = 'active' then 'pending'::public.merchant_status else status end
    where id = v_row.merchant_id;
    v_changed := v_changed + 1;
  end loop;

  return v_changed;
end;
$$;
create function public.create_order_batch(
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
      and verification_status = 'approved'
      and subscription_status in ('active', 'grace')
    for share;

    if v_merchant.id is null then
      raise exception using errcode = '23514', message = 'MERCHANT_NOT_ORDERABLE';
    end if;

    select dz.*
    into v_zone
    from public.delivery_zones dz
    where dz.id = (v_group ->> 'deliveryZoneId')::uuid
      and dz.merchant_id = v_merchant.id
      and dz.active;

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
      v_zone.fee_xof,
      v_subtotal + v_zone.fee_xof,
      jsonb_build_object(
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
      ),
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
create function public.transition_order_status(
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
  v_allowed boolean := false;
  v_is_merchant boolean;
  v_is_buyer boolean;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

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

  v_allowed := case
    when v_order.status = 'pending_seller_confirmation' and p_to_status in ('confirmed', 'cancelled') then v_is_merchant
    when v_order.status = 'confirmed' and p_to_status in ('preparing', 'cancelled') then v_is_merchant
    when v_order.status = 'preparing' and p_to_status in ('ready_for_handoff', 'cancelled') then v_is_merchant
    when v_order.status = 'ready_for_handoff' and p_to_status in ('in_transit', 'cancelled') then v_is_merchant
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
    (select oe.to_status from public.order_events oe where oe.order_id = v_order.id order by oe.id desc limit 1),
    p_to_status,
    p_public_message,
    p_internal_note
  );

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    v_order.merchant_id,
    'order.transition',
    'order',
    v_order.id::text,
    jsonb_build_object('to_status', p_to_status)
  );

  return v_order;
end;
$$;
revoke all on function public.is_merchant_member(uuid, public.merchant_member_role[]) from public;
revoke all on function public.has_admin_role(public.admin_role_kind[]) from public;
revoke all on function public.submit_verification_case(uuid) from public;
revoke all on function public.review_verification_case(uuid, public.verification_status, text, text, text) from public;
revoke all on function public.review_subscription_payment(uuid, boolean, text) from public;
revoke all on function public.create_order_batch(text, jsonb, jsonb) from public;
revoke all on function public.transition_order_status(uuid, public.order_status, text, text) from public;
grant execute on function public.submit_verification_case(uuid) to authenticated;
grant execute on function public.review_verification_case(uuid, public.verification_status, text, text, text) to authenticated;
grant execute on function public.review_subscription_payment(uuid, boolean, text) to authenticated;
grant execute on function public.create_order_batch(text, jsonb, jsonb) to authenticated;
grant execute on function public.transition_order_status(uuid, public.order_status, text, text) to authenticated;
commit;
