import { describe, expect, it } from "vitest";

import { MAX_AMOUNT_MINOR, formatAmount, toDecimalString, toMinorUnits } from "./money.js";
import { amountSchema } from "./schemas/common.js";

describe("toMinorUnits", () => {
  it("converts decimal strings without floating point drift", () => {
    expect(toMinorUnits("19.99")).toBe(1999);
    expect(toMinorUnits("0.1") + toMinorUnits("0.2")).toBe(30);
  });

  it("pads a single decimal place", () => {
    expect(toMinorUnits("7.5")).toBe(750);
  });

  it("handles whole numbers and plain numbers", () => {
    expect(toMinorUnits("1250")).toBe(125_000);
    expect(toMinorUnits(4.2)).toBe(420);
  });

  it("keeps the sign", () => {
    expect(toMinorUnits("-5.25")).toBe(-525);
  });

  it("rejects malformed input", () => {
    expect(() => toMinorUnits("1.234")).toThrow(RangeError);
    expect(() => toMinorUnits("abc")).toThrow(RangeError);
    expect(() => toMinorUnits(Number.NaN)).toThrow(RangeError);
  });

  it("rejects values that would overflow a PostgreSQL integer", () => {
    expect(() => toMinorUnits("99999999999")).toThrow(RangeError);
  });
});

describe("toDecimalString", () => {
  it("round-trips through toMinorUnits", () => {
    for (const value of ["19.99", "0.05", "12500.00", "1.00"]) {
      expect(toDecimalString(toMinorUnits(value))).toBe(value);
    }
  });

  it("pads the fractional part", () => {
    expect(toDecimalString(5)).toBe("0.05");
    expect(toDecimalString(-525)).toBe("-5.25");
  });
});

describe("formatAmount", () => {
  it("renders Malaysian ringgit", () => {
    expect(formatAmount(1_250_000)).toContain("12,500.00");
  });
});

describe("amountSchema", () => {
  it("accepts user-typed values and returns minor units", () => {
    expect(amountSchema.parse("19.99")).toBe(1999);
    expect(amountSchema.parse(12.5)).toBe(1250);
  });

  it.each([
    ["0", "zero"],
    ["-5", "negative"],
    ["1.234", "too many decimals"],
    ["abc", "not a number"],
    ["99999999999", "beyond the digit cap"],
  ])("rejects %s (%s) without throwing", (input) => {
    const result = amountSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts the largest permitted amount", () => {
    const largest = amountSchema.safeParse("9999999.99");
    expect(largest.success).toBe(true);
    if (largest.success) {
      expect(largest.data).toBeLessThan(MAX_AMOUNT_MINOR);
    }
  });
});
