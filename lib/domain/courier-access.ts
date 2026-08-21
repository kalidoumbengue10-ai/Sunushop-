import { createHash, createHmac } from "node:crypto";

function pinSecret() {
  const value = process.env.COURIER_PIN_SECRET?.trim();
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("COURIER_PIN_SECRET_REQUIRED");
    }
    return "sunushop-development-courier-pin-secret";
  }
  return value;
}

// Supabase Auth conserve le secret final. Le PIN n'est jamais stocké dans les
// tables métier et le mot de passe technique ne peut pas être deviné sans le
// secret serveur.
export function courierPinPassword(phone: string, pin: string) {
  const digest = createHmac("sha256", pinSecret()).update(`${phone}:${pin}`).digest("base64url");
  return `SunuShop-${digest}!`;
}

export function courierTechnicalEmail(phone: string) {
  const digest = createHash("sha256").update(phone.trim()).digest("hex").slice(0, 32);
  return `courier-${digest}@auth.sunushop.fr`;
}
