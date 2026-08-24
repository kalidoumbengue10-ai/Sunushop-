import { ApiError } from "@/lib/api/errors";

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    if (!text.trim()) throw new Error("EMPTY_BODY");
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Le corps JSON est absent ou invalide.");
  }
}
