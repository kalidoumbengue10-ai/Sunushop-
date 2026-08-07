import { createHash } from "node:crypto";
import { requireAdminClient } from "@/lib/api/auth";
import { enqueueEmail } from "@/lib/notifications/outbox";
import { verifyPaytechSignature, type PaytechIpnPayload } from "@/lib/providers/paytech-signature";

// La route la plus sensible du projet : encaisse réellement de l'argent.
// Pas d'authentification par session (PayTech n'a pas de cookie) — la
// signature HMAC EST l'authentification. Le proxy Next (proxy.ts) ne
// bloque jamais cette route : refreshSupabaseSession() ne fait que
// rafraîchir des cookies et appelle systématiquement NextResponse.next(),
// donc aucune exclusion de matcher n'est nécessaire ici (vérifié dans
// lib/infrastructure/supabase/session.ts).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number) {
  return new Response(null, { status });
}

export async function POST(request: Request) {
  const admin = requireAdminClient();

  // 1. Corps brut AVANT tout parse : le hash d'idempotence et, en théorie,
  // une vérification de signature au format brut dépendent de ce texte.
  const rawBody = await request.text();

  let payload: PaytechIpnPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError(400);
  }

  // 2. Signature HMAC-SHA256 constant-time -> 400 si KO. Aucun effet de
  // bord avant ce point.
  if (!verifyPaytechSignature(payload)) {
    console.error("[paytech_ipn] invalid signature", { refCommand: payload.ref_command });
    return jsonError(400);
  }

  const typeEvent = String(payload.type_event ?? "");
  const refCommand = String(payload.ref_command ?? "");
  const token = String(payload.token ?? "");

  if (!typeEvent || !refCommand) {
    return jsonError(400);
  }

  // PayTech ne fournit aucun identifiant d'événement : on le dérive de
  // manière déterministe pour que le MÊME événement rejoué produise le
  // MÊME provider_event_id (donc soit filtré par la contrainte unique).
  const eventId = createHash("sha256")
    .update(`${typeEvent}:${refCommand}:${token}`)
    .digest("hex");
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");

  // 5. Insertion AVANT tout effet de bord métier. Conflit (23505) = déjà
  // traité = 200 immédiat. C'est la seule protection anti-rejeu disponible
  // (PayTech ne documente ni timestamp signé, ni nonce) : elle doit donc
  // être la toute première écriture, avant capture_order_payment /
  // activate_subscription_from_payment / mark_payout_*.
  const { error: insertError } = await admin.from("webhook_events").insert({
    provider: "paytech",
    provider_event_id: eventId,
    payload_sha256: payloadHash,
    payload,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return new Response(null, { status: 200 });
    }
    console.error("[paytech_ipn] webhook_events insert failed", insertError);
    return jsonError(500);
  }

  try {
    await handleEvent(admin, typeEvent, payload);
    await admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", "paytech")
      .eq("provider_event_id", eventId);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[paytech_ipn] processing failed", { refCommand, typeEvent, error });
    await admin
      .from("webhook_events")
      .update({
        failed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message.slice(0, 500) : "IPN_PROCESSING_FAILED",
      })
      .eq("provider", "paytech")
      .eq("provider_event_id", eventId);
    // On répond quand même 200 : l'événement est déjà tracé comme échoué en
    // base (failed_at) et une alerte SAV a été envoyée le cas échéant.
    // Renvoyer une erreur HTTP inciterait PayTech à rejouer indéfiniment un
    // événement dont on sait déjà qu'il échoue pour une raison durable
    // (ex. montant divergent).
    return new Response(null, { status: 200 });
  }
}

type AdminClient = ReturnType<typeof requireAdminClient>;

async function handleEvent(admin: AdminClient, typeEvent: string, payload: PaytechIpnPayload) {
  const refCommand = String(payload.ref_command ?? "");
  const token = String(payload.token ?? "");
  const itemPrice = Number(payload.item_price ?? payload.final_item_price ?? 0);

  switch (typeEvent) {
    case "sale_complete": {
      const { data: intent, error: intentError } = await admin
        .from("payment_intents")
        .select("id, kind, amount_xof, order_batch_id, merchant_id, plan_id, buyer_id, status")
        .eq("ref_command", refCommand)
        .maybeSingle();
      if (intentError) throw intentError;
      if (!intent) {
        console.error("[paytech_ipn] sale_complete: unknown ref_command", refCommand);
        return;
      }

      // Recouper le montant : divergence => ne pas capturer, marquer
      // failed_at + alerte SAV (le montant du client-supplied JSON n'est
      // JAMAIS la source de vérité, seule payment_intents.amount_xof l'est).
      if (intent.amount_xof !== itemPrice) {
        console.error("[paytech_ipn] amount mismatch", { refCommand, expected: intent.amount_xof, received: itemPrice });
        const savEmail = process.env.SUNUSHOP_SAV_EMAIL?.trim() || "sunushop1@gmail.com";
        await enqueueEmail(admin, {
          dedupeKey: `paytech-amount-mismatch:${refCommand}`,
          template: "payout_failed",
          to: savEmail,
          payload: { orderCode: refCommand, reason: "Montant IPN différent du montant attendu.", expected: intent.amount_xof, received: itemPrice },
        }).catch(() => false);
        throw new Error("PAYMENT_AMOUNT_MISMATCH");
      }

      if (intent.kind === "order") {
        const { error } = await admin.rpc("capture_order_payment", {
          p_ref_command: refCommand,
          p_paytech_token: token,
          p_amount_xof: itemPrice,
          p_payment_method: payload.payment_method ?? null,
          p_client_phone: payload.client_phone ?? null,
        });
        if (error) throw error;
        await notifyOrderPaid(admin, intent.order_batch_id as string);
      } else if (intent.kind === "subscription") {
        const { error } = await admin.rpc("activate_subscription_from_payment", {
          p_ref_command: refCommand,
          p_amount_xof: itemPrice,
          p_paytech_token: token,
        });
        if (error) throw error;
        await notifySubscriptionActivated(admin, intent.merchant_id as string);
      }
      return;
    }

    case "sale_canceled": {
      await admin
        .from("payment_intents")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("ref_command", refCommand)
        .eq("status", "pending");
      return;
    }

    case "refund_complete": {
      const { data: intent } = await admin
        .from("payment_intents")
        .select("id, order_batch_id")
        .eq("ref_command", refCommand)
        .maybeSingle();
      if (!intent?.order_batch_id) return;

      const { data: orders } = await admin
        .from("orders")
        .select("id")
        .eq("batch_id", intent.order_batch_id);
      for (const order of orders ?? []) {
        await admin.rpc("mark_escrow_refunded", { p_order_id: order.id });
      }
      await admin
        .from("payment_intents")
        .update({ status: "refunded" })
        .eq("id", intent.id);
      return;
    }

    case "transfer_success": {
      const externalId = String(payload.custom_field ?? payload.external_id ?? "");
      if (!externalId) return;
      const { error } = await admin.rpc("mark_payout_paid", {
        p_external_id: externalId,
        p_id_transfer: token || null,
      });
      if (error) throw error;
      return;
    }

    case "transfer_failed": {
      const externalId = String(payload.custom_field ?? payload.external_id ?? "");
      if (!externalId) return;
      const { data: payout, error } = await admin.rpc("mark_payout_failed", {
        p_external_id: externalId,
        p_error: "PAYTECH_TRANSFER_FAILED",
      });
      if (error) throw error;
      const savEmail = process.env.SUNUSHOP_SAV_EMAIL?.trim() || "sunushop1@gmail.com";
      const payoutRow = payout as { merchant_id?: string; amount_xof?: number } | null;
      if (payoutRow?.merchant_id) {
        const { data: merchant } = await admin
          .from("merchant_accounts")
          .select("public_name, email, owner_user_id")
          .eq("id", payoutRow.merchant_id)
          .maybeSingle();
        await enqueueEmail(admin, {
          dedupeKey: `payout-failed:${externalId}`,
          template: "payout_failed",
          to: savEmail,
          payload: { shopName: merchant?.public_name, amountXof: payoutRow.amount_xof },
        }).catch(() => false);
        if (merchant?.email) {
          await enqueueEmail(admin, {
            dedupeKey: `payout-failed:${externalId}:merchant`,
            template: "payout_failed",
            to: merchant.email,
            recipientUserId: merchant.owner_user_id,
            payload: { shopName: merchant.public_name, amountXof: payoutRow.amount_xof },
          }).catch(() => false);
        }
      }
      return;
    }

    default:
      console.error("[paytech_ipn] unknown type_event", typeEvent);
  }
}

async function notifyOrderPaid(admin: AdminClient, orderBatchId: string) {
  const { data: orders } = await admin
    .from("orders")
    .select("id, public_code, buyer_id, merchant_id, total_xof, merchant_accounts(public_name, email)")
    .eq("batch_id", orderBatchId);
  for (const order of orders ?? []) {
    const merchant = Array.isArray(order.merchant_accounts) ? order.merchant_accounts[0] : order.merchant_accounts;
    await enqueueEmail(admin, {
      dedupeKey: `order-paid:${order.id}:buyer`,
      template: "order_paid",
      recipientUserId: order.buyer_id,
      payload: { orderCode: order.public_code, totalXof: order.total_xof },
    }).catch(() => false);
    if (merchant?.email) {
      await enqueueEmail(admin, {
        dedupeKey: `order-paid:${order.id}:merchant`,
        template: "order_paid",
        to: merchant.email,
        payload: { orderCode: order.public_code, totalXof: order.total_xof, shopName: merchant.public_name },
      }).catch(() => false);
    }
  }
}

async function notifySubscriptionActivated(admin: AdminClient, merchantId: string) {
  const { data: merchant } = await admin
    .from("merchant_accounts")
    .select("public_name, email, owner_user_id")
    .eq("id", merchantId)
    .maybeSingle();
  if (!merchant) return;
  await enqueueEmail(admin, {
    dedupeKey: `subscription-paytech-activated:${merchantId}:${new Date().toISOString().slice(0, 10)}`,
    template: "subscription_activated",
    to: merchant.email,
    recipientUserId: merchant.owner_user_id,
    payload: { shopName: merchant.public_name },
  }).catch(() => false);
}
