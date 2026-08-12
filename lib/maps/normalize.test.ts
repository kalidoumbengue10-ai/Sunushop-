import { describe, expect, it } from "vitest";
import { normalizePeliasFeature } from "./normalize";

describe("normalisation Pelias", () => {
  it("convertit l'ordre longitude/latitude en réponse SunuShop", () => {
    expect(normalizePeliasFeature({
      geometry: { coordinates: [-17.4677, 14.7167] },
      properties: { label: "Plateau, Dakar", region: "Dakar", locality: "Dakar" },
    })).toEqual({ label: "Plateau, Dakar", region: "Dakar", city: "Dakar", latitude: 14.7167, longitude: -17.4677 });
  });

  it("ignore une géométrie incomplète", () => {
    expect(normalizePeliasFeature({ properties: { label: "Incomplet" } })).toBeNull();
  });
});
