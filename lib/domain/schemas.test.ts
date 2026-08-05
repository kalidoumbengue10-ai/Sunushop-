import { describe, expect, it } from "vitest";
import {
  cartQuoteSchema,
  crmLeadUpdateSchema,
  merchantApplicationSchema,
  orderBatchSchema,
  productDetailsSchema,
  prelaunchLeadIngestSchema,
  signUpWithPasswordSchema,
} from "./schemas";

const merchantA = "00000000-0000-4000-8000-000000000001";
const zoneA = "00000000-0000-4000-8000-000000000002";
const variantA = "00000000-0000-4000-8000-000000000003";

describe("validation des entrées métier", () => {
  it("accepte un SKU facultatif et refuse les combinaisons dupliquées", () => {
    const base = {
      categoryId: "00000000-0000-4000-8000-000000000010",
      title: "T-shirt Sunu",
      description: "Un produit suffisamment bien décrit.",
      optionNames: ["Taille"],
    };
    expect(productDetailsSchema.safeParse({ ...base, variants: [{ title: "M", attributes: { Taille: "M" }, priceXof: 5000, stock: 4 }] }).success).toBe(true);
    expect(productDetailsSchema.safeParse({ ...base, variants: [
      { title: "M", attributes: { Taille: "M" }, priceXof: 5000, stock: 4 },
      { title: "M bis", attributes: { Taille: "M" }, priceXof: 5500, stock: 2 },
    ] }).success).toBe(false);
  });
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

  it("normalise une candidature issue du site", () => {
    const result = prelaunchLeadIngestSchema.parse({
      name: "Awa Ndiaye",
      businessName: "Maison Awa",
      email: "AWA@EXEMPLE.COM",
      city: "Dakar",
    });
    expect(result.email).toBe("awa@exemple.com");
    expect(result.phone).toBe("");
  });

  it("refuse une mise à jour CRM vide", () => {
    expect(crmLeadUpdateSchema.safeParse({}).success).toBe(false);
  });
});
