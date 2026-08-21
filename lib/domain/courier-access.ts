import { createHash } from "node:crypto";

export function courierTechnicalEmail(phone: string) {
  const digest = createHash("sha256").update(phone.trim()).digest("hex").slice(0, 32);
  return `courier-${digest}@auth.sunushop.fr`;
}
