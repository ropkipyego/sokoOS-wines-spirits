/**
 * Pure stock balance projection math.
 * Stock is NEVER overwritten arbitrarily — only updated by appending
 * movements and applying quantityDelta to the projection.
 */

export type NegativeStockPolicy = "allow" | "warn" | "block";

export type ApplyMovementResult =
  | { ok: true; nextQuantity: number; warning?: string }
  | { ok: false; code: "NEGATIVE_STOCK_BLOCKED"; nextQuantity: number };

/**
 * Compute next balance after a signed quantity delta.
 */
export function computeNextBalance(
  currentQuantity: number,
  quantityDelta: number,
): number {
  if (!Number.isInteger(currentQuantity) || !Number.isInteger(quantityDelta)) {
    throw new RangeError("Stock quantities must be integers");
  }
  return currentQuantity + quantityDelta;
}

/**
 * Apply a movement delta under tenant negative-stock policy.
 */
export function applyMovementToBalance(
  currentQuantity: number,
  quantityDelta: number,
  policy: NegativeStockPolicy = "block",
): ApplyMovementResult {
  const nextQuantity = computeNextBalance(currentQuantity, quantityDelta);

  if (nextQuantity < 0) {
    if (policy === "block") {
      return {
        ok: false,
        code: "NEGATIVE_STOCK_BLOCKED",
        nextQuantity,
      };
    }
    if (policy === "warn") {
      return {
        ok: true,
        nextQuantity,
        warning: "Stock balance would go negative",
      };
    }
  }

  return { ok: true, nextQuantity };
}

/** Aggregate multiple deltas for the same SKU/warehouse (e.g. sale lines). */
export function sumQuantityDeltas(deltas: readonly number[]): number {
  return deltas.reduce((acc, d) => {
    if (!Number.isInteger(d)) {
      throw new RangeError("Quantity deltas must be integers");
    }
    return acc + d;
  }, 0);
}

export const CANONICAL_MOVEMENT_TYPES = [
  "PURCHASE_RECEIPT",
  "SALE",
  "RETURN",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "ADJUSTMENT",
  "WRITE_OFF",
  "DAMAGE",
  "EXPIRED",
  "COUNT_RECONCILIATION",
  "OPENING_STOCK",
  "PACKAGING_CONVERSION",
] as const;

export type CanonicalMovementType = (typeof CANONICAL_MOVEMENT_TYPES)[number];

export type PackagingConversionResult =
  | {
      ok: true;
      caseDelta: number;
      bottleDelta: number;
      beforeCaseQuantity: number;
      afterCaseQuantity: number;
      beforeBottleQuantity: number;
      afterBottleQuantity: number;
    }
  | {
      ok: false;
      code: "NEGATIVE_STOCK_BLOCKED" | "INVALID_CONVERSION";
      message: string;
    };

/**
 * Pure packaging conversion math (e.g. 1 CASE = 12 BOTTLES).
 * Deducts `casesToBreak` from case SKU and adds `casesToBreak * bottlesPerCase` to bottle SKU.
 */
export function calculatePackagingConversion(input: {
  casesToBreak: number;
  bottlesPerCase: number;
  currentCaseStock: number;
  currentBottleStock: number;
  policy?: NegativeStockPolicy;
}): PackagingConversionResult {
  const {
    casesToBreak,
    bottlesPerCase,
    currentCaseStock,
    currentBottleStock,
    policy = "block",
  } = input;

  if (!Number.isInteger(casesToBreak) || casesToBreak < 1) {
    return {
      ok: false,
      code: "INVALID_CONVERSION",
      message: "casesToBreak must be a positive integer",
    };
  }
  if (!Number.isInteger(bottlesPerCase) || bottlesPerCase < 2) {
    return {
      ok: false,
      code: "INVALID_CONVERSION",
      message: "bottlesPerCase must be an integer >= 2",
    };
  }

  const caseDelta = -casesToBreak;
  const bottleDelta = casesToBreak * bottlesPerCase;
  const caseResult = applyMovementToBalance(currentCaseStock, caseDelta, policy);
  if (!caseResult.ok) {
    return {
      ok: false,
      code: "NEGATIVE_STOCK_BLOCKED",
      message: `Insufficient case stock (${currentCaseStock}) to break ${casesToBreak} case(s)`,
    };
  }

  const bottleResult = applyMovementToBalance(currentBottleStock, bottleDelta, "allow");
  if (!bottleResult.ok) {
    return {
      ok: false,
      code: "NEGATIVE_STOCK_BLOCKED",
      message: "Bottle stock update failed",
    };
  }

  return {
    ok: true,
    caseDelta,
    bottleDelta,
    beforeCaseQuantity: currentCaseStock,
    afterCaseQuantity: caseResult.nextQuantity,
    beforeBottleQuantity: currentBottleStock,
    afterBottleQuantity: bottleResult.nextQuantity,
  };
}

/**
 * Pure stock count reconciliation math: computes delta from beforeQuantity to countedQuantity.
 */
export function calculateCountReconciliation(
  currentQuantity: number,
  countedQuantity: number,
): {
  beforeQuantity: number;
  afterQuantity: number;
  quantityDelta: number;
} {
  if (!Number.isInteger(currentQuantity) || !Number.isInteger(countedQuantity) || countedQuantity < 0) {
    throw new RangeError("Counted quantity must be a non-negative integer");
  }
  return {
    beforeQuantity: currentQuantity,
    afterQuantity: countedQuantity,
    quantityDelta: countedQuantity - currentQuantity,
  };
}
