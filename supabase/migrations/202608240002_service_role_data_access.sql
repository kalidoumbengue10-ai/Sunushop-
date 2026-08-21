-- Les migrations locales sont exécutées par `postgres`. Sans ACL explicite,
-- les tables créées dans `public` ne donnent au rôle serveur que les droits
-- DDL hérités de Supabase (pas SELECT/INSERT/UPDATE/DELETE). Les routes backend
-- utilisant la clé service-role deviennent alors inutilisables après un reset.
begin;

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to service_role;

-- Ces prédicats `security definer` sont utilisés par les policies et par les
-- RPC métier. Ils ne révèlent aucune ligne, mais leur droit EXECUTE est requis
-- pour que le rôle authentifié puisse évaluer ses propres capacités.
grant execute on function public.is_merchant_member(uuid, public.merchant_member_role[])
  to authenticated, service_role;
grant execute on function public.has_admin_role(public.admin_role_kind[])
  to authenticated, service_role;

-- Plusieurs migrations ont ajouté des policies après le durcissement global
-- des ACL sans rétablir les privilèges SQL correspondants. RLS reste la source
-- d'autorisation ligne par ligne ; ces grants rendent simplement les policies
-- effectivement atteignables.
grant select, insert, update on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, delete on public.shop_follows to authenticated;
grant select on public.courier_payouts, public.courier_payout_deliveries,
  public.delivery_disputes, public.delivery_dispute_events,
  public.verification_reviews to authenticated;

-- Ces écritures financières restent obligatoirement derrière les RPC dédiées.
revoke insert, update, delete on public.payment_intents,
  public.payment_escrows, public.merchant_payouts from service_role;
grant select on public.payment_intents, public.payment_escrows,
  public.merchant_payouts to service_role;

commit;
