import { describe, expect, it } from "vitest";
import { calculateOrderTotalXof } from "./order-total";

describe("total facturé au client", () => {
  it("additionne le prix des produits et les frais de livraison", () => {
    expect(calculateOrderTotalXof(2500, 1500)).toBe(4000);
  });
});
