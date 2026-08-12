import { ApiError } from "@/lib/api/errors";
import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure } from "@/lib/api/response";
import { renderSubscriptionReceiptPdf } from "@/lib/domain/subscription-receipt-pdf";

const channelLabels: Record<string, string> = {
  wave: "Wave",
  orange_money: "Orange Money",
};

const billingCycleLabels: Record<string, string> = {
  monthly: "Mensuelle",
  quarterly: "Trimestrielle",
  annual: "Annuelle",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-SN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Dakar",
  }).format(new Date(value));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    const { admin } = await requireActiveMerchantAccess(merchantId, ["owner", "manager"]);

    const { data: payment, error: paymentError } = await admin
      .from("subscription_payment_submissions")
      .select(
        "id, merchant_id, plan_id, billing_cycle, period_months, channel, destination_number, external_reference, amount_xof, paid_at, status, reviewed_at, merchant_accounts(public_name), subscription_plans(name)",
      )
      .eq("id", id)
      .single();
    if (paymentError) throw paymentError;
    if (payment.merchant_id !== merchantId) {
      throw new ApiError(403, "FORBIDDEN", "Accès marchand requis.");
    }
    if (payment.status !== "approved") {
      throw new ApiError(409, "PAYMENT_ALREADY_REVIEWED", "Ce paiement n’a pas encore été confirmé par SunuShop.");
    }

    const merchantAccount = Array.isArray(payment.merchant_accounts) ? payment.merchant_accounts[0] : payment.merchant_accounts;
    const plan = Array.isArray(payment.subscription_plans) ? payment.subscription_plans[0] : payment.subscription_plans;

    const pdfBytes = await renderSubscriptionReceiptPdf({
      issuedAt: formatDateTime(new Date().toISOString()),
      merchantName: merchantAccount?.public_name ?? "Boutique SunuShop",
      planName: plan?.name ?? payment.plan_id,
      billingCycleLabel: billingCycleLabels[payment.billing_cycle] ?? payment.billing_cycle,
      periodMonths: payment.period_months,
      channelLabel: channelLabels[payment.channel] ?? payment.channel,
      destinationNumber: payment.destination_number,
      externalReference: payment.external_reference,
      amountXof: payment.amount_xof,
      paidAt: formatDateTime(payment.paid_at),
      approvedAt: payment.reviewed_at ? formatDateTime(payment.reviewed_at) : null,
    });

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="recu-abonnement-${payment.external_reference}.pdf"`,
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
