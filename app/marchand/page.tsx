import { redirect } from "next/navigation";
import { MerchantWorkspace } from "@/components/merchant-workspace";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { pilotConfig } from "@/lib/config/env";
import {
  getAdminSupabase,
  getServerSupabase,
} from "@/lib/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

export default async function MarchandPage() {
  const supabase = await getServerSupabase();
  if (!supabase) {
    return (
      <MvpShell>
        <main className="mvp-main">
          <div className="mvp-shell">
            <SetupRequired />
          </div>
        </main>
      </MvpShell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/marchand");

  const { data: membership } = await supabase
    .from("merchant_members")
    .select("merchant_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const admin = getAdminSupabase();
  const { data: merchant } =
    membership && admin
      ? await admin
          .from("merchant_accounts")
          .select(
            "id, kind, public_name, slug, status, verification_status, subscription_status, representative_is_legal_owner, wave_payment_number, orange_money_payment_number",
          )
          .eq("id", membership.merchant_id)
          .single()
      : { data: null };

  const categoriesPromise = supabase
    .from("categories")
    .select("id, name")
    .eq("active", true)
    .order("position");
  const plansPromise = supabase
    .from("subscription_plans")
    .select("id, name, monthly_price_xof, product_limit")
    .eq("active", true)
    .order("position");

  if (!merchant) {
    const [{ data: categories }, { data: plans }] = await Promise.all([
      categoriesPromise,
      plansPromise,
    ]);
    return (
      <MvpShell>
        <main className="mvp-main">
          <div className="mvp-shell">
            <MerchantWorkspace
              merchant={null}
              verificationCase={null}
              documents={[]}
              categories={categories ?? []}
              plans={plans ?? []}
              products={[]}
              zones={[]}
              subscription={null}
              payments={[]}
              orders={[]}
              notifications={[]}
              subscriptionPaymentNumbers={{
                wave: pilotConfig.waveMerchantNumber || null,
                orangeMoney: pilotConfig.orangeMoneyMerchantNumber || null,
              }}
            />
          </div>
        </main>
      </MvpShell>
    );
  }

  const [
    { data: verificationCase },
    { data: documents },
    { data: categories },
    { data: plans },
    { data: products },
    { data: zones },
    { data: subscription },
    { data: payments },
    { data: orders },
    { data: notifications },
  ] = await Promise.all([
    admin!
      .from("verification_cases")
      .select("id, status, merchant_note")
      .eq("merchant_id", merchant.id)
      .order("submission_version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin!
      .from("verification_documents")
      .select("id, document_type, version, status, uploaded_at")
      .eq("merchant_id", merchant.id)
      .order("version", { ascending: false }),
    categoriesPromise,
    plansPromise,
    admin!
      .from("products")
      .select(
        "id, title, status, product_media(id, storage_path), product_variants(id, sku, price_xof, inventory_items(available_quantity, reserved_quantity))",
      )
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false }),
    admin!
      .from("delivery_zones")
      .select(
        "id, label, region, city, fee_xof, min_delay_minutes, max_delay_minutes",
      )
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false }),
    admin!
      .from("merchant_subscriptions")
      .select("plan_id, status, current_period_ends_at, grace_ends_at")
      .eq("merchant_id", merchant.id)
      .in("status", ["pending", "active", "grace"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin!
      .from("subscription_payment_submissions")
      .select(
        "id, plan_id, channel, external_reference, amount_xof, status, created_at",
      )
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false }),
    admin!
      .from("orders")
      .select(
        "id, public_code, status, total_xof, created_at, direct_payment_declarations(id, external_reference, confirmed_by_merchant_at)",
      )
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("notification_outbox")
      .select("id, template, payload, created_at")
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <MerchantWorkspace
            merchant={merchant}
            verificationCase={verificationCase}
            documents={documents ?? []}
            categories={categories ?? []}
            plans={plans ?? []}
            products={products ?? []}
            zones={zones ?? []}
            subscription={subscription}
            payments={payments ?? []}
            orders={orders ?? []}
            notifications={notifications ?? []}
            subscriptionPaymentNumbers={{
              wave: pilotConfig.waveMerchantNumber || null,
              orangeMoney: pilotConfig.orangeMoneyMerchantNumber || null,
            }}
          />
        </div>
      </main>
    </MvpShell>
  );
}
