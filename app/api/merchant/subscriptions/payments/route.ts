import { requireAdminClient } from "@/lib/api/auth";
import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { subscriptionPaymentSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = subscriptionPaymentSchema.parse(await request.json());
    const { supabase } = await requireActiveMerchantAccess(input.merchantId, ["owner", "manager"]);
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("monthly_price_xof")
      .eq("id", input.planId)
      .eq("active", true)
      .single();
    if (planError) throw planError;
    const periodMonths = input.billingCycle === "monthly" ? 1 : input.billingCycle === "quarterly" ? 3 : 12;
    const amountXof = plan.monthly_price_xof * periodMonths;
    const { data, error } = await supabase.rpc(
      "submit_subscription_payment",
      {
        p_merchant_id: input.merchantId,
        p_plan_id: input.planId,
        p_billing_cycle: input.billingCycle,
        p_channel: input.channel,
        p_external_reference: input.externalReference,
        p_amount_xof: amountXof,
        p_paid_at: input.paidAt,
      },
    );
    if (error) throw error;
    const operationsEmail = process.env.SUNUSHOP_OPERATIONS_NOTIFICATION_EMAIL?.trim() || process.env.SUNUSHOP_CRM_NOTIFICATION_EMAIL?.trim();
    if (operationsEmail) {
      const admin = requireAdminClient();
      const { data: merchant } = await admin.from("merchant_accounts").select("public_name").eq("id", input.merchantId).maybeSingle();
      await enqueueEmail(admin, { dedupeKey: `subscription-payment-submitted:${String(data?.id ?? data)}`, template: "subscription_payment_submitted", to: operationsEmail, payload: { shopName: merchant?.public_name, amountXof, externalReference: input.externalReference } }).catch(() => false);
    }
    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
