-- Un marchand ou un membre du support doit pouvoir identifier l'acheteur
-- (nom, email, téléphone) sur les fils qu'il est autorisé à consulter.
-- La policy profiles_select_own ne couvrait que le propriétaire du profil ;
-- ce trou empêchait déjà l'affichage de l'identité de l'acheteur dans
-- /messages côté marchand/admin.

begin;

create policy profiles_select_conversation_counterparty
  on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.buyer_id = profiles.id
        and (
          (c.merchant_id is not null and public.is_merchant_member(c.merchant_id, null))
          or (
            c.kind = 'buyer_support'
            and public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
            and public.has_aal2()
          )
        )
    )
  );

commit;
