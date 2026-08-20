import { describe, expect, it } from "vitest";
import {
  isCourierVerificationChecklistComplete,
  requiredCourierVerificationDocuments,
  vehicleRequiresRegistration,
} from "./courier-verification";

describe("dossier de vérification du livreur", () => {
  it("n'exige que la pièce d'identité pour un livreur à pied ou à vélo", () => {
    for (const vehicle of ["walking", "bicycle"] as const) {
      expect(requiredCourierVerificationDocuments(vehicle).required).toEqual([
        "national_id_front",
        "national_id_back",
      ]);
      expect(vehicleRequiresRegistration(vehicle)).toBe(false);
    }
  });

  it("exige la carte grise pour un véhicule motorisé", () => {
    for (const vehicle of ["motorbike", "car", "van", "other"] as const) {
      expect(requiredCourierVerificationDocuments(vehicle).required).toContain(
        "vehicle_registration_document",
      );
      expect(vehicleRequiresRegistration(vehicle)).toBe(true);
    }
  });

  it("accepte le passeport à la place de la carte d'identité recto/verso", () => {
    expect(isCourierVerificationChecklistComplete("bicycle", ["passport_identity"])).toBe(true);
    expect(isCourierVerificationChecklistComplete("bicycle", ["national_id_front"])).toBe(false);
    expect(
      isCourierVerificationChecklistComplete("bicycle", ["national_id_front", "national_id_back"]),
    ).toBe(true);
  });

  it("refuse un dossier motorisé sans carte grise", () => {
    expect(
      isCourierVerificationChecklistComplete("motorbike", ["national_id_front", "national_id_back"]),
    ).toBe(false);
    expect(
      isCourierVerificationChecklistComplete("motorbike", [
        "national_id_front",
        "national_id_back",
        "vehicle_registration_document",
      ]),
    ).toBe(true);
  });

  it("propose le passeport en document optionnel", () => {
    expect(requiredCourierVerificationDocuments("car").optional).toEqual(["passport_identity"]);
  });
});
