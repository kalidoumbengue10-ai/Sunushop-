import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/errors";

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

const signatures = {
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
  "application/pdf": (bytes: Uint8Array) =>
    new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-",
} as const;

export type AllowedDocumentMime = keyof typeof signatures;

export async function validateVerificationFile(file: File) {
  if (file.size < 1 || file.size > MAX_DOCUMENT_SIZE) {
    throw new ApiError(
      400,
      "INVALID_FILE_SIZE",
      "Le fichier doit peser moins de 10 Mo.",
    );
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mime = (Object.entries(signatures) as Array<[
    AllowedDocumentMime,
    (value: Uint8Array) => boolean,
  ]>).find(([, matches]) => matches(bytes))?.[0];
  if (!mime) {
    throw new ApiError(
      400,
      "FILE_SIGNATURE_MISMATCH",
      "Le fichier n’est pas un JPEG, PNG ou PDF valide.",
    );
  }

  const extension =
    mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "pdf";

  return {
    buffer,
    mime,
    extension,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: file.size,
  };
}
