import { describe, expect, it } from "vitest";
import { prelaunchLeadSchema } from "./schemas";

describe("préinscription commerçant", () => {
  it("normalise l’email et exige le consentement", () => {
    const result = prelaunchLeadSchema.parse({
      contactName: "Awa Ndiaye",
      shopName: "Atelier Awa",
      email: "AWA@EXAMPLE.TEST",
      phone: "+221770000000",
      categories: ["Mode"],
      consent: true,
    });
    expect(result.email).toBe("awa@example.test");
    expect(() => prelaunchLeadSchema.parse({ ...result, consent: false })).toThrow();
  });
});
