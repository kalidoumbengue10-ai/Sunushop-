-- Messagerie : un acheteur peut discuter avec un marchand (rattaché ou non à
-- une commande/un produit) ou avec le support SunuShop. Le temps réel n'est
-- consommé que sur un fil ouvert (filtré par conversation_id côté client),
-- afin de rester dans les quotas Supabase Free.

begin;

create type public.conversation_kind as enum ('buyer_merchant', 'buyer_support');
create type public.message_sender_role as enum ('buyer', 'merchant', 'admin');

create table public.conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  kind public.conversation_kind not null,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  merchant_id uuid references public.merchant_accounts(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  subject text,
  last_message_at timestamptz not null default timezone('utc', now()),
  buyer_last_read_at timestamptz,
  merchant_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint conversation_merchant_required check (
    (kind = 'buyer_merchant' and merchant_id is not null)
    or (kind = 'buyer_support' and merchant_id is null)
  )
);

create index conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index conversations_merchant_idx on public.conversations (merchant_id, last_message_at desc) where merchant_id is not null;
create index conversations_support_idx on public.conversations (last_message_at desc) where kind = 'buyer_support';

create table public.messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  sender_role public.message_sender_role not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default timezone('utc', now())
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

create function public.touch_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_last_message();

-- Un acheteur (ou marchand) ne peut ouvrir qu'un seul fil support / marchand
-- par contexte : évite la prolifération de fils dupliqués pour la même paire.
create unique index conversations_support_unique
  on public.conversations (buyer_id)
  where kind = 'buyer_support';
create unique index conversations_merchant_context_unique
  on public.conversations (buyer_id, merchant_id, coalesce(order_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where kind = 'buyer_merchant';

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy conversations_buyer_access
  on public.conversations for select to authenticated
  using (buyer_id = (select auth.uid()));

create policy conversations_merchant_access
  on public.conversations for select to authenticated
  using (merchant_id is not null and public.is_merchant_member(merchant_id, null));

create policy conversations_admin_support_access
  on public.conversations for select to authenticated
  using (
    kind = 'buyer_support'
    and public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  );

create policy conversations_buyer_insert
  on public.conversations for insert to authenticated
  with check (buyer_id = (select auth.uid()));

create policy conversations_buyer_update_read
  on public.conversations for update to authenticated
  using (buyer_id = (select auth.uid()))
  with check (buyer_id = (select auth.uid()));

create policy conversations_merchant_update_read
  on public.conversations for update to authenticated
  using (merchant_id is not null and public.is_merchant_member(merchant_id, null))
  with check (merchant_id is not null and public.is_merchant_member(merchant_id, null));

create policy conversations_admin_update_read
  on public.conversations for update to authenticated
  using (
    kind = 'buyer_support'
    and public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  )
  with check (
    kind = 'buyer_support'
    and public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  );

create policy messages_read_via_conversation
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (
          c.buyer_id = (select auth.uid())
          or (c.merchant_id is not null and public.is_merchant_member(c.merchant_id, null))
          or (
            c.kind = 'buyer_support'
            and public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
            and public.has_aal2()
          )
        )
    )
  );

create policy messages_insert_via_conversation
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (
          (c.buyer_id = (select auth.uid()) and sender_role = 'buyer')
          or (c.merchant_id is not null and public.is_merchant_member(c.merchant_id, null) and sender_role = 'merchant')
          or (
            c.kind = 'buyer_support'
            and public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
            and public.has_aal2()
            and sender_role = 'admin'
          )
        )
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

commit;
