import { describe, expect, it } from "vitest";
import { optionValueAvailable, productOptionNames, productOptionValues, resolveProductVariant } from "./product-options";

const variants = [
  { id: "1", sku: "1", title: null, attributes: { Taille: "S", Couleur: "Noir" }, priceXof: 1, compareAtPriceXof: null, availableQuantity: 2 },
  { id: "2", sku: "2", title: null, attributes: { Taille: "M", Couleur: "Noir" }, priceXof: 1, compareAtPriceXof: null, availableQuantity: 0 },
  { id: "3", sku: "3", title: null, attributes: { Taille: "M", Couleur: "Rouge" }, priceXof: 1, compareAtPriceXof: null, availableQuantity: 3 },
];

describe("product options", () => {
  it("extrait les axes et leurs valeurs", () => {
    expect(productOptionNames(variants)).toEqual(["Taille", "Couleur"]);
    expect(productOptionValues(variants, "Taille")).toEqual(["S", "M"]);
  });

  it("respecte l’ordre stocké quand il est fourni", () => {
    expect(productOptionNames(variants, ["Couleur", "Taille"])).toEqual(["Couleur", "Taille"]);
    // Un axe stocké mais absent des variantes ne doit pas apparaître.
    expect(productOptionNames(variants, ["Matière", "Couleur", "Taille"])).toEqual(["Couleur", "Taille"]);
  });

  it("résout une combinaison et désactive celles sans stock", () => {
    expect(resolveProductVariant(variants, { Taille: "M", Couleur: "Rouge" })?.id).toBe("3");
    expect(optionValueAvailable(variants, { Couleur: "Noir" }, "Taille", "M")).toBe(false);
  });
});
