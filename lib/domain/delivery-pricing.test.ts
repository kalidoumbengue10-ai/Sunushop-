import { describe, expect, it } from "vitest";
import { highestCategoryDeliveryFee } from "./delivery-pricing";

describe("tarification de livraison par catégorie", () => {
  it("utilise le tarif régional lorsqu’aucune exception n’existe", () => {
    expect(highestCategoryDeliveryFee(1500, ["mode"], [])).toBe(1500);
  });

  it("retient une seule fois le tarif le plus élevé d’un panier mixte", () => {
    expect(highestCategoryDeliveryFee(1500, ["mode", "meuble", "beauté"], [
      { categoryId: "mode", feeXof: 1000 },
      { categoryId: "meuble", feeXof: 5000 },
      { categoryId: "beauté", feeXof: 2000 },
    ])).toBe(5000);
  });
});
