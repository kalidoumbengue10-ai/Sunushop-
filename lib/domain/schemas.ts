import { z } from "zod";

const uuid = z.uuid();
const e164Phone = z
  .string()
  .regex(/^\+[1-9][0-9]{7,14}$/, "Numéro international invalide");
const slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const authEmail = z.email().max(254).transform((value) => value.toLowerCase());
const authPassword = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères.")
  .max(128);
const safeNextPath = z
  .string()
  .max(300)
  .refine(
    (value) => value.startsWith("/") && !value.startsWith("//"),
    "Redirection invalide",
  )
  .optional();

export const signUpWithPasswordSchema = z.object({
  email: authEmail,
  password: authPassword,
  captchaToken: z.string().min(10).optional(),
  next: safeNextPath,
});

export const signInWithPasswordSchema = z.object({
  email: authEmail,
  password: authPassword,
  captchaToken: z.string().min(10).optional(),
});

export const recoverPasswordSchema = z.object({
  email: authEmail,
  captchaToken: z.string().min(10).optional(),
  next: safeNextPath,
});

export const updatePasswordSchema = z.object({
  password: authPassword,
});

export const recoveryEmailSchema = z.object({
  email: z.email(),
});

export const merchantApplicationSchema = z
  .object({
    kind: z.enum(["informal", "formal"]),
    publicName: z.string().trim().min(2).max(120),
    slug: slug.optional(),
    phone: e164Phone,
    email: z.email().optional(),
    legalName: z.string().trim().min(2).max(180).optional(),
    region: z.string().trim().min(2).max(120).optional(),
    city: z.string().trim().min(2).max(120).optional(),
    addressHint: z.string().trim().min(2).max(300).optional(),
    representativeIsLegalOwner: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.kind === "formal" && !value.legalName) {
      context.addIssue({
        code: "custom",
        path: ["legalName"],
        message: "La raison sociale est obligatoire.",
      });
    }
  });

export const verificationDocumentTypeSchema = z.enum([
  "national_id_front",
  "national_id_back",
  "passport_identity",
  "intent_letter",
  "proof_activity",
  "ninea",
  "rccm",
  "representative_mandate",
]);

export const verificationDecisionSchema = z
  .object({
    outcome: z.enum([
      "in_review",
      "needs_changes",
      "approved",
      "rejected",
      "suspended",
    ]),
    reasonCode: z.string().trim().min(2).max(80).optional(),
    merchantMessage: z.string().trim().min(2).max(1000).optional(),
    internalNote: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    if (
      ["needs_changes", "rejected", "suspended"].includes(value.outcome) &&
      (!value.reasonCode || !value.merchantMessage)
    ) {
      context.addIssue({
        code: "custom",
        path: ["reasonCode"],
        message: "Un motif et un message marchand sont obligatoires.",
      });
    }
  });

export const subscriptionPaymentSchema = z.object({
  merchantId: uuid,
  planId: z.enum(["essential", "pro", "network"]),
  channel: z.enum(["wave", "orange_money"]),
  externalReference: z.string().trim().min(4).max(120),
  amountXof: z.int().positive(),
  paidAt: z.iso.datetime(),
});

export const subscriptionDecisionSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().trim().min(2).max(500).optional(),
});

const quoteItemSchema = z.object({
  variantId: uuid,
  quantity: z.int().min(1).max(99),
});

export const quoteGroupSchema = z
  .object({
    merchantId: uuid,
    deliveryZoneId: uuid,
    items: z.array(quoteItemSchema).min(1).max(50),
  })
  .superRefine((value, context) => {
    const variants = new Set<string>();
    value.items.forEach((item, index) => {
      if (variants.has(item.variantId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "variantId"],
          message: "Une variante ne peut apparaître qu’une fois par boutique.",
        });
      }
      variants.add(item.variantId);
    });
  });

export const cartQuoteSchema = z.object({
  groups: z.array(quoteGroupSchema).min(1).max(10),
}).superRefine((value, context) => {
  const merchants = new Set<string>();
  value.groups.forEach((group, index) => {
    if (merchants.has(group.merchantId)) {
      context.addIssue({
        code: "custom",
        path: ["groups", index, "merchantId"],
        message: "Une seule livraison doit être choisie par boutique.",
      });
    }
    merchants.add(group.merchantId);
  });
});

export const orderBatchSchema = z
  .object({
    recipient: z.object({
      name: z.string().trim().min(2).max(120),
      phone: e164Phone,
      region: z.string().trim().min(2).max(120),
      city: z.string().trim().min(2).max(120),
      addressHint: z.string().trim().min(2).max(300),
    }),
    groups: z
      .array(
        quoteGroupSchema.extend({
          paymentMethod: z.enum([
            "cash_on_delivery",
            "wave_direct",
            "orange_money_direct",
          ]),
        }),
      )
      .min(1)
      .max(10),
  })
  .superRefine((value, context) => {
    const merchants = new Set<string>();
    value.groups.forEach((group, index) => {
      if (merchants.has(group.merchantId)) {
        context.addIssue({
          code: "custom",
          path: ["groups", index, "merchantId"],
          message: "Une seule commande doit être créée par boutique.",
        });
      }
      merchants.add(group.merchantId);
    });
  });

export const directPaymentDeclarationSchema = z.object({
  channel: z.enum(["wave", "orange_money"]),
  externalReference: z.string().trim().min(4).max(120),
  amountXof: z.int().positive(),
  declaredAt: z.iso.datetime(),
});

export const orderTransitionSchema = z.object({
  status: z.enum([
    "confirmed",
    "preparing",
    "ready_for_handoff",
    "in_transit",
    "delivered",
    "cancelled",
    "disputed",
  ]),
  publicMessage: z.string().trim().min(2).max(500).optional(),
  internalNote: z.string().trim().max(1000).optional(),
});

export const productInputSchema = z.object({
  merchantId: uuid,
  categoryId: uuid,
  title: z.string().trim().min(2).max(180),
  slug: slug.optional(),
  description: z.string().trim().min(10).max(5000),
  sku: z.string().trim().min(1).max(80),
  variantTitle: z.string().trim().max(120).optional(),
  priceXof: z.int().min(0),
  compareAtPriceXof: z.int().min(0).optional(),
  stock: z.int().min(0).max(1_000_000),
  publish: z.boolean().default(false),
});

export const productPublicationSchema = z.object({
  productId: uuid,
  publish: z.boolean(),
});

export const deliveryZoneInputSchema = z.object({
  merchantId: uuid,
  methodKind: z.enum(["pickup", "merchant_delivery"]),
  methodName: z.string().trim().min(2).max(120),
  region: z.string().trim().min(2).max(120),
  city: z.string().trim().max(120).optional(),
  label: z.string().trim().min(2).max(160),
  feeXof: z.int().min(0),
  minDelayMinutes: z.int().min(0).max(43_200),
  maxDelayMinutes: z.int().min(0).max(43_200),
});

export const merchantSettingsSchema = z.object({
  merchantId: uuid,
  wavePaymentNumber: e164Phone.nullable(),
  orangeMoneyPaymentNumber: e164Phone.nullable(),
});

export const crmLeadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "onboarding",
  "converted",
  "rejected",
  "archived",
]);

export const crmLeadPrioritySchema = z.enum(["low", "normal", "high"]);

export const prelaunchLeadIngestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  businessName: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(30).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  businessType: z.string().trim().max(120).optional().default(""),
  salesChannel: z.string().trim().max(240).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  submittedAt: z.iso.datetime().optional(),
});

export const crmLeadUpdateSchema = z
  .object({
    status: crmLeadStatusSchema.optional(),
    priority: crmLeadPrioritySchema.optional(),
    nextFollowUpAt: z.iso.datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Aucune modification reçue.",
  });

export const crmLeadNoteSchema = z.object({
  body: z.string().trim().min(2).max(3000),
});

export const crmTaskSchema = z.object({
  title: z.string().trim().min(2).max(240),
  dueAt: z.iso.datetime().nullable().optional(),
});

export const crmTaskUpdateSchema = z.object({
  completed: z.boolean(),
});

export const prelaunchLeadSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  shopName: z.string().trim().min(2).max(120),
  email: authEmail,
  phone: z.string().trim().min(8).max(24),
  city: z.string().trim().min(2).max(120).optional(),
  categories: z.array(z.string().trim().min(2).max(80)).max(12).default([]),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true, {
    error: "Votre accord est nécessaire pour être recontacté.",
  }),
  captchaToken: z.string().min(10).optional(),
});

export const merchantLeadApplicationSchema = prelaunchLeadSchema.extend({
  businessType: z.enum(["informal", "formal"]),
  legalName: z.string().trim().min(2).max(180).optional(),
  salesChannel: z.string().trim().min(2).max(240),
}).superRefine((value, context) => {
  if (value.businessType === "formal" && !value.legalName) {
    context.addIssue({ code: "custom", path: ["legalName"], message: "La raison sociale est obligatoire pour une entreprise enregistrée." });
  }
});

export const merchantInvitationSchema = merchantApplicationSchema.safeExtend({
  email: authEmail,
  leadId: uuid.optional(),
});

export const courierInvitationSchema = z.object({
  merchantId: uuid,
  email: authEmail,
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(24),
});

export const invitationClaimSchema = z.object({
  token: z.string().min(32).max(200),
});

export const addressInputSchema = z.object({
  label: z.string().trim().min(2).max(80),
  recipientName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(24),
  region: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  addressHint: z.string().trim().min(2).max(300),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean().default(false),
}).superRefine((value, context) => {
  if ((value.latitude == null) !== (value.longitude == null)) {
    context.addIssue({
      code: "custom",
      path: ["latitude"],
      message: "Latitude et longitude doivent être renseignées ensemble.",
    });
  }
});

export const cartItemInputSchema = z.object({
  variantId: uuid,
  quantity: z.int().min(0).max(99),
});

export const deliveryAssignmentSchema = z.object({
  orderId: uuid,
  courierMembershipId: uuid,
});

export const deliveryStatusSchema = z.object({
  status: z.enum(["accepted", "at_pickup", "in_transit", "failed", "cancelled"]),
  note: z.string().trim().min(2).max(500).optional(),
});

export const deliveryCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Le code doit contenir six chiffres."),
});

export const categoryInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(120),
  slug: slug.optional(),
  description: z.string().trim().max(500).optional(),
  position: z.int().min(0).max(10_000).default(100),
  active: z.boolean().default(true),
});
