begin;

create type public.crm_lead_status as enum (
  'new',
  'contacted',
  'qualified',
  'onboarding',
  'converted',
  'rejected',
  'archived'
);

create type public.crm_lead_priority as enum ('low', 'normal', 'high');

create table public.crm_leads (
  id uuid primary key default extensions.gen_random_uuid(),
  source text not null default 'prelaunch_site',
  full_name text not null,
  business_name text not null,
  email extensions.citext not null unique,
  phone text,
  city text,
  business_type text,
  sales_channel text,
  message text,
  status public.crm_lead_status not null default 'new',
  priority public.crm_lead_priority not null default 'normal',
  owner_user_id uuid references public.profiles(id) on delete set null,
  merchant_id uuid references public.merchant_accounts(id) on delete set null,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  converted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_lead_full_name_length check (char_length(full_name) between 2 and 80),
  constraint crm_lead_business_name_length check (char_length(business_name) between 2 and 120),
  constraint crm_lead_source_length check (char_length(source) between 2 and 80)
);

create table public.crm_lead_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint crm_lead_note_length check (char_length(body) between 2 and 3000)
);

create table public.crm_tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  title text not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_task_title_length check (char_length(title) between 2 and 240)
);

create table public.crm_lead_events (
  id uuid primary key default extensions.gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  from_status public.crm_lead_status,
  to_status public.crm_lead_status,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint crm_event_type_length check (char_length(event_type) between 2 and 80)
);

create index crm_leads_status_updated_idx
  on public.crm_leads (status, updated_at desc);
create index crm_leads_follow_up_idx
  on public.crm_leads (next_follow_up_at)
  where next_follow_up_at is not null and converted_at is null;
create index crm_lead_notes_lead_created_idx
  on public.crm_lead_notes (lead_id, created_at desc);
create index crm_tasks_open_due_idx
  on public.crm_tasks (due_at)
  where completed_at is null;
create index crm_lead_events_lead_created_idx
  on public.crm_lead_events (lead_id, created_at desc);

create trigger crm_leads_set_updated_at before update on public.crm_leads
  for each row execute function public.set_updated_at();
create trigger crm_tasks_set_updated_at before update on public.crm_tasks
  for each row execute function public.set_updated_at();

alter table public.crm_leads enable row level security;
alter table public.crm_lead_notes enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_lead_events enable row level security;

create policy crm_leads_admin_access
  on public.crm_leads for all to authenticated
  using (
    public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  )
  with check (
    public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  );

create policy crm_lead_notes_admin_access
  on public.crm_lead_notes for all to authenticated
  using (
    public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  )
  with check (
    public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  );

create policy crm_tasks_admin_access
  on public.crm_tasks for all to authenticated
  using (
    public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  )
  with check (
    public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  );

create policy crm_lead_events_admin_access
  on public.crm_lead_events for all to authenticated
  using (
    public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  )
  with check (
    public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  );

revoke all on public.crm_leads, public.crm_lead_notes, public.crm_tasks,
  public.crm_lead_events from anon, authenticated;

grant select, insert, update on public.crm_leads, public.crm_lead_notes,
  public.crm_tasks to authenticated;
grant select, insert on public.crm_lead_events to authenticated;

commit;
