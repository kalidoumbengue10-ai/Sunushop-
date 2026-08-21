import { ApiError } from "@/lib/api/errors";
import { apiFailure } from "@/lib/api/response";

export async function POST() {
  const requestId = crypto.randomUUID();
  try {
    throw new ApiError(
      403,
      "INVITATION_REQUIRED",
      "L’accès livreur est créé sur invitation d’une boutique. Demandez au marchand de vous inviter avec votre numéro de téléphone.",
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
