import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "./constant-time";

describe("constantTimeEqual", () => {
  it("retourne true pour deux tampons identiques", () => {
    expect(constantTimeEqual(Buffer.from("secret-partagé"), Buffer.from("secret-partagé"))).toBe(true);
  });

  it("retourne false pour des tampons de même longueur mais différents", () => {
    expect(constantTimeEqual(Buffer.from("aaaaaaaa"), Buffer.from("aaaaaaab"))).toBe(false);
  });

  it("retourne false sans lever d'exception pour des longueurs différentes", () => {
    expect(constantTimeEqual(Buffer.from("court"), Buffer.from("beaucoup-plus-long"))).toBe(false);
  });

  it("retourne false pour un tampon vide comparé à un secret non vide", () => {
    expect(constantTimeEqual(Buffer.alloc(0), Buffer.from("x"))).toBe(false);
  });
});
