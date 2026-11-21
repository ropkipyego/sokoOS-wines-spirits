import { describe, expect, it } from "vitest";
import { resolveAnalyticsPeriod } from "../src/reports/reports.service";

describe("Analytics period resolution", () => {
  const now = new Date("2026-11-21T12:00:00.000Z");

  it("resolves today and yesterday boundaries", () => {
    const today = resolveAnalyticsPeriod("today", undefined, undefined, now);
    expect(today.from.toISOString()).toBe("2026-11-21T00:00:00.000Z");
    expect(today.to.toISOString()).toBe("2026-11-22T00:00:00.000Z");

    const yesterday = resolveAnalyticsPeriod("yesterday", undefined, undefined, now);
    expect(yesterday.from.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(yesterday.to.toISOString()).toBe("2026-11-21T00:00:00.000Z");
  });

  it("resolves month, quarter, and year boundaries", () => {
    expect(resolveAnalyticsPeriod("current_month", undefined, undefined, now).from.toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(resolveAnalyticsPeriod("previous_month", undefined, undefined, now).from.toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    expect(resolveAnalyticsPeriod("current_quarter", undefined, undefined, now).from.toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    expect(resolveAnalyticsPeriod("previous_year", undefined, undefined, now).from.toISOString()).toBe(
      "2025-01-01T00:00:00.000Z",
    );
  });

  it("requires and resolves custom date ranges", () => {
    expect(() => resolveAnalyticsPeriod("custom", undefined, undefined, now)).toThrow(
      "Custom period requires from and to dates",
    );
    const custom = resolveAnalyticsPeriod("custom", "2026-11-10", "2026-11-12", now);
    expect(custom.from.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    expect(custom.to.toISOString()).toBe("2026-11-13T00:00:00.000Z");
  });
});
