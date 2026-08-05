begin;
create table public.rate_limit_buckets (
  key_hash text not null,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (key_hash, action),
  constraint rate_limit_count_positive check (request_count > 0)
);
alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;
create function public.consume_rate_limit(
  p_key_hash text,
  p_action text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_bucket public.rate_limit_buckets%rowtype;
begin
  if p_window_seconds < 1 or p_max_requests < 1 then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT';
  end if;

  insert into public.rate_limit_buckets (
    key_hash,
    action,
    window_started_at,
    request_count
  )
  values (
    p_key_hash,
    p_action,
    v_now,
    1
  )
  on conflict (key_hash, action) do update
  set window_started_at = case
        when public.rate_limit_buckets.window_started_at + make_interval(secs => p_window_seconds) <= v_now
          then v_now
        else public.rate_limit_buckets.window_started_at
      end,
      request_count = case
        when public.rate_limit_buckets.window_started_at + make_interval(secs => p_window_seconds) <= v_now
          then 1
        else public.rate_limit_buckets.request_count + 1
      end,
      updated_at = v_now
  returning * into v_bucket;

  return v_bucket.request_count <= p_max_requests;
end;
$$;
create function public.create_merchant_application(
  p_kind public.merchant_kind,
  p_public_name text,
  p_slug text,
  p_phone text,
  p_email text default null,
  p_legal_name text default null,
  p_region text default null,
  p_city text default null,
  p_address_hint text default null,
  p_representative_is_legal_owner boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_merchant public.merchant_accounts%rowtype;
  v_case public.verification_cases%rowtype;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if exists (
    select 1
    from public.merchant_members mm
    where mm.user_id = v_user and mm.role = 'owner' and mm.active
  ) then
    raise exception using errcode = '23505', message = 'MERCHANT_APPLICATION_ALREADY_EXISTS';
  end if;

  insert into public.merchant_accounts (
    owner_user_id,
    kind,
    legal_name,
    public_name,
    slug,
    phone,
    email,
    region,
    city,
    address_hint,
    representative_is_legal_owner
  )
  values (
    v_user,
    p_kind,
    nullif(trim(p_legal_name), ''),
    trim(p_public_name),
    lower(trim(p_slug)),
    p_phone,
    nullif(trim(p_email), '')::extensions.citext,
    nullif(trim(p_region), ''),
    nullif(trim(p_city), ''),
    nullif(trim(p_address_hint), ''),
    p_representative_is_legal_owner
  )
  returning * into v_merchant;

  insert into public.merchant_members (merchant_id, user_id, role)
  values (v_merchant.id, v_user, 'owner');

  insert into public.verification_cases (merchant_id)
  values (v_merchant.id)
  returning * into v_case;

  insert into public.verification_events (
    case_id,
    merchant_id,
    actor_id,
    event_type,
    to_status,
    public_message
  )
  values (
    v_case.id,
    v_merchant.id,
    v_user,
    'case_created',
    'draft',
    'Votre dossier marchand a été créé.'
  );

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (v_user, v_merchant.id, 'merchant.create', 'merchant_account', v_merchant.id::text);

  return jsonb_build_object(
    'merchantId', v_merchant.id,
    'caseId', v_case.id,
    'status', v_case.status
  );
end;
$$;
create function public.submit_subscription_payment(
  p_merchant_id uuid,
  p_plan_id text,
  p_channel public.payment_channel,
  p_external_reference text,
  p_amount_xof integer,
  p_paid_at timestamptz
)
returns public.subscription_payment_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.subscription_payment_submissions%rowtype;
  v_plan public.subscription_plans%rowtype;
begin
  if not public.is_merchant_member(
    p_merchant_id,
    array['owner', 'manager']::public.merchant_member_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where id = p_plan_id and active;

  if v_plan.id is null then
    raise exception using errcode = 'P0002', message = 'SUBSCRIPTION_PLAN_NOT_FOUND';
  end if;

  if p_amount_xof <> v_plan.monthly_price_xof then
    raise exception using errcode = '23514', message = 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  insert into public.subscription_payment_submissions (
    merchant_id,
    plan_id,
    submitted_by,
    channel,
    external_reference,
    amount_xof,
    paid_at
  )
  values (
    p_merchant_id,
    p_plan_id,
    auth.uid(),
    p_channel,
    trim(p_external_reference),
    p_amount_xof,
    p_paid_at
  )
  returning * into v_submission;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (
    auth.uid(),
    p_merchant_id,
    'subscription_payment.submit',
    'subscription_payment_submission',
    v_submission.id::text
  );

  return v_submission;
end;
$$;
create function public.document_retention_candidates(
  p_rejected_days integer default 90,
  p_closed_days integer default 365
)
returns table (
  document_id uuid,
  storage_bucket text,
  storage_path text
)
language sql
security definer
set search_path = ''
as $$
  select vd.id, vd.storage_bucket, vd.storage_path
  from public.verification_documents vd
  join public.verification_cases vc on vc.id = vd.case_id
  join public.merchant_accounts ma on ma.id = vd.merchant_id
  where vd.status <> 'purged'
    and vd.storage_path is not null
    and (
      (
        vc.status = 'rejected'
        and vc.decided_at < timezone('utc', now()) - make_interval(days => p_rejected_days)
      )
      or
      (
        vc.status in ('draft', 'needs_changes')
        and vc.updated_at < timezone('utc', now()) - make_interval(days => p_rejected_days)
      )
      or
      (
        ma.status = 'closed'
        and ma.closed_at < timezone('utc', now()) - make_interval(days => p_closed_days)
      )
    );
$$;
create function public.mark_verification_document_purged(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.verification_documents
  set status = 'purged',
      storage_path = null,
      sha256 = null,
      purged_at = timezone('utc', now())
  where id = p_document_id;
end;
$$;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public;
revoke all on function public.create_merchant_application(public.merchant_kind, text, text, text, text, text, text, text, text, boolean) from public;
revoke all on function public.submit_subscription_payment(uuid, text, public.payment_channel, text, integer, timestamptz) from public;
revoke all on function public.document_retention_candidates(integer, integer) from public;
revoke all on function public.mark_verification_document_purged(uuid) from public;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.create_merchant_application(public.merchant_kind, text, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.submit_subscription_payment(uuid, text, public.payment_channel, text, integer, timestamptz) to authenticated;
grant execute on function public.document_retention_candidates(integer, integer) to service_role;
grant execute on function public.mark_verification_document_purged(uuid) to service_role;
commit;
