import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enqueueEmail } from "@/lib/notifications/outbox";
import { transferFund } from "@/lib/providers/paytech";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireCron(request);
    const admin = requireAdminClient();
    const { data: expired, error: expiryError } = await admin.rpc("expire_loyalty_points", { p_limit: 1000 });
    if (expiryError) throw expiryError;

    const warningEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { data: expiring, error: warningError } = await admin
      .from("loyalty_point_lots")
      .select("id, account_id, remaining_points, expires_at, loyalty_accounts!inner(buyer_id, merchant_accounts!inner(public_name))")
      .gt("remaining_points", 0)
      .is("warning_sent_at", null)
      .gt("expires_at", new Date().toISOString())
      .lte("expires_at", warningEnd)
      .limit(500);
    if (warningError) throw warningError;
    for (const lot of expiring ?? []) {
      const account = Array.isArray(lot.loyalty_accounts) ? lot.loyalty_accounts[0] : lot.loyalty_accounts;
      const merchant = account && (Array.isArray(account.merchant_accounts) ? account.merchant_accounts[0] : account.merchant_accounts);
      await enqueueEmail(admin, {
        dedupeKey: `loyalty-expiring:${lot.id}`,
        template: "loyalty_expiring",
        recipientUserId: account?.buyer_id,
        payload: { shopName: merchant?.public_name, points: lot.remaining_points, expiresAt: lot.expires_at, url: new URL("/client", request.url).toString() },
      });
      await admin.from("loyalty_point_lots").update({ warning_sent_at: new Date().toISOString() }).eq("id", lot.id);
    }

    const { data: prepared, error: prepareError } = await admin.rpc("prepare_loyalty_credit_payouts");
    if (prepareError) throw prepareError;
    const { data: payouts, error: payoutError } = await admin
      .from("loyalty_credit_payouts")
      .select("id, merchant_id, amount_xof, destination_number, service, external_id, attempts")
      .in("status", ["pending", "failed"])
      .lt("attempts", 5)
      .order("created_at")
      .limit(50);
    if (payoutError) throw payoutError;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    let sent = 0;
    let errors = 0;
    for (const payout of payouts ?? []) {
      try {
        await transferFund({
          amount: payout.amount_xof,
          destinationNumber: payout.destination_number,
          service: payout.service as "Wave Senegal" | "Orange Money Senegal",
          callbackUrl: new URL("/api/payments/paytech/ipn", siteUrl).toString(),
          externalId: payout.external_id,
        });
        await admin.from("loyalty_credit_payouts").update({ status: "sent", attempts: payout.attempts + 1, sent_at: new Date().toISOString(), last_error: null }).eq("id", payout.id);
        sent += 1;
      } catch (error) {
        await admin.from("loyalty_credit_payouts").update({ status: "failed", attempts: payout.attempts + 1, failed_at: new Date().toISOString(), last_error: error instanceof Error ? error.message.slice(0, 500) : "TRANSFER_FAILED" }).eq("id", payout.id);
        errors += 1;
      }
    }
    return apiSuccess({ expired, warnings: expiring?.length ?? 0, prepared, sent, errors }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
