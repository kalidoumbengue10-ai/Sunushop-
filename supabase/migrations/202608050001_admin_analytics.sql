-- Métriques administrateur : CA abonnements, unités/valeur produits livrés, top vendeurs, sur une période donnée.
create function public.admin_period_analytics(p_from timestamptz, p_to timestamptz)
returns table (
  subscription_revenue_xof bigint,
  approved_payments_count bigint,
  delivered_units bigint,
  product_revenue_xof bigint,
  top_sellers jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_admin_role(array['admin', 'support']::public.admin_role_kind[])
     or not public.has_aal2() then
    raise exception using errcode = '42501', message = 'ADMIN_MFA_REQUIRED';
  end if;

  return query
  with subscription_payments as (
    select amount_xof
    from public.subscription_payment_submissions
    where status = 'approved'
      and paid_at >= p_from
      and paid_at < p_to
  ),
  delivered_items as (
    select
      o.merchant_id,
      oi.quantity,
      oi.line_total_xof
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.delivered_at is not null
      and o.delivered_at >= p_from
      and o.delivered_at < p_to
      and o.status <> 'disputed'
  ),
  sellers as (
    select
      ma.id as merchant_id,
      ma.public_name as merchant_name,
      coalesce(sum(di.quantity), 0)::bigint as units,
      coalesce(sum(di.line_total_xof), 0)::bigint as revenue_xof
    from delivered_items di
    join public.merchant_accounts ma on ma.id = di.merchant_id
    group by ma.id, ma.public_name
    order by units desc, revenue_xof desc
    limit 10
  )
  select
    coalesce((select sum(amount_xof) from subscription_payments), 0)::bigint,
    coalesce((select count(*) from subscription_payments), 0)::bigint,
    coalesce((select sum(quantity) from delivered_items), 0)::bigint,
    coalesce((select sum(line_total_xof) from delivered_items), 0)::bigint,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'merchantId', merchant_id,
        'merchantName', merchant_name,
        'units', units,
        'revenueXof', revenue_xof
      )) from sellers),
      '[]'::jsonb
    );
end;
$$;

revoke all on function public.admin_period_analytics(timestamptz, timestamptz) from public;
grant execute on function public.admin_period_analytics(timestamptz, timestamptz) to authenticated;
