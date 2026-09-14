import { describe, expect, it } from "vitest";
import { containsPattern, escapeLikePattern } from "./pattern-filter";

describe("escapeLikePattern", () => {
  it("neutralise les jokers", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("%%")).toBe("\\%\\%");
  });

  it("échappe l'anti-slash avant les jokers", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("laisse le texte ordinaire intact", () => {
    expect(escapeLikePattern("Boutique Dakar")).toBe("Boutique Dakar");
  });
});

describe("containsPattern", () => {
  it("entoure la valeur échappée", () => {
    expect(containsPattern("abc")).toBe("%abc%");
    expect(containsPattern("a%b")).toBe("%a\\%b%");
  });
});
