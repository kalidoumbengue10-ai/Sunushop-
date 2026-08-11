begin;

alter table public.platform_payment_settings
  add column if not exists payment_link text;
alter table public.platform_payment_settings
  add constraint platform_payment_link_format check (
    payment_link is null or payment_link ~ '^https://pay\.wave\.com/m/[A-Za-z0-9_-]+/c/sn/$'
  );

create or replace function public.set_platform_payment_setting(
  p_channel public.payment_channel, p_payment_number text,
  p_account_holder text, p_active boolean, p_payment_link text default null
)
returns public.platform_payment_settings
language plpgsql
security definer
set search_path = ''
as $$
declare v_setting public.platform_payment_settings%rowtype;
begin
  if not (public.has_admin_role(array['admin']::public.admin_role_kind[]) and public.has_aal2()) then
    raise exception using errcode = '42501', message = 'ADMIN_AAL2_REQUIRED';
  end if;
  if p_channel not in ('wave', 'orange_money') then
    raise exception using errcode = '23514', message = 'PLATFORM_PAYMENT_CHANNEL_INVALID';
  end if;
  insert into public.platform_payment_settings(channel, payment_number, account_holder, active, updated_by, payment_link)
  values (p_channel, p_payment_number, nullif(trim(p_account_holder), ''), p_active, auth.uid(), nullif(trim(p_payment_link), ''))
  on conflict (channel) do update set payment_number = excluded.payment_number,
    account_holder = excluded.account_holder, active = excluded.active,
    payment_link = excluded.payment_link,
    updated_by = auth.uid(), updated_at = timezone('utc', now())
  returning * into v_setting;
  insert into public.audit_events(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform_payment_setting.update', 'platform_payment_setting', p_channel::text,
    jsonb_build_object('active', p_active));
  return v_setting;
end;
$$;

commit;
