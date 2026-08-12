import { describe, expect, it } from "vitest";
import { anonymizeCompletedDelivery, canTransitionDelivery } from "./delivery";
import { deriveDeliveryCode, hashDeliveryCode, verifyDeliveryCode } from "./delivery-code";

describe("livraison marchande", () => {
  it("impose le retrait avant le transport puis la remise", () => {
    expect(canTransitionDelivery("assigned", "accepted")).toBe(true);
    expect(canTransitionDelivery("accepted", "at_pickup")).toBe(true);
    expect(canTransitionDelivery("at_pickup", "picked_up")).toBe(true);
    expect(canTransitionDelivery("picked_up", "in_transit")).toBe(true);
    expect(canTransitionDelivery("in_transit", "delivered")).toBe(true);
    expect(canTransitionDelivery("assigned", "delivered")).toBe(false);
    expect(canTransitionDelivery("delivered", "assigned")).toBe(false);
  });

  it("génère deux codes distincts et vérifiables sans les stocker en clair", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const pickup = deriveDeliveryCode(id, "pickup");
    const recipient = deriveDeliveryCode(id, "recipient");
    expect(pickup).toMatch(/^\d{6}$/);
    expect(recipient).toMatch(/^\d{6}$/);
    expect(recipient).not.toBe(pickup);
    expect(verifyDeliveryCode(hashDeliveryCode(pickup), pickup)).toBe(true);
    expect(verifyDeliveryCode(hashDeliveryCode(pickup), recipient)).toBe(false);
  });

  it("retire les coordonnées personnelles de l’historique terminé", () => {
    const result = anonymizeCompletedDelivery({
      status: "delivered" as const,
      recipient: { name: "Client", phone: "+221770000000", addressHint: "Rue 1", region: "Dakar", city: "Dakar" },
    });
    expect(result.recipient).toEqual({ name: null, phone: null, addressHint: null, latitude: null, longitude: null, region: "Dakar", city: "Dakar" });
  });

  it("ne rend les coordonnées terminales que pendant un litige actif", () => {
    const delivery = {
      status: "failed" as const,
      recipient: { name: "Client", phone: "+221770000000", addressHint: "Rue 1", region: "Dakar", city: "Dakar" },
    };
    expect(anonymizeCompletedDelivery(delivery).recipient?.phone).toBeNull();
    expect(anonymizeCompletedDelivery(delivery, { allowTerminalDetails: true }).recipient?.phone).toBe("+221770000000");
  });
});
