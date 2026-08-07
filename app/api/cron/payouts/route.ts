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

    // Auto-release J+PAYTECH_ESCROW_RELEASE_DAYS avant de traiter les
    // payouts déjà en attente.
    const { data: released, error: releaseError } = await admin.rpc("release_due_escrows", { p_limit: 100 });
    if (releaseError) throw releaseError;

    const { data: payouts, error: payoutsError } = await admin
      .from("merchant_payouts")
      .select("id, escrow_id, merchant_id, amount_xof, destination_number, service, external_id, status")
      .eq("status", "pending")
      .order("created_at")
      .limit(50);
    if (payoutsError) throw payoutsError;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    const callbackUrl = new URL("/api/payments/paytech/ipn", siteUrl).toString();
    const savEmail = process.env.SUNUSHOP_SAV_EMAIL?.trim() || "sunushop1@gmail.com";

    let processed = 0;
    let errors = 0;

    for (const payout of payouts ?? []) {
      if (!payout.destination_number || !payout.service) {
        await admin.rpc("mark_payout_failed", {
          p_external_id: payout.external_id,
          p_error: "MERCHANT_PAYOUT_NUMBER_MISSING",
        });
        const { data: merchant } = await admin
          .from("merchant_accounts")
          .select("public_name, email, owner_user_id")
          .eq("id", payout.merchant_id)
          .maybeSingle();
        await enqueueEmail(admin, {
          dedupeKey: `payout-number-missing:${payout.id}`,
          template: "payout_failed",
          to: savEmail,
          payload: { shopName: merchant?.public_name, amountXof: payout.amount_xof },
        }).catch(() => false);
        if (merchant?.email) {
          await enqueueEmail(admin, {
            dedupeKey: `payout-number-missing:${payout.id}:merchant`,
            template: "payout_failed",
            to: merchant.email,
            recipientUserId: merchant.owner_user_id,
            payload: { shopName: merchant.public_name, amountXof: payout.amount_xof },
          }).catch(() => false);
        }
        errors += 1;
        continue;
      }

      try {
        await transferFund({
          amount: payout.amount_xof,
          destinationNumber: payout.destination_number,
          service: payout.service as "Wave Senegal" | "Orange Money Senegal",
          callbackUrl,
          externalId: payout.external_id,
        });
        const { error: markError } = await admin.rpc("mark_payout_sent", {
          p_external_id: payout.external_id,
        });
        if (markError) throw markError;
        processed += 1;
      } catch (error) {
        console.error("[cron_payouts] transferFund failed", { payoutId: payout.id, error });
        await admin.rpc("mark_payout_failed", {
          p_external_id: payout.external_id,
          p_error: "PAYTECH_TRANSFER_REQUEST_FAILED",
        });
        const { data: merchant } = await admin
          .from("merchant_accounts")
          .select("public_name, email")
          .eq("id", payout.merchant_id)
          .maybeSingle();
        await enqueueEmail(admin, {
          dedupeKey: `payout-request-failed:${payout.id}`,
          template: "payout_failed",
          to: savEmail,
          payload: { shopName: merchant?.public_name, amountXof: payout.amount_xof },
        }).catch(() => false);
        errors += 1;
      }
    }

    return apiSuccess(
      { processed, errors, escrowsReleased: released },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
