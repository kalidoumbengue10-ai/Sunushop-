import { describe, expect, it } from "vitest";
import { canBuyerCancelOrder, canBuyerHideOrder } from "./client-order-actions";

describe("actions du client sur ses commandes", () => {
  it("autorise l'annulation avant la remise", () => {
    for (const status of ["pending_seller_confirmation", "confirmed", "preparing"]) {
      expect(canBuyerCancelOrder(status)).toBe(true);
    }
    expect(canBuyerCancelOrder("ready_for_handoff")).toBe(true);
  });

  it("bloque l'annulation dès qu'un livreur prend la mission", () => {
    for (const deliveryStatus of ["assigned", "accepted", "at_pickup", "picked_up", "in_transit"]) {
      expect(canBuyerCancelOrder("ready_for_handoff", deliveryStatus)).toBe(false);
    }
    expect(canBuyerCancelOrder("in_transit", "in_transit")).toBe(false);
    expect(canBuyerCancelOrder("delivered", "delivered")).toBe(false);
  });

  it("permet de retirer une commande terminée de la liste", () => {
    expect(canBuyerHideOrder("delivered", "paid")).toBe(true);
    expect(canBuyerHideOrder("cancelled", "awaiting_payment")).toBe(true);
    expect(canBuyerHideOrder("cancelled", "refunded")).toBe(true);
  });

  it("conserve une commande annulée tant que son paiement doit être régularisé", () => {
    expect(canBuyerHideOrder("cancelled", "paid")).toBe(false);
    expect(canBuyerHideOrder("cancelled", "pending_confirmation")).toBe(false);
    expect(canBuyerHideOrder("cancelled", "refund_pending")).toBe(false);
  });
});
