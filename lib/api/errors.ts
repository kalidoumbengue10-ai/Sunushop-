import { ZodError } from "zod";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
    requestId: string;
  };
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

const databaseErrorMap: Record<string, { status: number; message: string }> = {
  AUTHENTICATION_REQUIRED: {
    status: 401,
    message: "Connectez-vous pour continuer.",
  },
  FORBIDDEN: { status: 403, message: "Cette action n’est pas autorisée." },
  KYC_APPROVAL_REQUIRED: {
    status: 403,
    message: "Votre dossier doit être validé avant d’accéder aux outils de la boutique.",
  },
  MERCHANT_SUSPENDED: {
    status: 403,
    message: "Cette boutique est suspendue par SunuShop.",
  },
  MERCHANT_APPLICATION_ALREADY_EXISTS: {
    status: 409,
    message: "Vous avez déjà une boutique associée à ce compte.",
  },
  MERCHANT_NOT_PUBLISHABLE: {
    status: 409,
    message: "Votre abonnement doit être actif pour publier vos produits.",
  },
  REVIEWER_MFA_REQUIRED: {
    status: 403,
    message: "Une authentification renforcée est requise.",
  },
  ADMIN_MFA_REQUIRED: {
    status: 403,
    message: "Une authentification renforcée est requise.",
  },
  VERIFICATION_CASE_NOT_FOUND: {
    status: 404,
    message: "Dossier de vérification introuvable.",
  },
  VERIFICATION_DOCUMENTS_INCOMPLETE: {
    status: 422,
    message: "Le dossier documentaire est incomplet.",
  },
  MERCHANT_NOT_ORDERABLE: {
    status: 409,
    message: "Cette boutique ne peut pas recevoir de commandes actuellement.",
  },
  DELIVERY_ZONE_UNAVAILABLE: {
    status: 409,
    message: "La zone de livraison n’est plus disponible.",
  },
  INSUFFICIENT_STOCK: {
    status: 409,
    message: "Le stock a changé. Vérifiez votre panier.",
  },
  VARIANT_UNAVAILABLE: {
    status: 409,
    message: "Un produit du panier n’est plus disponible.",
  },
  PAYMENT_AMOUNT_MISMATCH: {
    status: 422,
    message: "Le montant ne correspond pas au plan sélectionné.",
  },
  MERCHANT_DOCUMENTS_NOT_APPROVED: {
    status: 409,
    message: "Validez d’abord les documents du commerçant avant d’activer son abonnement.",
  },
  SUBSCRIPTION_PLAN_NOT_FOUND: {
    status: 404,
    message: "Le plan d’abonnement sélectionné est indisponible.",
  },
  TEST_SUBSCRIPTION_DURATION_INVALID: {
    status: 422,
    message: "La durée de l’abonnement test doit être comprise entre 1 et 90 jours.",
  },
  ORDER_TRANSITION_NOT_ALLOWED: {
    status: 409,
    message: "Ce changement de statut n’est pas autorisé.",
  },
  PRODUCT_PUBLICATION_LOCKED: {
    status: 409,
    message: "Votre abonnement doit être actif pour publier vos produits.",
  },
  PRODUCT_NOT_FOUND: {
    status: 404,
    message: "Produit introuvable.",
  },
  CASE_ASSIGNED_TO_ANOTHER_REVIEWER: {
    status: 409,
    message: "Ce dossier est déjà attribué à un autre reviewer.",
  },
  PAYMENT_CHANNEL_MISMATCH: {
    status: 422,
    message: "Le canal ne correspond pas au mode de paiement de la commande.",
  },
  PAYMENT_DECLARATION_NOT_FOUND: {
    status: 404,
    message: "Déclaration de paiement introuvable.",
  },
  INVITATION_NOT_FOUND: {
    status: 404,
    message: "Cette invitation est invalide ou expirée.",
  },
  COURIER_VERIFICATION_CASE_NOT_FOUND: {
    status: 404,
    message: "Dossier livreur introuvable.",
  },
  COURIER_VERIFICATION_CASE_LOCKED: {
    status: 409,
    message: "Votre dossier est en cours de vérification et ne peut plus être modifié.",
  },
  COURIER_VERIFICATION_STATUS_INVALID: {
    status: 409,
    message: "Ce dossier ne peut pas être soumis dans son état actuel.",
  },
  COURIER_VERIFICATION_DOCUMENTS_INCOMPLETE: {
    status: 422,
    message: "Ajoutez votre pièce d’identité et, pour un véhicule motorisé, la carte grise.",
  },
  COURIER_VERIFICATION_OUTCOME_INVALID: {
    status: 422,
    message: "La décision de vérification est invalide.",
  },
  COURIER_NOT_VERIFIED: {
    status: 409,
    message: "Ce livreur n’a pas encore terminé sa vérification.",
  },
  COURIER_ALREADY_LINKED: {
    status: 409,
    message: "Ce livreur fait déjà partie de votre équipe.",
  },
  COURIER_INVITATION_NOT_FOUND: {
    status: 404,
    message: "Cette invitation est introuvable.",
  },
  COURIER_INVITATION_ALREADY_ANSWERED: {
    status: 409,
    message: "Vous avez déjà répondu à cette invitation.",
  },
  INVITATION_EMAIL_MISMATCH: {
    status: 403,
    message: "Connectez-vous avec l’adresse email invitée.",
  },
  DELIVERY_NOT_FOUND: {
    status: 404,
    message: "Livraison introuvable.",
  },
  DELIVERY_TRANSITION_NOT_ALLOWED: {
    status: 409,
    message: "Ce changement d’état de livraison n’est pas autorisé.",
  },
  DELIVERY_CODE_INVALID: {
    status: 422,
    message: "Le code de livraison est invalide.",
  },
  DELIVERY_CODE_LOCKED: {
    status: 429,
    message: "Trop de tentatives. Contactez le commerçant.",
  },
  ORDER_NOT_FOUND: {
    status: 404,
    message: "Commande introuvable.",
  },
  ORDER_NOT_REMOVABLE: {
    status: 409,
    message: "Cette commande doit rester visible pour son suivi ou son remboursement.",
  },
  COURIER_FEE_NOT_CONFIGURED: {
    status: 409,
    message: "Fixez d’abord la rémunération du livreur pour cette zone.",
  },
  COURIER_COMPENSATION_INVALID: {
    status: 422,
    message: "La compensation du livreur est invalide.",
  },
  DELIVERY_NOT_FAILED: {
    status: 409,
    message: "Seule une livraison en échec peut recevoir une compensation manuelle.",
  },
  COURIER_DELIVERIES_REQUIRED: {
    status: 422,
    message: "Sélectionnez au moins une livraison à régler.",
  },
  COURIER_DELIVERY_NOT_PAYABLE: {
    status: 409,
    message: "Une livraison sélectionnée n’est pas payable ou appartient à un autre livreur.",
  },
  COURIER_PAYOUT_NOT_FOUND: {
    status: 404,
    message: "Ce règlement livreur est introuvable.",
  },
  COURIER_PAYOUT_VOID_REASON_REQUIRED: {
    status: 422,
    message: "Indiquez la raison de l’annulation du règlement.",
  },
  DELIVERY_DISPUTE_NOT_ALLOWED: {
    status: 409,
    message: "Aucun litige livraison ne peut être ouvert à ce stade.",
  },
  DELIVERY_DISPUTE_NOT_FOUND: {
    status: 404,
    message: "Ce litige livraison est introuvable.",
  },
  DELIVERY_DISPUTE_ALREADY_OPEN: {
    status: 409,
    message: "Un litige de livraison est déjà ouvert.",
  },
  DELIVERY_DISPUTE_ALREADY_RESOLVED: {
    status: 409,
    message: "Ce litige de livraison a déjà été traité.",
  },
  DELIVERY_DISPUTE_OUTCOME_INVALID: {
    status: 422,
    message: "La décision du litige de livraison est invalide.",
  },
  ORDER_NOT_DELIVERED: {
    status: 409,
    message: "La commande doit être livrée avant cette action.",
  },
  DISPUTE_ALREADY_OPEN: {
    status: 409,
    message: "Un litige est déjà ouvert pour cette commande.",
  },
  DISPUTE_WINDOW_CLOSED: {
    status: 409,
    message: "Le délai pour signaler un problème est dépassé.",
  },
  ADMIN_AAL2_REQUIRED: { status: 403, message: "Une authentification renforcée est requise." },
  PAYTECH_DISABLED: { status: 422, message: "Cet ancien moyen de paiement n’est plus disponible." },
  CASH_PICKUP_ONLY: { status: 422, message: "Les espèces sont disponibles uniquement pour un retrait en boutique." },
  CASH_NOT_YET_COLLECTIBLE: { status: 409, message: "Marquez les espèces reçues uniquement lorsque la commande est prête à être retirée." },
  CASH_PAYMENT_NOT_CONFIRMED: { status: 409, message: "Confirmez la réception des espèces avant de remettre la commande." },
  DIRECT_PAYMENT_NOT_CONFIRMED: { status: 409, message: "Confirmez d’abord le transfert direct reçu." },
  DIRECT_PAYMENT_CHANNEL_REQUIRED: { status: 422, message: "Choisissez Wave ou Orange Money." },
  PAYMENT_CHANNEL_UNAVAILABLE: { status: 409, message: "Aucun numéro actif n’est configuré pour ce canal." },
  PAYMENT_ALREADY_CONFIRMED: { status: 409, message: "Ce paiement a déjà été confirmé." },
  PAYMENT_REFERENCE_REQUIRED: { status: 422, message: "La référence du transfert est obligatoire." },
  PAYMENT_DECLARATION_ALREADY_REVIEWED: { status: 409, message: "Cette déclaration a déjà été contrôlée." },
  PAYMENT_REJECTION_REASON_REQUIRED: { status: 422, message: "Indiquez le motif du refus." },
  PAYMENT_ALREADY_REVIEWED: { status: 409, message: "Ce paiement d’abonnement a déjà été contrôlé." },
  BILLING_CYCLE_INVALID: { status: 422, message: "Le cycle de facturation est invalide." },
  ORDER_NOT_PAID: { status: 409, message: "Cette commande n’est pas encore payée." },
  REFUND_AMOUNT_INVALID: { status: 422, message: "Le montant remboursé dépasse le montant encore remboursable." },
  REFUND_ALREADY_REVIEWED: { status: 409, message: "Ce remboursement a déjà été contrôlé." },
  DIRECT_REFUND_CHANNEL_REQUIRED: { status: 422, message: "Le remboursement doit utiliser Wave ou Orange Money." },
  COURIER_PAYMENT_NUMBER_MISSING: { status: 409, message: "Le livreur n’a pas renseigné de numéro pour ce canal." },
  COURIER_PAYOUT_REFERENCE_REQUIRED: { status: 422, message: "La référence du transfert au livreur est obligatoire." },
  COURIER_PAYOUT_ALREADY_REVIEWED: { status: 409, message: "Ce règlement a déjà été contrôlé par le livreur." },
  COURIER_PAYOUT_NOT_VOIDABLE: { status: 409, message: "Ce règlement confirmé ne peut plus être annulé." },
  LOYALTY_PROGRAM_FROZEN: { status: 409, message: "Le programme de fidélité est temporairement suspendu." },
  PICKUP_NOT_AVAILABLE: {
    status: 409,
    message: "Le retrait en boutique n’est pas disponible pour cette boutique.",
  },
  SHOP_LOCATION_REQUIRED: {
    status: 422,
    message: "Cette boutique doit enregistrer sa position avant de proposer la livraison.",
  },
  DELIVERY_DESTINATION_REQUIRED: {
    status: 422,
    message: "Placez la destination sur la carte avant de confirmer la livraison.",
  },
  DELIVERY_DESTINATION_INVALID: {
    status: 422,
    message: "La destination doit être située au Sénégal.",
  },
  DELIVERY_REGION_MISMATCH: {
    status: 422,
    message: "La zone choisie ne correspond pas à la région de livraison.",
  },
  SHOP_ADDRESS_REQUIRED: {
    status: 422,
    message: "L’adresse de la boutique est requise pour activer le retrait.",
  },
};

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return new ApiError(
      400,
      "VALIDATION_ERROR",
      "Certaines informations sont invalides.",
      error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  const candidate = error as { message?: string; code?: string };
  const key = candidate?.message ?? "";
  const mapped = databaseErrorMap[key];
  if (mapped) return new ApiError(mapped.status, key, mapped.message);

  if (candidate?.code === "23505") {
    return new ApiError(
      409,
      "CONFLICT",
      "Cette information existe déjà.",
    );
  }

  return new ApiError(
    500,
    "INTERNAL_ERROR",
    "Une erreur interne est survenue.",
  );
}
