import "server-only";

import { ApiError } from "./errors";
import { enforceRateLimit, getRequestIp, verifyCaptcha } from "./security";

export async function protectPasswordAuthRequest(input: {
  email: string;
  action: "password_sign_up" | "password_sign_in" | "password_recovery";
  captchaToken?: string;
  skipCaptcha?: boolean;
}) {
  const ip = await getRequestIp();
  const limits = {
    password_sign_up: { email: 5, ip: 20, windowSeconds: 3_600 },
    password_sign_in: { email: 20, ip: 60, windowSeconds: 600 },
    password_recovery: { email: 3, ip: 10, windowSeconds: 3_600 },
  }[input.action];

  await Promise.all([
    enforceRateLimit({
      key: `email:${input.email}`,
      action: input.action,
      windowSeconds: limits.windowSeconds,
      maxRequests: limits.email,
    }),
    enforceRateLimit({
      key: `ip:${ip}`,
      action: input.action,
      windowSeconds: limits.windowSeconds,
      maxRequests: limits.ip,
    }),
    input.skipCaptcha ? Promise.resolve() : verifyCaptcha(input.captchaToken, ip),
  ]);
}

export function getAuthCallbackUrl(request: Request, next: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  let origin: string;

  if (configuredSiteUrl) {
    try {
      origin = new URL(configuredSiteUrl).origin;
    } catch {
      throw new ApiError(
        503,
        "SITE_URL_INVALID",
        "L’adresse publique de SunuShop est invalide.",
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    throw new ApiError(
      503,
      "SITE_URL_NOT_CONFIGURED",
      "L’adresse publique de SunuShop n’est pas configurée.",
    );
  } else {
    origin = new URL(request.url).origin;
  }

  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);
  return callback.toString();
}
