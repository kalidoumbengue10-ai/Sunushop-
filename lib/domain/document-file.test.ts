import { describe, expect, it } from "vitest";
import { validateVerificationFile } from "./document-file";

describe("validation des documents mobiles", () => {
  it("accepte un JPEG valide même si le téléphone fournit un type générique", async () => {
    const file = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
      "photo.bin",
      { type: "application/octet-stream" },
    );
    const result = await validateVerificationFile(file);
    expect(result.mime).toBe("image/jpeg");
    expect(result.extension).toBe("jpg");
  });

  it("refuse un contenu qui n’est ni une image ni un PDF", async () => {
    const file = new File(["contenu invalide"], "document.bin", { type: "application/octet-stream" });
    await expect(validateVerificationFile(file)).rejects.toMatchObject({
      code: "FILE_SIGNATURE_MISMATCH",
    });
  });
});
