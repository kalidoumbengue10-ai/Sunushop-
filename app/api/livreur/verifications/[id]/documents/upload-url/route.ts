import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { requireEditableCourierVerificationCase } from "@/lib/api/courier-verification-case-access";
import { courierDocumentUploadRequestSchema } from "@/lib/domain/schemas";

export const runtime = "nodejs";

const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

function requestedExtension(fileName: string, mimeType?: string) {
  const fromMime = mimeType ? mimeExtensions[mimeType.toLowerCase()] : undefined;
  if (fromMime) return fromMime;
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "jpeg") return "jpg";
  return ["jpg", "png", "pdf"].includes(extension ?? "") ? extension : "upload";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id: caseId } = await context.params;
    const input = courierDocumentUploadRequestSchema.parse(await request.json());
    const { user, verificationCase } = await requireEditableCourierVerificationCase(caseId);
    const admin = requireAdminClient();
    const extension = requestedExtension(input.fileName, input.mimeType);
    const storagePath = [
      user.id,
      "pending",
      verificationCase.courier_id,
      caseId,
      `${crypto.randomUUID()}.${extension}`,
    ].join("/");

    const { data, error } = await admin.storage
      .from("courier-verification")
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (error) throw error;

    return apiSuccess({ storagePath: data.path, token: data.token }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
