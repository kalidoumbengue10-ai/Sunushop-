begin;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create type public.merchant_kind as enum ('informal', 'formal');
create type public.merchant_status as enum ('draft', 'pending', 'active', 'suspended', 'closed');
create type public.merchant_member_role as enum ('owner', 'manager', 'catalog', 'fulfillment');
create type public.admin_role_kind as enum ('reviewer', 'support', 'admin');
create type public.verification_status as enum (
  'draft',
  'submitted',
  'in_review',
  'needs_changes',
  'resubmitted',
  'approved',
  'rejected',
  'suspended'
);
create type public.verification_document_type as enum (
  'national_id_front',
  'national_id_back',
  'passport_identity',
  'intent_letter',
  'proof_activity',
  'ninea',
  'rccm',
  'representative_mandate'
);
create type public.verification_document_status as enum ('uploaded', 'accepted', 'rejected', 'replaced', 'purged');
create type public.product_status as enum ('draft', 'published', 'archived', 'suspended');
create type public.order_status as enum (
  'pending_seller_confirmation',
  'confirmed',
  'preparing',
  'ready_for_handoff',
  'in_transit',
  'delivered',
  'cancelled',
  'disputed'
);
create type public.order_payment_method as enum ('cash_on_delivery', 'wave_direct', 'orange_money_direct');
create type public.delivery_method_kind as enum ('pickup', 'merchant_delivery');
create type public.subscription_status as enum ('pending', 'active', 'grace', 'expired', 'cancelled');
create type public.payment_submission_status as enum ('pending', 'approved', 'rejected');
create type public.payment_channel as enum ('wave', 'orange_money');
create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed');
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  email extensions.citext,
  locale text not null default 'fr-SN',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_phone_format check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$')
);
create table public.merchant_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  kind public.merchant_kind not null,
  legal_name text,
  public_name text not null,
  slug extensions.citext not null unique,
  description text,
  phone text not null,
  email extensions.citext,
  region text,
  city text,
  address_hint text,
  ninea text,
  rccm text,
  status public.merchant_status not null default 'draft',
  verification_status public.verification_status not null default 'draft',
  subscription_status public.subscription_status not null default 'pending',
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint merchant_public_name_length check (char_length(public_name) between 2 and 120),
  constraint merchant_slug_format check (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint merchant_phone_format check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint formal_merchant_legal_name check (kind = 'informal' or legal_name is not null)
);
create table public.merchant_members (
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.merchant_member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (merchant_id, user_id)
);
create table public.admin_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.admin_role_kind not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, role)
);
create table public.verification_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  submission_version integer not null default 1,
  status public.verification_status not null default 'draft',
  assigned_reviewer_id uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  review_started_at timestamptz,
  decided_at timestamptz,
  decision_code text,
  merchant_note text,
  internal_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (merchant_id, submission_version),
  constraint verification_submission_version_positive check (submission_version > 0)
);
create table public.verification_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.verification_cases(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  document_type public.verification_document_type not null,
  version integer not null,
  storage_bucket text not null default 'merchant-verification',
  storage_path text,
  sha256 text,
  mime_type text not null,
  size_bytes bigint not null,
  status public.verification_document_status not null default 'uploaded',
  expires_on date,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  purged_at timestamptz,
  unique (case_id, document_type, version),
  constraint verification_document_size check (size_bytes between 1 and 10485760),
  constraint verification_document_mime check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  constraint verification_document_sha check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint verification_document_storage check (
    (status = 'purged' and storage_path is null)
    or
    (status <> 'purged' and storage_path is not null)
  )
);
create table public.verification_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.verification_cases(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  outcome public.verification_status not null,
  reason_code text,
  merchant_message text,
  internal_note text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint verification_review_outcome check (outcome in ('in_review', 'needs_changes', 'approved', 'rejected', 'suspended'))
);
create table public.verification_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.verification_cases(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  from_status public.verification_status,
  to_status public.verification_status,
  public_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create table public.categories (
  id uuid primary key default extensions.gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete set null,
  slug extensions.citext not null unique,
  name text not null,
  description text,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);
create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  slug extensions.citext not null,
  title text not null,
  description text not null,
  status public.product_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (merchant_id, slug),
  constraint product_title_length check (char_length(title) between 2 and 180),
  constraint product_slug_format check (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
create table public.product_variants (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  sku text not null,
  title text,
  attributes jsonb not null default '{}'::jsonb,
  price_xof integer not null,
  compare_at_price_xof integer,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (merchant_id, sku),
  constraint variant_price_positive check (price_xof >= 0),
  constraint variant_compare_price check (compare_at_price_xof is null or compare_at_price_xof >= price_xof)
);
create table public.inventory_items (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  available_quantity integer not null default 0,
  reserved_quantity integer not null default 0,
  version integer not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inventory_non_negative check (available_quantity >= 0 and reserved_quantity >= 0),
  constraint inventory_reservation_valid check (reserved_quantity <= available_quantity)
);
create table public.product_media (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  storage_bucket text not null default 'product-media',
  storage_path text not null,
  alt_text text,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);
create table public.delivery_methods (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  kind public.delivery_method_kind not null,
  name text not null,
  instructions text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create table public.delivery_zones (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_method_id uuid not null references public.delivery_methods(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  region text not null,
  city text,
  label text not null,
  fee_xof integer not null,
  min_delay_minutes integer not null,
  max_delay_minutes integer not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint delivery_fee_non_negative check (fee_xof >= 0),
  constraint delivery_delay_valid check (min_delay_minutes >= 0 and max_delay_minutes >= min_delay_minutes)
);
create table public.carts (
  id uuid primary key default extensions.gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint cart_status check (status in ('active', 'converted', 'abandoned'))
);
create table public.cart_items (
  id uuid primary key default extensions.gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (cart_id, variant_id),
  constraint cart_item_quantity check (quantity between 1 and 99)
);
create table public.delivery_quotes (
  id uuid primary key default extensions.gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  delivery_zone_id uuid not null references public.delivery_zones(id) on delete cascade,
  items_hash text not null,
  subtotal_xof integer not null,
  delivery_fee_xof integer not null,
  total_xof integer not null,
  min_delivery_at timestamptz,
  max_delivery_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint quote_totals_valid check (
    subtotal_xof >= 0
    and delivery_fee_xof >= 0
    and total_xof = subtotal_xof + delivery_fee_xof
  )
);
create table public.order_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  public_code text not null unique,
  idempotency_key text not null,
  order_count integer not null,
  total_xof integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (buyer_id, idempotency_key),
  constraint order_batch_count check (order_count > 0),
  constraint order_batch_total check (total_xof >= 0)
);
create table public.orders (
  id uuid primary key default extensions.gen_random_uuid(),
  batch_id uuid not null references public.order_batches(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  public_code text not null unique,
  status public.order_status not null default 'pending_seller_confirmation',
  payment_method public.order_payment_method not null,
  currency text not null default 'XOF',
  subtotal_xof integer not null,
  delivery_fee_xof integer not null,
  total_xof integer not null,
  delivery_snapshot jsonb not null,
  recipient_snapshot jsonb not null,
  payment_instructions_snapshot jsonb not null default '{}'::jsonb,
  seller_confirm_by timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_currency_xof check (currency = 'XOF'),
  constraint order_totals_valid check (
    subtotal_xof >= 0
    and delivery_fee_xof >= 0
    and total_xof = subtotal_xof + delivery_fee_xof
  )
);
create table public.order_items (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_snapshot jsonb not null,
  sku_snapshot text not null,
  unit_price_xof integer not null,
  quantity integer not null,
  line_total_xof integer generated always as (unit_price_xof * quantity) stored,
  created_at timestamptz not null default timezone('utc', now()),
  constraint order_item_price check (unit_price_xof >= 0),
  constraint order_item_quantity check (quantity between 1 and 99)
);
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_status public.order_status,
  to_status public.order_status not null,
  public_message text,
  internal_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create table public.direct_payment_declarations (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  merchant_id uuid not null references public.merchant_accounts(id) on delete restrict,
  channel public.payment_channel not null,
  external_reference text not null,
  amount_xof integer not null,
  declared_at timestamptz not null,
  confirmed_by_merchant_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (merchant_id, channel, external_reference),
  constraint direct_payment_amount check (amount_xof > 0)
);
create table public.subscription_plans (
  id text primary key,
  name text not null,
  monthly_price_xof integer not null,
  product_limit integer,
  team_member_limit integer not null default 1,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint plan_price_non_negative check (monthly_price_xof >= 0),
  constraint plan_product_limit_positive check (product_limit is null or product_limit > 0),
  constraint plan_team_limit_positive check (team_member_limit > 0)
);
create table public.merchant_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id) on delete restrict,
  status public.subscription_status not null default 'pending',
  starts_at timestamptz,
  current_period_ends_at timestamptz,
  grace_ends_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create unique index merchant_one_open_subscription
  on public.merchant_subscriptions(merchant_id)
  where status in ('pending', 'active', 'grace');
create table public.subscription_payment_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  subscription_id uuid references public.merchant_subscriptions(id) on delete set null,
  plan_id text not null references public.subscription_plans(id) on delete restrict,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  channel public.payment_channel not null,
  external_reference text not null,
  amount_xof integer not null,
  paid_at timestamptz not null,
  status public.payment_submission_status not null default 'pending',
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (channel, external_reference),
  constraint subscription_payment_amount check (amount_xof > 0)
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  merchant_id uuid references public.merchant_accounts(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  request_id uuid,
  ip_hash text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create table public.notification_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  dedupe_key text unique,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  channel text not null,
  template text not null,
  payload jsonb not null,
  status public.notification_status not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint notification_channel check (channel in ('email', 'sms', 'whatsapp', 'in_app')),
  constraint notification_attempts check (attempts >= 0)
);
create table public.webhook_events (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payload_sha256 text not null,
  processed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_event_id)
);
create index merchant_accounts_public_idx
  on public.merchant_accounts(status, verification_status, subscription_status);
create index verification_cases_queue_idx
  on public.verification_cases(status, submitted_at);
create index verification_documents_case_idx
  on public.verification_documents(case_id, document_type, version desc);
create index products_public_idx
  on public.products(status, category_id, published_at desc);
create index products_merchant_idx
  on public.products(merchant_id, status, created_at desc);
create index variants_product_idx on public.product_variants(product_id, active);
create index delivery_zones_merchant_idx on public.delivery_zones(merchant_id, active);
create index quotes_expiry_idx on public.delivery_quotes(buyer_id, expires_at);
create index orders_buyer_idx on public.orders(buyer_id, created_at desc);
create index orders_merchant_idx on public.orders(merchant_id, status, created_at desc);
create index order_events_order_idx on public.order_events(order_id, created_at);
create index subscription_expiry_idx
  on public.merchant_subscriptions(status, current_period_ends_at, grace_ends_at);
create index payment_submissions_queue_idx
  on public.subscription_payment_submissions(status, created_at);
create index audit_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);
create index notification_outbox_queue_idx
  on public.notification_outbox(status, available_at)
  where status in ('pending', 'failed');
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger merchant_accounts_set_updated_at before update on public.merchant_accounts
  for each row execute function public.set_updated_at();
create trigger verification_cases_set_updated_at before update on public.verification_cases
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();
create trigger delivery_methods_set_updated_at before update on public.delivery_methods
  for each row execute function public.set_updated_at();
create trigger delivery_zones_set_updated_at before update on public.delivery_zones
  for each row execute function public.set_updated_at();
create trigger carts_set_updated_at before update on public.carts
  for each row execute function public.set_updated_at();
create trigger cart_items_set_updated_at before update on public.cart_items
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger merchant_subscriptions_set_updated_at before update on public.merchant_subscriptions
  for each row execute function public.set_updated_at();
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone, email, display_name)
  values (
    new.id,
    new.phone,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do update
  set phone = excluded.phone,
      email = excluded.email,
      updated_at = timezone('utc', now());
  return new;
end;
$$;
create trigger auth_user_profile_sync
  after insert or update of phone, email on auth.users
  for each row execute function public.handle_new_auth_user();
commit;
