import { describe, expect, it } from "vitest";
import { computeVariantMatrix } from "./variant-matrix";

describe("computeVariantMatrix", () => {
  it("retourne null sans axe rempli", () => {
    expect(computeVariantMatrix([])).toBeNull();
    expect(computeVariantMatrix([{ name: "Taille", values: [] }])).toBeNull();
    expect(computeVariantMatrix([{ name: "", values: ["S"] }])).toBeNull();
  });

  it("produit le produit cartésien pour un seul axe", () => {
    expect(computeVariantMatrix([{ name: "Taille", values: ["S", "M"] }])).toEqual([
      { Taille: "S" },
      { Taille: "M" },
    ]);
  });

  it("produit le produit cartésien pour deux axes", () => {
    const result = computeVariantMatrix([
      { name: "Taille", values: ["S", "M"] },
      { name: "Couleur", values: ["Noir", "Blanc"] },
    ]);
    expect(result).toEqual([
      { Taille: "S", Couleur: "Noir" },
      { Taille: "S", Couleur: "Blanc" },
      { Taille: "M", Couleur: "Noir" },
      { Taille: "M", Couleur: "Blanc" },
    ]);
  });

  it("produit le produit cartésien pour trois axes", () => {
    const result = computeVariantMatrix([
      { name: "Taille", values: ["S", "M"] },
      { name: "Couleur", values: ["Noir"] },
      { name: "Matière", values: ["Coton", "Lin"] },
    ]);
    expect(result).toEqual([
      { Taille: "S", Couleur: "Noir", Matière: "Coton" },
      { Taille: "S", Couleur: "Noir", Matière: "Lin" },
      { Taille: "M", Couleur: "Noir", Matière: "Coton" },
      { Taille: "M", Couleur: "Noir", Matière: "Lin" },
    ]);
  });

  it("ignore les axes vides et garde ceux remplis", () => {
    const result = computeVariantMatrix([
      { name: "Taille", values: ["S"] },
      { name: "Couleur", values: [] },
    ]);
    expect(result).toEqual([{ Taille: "S" }]);
  });
});
