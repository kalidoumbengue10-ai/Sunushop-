import { createHash, createHmac } from "node:crypto";
import { constantTimeEqual } from "@/lib/api/constant-time";

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

export function deriveDeliveryCode(deliveryId: string, stage: DeliveryCodeStage, version = 0) {
  const digest = createHmac("sha256", secret())
    .update(version === 0 ? `${stage}:${deliveryId}` : `${stage}:${deliveryId}:${version}`)
    .digest();
  return (digest.readUInt32BE(0) % 1_000_000).toString().padStart(6, "0");
}

export function hashDeliveryCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyDeliveryCode(expectedHash: string, received: string) {
  const actual = Buffer.from(hashDeliveryCode(received), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return constantTimeEqual(actual, expected);
}
