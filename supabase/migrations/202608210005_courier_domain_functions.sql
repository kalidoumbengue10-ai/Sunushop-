begin;

-- ---------------------------------------------------------------------------
-- Fonctions du domaine livreur : constitution et revue du dossier de
-- vérification, invitation d'un livreur du vivier par une boutique, réponse
-- du livreur à cette invitation.
-- ---------------------------------------------------------------------------

create function public.latest_courier_document_exists(
  p_case_id uuid,
  p_type public.courier_verification_document_type
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courier_verification_documents cvd
    where cvd.case_id = p_case_id
      and cvd.document_type = p_type
      and cvd.status in ('uploaded', 'accepted')
      and cvd.storage_path is not null
  );
$$;

create function public.courier_verification_case_is_complete(p_case_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_courier public.courier_profiles%rowtype;
  v_identity_ok boolean;
begin
  select cp.* into v_courier
  from public.courier_verification_cases cvc
  join public.courier_profiles cp on cp.id = cvc.courier_id
  where cvc.id = p_case_id;

  if v_courier.id is null then
    return false;
  end if;

  v_identity_ok :=
    public.latest_courier_document_exists(p_case_id, 'passport_identity')
    or (
      public.latest_courier_document_exists(p_case_id, 'national_id_front')
      and public.latest_courier_document_exists(p_case_id, 'national_id_back')
    );

  if not v_identity_ok then
    return false;
  end if;

  -- Un véhicule motorisé doit être immatriculé : la carte grise est exigée.
  if v_courier.vehicle_type is not null
     and v_courier.vehicle_type not in ('walking', 'bicycle')
     and not public.latest_courier_document_exists(p_case_id, 'vehicle_registration_document') then
    return false;
  end if;

  return true;
end;
$$;

create function public.submit_courier_verification_case(p_case_id uuid)
returns public.courier_verification_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.courier_verification_cases%rowtype;
  v_courier public.courier_profiles%rowtype;
begin
  select * into v_case from public.courier_verification_cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception using errcode = 'P0002', message = 'COURIER_VERIFICATION_CASE_NOT_FOUND';
  end if;

  select * into v_courier from public.courier_profiles where id = v_case.courier_id;
  if v_courier.user_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_case.status not in ('pending_verification', 'rejected') then
    raise exception using errcode = '22023', message = 'COURIER_VERIFICATION_STATUS_INVALID';
  end if;

  if not public.courier_verification_case_is_complete(p_case_id) then
    raise exception using errcode = '23514', message = 'COURIER_VERIFICATION_DOCUMENTS_INCOMPLETE';
  end if;

  update public.courier_verification_cases
  set submitted_at = timezone('utc', now()),
      status = 'pending_verification',
      courier_message = null
  where id = p_case_id
  returning * into v_case;

  update public.courier_profiles
  set verification_status = 'pending_verification'
  where id = v_case.courier_id;

  insert into public.courier_verification_events (
    case_id, courier_id, actor_id, event_type, from_status, to_status, public_message
  )
  values (
    v_case.id, v_case.courier_id, auth.uid(), 'submitted',
    'pending_verification', 'pending_verification', 'Dossier soumis pour vérification.'
  );

  return v_case;
end;
$$;

create function public.review_courier_verification_case(
  p_case_id uuid,
  p_outcome public.courier_verification_status,
  p_decision_code text default null,
  p_courier_message text default null,
  p_internal_note text default null
)
returns public.courier_verification_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.courier_verification_cases%rowtype;
begin
  if not (
    public.has_admin_role(array['reviewer', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_AAL2_REQUIRED';
  end if;

  if p_outcome not in ('verified', 'rejected', 'suspended') then
    raise exception using errcode = '22023', message = 'COURIER_VERIFICATION_OUTCOME_INVALID';
  end if;

  select * into v_case from public.courier_verification_cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception using errcode = 'P0002', message = 'COURIER_VERIFICATION_CASE_NOT_FOUND';
  end if;

  update public.courier_verification_cases
  set status = p_outcome,
      decided_at = timezone('utc', now()),
      decision_code = p_decision_code,
      courier_message = p_courier_message,
      internal_note = coalesce(p_internal_note, internal_note),
      assigned_reviewer_id = coalesce(assigned_reviewer_id, auth.uid())
  where id = p_case_id
  returning * into v_case;

  update public.courier_profiles
  set verification_status = p_outcome,
      verified_at = case when p_outcome = 'verified' then timezone('utc', now()) else verified_at end
  where id = v_case.courier_id;

  insert into public.courier_verification_events (
    case_id, courier_id, actor_id, event_type, from_status, to_status, public_message
  )
  values (
    v_case.id, v_case.courier_id, auth.uid(), 'reviewed',
    'pending_verification', p_outcome, p_courier_message
  );

  return v_case;
end;
$$;

create function public.create_courier_membership_invitation(
  p_merchant_id uuid,
  p_courier_profile_id uuid
)
returns public.courier_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier public.courier_profiles%rowtype;
  v_membership public.courier_memberships%rowtype;
begin
  if not public.is_merchant_member(
    p_merchant_id,
    array['owner', 'manager', 'fulfillment']::public.merchant_member_role[]
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into v_courier from public.courier_profiles where id = p_courier_profile_id;
  if v_courier.id is null then
    raise exception using errcode = 'P0002', message = 'COURIER_NOT_FOUND';
  end if;

  if v_courier.verification_status <> 'verified' then
    raise exception using errcode = '22023', message = 'COURIER_NOT_VERIFIED';
  end if;

  select * into v_membership
  from public.courier_memberships
  where merchant_id = p_merchant_id and courier_user_id = v_courier.user_id;

  if v_membership.id is not null then
    raise exception using errcode = '23505', message = 'COURIER_ALREADY_LINKED';
  end if;

  insert into public.courier_memberships (
    merchant_id, courier_user_id, courier_profile_id, display_name, phone, email,
    vehicle_type, vehicle_registration, photo_storage_path,
    wave_payment_number, orange_money_payment_number, preferred_payment_channel,
    status, invited_by, invited_at, accepted_at
  )
  values (
    p_merchant_id, v_courier.user_id, v_courier.id, v_courier.display_name, v_courier.phone,
    v_courier.email, v_courier.vehicle_type::text, v_courier.vehicle_registration,
    v_courier.photo_storage_path, v_courier.wave_payment_number,
    v_courier.orange_money_payment_number, v_courier.preferred_payment_channel,
    'pending_invitation', auth.uid(), timezone('utc', now()), null
  )
  returning * into v_membership;

  return v_membership;
end;
$$;

create function public.respond_to_courier_invitation(
  p_membership_id uuid,
  p_accept boolean
)
returns public.courier_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.courier_memberships%rowtype;
begin
  select cm.* into v_membership
  from public.courier_memberships cm
  join public.courier_profiles cp on cp.id = cm.courier_profile_id
  where cm.id = p_membership_id and cp.user_id = auth.uid()
  for update of cm;

  if v_membership.id is null then
    raise exception using errcode = 'P0002', message = 'COURIER_INVITATION_NOT_FOUND';
  end if;

  if v_membership.status <> 'pending_invitation' then
    raise exception using errcode = '22023', message = 'COURIER_INVITATION_ALREADY_ANSWERED';
  end if;

  if not p_accept then
    -- Une invitation refusée n'a pas de valeur informative à conserver,
    -- contrairement à un accès désactivé qui documente une collaboration réelle.
    delete from public.courier_memberships where id = p_membership_id;
    return v_membership;
  end if;

  update public.courier_memberships
  set status = 'active',
      accepted_at = timezone('utc', now()),
      responded_at = timezone('utc', now())
  where id = p_membership_id
  returning * into v_membership;

  return v_membership;
end;
$$;

revoke all on function public.latest_courier_document_exists(uuid, public.courier_verification_document_type) from public;
revoke all on function public.courier_verification_case_is_complete(uuid) from public;
revoke all on function public.submit_courier_verification_case(uuid) from public;
revoke all on function public.review_courier_verification_case(uuid, public.courier_verification_status, text, text, text) from public;
revoke all on function public.create_courier_membership_invitation(uuid, uuid) from public;
revoke all on function public.respond_to_courier_invitation(uuid, boolean) from public;

grant execute on function public.submit_courier_verification_case(uuid) to authenticated;
grant execute on function public.review_courier_verification_case(uuid, public.courier_verification_status, text, text, text) to authenticated;
grant execute on function public.create_courier_membership_invitation(uuid, uuid) to authenticated;
grant execute on function public.respond_to_courier_invitation(uuid, boolean) to authenticated;

commit;
