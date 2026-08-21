import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sendNotificationEmail } from "./email";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("sendNotificationEmail", () => {
  it("transmet une clé d'idempotence stable à Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await sendNotificationEmail(
      "subscription_expired",
      { to: "merchant@example.test" },
      { idempotencyKey: "outbox/00000000-0000-4000-8000-000000000001" },
    );

    const request = fetchMock.mock.calls[0];
    const headers = new Headers(request[1]?.headers);
    expect(headers.get("Idempotency-Key")).toBe("outbox/00000000-0000-4000-8000-000000000001");
  });

  it("n'ajoute pas d'en-tête d'idempotence aux appels qui n'en fournissent pas", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-2" }), { status: 200 }),
    );

    await sendNotificationEmail("subscription_expired", { to: "merchant@example.test" });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.has("Idempotency-Key")).toBe(false);
  });
});
