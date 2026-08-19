begin;

-- Permet au commerçant d'enregistrer directement un livreur (fiche
-- immédiatement sélectionnable pour une affectation) avant même que ce
-- dernier ait activé son compte via le lien d'invitation par email.
alter table public.courier_memberships
  alter column courier_user_id drop not null;

-- Une seule fiche pré-enregistrée (non activée) par email et par boutique.
-- email est de type extensions.citext : l'unicité est déjà insensible à la
-- casse. L'unicité des livreurs déjà activés reste assurée par la
-- contrainte native unique (merchant_id, courier_user_id).
create unique index courier_memberships_merchant_pending_email_idx
  on public.courier_memberships (merchant_id, email)
  where email is not null and courier_user_id is null;

commit;
