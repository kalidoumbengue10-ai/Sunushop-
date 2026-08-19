import { describe, expect, it } from "vitest";
import {
  assignableOrderLabel,
  assignableOrderReason,
  isReadyForAssignment,
  isVisibleInAssignmentQueue,
} from "./courier-assignment";

const readyOrder = {
  status: "ready_for_handoff",
  deliverySnapshot: { methodKind: "merchant_delivery", zoneId: "zone-1" },
  delivery: null,
};

describe("éligibilité des commandes à l'affectation d'un livreur", () => {
  it("affiche une commande en attente, prête, confirmée ou en préparation avec une zone de livraison", () => {
    expect(assignableOrderReason(readyOrder)).toBe("assignable");
    expect(assignableOrderReason({ ...readyOrder, status: "pending_seller_confirmation" })).toBe("assignable");
    expect(assignableOrderReason({ ...readyOrder, status: "confirmed" })).toBe("assignable");
    expect(assignableOrderReason({ ...readyOrder, status: "preparing" })).toBe("assignable");
  });

  it("rejette les statuts hors du flux d'affectation", () => {
    for (const status of ["in_transit", "delivered", "cancelled", "disputed"]) {
      expect(assignableOrderReason({ ...readyOrder, status })).toBe("status_not_assignable");
    }
  });

  it("exclut les commandes de retrait en boutique", () => {
    expect(assignableOrderReason({ ...readyOrder, deliverySnapshot: { methodKind: "pickup", zoneId: null } })).toBe("pickup_order");
  });

  it("exclut une commande sans zoneId dans le snapshot (retrait boutique implicite)", () => {
    expect(assignableOrderReason({ ...readyOrder, deliverySnapshot: { methodKind: "merchant_delivery" } })).toBe("pickup_order");
  });

  it("exclut une commande sans snapshot de livraison du tout", () => {
    expect(assignableOrderReason({ ...readyOrder, deliverySnapshot: null })).toBe("pickup_order");
  });

  it("priorise le motif retrait boutique sur le statut", () => {
    expect(assignableOrderReason({ ...readyOrder, status: "delivered", deliverySnapshot: { methodKind: "pickup" } })).toBe("pickup_order");
  });

  it("autorise la réaffectation tant que la livraison n'a pas été retirée", () => {
    for (const status of ["assigned", "accepted", "at_pickup"]) {
      expect(assignableOrderReason({ ...readyOrder, delivery: { status } })).toBe("assignable");
    }
  });

  it("verrouille une commande dont la livraison est déjà retirée ou terminée", () => {
    for (const status of ["picked_up", "in_transit", "delivered", "failed", "cancelled"]) {
      expect(assignableOrderReason({ ...readyOrder, delivery: { status } })).toBe("delivery_locked");
    }
  });

  it("libelle prête uniquement le statut ready_for_handoff", () => {
    expect(assignableOrderLabel("ready_for_handoff")).toBe("prête");
    expect(assignableOrderLabel("pending_seller_confirmation", "paid")).toBe("à confirmer");
    expect(assignableOrderLabel("pending_seller_confirmation", "awaiting_payment")).toBe("paiement en attente");
    expect(assignableOrderLabel("confirmed")).toBe("à préparer");
    expect(assignableOrderLabel("preparing")).toBe("à préparer");
  });

  it("n'affiche en attente vendeur que la commande déjà payée", () => {
    expect(isVisibleInAssignmentQueue("pending_seller_confirmation", "paid")).toBe(true);
    expect(isVisibleInAssignmentQueue("pending_seller_confirmation", "awaiting_payment")).toBe(false);
    expect(isVisibleInAssignmentQueue("preparing", "paid")).toBe(true);
  });

  it("n'est prête pour affectation immédiate que si assignable et déjà au statut ready_for_handoff", () => {
    expect(isReadyForAssignment(readyOrder)).toBe(true);
    expect(isReadyForAssignment({ ...readyOrder, status: "confirmed" })).toBe(false);
    expect(isReadyForAssignment({ ...readyOrder, delivery: { status: "picked_up" } })).toBe(false);
  });
});
