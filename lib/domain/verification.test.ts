import { describe, expect, it } from "vitest";
import {
  isVerificationChecklistComplete,
  requiredVerificationDocuments,
} from "./verification";

describe("checklist KYC", () => {
  it("accepte le passeport pour un marchand informel", () => {
    expect(
      isVerificationChecklistComplete("informal", true, [
        "passport_identity",
        "intent_letter",
        "proof_activity",
      ]),
    ).toBe(true);
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
      "intent_letter",
      "proof_activity",
      "ninea",
      "rccm",
      "representative_mandate",
    ]);
  });
});
