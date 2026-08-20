begin;

-- ---------------------------------------------------------------------------
-- Dossier de vérification du livreur (CNI + carte grise), en miroir du
-- dossier commerçant mais rattaché à courier_profiles au lieu de
-- merchant_accounts. Tables jumelles plutôt que réutilisation de
-- verification_cases : cette dernière impose merchant_id not null dans toutes
-- ses policies et RPC, qu'un livreur sans boutique ne peut pas satisfaire.
-- ---------------------------------------------------------------------------

create type public.courier_verification_document_type as enum (
  'national_id_front',
  'national_id_back',
  'passport_identity',
  'vehicle_registration_document'
);

create table public.courier_verification_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  courier_id uuid not null references public.courier_profiles(id) on delete cascade,
  submission_version integer not null default 1,
  status public.courier_verification_status not null default 'pending_verification',
  assigned_reviewer_id uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  review_started_at timestamptz,
  decided_at timestamptz,
  decision_code text,
  courier_message text,
  internal_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (courier_id, submission_version),
  constraint courier_verification_submission_version_positive check (submission_version > 0)
);

create table public.courier_verification_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.courier_verification_cases(id) on delete cascade,
  courier_id uuid not null references public.courier_profiles(id) on delete cascade,
  document_type public.courier_verification_document_type not null,
  version integer not null,
  storage_bucket text not null default 'courier-verification',
  storage_path text,
  sha256 text,
  mime_type text not null,
  size_bytes bigint not null,
  status public.verification_document_status not null default 'uploaded',
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  purged_at timestamptz,
  unique (case_id, document_type, version),
  constraint courier_verification_document_size check (size_bytes between 1 and 10485760),
  constraint courier_verification_document_mime check (
    mime_type in ('image/jpeg', 'image/png', 'application/pdf')
  ),
  constraint courier_verification_document_sha check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint courier_verification_document_storage check (
    (status = 'purged' and storage_path is null)
    or (status <> 'purged' and storage_path is not null)
  )
);

create table public.courier_verification_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.courier_verification_cases(id) on delete cascade,
  courier_id uuid not null references public.courier_profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  from_status public.courier_verification_status,
  to_status public.courier_verification_status,
  public_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index courier_verification_cases_courier_idx
  on public.courier_verification_cases (courier_id, submission_version desc);
create index courier_verification_cases_review_idx
  on public.courier_verification_cases (status, submitted_at desc);
create index courier_verification_documents_case_idx
  on public.courier_verification_documents (case_id, document_type, version desc);
create index courier_verification_events_case_idx
  on public.courier_verification_events (case_id, created_at desc);

create trigger courier_verification_cases_set_updated_at
  before update on public.courier_verification_cases
  for each row execute function public.set_updated_at();

alter table public.courier_verification_cases enable row level security;
alter table public.courier_verification_documents enable row level security;
alter table public.courier_verification_events enable row level security;

create policy courier_verification_cases_participant_read
  on public.courier_verification_cases for select to authenticated
  using (
    exists (
      select 1 from public.courier_profiles cp
      where cp.id = courier_id and cp.user_id = (select auth.uid())
    )
    or (
      public.has_admin_role(array['reviewer', 'support', 'admin']::public.admin_role_kind[])
      and public.has_aal2()
    )
  );

create policy courier_verification_documents_participant_read
  on public.courier_verification_documents for select to authenticated
  using (
    exists (
      select 1 from public.courier_profiles cp
      where cp.id = courier_id and cp.user_id = (select auth.uid())
    )
    or (
      public.has_admin_role(array['reviewer', 'support', 'admin']::public.admin_role_kind[])
      and public.has_aal2()
    )
  );

create policy courier_verification_events_participant_read
  on public.courier_verification_events for select to authenticated
  using (
    exists (
      select 1 from public.courier_profiles cp
      where cp.id = courier_id and cp.user_id = (select auth.uid())
    )
    or (
      public.has_admin_role(array['reviewer', 'support', 'admin']::public.admin_role_kind[])
      and public.has_aal2()
    )
  );

grant select on public.courier_verification_cases, public.courier_verification_documents,
  public.courier_verification_events to authenticated;

-- Bucket dédié : courier-profiles est limité aux photos de profil (5 Mo,
-- images seules) et merchant-verification a des policies fondées sur
-- is_merchant_member, qu'un livreur ne satisfait jamais.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-verification',
  'courier-verification',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy courier_verification_storage_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'courier-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy courier_verification_storage_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'courier-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
