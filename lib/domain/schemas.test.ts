import { describe, expect, it } from "vitest";
import {
  cartQuoteSchema,
  merchantApplicationSchema,
  orderBatchSchema,
  signUpWithPasswordSchema,
} from "./schemas";

const merchantA = "00000000-0000-4000-8000-000000000001";
const zoneA = "00000000-0000-4000-8000-000000000002";
const variantA = "00000000-0000-4000-8000-000000000003";

describe("validation des entrées métier", () => {
  it("normalise un email d’inscription valide", () => {
    const result = signUpWithPasswordSchema.parse({
      email: "CLIENT@EXEMPLE.COM",
      password: "mot-de-passe-solide",
      next: "/client",
    });
    expect(result.email).toBe("client@exemple.com");
  });

  it("refuse un mot de passe court ou une redirection externe", () => {
    expect(
      signUpWithPasswordSchema.safeParse({
        email: "client@exemple.com",
        password: "court",
        next: "//site-malveillant.example",
      }).success,
    ).toBe(false);
  });

  it("exige une raison sociale pour un marchand formel", () => {
    const result = merchantApplicationSchema.safeParse({
      kind: "formal",
      publicName: "Atelier Dakar",
      slug: "atelier-dakar",
      phone: "+221770000000",
      representativeIsLegalOwner: true,
    });
    expect(result.success).toBe(false);
  });

  it("refuse une variante dupliquée dans un groupe", () => {
    const result = cartQuoteSchema.safeParse({
      groups: [
        {
          merchantId: merchantA,
          deliveryZoneId: zoneA,
          items: [
            { variantId: variantA, quantity: 1 },
            { variantId: variantA, quantity: 2 },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("refuse deux groupes pour le même marchand", () => {
    const result = orderBatchSchema.safeParse({
      recipient: {
        name: "Awa Ndiaye",
        phone: "+221770000001",
        region: "Dakar",
        city: "Dakar",
        addressHint: "Près du marché",
      },
      groups: [
        {
          merchantId: merchantA,
          deliveryZoneId: zoneA,
          paymentMethod: "cash_on_delivery",
          items: [{ variantId: variantA, quantity: 1 }],
        },
        {
          merchantId: merchantA,
          deliveryZoneId: "00000000-0000-4000-8000-000000000004",
          paymentMethod: "wave_direct",
          items: [
            {
              variantId: "00000000-0000-4000-8000-000000000005",
              quantity: 1,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
