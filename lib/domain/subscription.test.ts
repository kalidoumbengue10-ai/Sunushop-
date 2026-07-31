import { describe, expect, it } from "vitest";
import {
  subscriptionReminderWindow,
  subscriptionStatusAt,
} from "./subscription";

describe("cycle de l’abonnement", () => {
  const end = new Date("2026-08-30T00:00:00.000Z");
  const grace = new Date("2026-09-02T00:00:00.000Z");

  it("passe de actif à grâce puis expiré", () => {
    expect(
      subscriptionStatusAt(end, grace, new Date("2026-08-29T23:59:00.000Z")),
    ).toBe("active");
    expect(
      subscriptionStatusAt(end, grace, new Date("2026-08-31T00:00:00.000Z")),
    ).toBe("grace");
    expect(
      subscriptionStatusAt(end, grace, new Date("2026-09-02T00:00:00.000Z")),
    ).toBe("expired");
  });

  it("identifie les rappels J-7 et J-2", () => {
    expect(
      subscriptionReminderWindow(
        end,
        new Date("2026-08-23T00:00:00.000Z"),
      ),
    ).toBe("j-7");
    expect(
      subscriptionReminderWindow(
        end,
        new Date("2026-08-28T00:00:00.000Z"),
      ),
    ).toBe("j-2");
  });
});
