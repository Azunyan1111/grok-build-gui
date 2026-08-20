import { describe, expect, it } from "vitest";
import { readCreditUsagePercent } from "./grokAccount";

describe("readCreditUsagePercent", () => {
  it("reads the reported percent", () => {
    expect(
      readCreditUsagePercent({
        creditUsagePercent: 4,
        currentPeriod: { start: "2026-08-16T15:11:10Z" },
      }),
    ).toBe(4);
  });

  it("treats an omitted percent as 0% for a real period", () => {
    // proto3 JSON drops the scalar at its default, so a freshly reset week
    // arrives with no `creditUsagePercent` key at all.
    expect(
      readCreditUsagePercent({
        currentPeriod: {
          type: "USAGE_PERIOD_TYPE_WEEKLY",
          start: "2026-08-16T15:11:10Z",
          end: "2026-08-23T15:11:10Z",
        },
        onDemandCap: { val: 0 },
      }),
    ).toBe(0);
    expect(
      readCreditUsagePercent({ billingPeriodStart: "2026-08-16T15:11:10Z" }),
    ).toBe(0);
  });

  it("stays null when the response describes no period", () => {
    expect(readCreditUsagePercent(null)).toBeNull();
    expect(readCreditUsagePercent({})).toBeNull();
    expect(readCreditUsagePercent({ onDemandCap: { val: 0 } })).toBeNull();
  });

  it("clamps out-of-range percents", () => {
    expect(
      readCreditUsagePercent({ creditUsagePercent: 140, currentPeriod: { start: "x" } }),
    ).toBe(100);
    expect(
      readCreditUsagePercent({ creditUsagePercent: -5, currentPeriod: { start: "x" } }),
    ).toBe(0);
  });
});
