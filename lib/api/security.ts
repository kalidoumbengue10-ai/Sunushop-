import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { ApiError } from "./errors";
import { requireAdminClient } from "./auth";

export async function getRequestIp() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    "unknown"
  );
}

export function hashRateLimitKey(value: string) {
  const secret = process.env.RATE_LIMIT_HASH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new ApiError(
      503,
      "RATE_LIMIT_NOT_CONFIGURED",
      "La protection anti-abus n’est pas configurée.",
    );
  }
  return createHash("sha256")
    .update(`${secret ?? "sunushop-local"}:${value}`)
    .digest("hex");
}

export async function enforceRateLimit(input: {
  key: string;
  action: string;
  windowSeconds: number;
  maxRequests: number;
}) {
  const admin = requireAdminClient();
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key_hash: hashRateLimitKey(input.key),
    p_action: input.action,
    p_window_seconds: input.windowSeconds,
    p_max_requests: input.maxRequests,
  });

  if (error) throw error;
  if (!data) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Trop de tentatives. Réessayez plus tard.",
    );
  }
}

export async function verifyCaptcha(
  token: string | undefined,
  remoteIp: string,
) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    // Le CAPTCHA est désactivable en retirant TURNSTILE_SECRET_KEY (et la
    // clé publique côté client) : dans ce cas on laisse passer plutôt que
    // de bloquer tout le monde, en s'appuyant sur le rate-limiting restant.
    return;
  }
  if (!token) {
    throw new ApiError(400, "CAPTCHA_REQUIRED", "Validez le contrôle anti-robot.");
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: remoteIp,
      }),
      cache: "no-store",
    },
  );
  const result = (await response.json()) as { success?: boolean };
  if (!result.success) {
    throw new ApiError(400, "CAPTCHA_INVALID", "Le contrôle anti-robot a échoué.");
  }
}
