import { describe, expect, it } from "vitest";
import { canTransitionOrder } from "./order-status";

describe("machine d’état des commandes", () => {
  it("autorise le chemin nominal", () => {
    expect(canTransitionOrder("pending_seller_confirmation", "confirmed")).toBe(
      true,
    );
    expect(canTransitionOrder("confirmed", "preparing")).toBe(true);
    expect(canTransitionOrder("preparing", "ready_for_handoff")).toBe(true);
    expect(canTransitionOrder("ready_for_handoff", "in_transit")).toBe(true);
    expect(canTransitionOrder("in_transit", "delivered")).toBe(true);
  });

  it("refuse de sauter un état et de rouvrir une commande", () => {
    expect(
      canTransitionOrder("pending_seller_confirmation", "delivered"),
    ).toBe(false);
    expect(canTransitionOrder("cancelled", "confirmed")).toBe(false);
  });
});
