import { describe, expect, it } from "vitest";
import { calculateLoyaltyQuote } from "./loyalty";

describe("fidélité par boutique", () => {
  it("applique au maximum 20 % du sous-total", () => {
    expect(calculateLoyaltyQuote(10_000, 8_000, true)).toEqual({
      availablePoints: 8_000,
      pointsApplied: 2_000,
      loyaltyDiscountXof: 2_000,
      pointsEarnable: 80,
    });
  });

  it("respecte le solde et la désactivation client", () => {
    expect(calculateLoyaltyQuote(10_000, 450, true).pointsApplied).toBe(450);
    expect(calculateLoyaltyQuote(10_000, 450, false).pointsApplied).toBe(0);
  });

  it("ne rend jamais une dette disponible", () => {
    expect(calculateLoyaltyQuote(10_000, -25, true).availablePoints).toBe(0);
  });
});
