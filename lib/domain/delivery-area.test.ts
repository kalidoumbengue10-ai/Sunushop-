import { describe, expect, it } from "vitest";
import { normalizeDeliveryAreaName, sameDeliveryAreaName } from "./delivery-area";

describe("noms de zones de livraison", () => {
  it("ignore la casse et les espaces autour du nom", () => {
    expect(sameDeliveryAreaName("  DAKAR ", "Dakar")).toBe(true);
  });

  it("neutralise les espaces insécables et répétés", () => {
    expect(sameDeliveryAreaName("Saint\u00a0-\u00a0Louis", "saint - louis")).toBe(true);
  });

  it("neutralise les formes Unicode composées et décomposées", () => {
    expect(sameDeliveryAreaName("Ke\u0301dougou", "Kédougou")).toBe(true);
    expect(normalizeDeliveryAreaName("Thie\u0300s")).toBe("thiès");
  });

  it("conserve la différence entre deux régions réelles", () => {
    expect(sameDeliveryAreaName("Dakar", "Thiès")).toBe(false);
  });
});
