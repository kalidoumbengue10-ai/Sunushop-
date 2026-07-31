import { ApiError } from "@/lib/api/errors";

const MAX_MEDIA_SIZE = 10 * 1024 * 1024;

const mediaSignatures = {
  "image/jpeg": (bytes: Uint8Array) =>
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes: Uint8Array) =>
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a,
  "image/webp": (bytes: Uint8Array) =>
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP",
} as const;

type ProductMediaMime = keyof typeof mediaSignatures;

export async function validateProductMediaFile(file: File) {
  if (file.size < 1 || file.size > MAX_MEDIA_SIZE) {
    throw new ApiError(
      400,
      "INVALID_FILE_SIZE",
      "L’image doit peser moins de 10 Mo.",
    );
  }

  const mime = file.type as ProductMediaMime;
  if (!(mime in mediaSignatures)) {
    throw new ApiError(
      400,
      "INVALID_FILE_TYPE",
      "Utilisez une image JPEG, PNG ou WebP.",
    );
  }

  const buffer = await file.arrayBuffer();
  if (!mediaSignatures[mime](new Uint8Array(buffer))) {
    throw new ApiError(
      400,
      "FILE_SIGNATURE_MISMATCH",
      "Le contenu du fichier ne correspond pas à son format.",
    );
  }

  return {
    buffer,
    mime,
    extension:
      mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp",
  };
}
