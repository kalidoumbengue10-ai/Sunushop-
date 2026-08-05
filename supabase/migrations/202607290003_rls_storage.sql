begin;
alter table public.profiles enable row level security;
alter table public.merchant_accounts enable row level security;
alter table public.merchant_members enable row level security;
alter table public.admin_roles enable row level security;
alter table public.verification_cases enable row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_reviews enable row level security;
alter table public.verification_events enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_items enable row level security;
alter table public.product_media enable row level security;
alter table public.delivery_methods enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.delivery_quotes enable row level security;
alter table public.order_batches enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.direct_payment_declarations enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.merchant_subscriptions enable row level security;
alter table public.subscription_payment_submissions enable row level security;
alter table public.audit_events enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.webhook_events enable row level security;
create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy merchant_accounts_public_read
  on public.merchant_accounts for select to anon, authenticated
  using (
    status = 'active'
    and verification_status = 'approved'
    and subscription_status in ('active', 'grace')
  );
create policy merchant_accounts_member_read
  on public.merchant_accounts for select to authenticated
  using (public.is_merchant_member(id, null));
create policy merchant_accounts_admin_read
  on public.merchant_accounts for select to authenticated
  using (public.has_admin_role(null) and public.has_aal2());
create policy merchant_members_read_own_memberships
  on public.merchant_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_merchant_member(merchant_id, array['owner', 'manager']::public.merchant_member_role[])
    or (public.has_admin_role(null) and public.has_aal2())
  );
create policy admin_roles_read_own
  on public.admin_roles for select to authenticated
  using (user_id = (select auth.uid()));
create policy verification_cases_member_read
  on public.verification_cases for select to authenticated
  using (
    public.is_merchant_member(merchant_id, null)
    or (
      (
        public.has_admin_role(array['admin']::public.admin_role_kind[])
        or (
          public.has_admin_role(array['reviewer']::public.admin_role_kind[])
          and (
            assigned_reviewer_id is null
            or assigned_reviewer_id = (select auth.uid())
          )
        )
      )
      and public.has_aal2()
    )
  );
create policy verification_documents_member_read
  on public.verification_documents for select to authenticated
  using (
    public.is_merchant_member(merchant_id, null)
    or (
      (
        public.has_admin_role(array['admin']::public.admin_role_kind[])
        or exists (
          select 1
          from public.verification_cases vc
          where vc.id = verification_documents.case_id
            and (
              vc.assigned_reviewer_id is null
              or vc.assigned_reviewer_id = (select auth.uid())
            )
            and public.has_admin_role(array['reviewer']::public.admin_role_kind[])
        )
      )
      and public.has_aal2()
    )
  );
create policy verification_reviews_reviewer_read
  on public.verification_reviews for select to authenticated
  using (
    public.has_admin_role(array['reviewer', 'admin']::public.admin_role_kind[])
    and public.has_aal2()
  );
create policy verification_events_member_read
  on public.verification_events for select to authenticated
  using (
    public.is_merchant_member(merchant_id, null)
    or (
      (
        public.has_admin_role(array['admin']::public.admin_role_kind[])
        or exists (
          select 1
          from public.verification_cases vc
          where vc.id = verification_events.case_id
            and (
              vc.assigned_reviewer_id is null
              or vc.assigned_reviewer_id = (select auth.uid())
            )
            and public.has_admin_role(array['reviewer']::public.admin_role_kind[])
        )
      )
      and public.has_aal2()
    )
  );
create policy categories_public_read
  on public.categories for select to anon, authenticated
  using (active);
create policy products_public_read
  on public.products for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1
      from public.merchant_accounts ma
      where ma.id = products.merchant_id
        and ma.status = 'active'
        and ma.verification_status = 'approved'
        and ma.subscription_status in ('active', 'grace')
    )
  );
create policy products_member_read
  on public.products for select to authenticated
  using (public.is_merchant_member(merchant_id, null));
create policy variants_public_read
  on public.product_variants for select to anon, authenticated
  using (
    active
    and exists (
      select 1
      from public.products p
      join public.merchant_accounts ma on ma.id = p.merchant_id
      where p.id = product_variants.product_id
        and p.status = 'published'
        and ma.status = 'active'
        and ma.verification_status = 'approved'
        and ma.subscription_status in ('active', 'grace')
    )
  );
create policy variants_member_read
  on public.product_variants for select to authenticated
  using (public.is_merchant_member(merchant_id, null));
create policy inventory_public_read
  on public.inventory_items for select to anon, authenticated
  using (
    exists (
      select 1
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      join public.merchant_accounts ma on ma.id = p.merchant_id
      where pv.id = inventory_items.variant_id
        and pv.active
        and p.status = 'published'
        and ma.status = 'active'
        and ma.verification_status = 'approved'
        and ma.subscription_status in ('active', 'grace')
    )
  );
create policy inventory_member_read
  on public.inventory_items for select to authenticated
  using (public.is_merchant_member(merchant_id, null));
create policy product_media_public_read
  on public.product_media for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.merchant_accounts ma on ma.id = p.merchant_id
      where p.id = product_media.product_id
        and p.status = 'published'
        and ma.status = 'active'
        and ma.verification_status = 'approved'
        and ma.subscription_status in ('active', 'grace')
    )
  );
create policy product_media_member_read
  on public.product_media for select to authenticated
  using (public.is_merchant_member(merchant_id, null));
create policy delivery_methods_public_read
  on public.delivery_methods for select to anon, authenticated
  using (
    active
    and exists (
      select 1 from public.merchant_accounts ma
      where ma.id = delivery_methods.merchant_id
        and ma.status = 'active'
        and ma.verification_status = 'approved'
        and ma.subscription_status in ('active', 'grace')
    )
  );
create policy delivery_methods_member_read
  on public.delivery_methods for select to authenticated
  using (public.is_merchant_member(merchant_id, null));
create policy delivery_zones_public_read
  on public.delivery_zones for select to anon, authenticated
  using (
    active
    and exists (
      select 1 from public.merchant_accounts ma
      where ma.id = delivery_zones.merchant_id
        and ma.status = 'active'
        and ma.verification_status = 'approved'
        and ma.subscription_status in ('active', 'grace')
    )
  );
create policy delivery_zones_member_read
  on public.delivery_zones for select to authenticated
  using (public.is_merchant_member(merchant_id, null));
create policy carts_owner_read
  on public.carts for select to authenticated
  using (buyer_id = (select auth.uid()));
create policy cart_items_owner_read
  on public.cart_items for select to authenticated
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.buyer_id = (select auth.uid())
    )
  );
create policy quotes_owner_read
  on public.delivery_quotes for select to authenticated
  using (buyer_id = (select auth.uid()));
create policy order_batches_buyer_read
  on public.order_batches for select to authenticated
  using (buyer_id = (select auth.uid()));
create policy orders_participant_read
  on public.orders for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or public.is_merchant_member(merchant_id, null)
    or (
      public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
      and public.has_aal2()
    )
  );
create policy order_items_participant_read
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          o.buyer_id = (select auth.uid())
          or public.is_merchant_member(o.merchant_id, null)
          or (
            public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
            and public.has_aal2()
          )
        )
    )
  );
create policy order_events_participant_read
  on public.order_events for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_events.order_id
        and (
          o.buyer_id = (select auth.uid())
          or public.is_merchant_member(o.merchant_id, null)
          or (
            public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
            and public.has_aal2()
          )
        )
    )
  );
create policy direct_payments_participant_read
  on public.direct_payment_declarations for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or public.is_merchant_member(merchant_id, null)
    or (
      public.has_admin_role(array['support', 'admin']::public.admin_role_kind[])
      and public.has_aal2()
    )
  );
create policy subscription_plans_public_read
  on public.subscription_plans for select to anon, authenticated
  using (active);
create policy merchant_subscriptions_member_read
  on public.merchant_subscriptions for select to authenticated
  using (
    public.is_merchant_member(merchant_id, null)
    or (
      public.has_admin_role(array['admin']::public.admin_role_kind[])
      and public.has_aal2()
    )
  );
create policy subscription_payments_member_read
  on public.subscription_payment_submissions for select to authenticated
  using (
    public.is_merchant_member(merchant_id, null)
    or (
      public.has_admin_role(array['admin']::public.admin_role_kind[])
      and public.has_aal2()
    )
  );
create policy notifications_owner_read
  on public.notification_outbox for select to authenticated
  using (recipient_user_id = (select auth.uid()));
revoke all on all tables in schema public from anon, authenticated;
grant select on public.categories to anon, authenticated;
grant select (id, public_name, slug, description, region, city, status, verification_status, subscription_status)
  on public.merchant_accounts to anon, authenticated;
grant select on public.products, public.product_variants, public.inventory_items, public.product_media
  to anon, authenticated;
grant select on public.delivery_methods, public.delivery_zones, public.subscription_plans
  to anon, authenticated;
grant select, update (display_name, locale) on public.profiles to authenticated;
grant select on public.merchant_members, public.admin_roles to authenticated;
grant select on public.verification_cases, public.verification_documents, public.verification_events
  to authenticated;
grant select on public.carts, public.cart_items, public.delivery_quotes
  to authenticated;
grant select on public.order_batches, public.orders, public.order_items, public.order_events,
  public.direct_payment_declarations to authenticated;
grant select on public.merchant_subscriptions, public.subscription_payment_submissions
  to authenticated;
grant select on public.notification_outbox to authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'merchant-verification',
  'merchant-verification',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
create policy verification_storage_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'merchant-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_merchant_member(((storage.foldername(name))[2])::uuid, array['owner', 'manager']::public.merchant_member_role[])
  );
create policy verification_storage_delete_draft_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'merchant-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_merchant_member(((storage.foldername(name))[2])::uuid, array['owner', 'manager']::public.merchant_member_role[])
  );
create policy product_media_storage_insert_member
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-media'
    and public.is_merchant_member(((storage.foldername(name))[1])::uuid, array['owner', 'manager', 'catalog']::public.merchant_member_role[])
  );
create policy product_media_storage_update_member
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-media'
    and public.is_merchant_member(((storage.foldername(name))[1])::uuid, array['owner', 'manager', 'catalog']::public.merchant_member_role[])
  );
create policy product_media_storage_delete_member
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-media'
    and public.is_merchant_member(((storage.foldername(name))[1])::uuid, array['owner', 'manager', 'catalog']::public.merchant_member_role[])
  );
revoke all on function public.refresh_subscription_states() from public;
revoke all on function public.latest_verification_document_exists(uuid, public.verification_document_type) from public;
revoke all on function public.verification_case_is_complete(uuid) from public;
revoke all on function public.generate_public_code(text) from public;
grant execute on function public.refresh_subscription_states() to service_role;
commit;
