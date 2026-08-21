import { describe, expect, it } from "vitest";
import { merchantOrderSearchFilter, merchantOrderStatusFilter } from "./merchant-order-query";

describe("merchant order server query", () => {
  it("routes order and payment filters to their own columns", () => {
    expect(merchantOrderStatusFilter("preparing")).toEqual({ column: "status", value: "preparing" });
    expect(merchantOrderStatusFilter("refund_pending")).toEqual({ column: "payment_status", value: "refund_pending" });
    expect(merchantOrderStatusFilter("all")).toBeNull();
  });

  it("recognizes merchant sequence numbers with and without the CMD prefix", () => {
    expect(merchantOrderSearchFilter("CMD-000042")).toEqual({ kind: "merchant_sequence", value: 42 });
    expect(merchantOrderSearchFilter("000123")).toEqual({ kind: "merchant_sequence", value: 123 });
  });

  it("keeps public order codes as text searches", () => {
    expect(merchantOrderSearchFilter("SUNU-AB12CD")).toEqual({ kind: "public_code", value: "SUNU-AB12CD" });
    expect(merchantOrderSearchFilter(" ")).toBeNull();
  });
});
