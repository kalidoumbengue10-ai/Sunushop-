import "server-only";

import { getPaytechConfig } from "@/lib/config/env";
import { ApiError } from "@/lib/api/errors";

// Règle 8 du sous-skill cron-webhooks-integrations : le code métier n'appelle
// jamais PayTech directement, il passe systématiquement par cet adapter.
//
// Sources exclusives : https://doc.intech.sn/doc_paytech.php et la collection
// Postman « PayTech x DOC.postman_collection.json ». Rien d'autre n'a été
// utilisé pour ces signatures d'appel.

const PAYTECH_BASE_URL = "https://paytech.sn/api";
const REQUEST_TIMEOUT_MS = 10_000;

function requireConfig() {
  const config = getPaytechConfig();
  if (!config) {
    throw new ApiError(
      503,
      "PAYTECH_NOT_CONFIGURED",
      "Le paiement en ligne n’est pas encore disponible.",
    );
  }
  return config;
}

function authHeaders(config: { PAYTECH_API_KEY: string; PAYTECH_API_SECRET: string }) {
  return {
    API_KEY: config.PAYTECH_API_KEY,
    API_SECRET: config.PAYTECH_API_SECRET,
  };
}

// Le message brut renvoyé par PayTech ne remonte jamais au client (règle 7 du
// sous-skill api-routes-input-validation) : on logue côté serveur et on lève
// une erreur générique en français.
function logAndFail(context: string, error: unknown): never {
  console.error(`[paytech] ${context}`, error);
  throw new ApiError(
    502,
    "PAYTECH_UNAVAILABLE",
    "Le service de paiement est momentanément indisponible. Réessayez dans un instant.",
  );
}

export type RequestPaymentInput = {
  itemName: string;
  itemPrice: number;
  refCommand: string;
  commandName: string;
  currency?: string;
  env?: "test" | "prod";
  ipnUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
  customField?: string;
  targetPayment?: string;
  refundNotifUrl?: string;
};

export type RequestPaymentResult = {
  token: string;
  redirectUrl: string;
};

export async function requestPayment(
  input: RequestPaymentInput,
): Promise<RequestPaymentResult> {
  const config = requireConfig();

  let response: Response;
  try {
    response = await fetch(`${PAYTECH_BASE_URL}/payment/request-payment`, {
      method: "POST",
      headers: {
        ...authHeaders(config),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        item_name: input.itemName,
        item_price: input.itemPrice,
        ref_command: input.refCommand,
        command_name: input.commandName,
        currency: input.currency ?? "XOF",
        env: input.env ?? config.PAYTECH_ENV,
        ipn_url: input.ipnUrl,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        custom_field: input.customField,
        target_payment: input.targetPayment,
        refund_notif_url: input.refundNotifUrl,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logAndFail("request-payment fetch failed", error);
  }

  let body: {
    success?: boolean | number;
    token?: string;
    redirect_url?: string;
    redirectUrl?: string;
  };
  try {
    body = await response.json();
  } catch (error) {
    logAndFail("request-payment invalid JSON response", error);
  }

  const success = body.success === true || body.success === 1;
  if (!success || !body.token) {
    logAndFail("request-payment rejected", body);
  }

  const redirectUrl = body.redirect_url ?? body.redirectUrl;
  if (!redirectUrl) {
    logAndFail("request-payment missing redirect_url", body);
  }

  return { token: body.token, redirectUrl };
}

export type PaymentStatusResult = {
  raw: Record<string, unknown>;
};

export async function getPaymentStatus(token: string): Promise<PaymentStatusResult> {
  const config = requireConfig();

  let response: Response;
  try {
    response = await fetch(
      `${PAYTECH_BASE_URL}/payment/get-status?token_payment=${encodeURIComponent(token)}`,
      {
        method: "GET",
        headers: authHeaders(config),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch (error) {
    logAndFail("get-status fetch failed", error);
  }

  try {
    const raw = await response.json();
    return { raw };
  } catch (error) {
    logAndFail("get-status invalid JSON response", error);
  }
}

export async function refundPayment(refCommand: string): Promise<void> {
  const config = requireConfig();

  // Seul endpoint qui diffère : application/x-www-form-urlencoded, pas JSON.
  let response: Response;
  try {
    response = await fetch(`${PAYTECH_BASE_URL}/payment/refund-payment`, {
      method: "POST",
      headers: {
        ...authHeaders(config),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ ref_command: refCommand }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logAndFail("refund-payment fetch failed", error);
  }

  if (!response.ok) {
    logAndFail("refund-payment rejected", await response.text().catch(() => ""));
  }
}

export type TransferFundInput = {
  amount: number;
  destinationNumber: string;
  service: "Wave Senegal" | "Orange Money Senegal";
  callbackUrl: string;
  externalId: string;
};

export async function transferFund(input: TransferFundInput): Promise<void> {
  const config = requireConfig();

  let response: Response;
  try {
    response = await fetch(`${PAYTECH_BASE_URL}/transfer/transferFund`, {
      method: "POST",
      headers: {
        ...authHeaders(config),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amount,
        destination_number: input.destinationNumber,
        service: input.service,
        callback_url: input.callbackUrl,
        external_id: input.externalId,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logAndFail("transferFund fetch failed", error);
  }

  if (!response.ok) {
    logAndFail("transferFund rejected", await response.text().catch(() => ""));
  }
}

export async function getTransferStatus(idTransfer: string): Promise<Record<string, unknown>> {
  const config = requireConfig();

  let response: Response;
  try {
    response = await fetch(
      `${PAYTECH_BASE_URL}/transfer/get-status?id_transfer=${encodeURIComponent(idTransfer)}`,
      {
        method: "GET",
        headers: authHeaders(config),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch (error) {
    logAndFail("transfer get-status fetch failed", error);
  }

  try {
    return await response.json();
  } catch (error) {
    logAndFail("transfer get-status invalid JSON response", error);
  }
}

export function paytechCheckoutUrl(token: string) {
  return `https://paytech.sn/payment/checkout/${token}`;
}
