import { describe, expect, it } from "vitest";
import { previousRangeFor, rangeForPreset } from "./analytics-period";

describe("analytics period", () => {
  it("borne 'today' au début de la journée UTC", () => {
    const range = rangeForPreset("today", "", "");
    const from = new Date(range.from);
    expect(from.getUTCHours()).toBe(0);
    expect(from.getUTCMinutes()).toBe(0);
    expect(range.granularity).toBe("day");
  });

  it("couvre 7 jours pleins pour le préréglage 7days", () => {
    const range = rangeForPreset("7days", "", "");
    const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000;
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("utilise une granularité mensuelle pour le préréglage annuel", () => {
    expect(rangeForPreset("year", "", "").granularity).toBe("month");
  });

  it("respecte les bornes personnalisées", () => {
    const range = rangeForPreset("custom", "2026-01-01", "2026-01-31");
    expect(range.from).toBe(new Date("2026-01-01T00:00:00.000Z").toISOString());
    expect(range.to).toBe(new Date("2026-01-31T23:59:59.999Z").toISOString());
  });

  it("calcule une période précédente de même durée", () => {
    const { previousFrom, previousTo } = previousRangeFor("2026-02-01T00:00:00.000Z", "2026-02-08T00:00:00.000Z");
    expect(previousTo).toBe("2026-02-01T00:00:00.000Z");
    expect(previousFrom).toBe("2026-01-25T00:00:00.000Z");
  });
});
