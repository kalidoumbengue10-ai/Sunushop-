begin;

-- Le CRM devient un pipeline minimal (voir composants admin) et gagne la
-- suppression de prospects. La suppression réelle d'une fiche liée à une
-- boutique existante est bloquée : dans ce cas on suspend la boutique
-- plutôt que d'orpheliner ses données.

grant delete on public.crm_leads to authenticated;

create function public.block_crm_lead_delete_when_linked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.merchant_id is not null then
    raise exception using errcode = '42501', message = 'CRM_LEAD_LINKED_TO_MERCHANT';
  end if;
  return old;
end;
$$;

create trigger crm_leads_block_delete_when_linked
  before delete on public.crm_leads
  for each row execute function public.block_crm_lead_delete_when_linked();

revoke all on function public.block_crm_lead_delete_when_linked() from public;

-- Relances retirées de l'interface (pipeline minimal : « À traiter » /
-- « Boutique ouverte »). La table est conservée pour l'historique.
comment on table public.crm_tasks is 'Déprécié — relances retirées de l''interface. Conservé pour l''historique.';

commit;
