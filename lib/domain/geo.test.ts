import { describe, expect, it } from "vitest";
import { distanceKm, hasCoordinatePair, isInSenegalBounds, navigationLinks } from "./geo";

describe("geo", () => {
  it("valide uniquement les coordonnées complètes dans l'enveloppe du Sénégal", () => {
    expect(hasCoordinatePair({ latitude: 14.7167, longitude: -17.4677 })).toBe(true);
    expect(hasCoordinatePair({ latitude: 14.7167, longitude: null })).toBe(false);
    expect(isInSenegalBounds({ latitude: 14.7167, longitude: -17.4677 })).toBe(true);
    expect(isInSenegalBounds({ latitude: 48.8566, longitude: 2.3522 })).toBe(false);
  });

  it("calcule une distance à vol d'oiseau cohérente", () => {
    const distance = distanceKm(
      { latitude: 14.7167, longitude: -17.4677 },
      { latitude: 14.75, longitude: -17.45 },
    );
    expect(distance).toBeGreaterThan(3);
    expect(distance).toBeLessThan(5);
  });

  it("construit des liens de navigation sans fournisseur payant", () => {
    const links = navigationLinks({ latitude: 14.7167, longitude: -17.4677, label: "Boutique" });
    expect(links.app).toContain("geo:14.7167,-17.4677");
    expect(links.openStreetMap).toContain("openstreetmap.org");
  });
});
