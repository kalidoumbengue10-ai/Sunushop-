import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

export type SupabasePublicConfig = z.infer<typeof publicSchema>;
export type SupabaseServerConfig = z.infer<typeof serverSchema>;

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const result = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  return result.success ? result.data : null;
}

export function getSupabaseServerConfig(): SupabaseServerConfig | null {
  const publicConfig = getSupabasePublicConfig();
  if (!publicConfig) return null;

  const result = serverSchema.safeParse({
    ...publicConfig,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return result.success ? result.data : null;
}

export function isSupabaseConfigured() {
  return getSupabasePublicConfig() !== null;
}

export const pilotConfig = {
  environment: process.env.SUNUSHOP_ENVIRONMENT ?? "development",
  waveMerchantNumber: process.env.SUNUSHOP_WAVE_MERCHANT_NUMBER ?? "",
  orangeMoneyMerchantNumber:
    process.env.SUNUSHOP_ORANGE_MONEY_MERCHANT_NUMBER ?? "",
  kycSignedUrlTtlSeconds: Number(
    process.env.SUNUSHOP_KYC_SIGNED_URL_TTL_SECONDS ?? 300,
  ),
  rejectedRetentionDays: Number(
    process.env.SUNUSHOP_KYC_REJECTED_RETENTION_DAYS ?? 90,
  ),
  closedRetentionDays: Number(
    process.env.SUNUSHOP_KYC_CLOSED_RETENTION_DAYS ?? 365,
  ),
} as const;

const paytechSchema = z.object({
  PAYTECH_API_KEY: z.string().min(10),
  PAYTECH_API_SECRET: z.string().min(10),
  PAYTECH_ENV: z.enum(["test", "prod"]).default("test"),
  PAYTECH_ESCROW_RELEASE_DAYS: z.coerce.number().int().min(1).max(30).default(3),
  SUNUSHOP_SAV_EMAIL: z.email().default("sunushop1@gmail.com"),
});

export type PaytechConfig = z.infer<typeof paytechSchema>;

export function getPaytechConfig(): PaytechConfig | null {
  const result = paytechSchema.safeParse({
    PAYTECH_API_KEY: process.env.PAYTECH_API_KEY,
    PAYTECH_API_SECRET: process.env.PAYTECH_API_SECRET,
    PAYTECH_ENV: process.env.PAYTECH_ENV,
    PAYTECH_ESCROW_RELEASE_DAYS: process.env.PAYTECH_ESCROW_RELEASE_DAYS,
    SUNUSHOP_SAV_EMAIL: process.env.SUNUSHOP_SAV_EMAIL,
  });

  return result.success ? result.data : null;
}
