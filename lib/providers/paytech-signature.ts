import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getPaytechConfig } from "@/lib/config/env";

// Vérification de la signature IPN PayTech.
//
// Méthode principale (documentée) : HMAC-SHA256 sur le message
// `${amount}|${refCommand}|${apiKey}`, avec `apiSecret` comme clé HMAC,
// comparé en constant-time à `hmac_compute`.
//
// Repli documenté : sha256(API_KEY) === api_key_sha256 ET
// sha256(API_SECRET) === api_secret_sha256.
//
// Ce fichier tourne en runtime Node (voir lib/api/cron.ts et
// lib/api/security.ts qui utilisent déjà node:crypto de la même façon) — pas
// Edge/Workers. Si ce projet migrait un jour vers Cloudflare Workers, il
// faudrait remplacer timingSafeEqual par le helper XOR "Edge-safe" du
// sous-skill cron-webhooks-integrations, car node:crypto n'y est pas
// disponible.

function constantTimeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  // timingSafeEqual exige des buffers de même longueur : une différence de
  // longueur est déjà une preuve de non-correspondance, mais on ne doit pas
  // court-circuiter avant timingSafeEqual pour rester constant-time sur le
  // contenu ; la comparaison de longueur elle-même n'est pas secrète.
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export type PaytechIpnPayload = {
  type_event?: string;
  ref_command?: string;
  item_price?: number | string;
  final_item_price?: number | string;
  currency?: string;
  token?: string;
  env?: string;
  payment_method?: string;
  client_phone?: string;
  custom_field?: string;
  api_key_sha256?: string;
  api_secret_sha256?: string;
  hmac_compute?: string;
  [key: string]: unknown;
};

export function verifyPaytechSignature(payload: PaytechIpnPayload): boolean {
  const config = getPaytechConfig();
  if (!config) return false;

  const amount = String(payload.item_price ?? "");
  const refCommand = String(payload.ref_command ?? "");

  if (payload.hmac_compute) {
    const message = `${amount}|${refCommand}|${config.PAYTECH_API_KEY}`;
    const computed = createHmac("sha256", config.PAYTECH_API_SECRET)
      .update(message)
      .digest("hex");
    return constantTimeEqual(computed, String(payload.hmac_compute));
  }

  if (payload.api_key_sha256 && payload.api_secret_sha256) {
    const apiKeyHash = createHash("sha256").update(config.PAYTECH_API_KEY).digest("hex");
    const apiSecretHash = createHash("sha256").update(config.PAYTECH_API_SECRET).digest("hex");
    return (
      constantTimeEqual(apiKeyHash, String(payload.api_key_sha256)) &&
      constantTimeEqual(apiSecretHash, String(payload.api_secret_sha256))
    );
  }

  return false;
}
