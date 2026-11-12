import { describe, it, expect } from "vitest";
import {
  applyMovementToBalance,
  calculateCountReconciliation,
  calculatePackagingConversion,
  computeNextBalance,
  sumQuantityDeltas,
} from "../src/inventory/stock-balance.math";

describe("stock balance update math", () => {
  it("computes next balance from signed deltas", () => {
    expect(computeNextBalance(100, -3)).toBe(97);
    expect(computeNextBalance(0, 10)).toBe(10);
    expect(computeNextBalance(5, -5)).toBe(0);
  });

  it("blocks negative stock when policy is block", () => {
    const result = applyMovementToBalance(2, -5, "block");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NEGATIVE_STOCK_BLOCKED");
      expect(result.nextQuantity).toBe(-3);
    }
  });

  it("allows negative stock with warn and surfaces warning", () => {
    const result = applyMovementToBalance(1, -2, "warn");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextQuantity).toBe(-1);
      expect(result.warning).toBeTruthy();
    }
  });

  it("sums line deltas for a multi-item sale", () => {
    // sale lines are negative
    expect(sumQuantityDeltas([-2, -1, -3])).toBe(-6);
  });

  it("converts cases into bottles deterministically (1 CASE = 12 BOTTLES)", () => {
    const res = calculatePackagingConversion({
      casesToBreak: 2,
      bottlesPerCase: 12,
      currentCaseStock: 5,
      currentBottleStock: 4,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.caseDelta).toBe(-2);
      expect(res.bottleDelta).toBe(24);
      expect(res.beforeCaseQuantity).toBe(5);
      expect(res.afterCaseQuantity).toBe(3);
      expect(res.beforeBottleQuantity).toBe(4);
      expect(res.afterBottleQuantity).toBe(28);
    }
  });

  it("blocks packaging conversion when case stock is insufficient", () => {
    const res = calculatePackagingConversion({
      casesToBreak: 3,
      bottlesPerCase: 12,
      currentCaseStock: 2,
      currentBottleStock: 10,
      policy: "block",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("NEGATIVE_STOCK_BLOCKED");
    }
  });

  it("reconciles physical count to signed delta with before/after quantities", () => {
    const r1 = calculateCountReconciliation(24, 21);
    expect(r1).toEqual({ beforeQuantity: 24, afterQuantity: 21, quantityDelta: -3 });

    const r2 = calculateCountReconciliation(10, 15);
    expect(r2).toEqual({ beforeQuantity: 10, afterQuantity: 15, quantityDelta: 5 });
  });
});
