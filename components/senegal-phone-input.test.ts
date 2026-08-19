import { describe, expect, it } from "vitest";
import { senegalNationalNumber, toSenegalPhone } from "./senegal-phone-input";

describe("numéro sénégalais", () => {
  it("affiche uniquement les neuf chiffres après +221", () => {
    expect(senegalNationalNumber("+221 77 123 45 67")).toBe("771234567");
  });

  it("transforme une saisie locale en numéro international", () => {
    expect(toSenegalPhone("77 123 45 67")).toBe("+221771234567");
  });
});
