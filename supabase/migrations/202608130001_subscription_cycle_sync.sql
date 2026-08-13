begin;

-- Le tarif Essentiel est la référence mensuelle de l'offre de base.
-- Les montants trimestriels et annuels sont toujours dérivés de ce tarif.
update public.subscription_plans
set monthly_price_xof = 4900
where id = 'essential';

create or replace function public.subscription_cycle_months(p_billing_cycle text)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select case p_billing_cycle
    when 'monthly' then 1
    when 'quarterly' then 3
    when 'annual' then 12
    else null
  end
$$;

-- Empêche qu'un cycle et sa durée soient enregistrés avec des valeurs différentes.
alter table public.subscription_payment_submissions
  add constraint subscription_submission_cycle_months_match
  check (period_months = public.subscription_cycle_months(billing_cycle))
  not valid;

alter table public.subscription_billing_periods
  add constraint subscription_billing_cycle_months_match
  check (period_months = public.subscription_cycle_months(billing_cycle))
  not valid;

-- Les nouvelles lignes sont contrôlées immédiatement. Les éventuelles anciennes
-- lignes incohérentes restent consultables et pourront être régularisées séparément.

commit;
