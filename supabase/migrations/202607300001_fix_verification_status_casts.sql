begin;
create or replace function public.submit_verification_case(p_case_id uuid)
returns public.verification_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.verification_cases%rowtype;
  v_next_status public.verification_status;
begin
  select *
  into v_case
  from public.verification_cases
  where id = p_case_id
  for update;

  if v_case.id is null then
    raise exception using errcode = 'P0002', message = 'VERIFICATION_CASE_NOT_FOUND';
  end if;

  if not public.is_merchant_member(
    v_case.merchant_id,
    array['owner', 'manager']::public.merchant_member_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_case.status not in ('draft', 'needs_changes') then
    raise exception using errcode = '22023', message = 'INVALID_VERIFICATION_STATUS';
  end if;

  if not public.verification_case_is_complete(p_case_id) then
    raise exception using errcode = '23514', message = 'VERIFICATION_DOCUMENTS_INCOMPLETE';
  end if;

  v_next_status := case
    when v_case.status = 'needs_changes'
      then 'resubmitted'::public.verification_status
    else 'submitted'::public.verification_status
  end;

  update public.verification_cases
  set status = v_next_status,
      submission_version = submission_version
        + case when v_next_status = 'resubmitted' then 1 else 0 end,
      submitted_at = timezone('utc', now()),
      merchant_note = null
  where id = p_case_id
  returning * into v_case;

  update public.merchant_accounts
  set status = 'pending',
      verification_status = v_next_status
  where id = v_case.merchant_id;

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
    v_case.id,
    v_case.merchant_id,
    auth.uid(),
    'case_submitted',
    case
      when v_next_status = 'resubmitted'
        then 'needs_changes'::public.verification_status
      else 'draft'::public.verification_status
    end,
    v_next_status,
    'Votre dossier a été transmis à l’équipe SunuShop.'
  );

  insert into public.audit_events (
    actor_id,
    merchant_id,
    action,
    entity_type,
    entity_id
  )
  values (
    auth.uid(),
    v_case.merchant_id,
    'verification.submit',
    'verification_case',
    v_case.id::text
  );

  return v_case;
end;
$$;
revoke all on function public.submit_verification_case(uuid) from public;
grant execute on function public.submit_verification_case(uuid) to authenticated;
commit;
