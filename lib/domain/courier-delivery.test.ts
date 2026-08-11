import { describe, expect, it } from "vitest";
import { calculateCourierPayoutTotal, canOpenDeliveryDispute } from "./courier-delivery";

describe("rémunération et litiges livreur", () => {
  it("additionne uniquement les missions dues", () => {
    expect(calculateCourierPayoutTotal([
      { courier_payment_status: "due", courier_payable_xof: 1200 },
      { courier_payment_status: "paid", courier_payable_xof: 900 },
      { courier_payment_status: "due", courier_payable_xof: 2500 },
      { courier_payment_status: "waived", courier_payable_xof: 0 },
    ])).toBe(3700);
  });

  it("autorise un litige pendant la mission et trois jours après la fin", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    expect(canOpenDeliveryDispute("in_transit", null, now)).toBe(true);
    expect(canOpenDeliveryDispute("delivered", "2026-08-07T12:00:00.000Z", now)).toBe(true);
    expect(canOpenDeliveryDispute("failed", "2026-08-07T11:59:59.000Z", now)).toBe(false);
    expect(canOpenDeliveryDispute("cancelled", "2026-08-10T11:00:00.000Z", now)).toBe(false);
  });
});
