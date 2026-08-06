begin;

-- Le paiement de l'abonnement devient le seul droit de vendre : la validation
-- KYC (verification_status) reste affichée et utilisée par l'équipe support
-- mais ne bloque plus l'accès aux outils marchand ni la publication. Seul
-- merchant_accounts.status = 'suspended' (action admin) coupe la boutique.

-- 1. Remplacer le trigger d'écriture "KYC obligatoire" par un trigger
--    "boutique non suspendue".
drop trigger if exists products_require_approved_merchant on public.products;
drop trigger if exists delivery_methods_require_approved_merchant on public.delivery_methods;
drop trigger if exists delivery_zones_require_approved_merchant on public.delivery_zones;
drop trigger if exists subscription_payments_require_approved_merchant on public.subscription_payment_submissions;

create function public.enforce_active_merchant_workspace_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Les opérations système utilisent la service role et n'ont pas de JWT utilisateur.
  if auth.uid() is null then
    return new;
  end if;

  if exists (
    select 1
    from public.merchant_accounts ma
    where ma.id = new.merchant_id
      and ma.status = 'suspended'
  ) then
    raise exception using errcode = '42501', message = 'MERCHANT_SUSPENDED';
  end if;

  return new;
end;
$$;

create trigger products_require_active_merchant
  before insert or update on public.products
  for each row execute function public.enforce_active_merchant_workspace_write();

create trigger delivery_methods_require_active_merchant
  before insert or update on public.delivery_methods
  for each row execute function public.enforce_active_merchant_workspace_write();

create trigger delivery_zones_require_active_merchant
  before insert or update on public.delivery_zones
  for each row execute function public.enforce_active_merchant_workspace_write();

create trigger subscription_payments_require_active_merchant
  before insert or update on public.subscription_payment_submissions
  for each row execute function public.enforce_active_merchant_workspace_write();

revoke all on function public.enforce_active_merchant_workspace_write() from public;

drop function if exists public.enforce_approved_merchant_workspace_write();

-- 2. create_merchant_product : la publication ne dépend plus du KYC.
create or replace function public.create_merchant_product(
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
    v_merchant.status = 'suspended'
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

-- 3. set_merchant_product_publication : même correction.
create or replace function public.set_merchant_product_publication(
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
    v_merchant.status = 'suspended'
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

-- 4. review_verification_case : un verdict non "suspended" ne doit plus
--    ramener une boutique payante à l'état 'pending'. Seul 'suspended' coupe
--    la boutique ; les autres verdicts laissent status inchangé.
create or replace function public.review_verification_case(
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
    raise exception using errcode = '42501', message = 'ADMIN_MFA_REQUIRED';
  end if;

  select *
  into v_case
  from public.verification_cases
  where id = p_case_id
  for update;

  if v_case.id is null then
    raise exception using errcode = 'P0002', message = 'VERIFICATION_CASE_NOT_FOUND';
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
        when p_outcome = 'suspended' then 'suspended'::public.merchant_status
        when status = 'suspended' then 'suspended'::public.merchant_status
        else status
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

-- 5. review_subscription_payment : le paiement approuvé active la boutique
--    indépendamment du KYC. Seule une suspension admin reste prioritaire.
create or replace function public.review_subscription_payment(
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
          when status = 'suspended' then 'suspended'::public.merchant_status
          else 'active'::public.merchant_status
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

-- 6. admin_activate_test_subscription : retirer le blocage KYC pour rester
--    cohérent avec le paiement réel (recopié depuis la dernière version,
--    202608040003_subscription_plan_catalog.sql, qui a remplacé celle de
--    202608040002_admin_test_subscriptions.sql).
create or replace function public.admin_activate_test_subscription(
  p_merchant_id uuid,
  p_plan_id text default null,
  p_days integer default 30
)
returns public.merchant_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant_accounts%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_subscription public.merchant_subscriptions%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if not public.has_admin_role(array['admin']::public.admin_role_kind[])
     or not public.has_aal2() then
    raise exception using errcode = '42501', message = 'ADMIN_MFA_REQUIRED';
  end if;

  if p_days < 1 or p_days > 90 then
    raise exception using errcode = '22023', message = 'TEST_SUBSCRIPTION_DURATION_INVALID';
  end if;

  select * into v_merchant
  from public.merchant_accounts
  where id = p_merchant_id
  for update;

  if v_merchant.id is null then
    raise exception using errcode = 'P0002', message = 'MERCHANT_NOT_FOUND';
  end if;

  if v_merchant.status = 'suspended' then
    raise exception using errcode = '42501', message = 'MERCHANT_SUSPENDED';
  end if;

  select * into v_plan
  from public.subscription_plans
  where active
    and (p_plan_id is null or id = p_plan_id)
  order by position, monthly_price_xof, id
  limit 1;

  if v_plan.id is null then
    raise exception using errcode = 'P0002', message = 'SUBSCRIPTION_PLAN_NOT_FOUND';
  end if;

  select * into v_subscription
  from public.merchant_subscriptions
  where merchant_id = p_merchant_id
    and status in ('pending', 'active', 'grace')
  order by created_at desc
  limit 1
  for update;

  if v_subscription.id is null then
    insert into public.merchant_subscriptions (
      merchant_id, plan_id, status, starts_at, current_period_ends_at, grace_ends_at
    ) values (
      p_merchant_id, v_plan.id, 'active', v_now,
      v_now + make_interval(days => p_days),
      v_now + make_interval(days => p_days + 3)
    ) returning * into v_subscription;
  else
    update public.merchant_subscriptions
    set plan_id = v_plan.id,
        status = 'active',
        starts_at = v_now,
        current_period_ends_at = v_now + make_interval(days => p_days),
        grace_ends_at = v_now + make_interval(days => p_days + 3),
        cancelled_at = null,
        updated_at = v_now
    where id = v_subscription.id
    returning * into v_subscription;
  end if;

  update public.merchant_accounts
  set subscription_status = 'active', status = 'active'
  where id = p_merchant_id;

  insert into public.notification_outbox (
    dedupe_key, recipient_user_id, channel, template, payload
  ) values (
    'test-subscription:' || v_subscription.id::text || ':' || v_subscription.current_period_ends_at::text,
    v_merchant.owner_user_id,
    'in_app',
    'subscription_activated',
    jsonb_build_object(
      'merchant_id', p_merchant_id,
      'plan_id', v_plan.id,
      'plan_name', v_plan.name,
      'test_activation', true,
      'current_period_ends_at', v_subscription.current_period_ends_at
    )
  ) on conflict (dedupe_key) do nothing;

  insert into public.audit_events (
    actor_id, merchant_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), p_merchant_id, 'subscription.test_activate',
    'merchant_subscription', v_subscription.id::text,
    jsonb_build_object('plan_id', v_plan.id, 'days', p_days)
  );

  return v_subscription;
end;
$$;

-- 7. create_order_batch : une boutique commandable n'a plus besoin du KYC
--    approuvé, seulement d'être active (payante, non suspendue).
create or replace function public.create_order_batch(
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

-- 8. Politiques de lecture publique : retirer la condition KYC, garder
--    status = 'active' (payant, non suspendu) et l'abonnement actif/grâce.
drop policy if exists merchant_accounts_public_read on public.merchant_accounts;
create policy merchant_accounts_public_read
  on public.merchant_accounts for select to anon, authenticated
  using (
    status = 'active'
    and subscription_status in ('active', 'grace')
  );

drop policy if exists products_public_read on public.products;
create policy products_public_read
  on public.products for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1
      from public.merchant_accounts ma
      where ma.id = products.merchant_id
        and ma.status = 'active'
        and ma.subscription_status in ('active', 'grace')
    )
  );

drop policy if exists variants_public_read on public.product_variants;
create policy variants_public_read
  on public.product_variants for select to anon, authenticated
  using (
    active
    and exists (
      select 1
      from public.products p
      join public.merchant_accounts ma on ma.id = p.merchant_id
      where p.id = product_variants.product_id
        and p.status = 'published'
        and ma.status = 'active'
        and ma.subscription_status in ('active', 'grace')
    )
  );

drop policy if exists inventory_public_read on public.inventory_items;
create policy inventory_public_read
  on public.inventory_items for select to anon, authenticated
  using (
    exists (
      select 1
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      join public.merchant_accounts ma on ma.id = p.merchant_id
      where pv.id = inventory_items.variant_id
        and pv.active
        and p.status = 'published'
        and ma.status = 'active'
        and ma.subscription_status in ('active', 'grace')
    )
  );

drop policy if exists product_media_public_read on public.product_media;
create policy product_media_public_read
  on public.product_media for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.merchant_accounts ma on ma.id = p.merchant_id
      where p.id = product_media.product_id
        and p.status = 'published'
        and ma.status = 'active'
        and ma.subscription_status in ('active', 'grace')
    )
  );

drop policy if exists delivery_methods_public_read on public.delivery_methods;
create policy delivery_methods_public_read
  on public.delivery_methods for select to anon, authenticated
  using (
    active
    and exists (
      select 1 from public.merchant_accounts ma
      where ma.id = delivery_methods.merchant_id
        and ma.status = 'active'
        and ma.subscription_status in ('active', 'grace')
    )
  );

drop policy if exists delivery_zones_public_read on public.delivery_zones;
create policy delivery_zones_public_read
  on public.delivery_zones for select to anon, authenticated
  using (
    active
    and exists (
      select 1 from public.merchant_accounts ma
      where ma.id = delivery_zones.merchant_id
        and ma.status = 'active'
        and ma.subscription_status in ('active', 'grace')
    )
  );

drop policy if exists delivery_category_rates_public_read on public.delivery_category_rates;
create policy delivery_category_rates_public_read
  on public.delivery_category_rates for select to anon, authenticated
  using (
    exists (
      select 1
      from public.delivery_zones dz
      join public.merchant_accounts ma on ma.id = dz.merchant_id
      where dz.id = delivery_category_rates.delivery_zone_id
        and dz.active
        and ma.status = 'active'
        and ma.subscription_status in ('active', 'grace')
    )
  );

-- 9. Rattraper les marchands déjà payants restés à 'pending' faute de KYC
--    approuvé : le paiement valide désormais status='active' à lui seul.
update public.merchant_accounts
set status = 'active'
where status <> 'suspended'
  and subscription_status in ('active', 'grace');

commit;
