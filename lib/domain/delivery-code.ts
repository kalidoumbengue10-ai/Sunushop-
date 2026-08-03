import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type DeliveryCodeStage = "pickup" | "recipient";

function secret() {
  const value = process.env.DELIVERY_CODE_SECRET;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DELIVERY_CODE_SECRET_REQUIRED");
    }
    return "sunushop-development-delivery-secret";
  }
  return value;
}

export function deriveDeliveryCode(deliveryId: string, stage: DeliveryCodeStage) {
  const digest = createHmac("sha256", secret())
    .update(`${stage}:${deliveryId}`)
    .digest();
  return (digest.readUInt32BE(0) % 1_000_000).toString().padStart(6, "0");
}

export function hashDeliveryCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyDeliveryCode(expectedHash: string, received: string) {
  const actual = Buffer.from(hashDeliveryCode(received), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
