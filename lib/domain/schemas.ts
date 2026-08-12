import { z } from "zod";
import { isInSenegalBounds } from "@/lib/domain/geo";

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

export const verificationDocumentUploadRequestSchema = z.object({
  documentType: verificationDocumentTypeSchema,
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.int().min(1).max(10 * 1024 * 1024),
  mimeType: z.string().trim().max(120).optional(),
});

export const verificationDocumentFinalizeSchema = z.object({
  documentType: verificationDocumentTypeSchema,
  storagePath: z.string().trim().min(20).max(800),
});

export const intentLetterSubmissionSchema = z.object({
  signatoryName: z.string().trim().min(2).max(120),
  signatoryBirthDate: z.iso.date(),
  idType: z.enum(["cni", "passeport"]),
  idNumber: z.string().trim().min(4).max(40),
  signatoryRole: z.string().trim().min(2).max(120),
  actingFor: z.enum(["own_account", "company_account"]),
  activityDescription: z.string().trim().min(10).max(600),
  signaturePlace: z.string().trim().min(2).max(120),
  certify: z.literal(true, {
    error: "Vous devez certifier l’exactitude de vos déclarations.",
  }),
});

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
  billingCycle: z.enum(["monthly", "quarterly", "annual"]),
  channel: z.enum(["wave", "orange_money"]),
  externalReference: z.string().trim().min(4).max(120),
  paidAt: z.iso.datetime(),
});

export const subscriptionDecisionSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().trim().min(2).max(500).optional(),
});

export const subscriptionTestActivationSchema = z.object({
  merchantId: uuid,
  planId: z.string().trim().min(1).max(60).optional(),
  days: z.int().min(1).max(90).default(30),
});

const quoteItemSchema = z.object({
  variantId: uuid,
  quantity: z.int().min(1).max(99),
});

const deliveryCoordinatesSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
}).refine(isInSenegalBounds, "Choisissez un point situé au Sénégal.");

const quoteDestinationSchema = deliveryCoordinatesSchema.extend({
  region: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
});

export const quoteGroupSchema = z
  .object({
    merchantId: uuid,
    deliveryZoneId: uuid.optional(),
    methodKind: z.enum(["pickup", "merchant_delivery"]).default("merchant_delivery"),
    applyLoyalty: z.boolean().default(false).transform(() => false),
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
    if (value.methodKind === "merchant_delivery" && !value.deliveryZoneId) {
      context.addIssue({
        code: "custom",
        path: ["deliveryZoneId"],
        message: "Une zone de livraison est requise.",
      });
    }
  });

export const cartQuoteSchema = z.object({
  groups: z.array(quoteGroupSchema).min(1).max(10),
  destination: quoteDestinationSchema.optional(),
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
  if (value.groups.some((group) => group.methodKind === "merchant_delivery") && !value.destination) {
    context.addIssue({ code: "custom", path: ["destination"], message: "La destination GPS est requise pour la livraison." });
  }
});

export const orderBatchSchema = z
  .object({
    recipient: z.object({
      name: z.string().trim().min(2).max(120),
      phone: e164Phone,
      region: z.string().trim().min(2).max(120),
      city: z.string().trim().min(2).max(120),
      addressHint: z.string().trim().min(2).max(300),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
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
      if (group.paymentMethod === "cash_on_delivery" && group.methodKind !== "pickup") {
        context.addIssue({
          code: "custom",
          path: ["groups", index, "paymentMethod"],
          message: "Les espèces sont réservées au retrait en boutique.",
        });
      }
      merchants.add(group.merchantId);
    });
    const hasDelivery = value.groups.some((group) => group.methodKind === "merchant_delivery");
    const hasLatitude = value.recipient.latitude !== undefined;
    const hasLongitude = value.recipient.longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      context.addIssue({ code: "custom", path: ["recipient", "latitude"], message: "Latitude et longitude doivent être renseignées ensemble." });
    } else if (hasDelivery && (!hasLatitude || !hasLongitude)) {
      context.addIssue({ code: "custom", path: ["recipient", "latitude"], message: "La destination GPS est requise pour la livraison." });
    } else if (hasLatitude && hasLongitude && !isInSenegalBounds({ latitude: value.recipient.latitude!, longitude: value.recipient.longitude! })) {
      context.addIssue({ code: "custom", path: ["recipient", "latitude"], message: "Choisissez un point situé au Sénégal." });
    }
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
  sku: z.string().trim().max(80).optional().transform((value) => value || undefined),
  variantTitle: z.string().trim().max(120).optional(),
  priceXof: z.int().min(0),
  compareAtPriceXof: z.int().min(0).optional(),
  stock: z.int().min(0).max(1_000_000),
  publish: z.boolean().default(false),
});

export const productDraftSchema = z.object({
  merchantId: uuid,
  categoryId: uuid,
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().min(10).max(5000),
});

const productVariantEditorSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().max(120).optional(),
  attributes: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(80)).default({}),
  sku: z.string().trim().max(80).optional().transform((value) => value || undefined),
  priceXof: z.int().min(0),
  compareAtPriceXof: z.int().min(0).optional(),
  stock: z.int().min(0).max(1_000_000),
  lowStockThreshold: z.int().min(0).max(1_000_000).default(5),
  active: z.boolean().default(true),
});

export const productDetailsSchema = z.object({
  categoryId: uuid,
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().min(10).max(5000),
  optionNames: z.array(z.string().trim().min(1).max(40)).max(3).default([]),
  variants: z.array(productVariantEditorSchema).min(1).max(50),
}).superRefine((value, context) => {
  const combinations = new Set<string>();
  value.variants.forEach((variant, index) => {
    const key = Object.entries(variant.attributes)
      .sort(([left], [right]) => left.localeCompare(right, "fr"))
      .map(([name, option]) => `${name.toLocaleLowerCase("fr")}:${option.toLocaleLowerCase("fr")}`)
      .join("|") || "standard";
    if (combinations.has(key)) {
      context.addIssue({ code: "custom", path: ["variants", index, "attributes"], message: "Cette combinaison existe déjà." });
    }
    combinations.add(key);
    if (variant.compareAtPriceXof !== undefined && variant.compareAtPriceXof < variant.priceXof) {
      context.addIssue({ code: "custom", path: ["variants", index, "compareAtPriceXof"], message: "Le prix barré doit être supérieur ou égal au prix de vente." });
    }
  });
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
  courierFeeXof: z.int().min(0).nullable().optional(),
  minDelayMinutes: z.int().min(0).max(43_200),
  maxDelayMinutes: z.int().min(0).max(43_200),
});

export const deliveryRegionInputSchema = z.object({
  merchantId: uuid,
  zoneId: uuid.optional(),
  region: z.string().trim().min(2).max(120),
  enabled: z.boolean().default(true),
  feeXof: z.int().min(0),
  courierFeeXof: z.int().min(0).nullable(),
  minDelayDays: z.int().min(0).max(30),
  maxDelayDays: z.int().min(0).max(30),
  categoryRates: z.array(z.object({
    categoryId: uuid,
    feeXof: z.int().min(0),
  })).max(100).default([]),
}).refine((value) => value.maxDelayDays >= value.minDelayDays, {
  path: ["maxDelayDays"],
  message: "Le délai maximal doit être supérieur au délai minimal.",
});

export const merchantAnalyticsQuerySchema = z.object({
  merchantId: uuid,
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  granularity: z.enum(["day", "week", "month", "year"]).default("day"),
}).refine((value) => new Date(value.to).getTime() > new Date(value.from).getTime(), {
  path: ["to"],
  message: "La fin de période doit suivre le début.",
});

export const adminAnalyticsQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
}).refine((value) => new Date(value.to).getTime() > new Date(value.from).getTime(), {
  path: ["to"],
  message: "La fin de période doit suivre le début.",
});

export const merchantSettingsSchema = z.object({
  merchantId: uuid,
  wavePaymentNumber: e164Phone.nullable(),
  orangeMoneyPaymentNumber: e164Phone.nullable(),
});

export const productMediaOrderSchema = z.object({
  mediaIds: z.array(uuid).min(1).max(8).refine((ids) => new Set(ids).size === ids.length, {
    message: "Une photo ne peut apparaître qu’une seule fois.",
  }),
});

export const merchantOnboardingUpdateSchema = z.object({
  merchantId: uuid,
  caseId: uuid,
  contactName: z.string().trim().min(2).max(120),
  shopName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(24),
  city: z.string().trim().max(120).optional().default(""),
  businessType: z.enum(["informal", "formal"]),
  legalName: z.string().trim().max(180).optional().default(""),
  salesChannel: z.string().trim().min(2).max(240),
  categories: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
}).superRefine((value, context) => {
  if (value.businessType === "formal" && !value.legalName) {
    context.addIssue({ code: "custom", path: ["legalName"], message: "La raison sociale est obligatoire." });
  }
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
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Aucune modification reçue.",
  });

export const crmLeadNoteSchema = z.object({
  body: z.string().trim().min(2).max(3000),
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

export const merchantFastTrackSignupSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  shopName: z.string().trim().min(2).max(120),
  email: authEmail,
  password: authPassword,
  phone: z.string().trim().min(8).max(24),
  city: z.string().trim().min(2).max(120).optional(),
  categories: z.array(z.string().trim().min(2).max(80)).max(12).default([]),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true, {
    error: "Votre accord est nécessaire pour être recontacté.",
  }),
  captchaToken: z.string().min(10).optional(),
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
  vehicleType: z.enum(["walking", "bicycle", "motorbike", "car", "van", "other"]).optional(),
  vehicleRegistration: z.string().trim().min(2).max(40).optional(),
});

export const courierUpdateSchema = z.object({
  merchantId: uuid,
  membershipId: uuid,
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(24),
  vehicleType: z.enum(["walking", "bicycle", "motorbike", "car", "van", "other"]).nullable().optional(),
  vehicleRegistration: z.string().trim().min(2).max(40).nullable().optional(),
  status: z.enum(["active", "inactive"]),
});

export const loyaltySettingSchema = z.object({
  merchantId: uuid,
  accrualEnabled: z.boolean(),
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
  } else if (value.latitude != null && value.longitude != null && !isInSenegalBounds({ latitude: value.latitude, longitude: value.longitude })) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "L’adresse doit être située au Sénégal." });
  }
});

export const cartItemInputSchema = z.object({
  variantId: uuid,
  quantity: z.int().min(0).max(99),
});

export const shopFollowInputSchema = z.object({
  merchantId: uuid,
});

export const conversationCreateSchema = z.object({
  kind: z.enum(["buyer_merchant", "buyer_support"]),
  merchantId: uuid.optional(),
  orderId: uuid.optional(),
  productId: uuid.optional(),
  subject: z.string().trim().max(160).optional(),
}).refine(
  (value) => (value.kind === "buyer_merchant") === Boolean(value.merchantId),
  { message: "merchantId est requis pour un fil marchand et interdit pour un fil support.", path: ["merchantId"] },
);

export const messageCreateSchema = z.object({
  body: z.string().trim().min(1).max(4000),
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

export const directPaymentDecisionSchema = z.object({
  declarationId: uuid,
  decision: z.enum(["confirmed", "rejected"]),
  rejectionReason: z.string().trim().min(4).max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.decision === "rejected" && !value.rejectionReason) {
    context.addIssue({ code: "custom", path: ["rejectionReason"], message: "Le motif du refus est obligatoire." });
  }
});

export const orderRefundDeclarationSchema = z.object({
  amountXof: z.int().positive(),
  channel: z.enum(["wave", "orange_money"]),
  externalReference: z.string().trim().min(2).max(120),
  destinationNumber: e164Phone,
});

export const orderRefundDecisionSchema = z.object({
  refundId: uuid,
  decision: z.enum(["confirmed", "contested"]),
  contestReason: z.string().trim().min(4).max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.decision === "contested" && !value.contestReason) {
    context.addIssue({ code: "custom", path: ["contestReason"], message: "Le motif de contestation est obligatoire." });
  }
});

export const courierCompensationSchema = z.object({
  amountXof: z.int().min(0).max(100_000_000),
});

export const courierPayoutSchema = z.object({
  merchantId: uuid,
  courierMembershipId: uuid,
  deliveryIds: z.array(uuid).min(1).max(200).refine((ids) => new Set(ids).size === ids.length, {
    message: "Une livraison ne peut être ajoutée qu’une fois.",
  }),
  paymentMethod: z.enum(["wave", "orange_money"]),
  externalReference: z.string().trim().min(2).max(120),
  paidAt: z.iso.datetime(),
});

export const courierPaymentProfileSchema = z.object({
  wavePaymentNumber: e164Phone.nullable(),
  orangeMoneyPaymentNumber: e164Phone.nullable(),
  preferredPaymentChannel: z.enum(["wave", "orange_money"]).nullable(),
}).superRefine((value, context) => {
  if (value.preferredPaymentChannel === "wave" && !value.wavePaymentNumber) {
    context.addIssue({ code: "custom", path: ["wavePaymentNumber"], message: "Le numéro Wave préféré est obligatoire." });
  }
  if (value.preferredPaymentChannel === "orange_money" && !value.orangeMoneyPaymentNumber) {
    context.addIssue({ code: "custom", path: ["orangeMoneyPaymentNumber"], message: "Le numéro Orange Money préféré est obligatoire." });
  }
});

export const courierPayoutDecisionSchema = z.object({
  decision: z.enum(["confirmed", "contested"]),
  contestReason: z.string().trim().min(4).max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.decision === "contested" && !value.contestReason) {
    context.addIssue({ code: "custom", path: ["contestReason"], message: "Le motif de contestation est obligatoire." });
  }
});

export const courierPayoutVoidSchema = z.object({
  reason: z.string().trim().min(4).max(500),
});

export const deliveryDisputeResolutionSchema = z.object({
  outcome: z.enum(["resolved", "dismissed"]),
  resolution: z.string().trim().min(4).max(1000),
});

export const orderDisputeSchema = z.object({
  reason: z.string().trim().min(20).max(1000),
});

export const directDisputeResolutionSchema = z.object({
  resolution: z.enum(["refund_required", "no_refund"]),
  note: z.string().trim().min(4).max(1000),
});

export const platformPaymentSettingsSchema = z.object({
  channel: z.enum(["wave", "orange_money"]),
  paymentNumber: e164Phone,
  accountHolder: z.string().trim().min(2).max(120).nullable().optional(),
  active: z.boolean(),
  paymentLink: z
    .string()
    .trim()
    .regex(/^https:\/\/pay\.wave\.com\/m\/[A-Za-z0-9_-]+\/c\/sn\/$/)
    .nullable()
    .optional(),
});

export const disputeResolutionSchema = z.object({
  resolution: z.enum(["release", "refund"]),
  note: z.string().trim().max(1000).optional(),
});

export const merchantPickupSettingsSchema = z.object({
  merchantId: uuid,
  pickupEnabled: z.boolean(),
  pickupAddressLine: z.string().trim().min(4).max(300).nullable(),
  pickupLatitude: z.number().min(-90).max(90).nullable().optional(),
  pickupLongitude: z.number().min(-180).max(180).nullable().optional(),
  pickupHours: z.string().trim().max(200).nullable().optional(),
  pickupInstructions: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (!value.pickupAddressLine) {
    context.addIssue({
      code: "custom",
      path: ["pickupAddressLine"],
      message: "L’adresse publique de la boutique est requise.",
    });
  }
  if ((value.pickupLatitude == null) !== (value.pickupLongitude == null)) {
    context.addIssue({
      code: "custom",
      path: ["pickupLatitude"],
      message: "Latitude et longitude doivent être renseignées ensemble.",
    });
  } else if (value.pickupLatitude == null || value.pickupLongitude == null) {
    context.addIssue({ code: "custom", path: ["pickupLatitude"], message: "Placez la boutique sur la carte." });
  } else if (!isInSenegalBounds({ latitude: value.pickupLatitude, longitude: value.pickupLongitude })) {
    context.addIssue({ code: "custom", path: ["pickupLatitude"], message: "La boutique doit être située au Sénégal." });
  }
});

export const subscriptionGrantSchema = z.object({
  merchantId: uuid,
  planId: z.enum(["essential", "pro", "network"]),
  days: z.int().min(1).max(365),
  reason: z.string().trim().min(4).max(500),
});

export const categoryInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(120),
  slug: slug.optional(),
  description: z.string().trim().max(500).optional(),
  position: z.int().min(0).max(10_000).default(100),
  active: z.boolean().default(true),
});
