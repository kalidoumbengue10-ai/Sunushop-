begin;

-- Filet de sécurité : jusqu'ici, seule la route /api/marchand/inscription
-- créait explicitement une fiche crm_leads avant d'appeler
-- create_merchant_application. Le parcours invitation -> claim
-- (invitations/claim/route.ts) ne crée un lien crm_leads que si
-- l'invitation portait déjà un lead_id, ce qui laisse des comptes
-- marchand entièrement invisibles du CRM (donc jamais soumis à
-- l'activation d'abonnement admin, donc jamais visibles en boutique)
-- quand un admin invite un email sans lead préexistant. On déplace
-- la garantie "un merchant_accounts a toujours une fiche crm_leads
-- liée" dans la RPC elle-même : c'est l'unique point d'insertion en
-- production pour merchant_accounts, donc tout appelant (présent ou
-- futur) en bénéficie automatiquement, de façon atomique.
create or replace function public.create_merchant_application(
  p_kind public.merchant_kind,
  p_public_name text,
  p_slug text,
  p_phone text,
  p_email text default null,
  p_legal_name text default null,
  p_region text default null,
  p_city text default null,
  p_address_hint text default null,
  p_representative_is_legal_owner boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_merchant public.merchant_accounts%rowtype;
  v_case public.verification_cases%rowtype;
  v_email extensions.citext := nullif(trim(p_email), '')::extensions.citext;
  v_lead_id uuid;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if exists (
    select 1
    from public.merchant_members mm
    where mm.user_id = v_user and mm.role = 'owner' and mm.active
  ) then
    raise exception using errcode = '23505', message = 'MERCHANT_APPLICATION_ALREADY_EXISTS';
  end if;

  insert into public.merchant_accounts (
    owner_user_id,
    kind,
    legal_name,
    public_name,
    slug,
    phone,
    email,
    region,
    city,
    address_hint,
    representative_is_legal_owner
  )
  values (
    v_user,
    p_kind,
    nullif(trim(p_legal_name), ''),
    trim(p_public_name),
    lower(trim(p_slug)),
    p_phone,
    v_email,
    nullif(trim(p_region), ''),
    nullif(trim(p_city), ''),
    nullif(trim(p_address_hint), ''),
    p_representative_is_legal_owner
  )
  returning * into v_merchant;

  insert into public.merchant_members (merchant_id, user_id, role)
  values (v_merchant.id, v_user, 'owner');

  insert into public.verification_cases (merchant_id)
  values (v_merchant.id)
  returning * into v_case;

  insert into public.verification_events (
    case_id,
    merchant_id,
    actor_id,
    event_type,
    to_status,
    public_message
  )
  values (
    v_case.id,
    v_merchant.id,
    v_user,
    'case_created',
    'draft',
    'Votre dossier marchand a été créé.'
  );

  -- Filet de sécurité CRM : relie (ou crée) une fiche crm_leads pour que
  -- ce marchand soit trouvable depuis /admin/crm et son abonnement
  -- activable. Ne fait rien de bloquant si aucun email n'est fourni
  -- (cas rare : le lead ne peut pas être dédoublonné sans email, la
  -- boutique reste simplement à découvrir autrement par l'admin).
  if v_email is not null then
    select id into v_lead_id
    from public.crm_leads
    where email = v_email
    limit 1;

    if v_lead_id is null then
      insert into public.crm_leads (
        source, full_name, business_name, email, phone, city,
        status, merchant_id, metadata
      )
      values (
        'merchant_account_safety_net',
        left(trim(p_public_name), 80),
        left(trim(p_public_name), 120),
        v_email,
        p_phone,
        nullif(trim(p_city), ''),
        'onboarding',
        v_merchant.id,
        jsonb_build_object('submittedVia', 'create_merchant_application')
      )
      on conflict (email) do nothing
      returning id into v_lead_id;

      -- Course concurrente rare : une autre transaction a inséré le même
      -- email entre le select et l'insert ci-dessus. On rattache alors
      -- ce merchant à la fiche déjà créée plutôt que d'échouer.
      if v_lead_id is null then
        select id into v_lead_id from public.crm_leads where email = v_email limit 1;
        update public.crm_leads
        set merchant_id = coalesce(merchant_id, v_merchant.id),
            status = case when status = 'new' then 'onboarding' else status end,
            updated_at = timezone('utc', now())
        where id = v_lead_id;
      end if;
    else
      update public.crm_leads
      set merchant_id = coalesce(merchant_id, v_merchant.id),
          status = case when status = 'new' then 'onboarding' else status end,
          updated_at = timezone('utc', now())
      where id = v_lead_id;
    end if;
  end if;

  insert into public.audit_events (actor_id, merchant_id, action, entity_type, entity_id)
  values (v_user, v_merchant.id, 'merchant.create', 'merchant_account', v_merchant.id::text);

  return jsonb_build_object(
    'merchantId', v_merchant.id,
    'caseId', v_case.id,
    'status', v_case.status
  );
end;
$$;

commit;
