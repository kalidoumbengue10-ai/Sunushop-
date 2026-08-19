begin;

-- Le rejet DELIVERY_REGION_MISMATCH pouvait se produire même quand la région
-- affichée côté zone et côté destinataire semblait identique : la comparaison
-- brute (lower/trim) ne neutralise pas les variantes d'accentuation Unicode
-- (ex. "é" composé vs décomposé) ni les espaces insécables. On normalise avec
-- NFKC en plus du lower/trim, et on remonte les valeurs comparées dans le
-- message d'erreur pour pouvoir diagnostiquer tout futur cas résiduel.
create or replace function public.validate_order_geolocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latitude numeric;
  v_longitude numeric;
  v_shop public.merchant_accounts%rowtype;
  v_zone_region text;
  v_recipient_region text;
begin
  if coalesce(new.delivery_snapshot ->> 'methodKind', 'merchant_delivery') = 'pickup' then
    return new;
  end if;

  if coalesce(jsonb_typeof(new.recipient_snapshot -> 'latitude'), 'null') <> 'number'
     or coalesce(jsonb_typeof(new.recipient_snapshot -> 'longitude'), 'null') <> 'number' then
    raise exception using errcode = '23514', message = 'DELIVERY_DESTINATION_REQUIRED';
  end if;

  v_latitude := (new.recipient_snapshot ->> 'latitude')::numeric;
  v_longitude := (new.recipient_snapshot ->> 'longitude')::numeric;
  if v_latitude not between 12 and 17 or v_longitude not between -18 and -11 then
    raise exception using errcode = '23514', message = 'DELIVERY_DESTINATION_INVALID';
  end if;

  v_zone_region := lower(trim(regexp_replace(
    normalize(coalesce(new.delivery_snapshot ->> 'region', ''), nfkc),
    '[[:space:]]+',
    ' ',
    'g'
  )));
  v_recipient_region := lower(trim(regexp_replace(
    normalize(coalesce(new.recipient_snapshot ->> 'region', ''), nfkc),
    '[[:space:]]+',
    ' ',
    'g'
  )));
  if v_zone_region <> v_recipient_region then
    raise exception using
      errcode = '23514',
      message = 'DELIVERY_REGION_MISMATCH',
      detail = format('zone_region=%s recipient_region=%s', v_zone_region, v_recipient_region);
  end if;

  select * into v_shop from public.merchant_accounts where id = new.merchant_id;
  if v_shop.pickup_latitude is null or v_shop.pickup_longitude is null then
    raise exception using errcode = '23514', message = 'SHOP_LOCATION_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_order_geolocation() from public;

commit;
