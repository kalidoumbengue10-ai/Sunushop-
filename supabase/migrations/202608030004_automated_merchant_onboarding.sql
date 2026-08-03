begin;

alter table public.workspace_invitations
  alter column invited_by drop not null;

create or replace function public.enforce_approved_merchant_workspace_write()
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

  if not exists (
    select 1
    from public.merchant_accounts ma
    where ma.id = new.merchant_id
      and ma.verification_status = 'approved'
  ) then
    raise exception using errcode = '42501', message = 'KYC_APPROVAL_REQUIRED';
  end if;

  return new;
end;
$$;

create trigger products_require_approved_merchant
  before insert or update on public.products
  for each row execute function public.enforce_approved_merchant_workspace_write();

create trigger delivery_methods_require_approved_merchant
  before insert or update on public.delivery_methods
  for each row execute function public.enforce_approved_merchant_workspace_write();

create trigger delivery_zones_require_approved_merchant
  before insert or update on public.delivery_zones
  for each row execute function public.enforce_approved_merchant_workspace_write();

create trigger subscription_payments_require_approved_merchant
  before insert or update on public.subscription_payment_submissions
  for each row execute function public.enforce_approved_merchant_workspace_write();

revoke all on function public.enforce_approved_merchant_workspace_write() from public;

commit;
