import { redirect } from "next/navigation";
import Link from "next/link";
import { MerchantWorkspace } from "@/components/merchant-workspace";
import { CourierWorkspace } from "@/components/courier-workspace";
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
  if (!user) redirect("/connexion?profil=vendeur&next=/marchand");

  const { data: membership } = await supabase
    .from("merchant_members")
    .select("merchant_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const { data: courierMembership } = await supabase
    .from("courier_memberships")
    .select("id")
    .eq("courier_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership && courierMembership) {
    return (
      <MvpShell>
        <main className="mvp-main"><div className="mvp-shell"><CourierWorkspace /></div></main>
      </MvpShell>
    );
  }

  const admin = getAdminSupabase();
  if (!membership && !courierMembership && user.email && admin) {
    const { data: pendingInvitation } = await admin
      .from("workspace_invitations")
      .select("id")
      .eq("kind", "merchant_owner")
      .eq("email", user.email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (pendingInvitation) {
      const { data: notification } = await admin
        .from("notification_outbox")
        .select("payload")
        .eq("dedupe_key", `merchant-invitation:${pendingInvitation.id}`)
        .maybeSingle();
      const invitationUrl = (notification?.payload as { url?: string } | null)?.url;
      if (invitationUrl) {
        const next = new URL(invitationUrl).searchParams.get("next");
        if (next?.startsWith("/invitations/claim?token=")) redirect(next);
      }
    }
  }
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
    return (
      <MvpShell>
        <main className="mvp-main">
          <div className="mvp-shell">
            <section className="mvp-card mvp-card--full access-required-card">
              <span className="mvp-eyebrow">Accès sur invitation</span>
              <h1 className="mvp-title">Aucun commerce ni mission ne vous est encore associé.</h1>
              <p className="mvp-lede">Un compte commerçant est ouvert seulement après étude du dossier. Un accès livreur est créé par le commerçant qui vous confie ses livraisons.</p>
              <div className="mvp-actions"><Link className="mvp-button" href="/devenir-marchand">Déposer une candidature</Link><Link className="mvp-button mvp-button--secondary" href="/">Retour à l’accueil</Link></div>
            </section>
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
