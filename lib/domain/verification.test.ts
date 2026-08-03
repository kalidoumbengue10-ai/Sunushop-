import { describe, expect, it } from "vitest";
import {
  isVerificationChecklistComplete,
  requiredVerificationDocuments,
} from "./verification";

describe("checklist KYC", () => {
  it("garde le passeport facultatif et exige la CNI", () => {
    expect(
      isVerificationChecklistComplete("informal", true, [
        "passport_identity",
        "intent_letter",
        "proof_activity",
      ]),
    ).toBe(false);
    expect(requiredVerificationDocuments("informal", true).optional).toEqual([
      "passport_identity",
    ]);
  });

  it("exige les deux faces de la CNI", () => {
    expect(
      isVerificationChecklistComplete("informal", true, [
        "national_id_front",
        "intent_letter",
        "proof_activity",
      ]),
    ).toBe(false);
  });

  it("exige NINEA, RCCM et mandat lorsque nécessaire", () => {
    expect(requiredVerificationDocuments("formal", false).required).toEqual([
      "national_id_front",
      "national_id_back",
      "intent_letter",
      "proof_activity",
      "ninea",
      "rccm",
      "representative_mandate",
    ]);
  });
});
