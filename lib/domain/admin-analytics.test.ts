import { describe, expect, it } from "vitest";
import { isRevenueOrder, netOrderVolume, subscriptionCatalogValue } from "./admin-analytics";

describe("admin analytics rules", () => {
  it("valorise les tests et octrois au prorata du catalogue", () => {
    expect(subscriptionCatalogValue(4_900, 30)).toBe(4_900);
    expect(subscriptionCatalogValue(4_900, 90)).toBe(14_700);
    expect(subscriptionCatalogValue(4_900, 15)).toBe(2_450);
  });

  it("déduit les remboursements confirmés sans produire un volume négatif", () => {
    expect(netOrderVolume(68_000, 8_000)).toBe(60_000);
    expect(netOrderVolume(5_000, 7_000)).toBe(0);
  });

  it("compte une commande payée avant livraison mais jamais une annulation", () => {
    expect(isRevenueOrder({ status: "confirmed", payment_status: "paid" })).toBe(true);
    expect(isRevenueOrder({ status: "confirmed", payment_status: "awaiting_payment" })).toBe(false);
    expect(isRevenueOrder({ status: "cancelled", payment_status: "paid" })).toBe(false);
  });
});

