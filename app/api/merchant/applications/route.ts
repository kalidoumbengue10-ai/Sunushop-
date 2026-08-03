import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure } from "@/lib/api/response";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireUser();
    throw new ApiError(
      403,
      "MERCHANT_INVITATION_REQUIRED",
      "Votre dossier doit d’abord être accepté par SunuShop. Utilisez le formulaire de candidature.",
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
