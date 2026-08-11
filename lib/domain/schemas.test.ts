import { describe, expect, it } from "vitest";
import {
  cartQuoteSchema,
  courierPayoutSchema,
  crmLeadUpdateSchema,
  intentLetterSubmissionSchema,
  merchantApplicationSchema,
  orderBatchSchema,
  productDetailsSchema,
  productMediaOrderSchema,
  prelaunchLeadIngestSchema,
  signUpWithPasswordSchema,
  subscriptionPaymentSchema,
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
  it("refuse un ordre de photos incomplet ou dupliqué côté API", () => {
    const mediaA = "00000000-0000-4000-8000-000000000020";
    const mediaB = "00000000-0000-4000-8000-000000000021";
    expect(productMediaOrderSchema.safeParse({ mediaIds: [mediaA, mediaB] }).success).toBe(true);
    expect(productMediaOrderSchema.safeParse({ mediaIds: [mediaA, mediaA] }).success).toBe(false);
    expect(productMediaOrderSchema.safeParse({ mediaIds: [] }).success).toBe(false);
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

  it("refuse la lettre d'intention sans certification sur l'honneur", () => {
    const base = {
      signatoryName: "Awa Diop",
      signatoryBirthDate: "1990-05-12",
      idType: "cni" as const,
      idNumber: "1234567890123",
      signatoryRole: "Propriétaire",
      actingFor: "own_account" as const,
      activityDescription: "Vente de vêtements traditionnels et accessoires.",
      signaturePlace: "Dakar",
    };
    expect(intentLetterSubmissionSchema.safeParse({ ...base, certify: false }).success).toBe(false);
    expect(intentLetterSubmissionSchema.safeParse(base).success).toBe(false);
    expect(intentLetterSubmissionSchema.safeParse({ ...base, certify: true }).success).toBe(true);
  });

  it("refuse une description d'activité trop courte ou un numéro de pièce invalide", () => {
    const base = {
      signatoryName: "Awa Diop",
      signatoryBirthDate: "1990-05-12",
      idType: "cni" as const,
      idNumber: "123",
      signatoryRole: "Propriétaire",
      actingFor: "own_account" as const,
      activityDescription: "Trop court",
      signaturePlace: "Dakar",
      certify: true as const,
    };
    expect(intentLetterSubmissionSchema.safeParse(base).success).toBe(false);
    expect(
      intentLetterSubmissionSchema.safeParse({
        ...base,
        idNumber: "1234567890123",
        activityDescription: "Vente de vêtements traditionnels et accessoires artisanaux.",
      }).success,
    ).toBe(true);
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

describe("règlements livreur", () => {
  it("limite le règlement groupé à Wave/Orange Money avec une référence unique", () => {
    const base = { merchantId: merchantA, courierMembershipId: zoneA, deliveryIds: [variantA], paidAt: "2026-08-10T12:00:00.000Z" };
    expect(courierPayoutSchema.safeParse({ ...base, paymentMethod: "cash" }).success).toBe(false);
    expect(courierPayoutSchema.safeParse({ ...base, paymentMethod: "wave" }).success).toBe(false);
    expect(courierPayoutSchema.safeParse({ ...base, paymentMethod: "wave", externalReference: "WAVE-42" }).success).toBe(true);
    expect(courierPayoutSchema.safeParse({ ...base, paymentMethod: "orange_money", externalReference: "OM-42", deliveryIds: [variantA, variantA] }).success).toBe(false);
  });
});

describe("paiements directs et abonnements", () => {
  const recipient = { name: "Awa Ndiaye", phone: "+221770000001", region: "Dakar", city: "Dakar", addressHint: "Près du marché" };

  it("autorise les espèces uniquement pour un retrait boutique", () => {
    const group = { merchantId: merchantA, paymentMethod: "cash_on_delivery" as const, items: [{ variantId: variantA, quantity: 1 }] };
    expect(orderBatchSchema.safeParse({ recipient, groups: [{ ...group, methodKind: "merchant_delivery", deliveryZoneId: zoneA }] }).success).toBe(false);
    expect(orderBatchSchema.safeParse({ recipient, groups: [{ ...group, methodKind: "pickup" }] }).success).toBe(true);
  });

  it("accepte les trois cycles sans montant fourni par le marchand", () => {
    for (const billingCycle of ["monthly", "quarterly", "annual"] as const) {
      expect(subscriptionPaymentSchema.safeParse({ merchantId: merchantA, planId: "pro", billingCycle, channel: "wave", externalReference: `REF-${billingCycle}`, paidAt: "2026-08-11T12:00:00.000Z" }).success).toBe(true);
    }
    const parsed = subscriptionPaymentSchema.parse({ merchantId: merchantA, planId: "pro", billingCycle: "annual", channel: "wave", externalReference: "REF-ANNUAL", paidAt: "2026-08-11T12:00:00.000Z", amountXof: 1 });
    expect("amountXof" in parsed).toBe(false);
  });
});
