import { describe, expect, it } from "vitest";
import { deriveDeliveryCode, hashDeliveryCode, verifyDeliveryCode } from "@/lib/domain/delivery-code";
import { courierAccessActivateSchema, courierInvitationSchema, deliveryOfferSchema } from "@/lib/domain/schemas";
import { courierWhatsappUrl } from "@/lib/domain/courier-sharing";

describe("parcours livreur direct", () => {
  it("accepte une invitation sans e-mail et impose le nom et le téléphone", () => {
    const parsed = courierInvitationSchema.parse({ merchantId: crypto.randomUUID(), displayName: "Moussa Fall", phone: "+221770000001" });
    expect(parsed.email).toBeUndefined();
  });

  it("accepte un e-mail facultatif et prépare le message WhatsApp avec le même lien", () => {
    const invitationUrl = "https://sunushop.example/livreur/invitation?token=secret";
    const parsed = courierInvitationSchema.parse({ merchantId: crypto.randomUUID(), displayName: "Moussa Fall", phone: "+221 77 000 00 01", email: "moussa@example.com" });
    const whatsapp = new URL(courierWhatsappUrl(parsed.phone, invitationUrl));

    expect(parsed.email).toBe("moussa@example.com");
    expect(whatsapp.hostname).toBe("wa.me");
    expect(whatsapp.pathname).toBe("/221770000001");
    expect(whatsapp.searchParams.get("text")).toContain(invitationUrl);
    expect(whatsapp.searchParams.get("text")).toContain("ouvrir directement votre mission");
  });

  it("ouvre l’accès avec le seul lien personnel", () => {
    expect(courierAccessActivateSchema.safeParse({ token: "court" }).success).toBe(false);
    expect(courierAccessActivateSchema.safeParse({ token: "a".repeat(40) }).success).toBe(true);
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
});
