begin;

create or replace function public.verification_case_is_complete(p_case_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant_accounts%rowtype;
begin
  select ma.*
  into v_merchant
  from public.verification_cases vc
  join public.merchant_accounts ma on ma.id = vc.merchant_id
  where vc.id = p_case_id;

  if v_merchant.id is null then
    return false;
  end if;

  if not public.latest_verification_document_exists(p_case_id, 'national_id_front')
     or not public.latest_verification_document_exists(p_case_id, 'national_id_back')
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

revoke all on function public.verification_case_is_complete(uuid) from public;

commit;
