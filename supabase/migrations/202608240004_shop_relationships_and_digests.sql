begin;

-- Les favoris sont un marque-page prive, distinct de l'abonnement aux
-- nouveautes porte par shop_follows.
create table public.shop_favorites (
  id uuid primary key default extensions.gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (buyer_id, merchant_id)
);

create index shop_favorites_buyer_idx
  on public.shop_favorites(buyer_id, created_at desc);
create index shop_favorites_merchant_idx on public.shop_favorites(merchant_id);
create index if not exists shop_follows_merchant_idx on public.shop_follows(merchant_id);

alter table public.shop_favorites enable row level security;

create policy shop_favorites_owner_all
  on public.shop_favorites for all to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

grant select, insert, delete on public.shop_favorites to authenticated;
grant select, insert, update, delete on public.shop_favorites to service_role;

-- Le coeur historique representait a la fois le favori et le suivi. On garde
-- donc le suivi et on le duplique dans les favoris sans perdre de donnees.
insert into public.shop_favorites (buyer_id, merchant_id, created_at)
select buyer_id, merchant_id, created_at
from public.shop_follows
on conflict (buyer_id, merchant_id) do nothing;

-- Registre immuable de premiere diffusion : une republication ne doit jamais
-- notifier une seconde fois les abonnes.
create table public.shop_follow_product_broadcasts (
  product_id uuid primary key references public.products(id) on delete cascade,
  merchant_id uuid not null references public.merchant_accounts(id) on delete cascade,
  broadcasted_at timestamptz not null default timezone('utc', now())
);

alter table public.shop_follow_product_broadcasts enable row level security;
grant select, insert, update, delete on public.shop_follow_product_broadcasts to service_role;

create function public.queue_shop_follow_product_digest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
  v_send_at timestamptz;
  v_merchant_name text;
  v_merchant_slug text;
begin
  if new.status <> 'published'::public.product_status then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published'::public.product_status then
    return new;
  end if;

  insert into public.shop_follow_product_broadcasts(product_id, merchant_id)
  values (new.id, new.merchant_id)
  on conflict (product_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return new;
  end if;

  select public_name::text, slug::text
  into v_merchant_name, v_merchant_slug
  from public.merchant_accounts
  where id = new.merchant_id;

  -- Le cron Vercel s'execute chaque jour a 08:00 UTC. Une publication faite
  -- apres ce passage est rattachee au digest du lendemain.
  v_send_at := (date_trunc('day', now() at time zone 'utc') + interval '8 hours') at time zone 'utc';
  if v_send_at <= now() then
    v_send_at := v_send_at + interval '1 day';
  end if;

  insert into public.notification_outbox (
    dedupe_key,
    recipient_user_id,
    channel,
    template,
    payload,
    available_at
  )
  select
    'shop-follow-digest:' || sf.id::text || ':' || to_char(v_send_at at time zone 'utc', 'YYYY-MM-DD'),
    sf.buyer_id,
    'email',
    'shop_product_digest',
    jsonb_build_object(
      'to', p.email::text,
      'followId', sf.id,
      'merchantId', new.merchant_id,
      'shopName', v_merchant_name,
      'shopSlug', v_merchant_slug,
      'products', jsonb_build_array(jsonb_build_object(
        'id', new.id,
        'title', new.title,
        'slug', new.slug::text
      ))
    ),
    v_send_at
  from public.shop_follows sf
  join public.profiles p on p.id = sf.buyer_id
  where sf.merchant_id = new.merchant_id
    and p.email is not null
  on conflict (dedupe_key) do update
  set
    payload = jsonb_set(
      public.notification_outbox.payload,
      '{products}',
      coalesce(public.notification_outbox.payload -> 'products', '[]'::jsonb)
        || coalesce(excluded.payload -> 'products', '[]'::jsonb)
    ),
    available_at = least(public.notification_outbox.available_at, excluded.available_at)
  where public.notification_outbox.status in ('pending', 'failed')
    and public.notification_outbox.suppressed_at is null;

  return new;
end;
$$;

revoke all on function public.queue_shop_follow_product_digest() from public;
grant execute on function public.queue_shop_follow_product_digest() to service_role, authenticated;

create trigger products_queue_shop_follow_digest
after insert or update of status on public.products
for each row execute function public.queue_shop_follow_product_digest();

commit;
