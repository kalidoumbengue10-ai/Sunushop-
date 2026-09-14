import { describe, expect, it } from "vitest";
import { isSafeRedirectPath, safeRedirectPath } from "./safe-redirect";

describe("isSafeRedirectPath", () => {
  it("accepte les chemins internes", () => {
    expect(isSafeRedirectPath("/client")).toBe(true);
    expect(isSafeRedirectPath("/invitations/claim?token=abc")).toBe(true);
    expect(isSafeRedirectPath("/commandes/42#suivi")).toBe(true);
  });

  it("refuse les origines externes déguisées en chemin", () => {
    expect(isSafeRedirectPath("//evil.com")).toBe(false);
    expect(isSafeRedirectPath("/\\evil.com")).toBe(false);
    expect(isSafeRedirectPath("/\\/evil.com")).toBe(false);
    expect(isSafeRedirectPath("/\\\\evil.com")).toBe(false);
  });

  it("refuse les URL absolues et les autres schémas", () => {
    expect(isSafeRedirectPath("https://evil.com")).toBe(false);
    expect(isSafeRedirectPath("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirectPath("client")).toBe(false);
  });

  it("refuse les caractères de contrôle et les valeurs vides", () => {
    expect(isSafeRedirectPath("/client\nhttps://evil.com")).toBe(false);
    expect(isSafeRedirectPath("/\t/evil.com")).toBe(false);
    expect(isSafeRedirectPath("")).toBe(false);
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath(undefined)).toBe(false);
  });

  it("refuse les chemins trop longs", () => {
    expect(isSafeRedirectPath(`/${"a".repeat(300)}`)).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it("retourne le repli quand le chemin est refusé", () => {
    expect(safeRedirectPath("/\\evil.com", "/client")).toBe("/client");
    expect(safeRedirectPath(null, "/client")).toBe("/client");
  });

  it("retourne le chemin quand il est sûr", () => {
    expect(safeRedirectPath("/marchand", "/client")).toBe("/marchand");
  });
});
