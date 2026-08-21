import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveDeliveryCode, hashDeliveryCode, verifyDeliveryCode } from "@/lib/domain/delivery-code";
import { courierAccessActivateSchema, courierInvitationSchema, deliveryOfferSchema } from "@/lib/domain/schemas";

const ENV_KEYS = ["NODE_ENV", "COURIER_PIN_SECRET", "DELIVERY_CODE_SECRET"] as const;
const mutableEnv = process.env as Record<string, string | undefined>;

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, run: () => Promise<void> | void) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, mutableEnv[key]]));
  for (const key of ENV_KEYS) {
    if (overrides[key] === undefined) delete mutableEnv[key];
    else mutableEnv[key] = overrides[key];
  }
  return Promise.resolve(run()).finally(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete mutableEnv[key];
      else mutableEnv[key] = saved[key];
    }
  });
}

describe("parcours livreur direct", () => {
  it("accepte une invitation sans e-mail et impose le nom et le téléphone", () => {
    const parsed = courierInvitationSchema.parse({ merchantId: crypto.randomUUID(), displayName: "Moussa Fall", phone: "+221770000001" });
    expect(parsed.email).toBeUndefined();
  });

  it("exige deux PIN identiques lors de la création mais permet un PIN existant seul", () => {
    expect(courierAccessActivateSchema.safeParse({ token: "a".repeat(40), pin: "123456", pinConfirmation: "654321" }).success).toBe(false);
    expect(courierAccessActivateSchema.safeParse({ token: "a".repeat(40), pin: "123456" }).success).toBe(true);
  });

  it("valide la photographie de rémunération et sa clé d'idempotence", () => {
    const parsed = deliveryOfferSchema.parse({ orderId: crypto.randomUUID(), courierMembershipId: crypto.randomUUID(), courierFeeXof: 1800, idempotencyKey: "mission-fixture-1" });
    expect(parsed.courierFeeXof).toBe(1800);
  });

  it("renouvelle le code client sans rendre l'ancien réutilisable", () => {
    const deliveryId = crypto.randomUUID();
    const original = deriveDeliveryCode(deliveryId, "recipient");
    const renewed = deriveDeliveryCode(deliveryId, "recipient", 1);
    expect(renewed).not.toBe(original);
    expect(verifyDeliveryCode(hashDeliveryCode(renewed), renewed)).toBe(true);
    expect(verifyDeliveryCode(hashDeliveryCode(renewed), original)).toBe(false);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("refuse de démarrer en production sans secret PIN livreur configuré (régression C1)", async () => {
    await withEnv({ NODE_ENV: "production", COURIER_PIN_SECRET: undefined, DELIVERY_CODE_SECRET: undefined }, async () => {
      vi.resetModules();
      const mod = await import("@/lib/domain/courier-access");
      expect(() => mod.courierPinPassword("+221770000001", "123456")).toThrow("COURIER_PIN_SECRET_REQUIRED");
    });
  });

  it("refuse aussi en production si le secret configuré est trop court", async () => {
    await withEnv({ NODE_ENV: "production", COURIER_PIN_SECRET: "trop-court", DELIVERY_CODE_SECRET: undefined }, async () => {
      vi.resetModules();
      const mod = await import("@/lib/domain/courier-access");
      expect(() => mod.courierPinPassword("+221770000001", "123456")).toThrow("COURIER_PIN_SECRET_REQUIRED");
    });
  });

  it("n'utilise pas DELIVERY_CODE_SECRET comme secret PIN implicite en production", async () => {
    await withEnv({ NODE_ENV: "production", COURIER_PIN_SECRET: undefined, DELIVERY_CODE_SECRET: "d".repeat(64) }, async () => {
      vi.resetModules();
      const mod = await import("@/lib/domain/courier-access");
      expect(() => mod.courierPinPassword("+221770000001", "123456")).toThrow("COURIER_PIN_SECRET_REQUIRED");
    });
  });

  it("n'utilise jamais le secret de repli public en production", async () => {
    await withEnv({ NODE_ENV: "production", COURIER_PIN_SECRET: "a".repeat(32), DELIVERY_CODE_SECRET: undefined }, async () => {
      vi.resetModules();
      const withRealSecret = await import("@/lib/domain/courier-access");
      const passwordWithRealSecret = withRealSecret.courierPinPassword("+221770000001", "123456");

      vi.resetModules();
      mutableEnv.NODE_ENV = "development";
      delete mutableEnv.COURIER_PIN_SECRET;
      delete mutableEnv.DELIVERY_CODE_SECRET;
      const withFallbackSecret = await import("@/lib/domain/courier-access");
      const passwordWithFallbackSecret = withFallbackSecret.courierPinPassword("+221770000001", "123456");

      expect(passwordWithRealSecret).not.toBe(passwordWithFallbackSecret);
    });
  });
});
