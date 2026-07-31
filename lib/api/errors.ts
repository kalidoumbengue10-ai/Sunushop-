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
  ORDER_TRANSITION_NOT_ALLOWED: {
    status: 409,
    message: "Ce changement de statut n’est pas autorisé.",
  },
  PRODUCT_PUBLICATION_LOCKED: {
    status: 409,
    message: "Le KYC et l’abonnement doivent être actifs avant publication.",
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
