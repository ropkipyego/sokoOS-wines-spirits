export type TaxClassification =
  | "STANDARD_VAT"
  | "ZERO_RATED"
  | "EXEMPT"
  | "NON_TAXABLE"
  | "REVIEW_REQUIRED";

export type LineTaxCalculation = {
  unitPriceMinor: number;
  quantity: number;
  grossAmountMinor: number;
  discountMinor: number;
  taxableAmountMinor: number;
  taxAmountMinor: number;
  totalAmountMinor: number;
  taxRateBps: number;
  classification: TaxClassification;
  pricingModel: "inclusive" | "exclusive";
};

export type OrderTaxSummary = {
  subtotalMinor: number;
  discountMinor: number;
  taxableAmountMinor: number;
  taxMinor: number;
  totalMinor: number;
  byClassification: Record<
    TaxClassification,
    {
      taxableAmountMinor: number;
      taxAmountMinor: number;
      rateBps: number;
    }
  >;
};

export const KENYA_STANDARD_VAT_BPS = 1600; // 16.00%

export type ComputeLineTaxInput = {
  unitPriceMinor: number;
  quantity: number;
  discountMinor?: number;
  taxRateBps?: number;
  classification?: TaxClassification;
  pricingModel?: "inclusive" | "exclusive";
};

/**
 * Deterministically computes tax for a single line item.
 * Supports both tax-inclusive (standard retail in Kenya) and tax-exclusive pricing.
 * All arithmetic uses integer minor units (cents) with half-up rounding.
 */
export function computeLineTax(input: ComputeLineTaxInput): LineTaxCalculation {
  const {
    unitPriceMinor,
    quantity,
    discountMinor = 0,
    pricingModel = "inclusive",
  } = input;

  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new Error("unitPriceMinor must be a non-negative integer");
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("quantity must be a non-negative integer");
  }
  if (!Number.isInteger(discountMinor) || discountMinor < 0) {
    throw new Error("discountMinor must be a non-negative integer");
  }

  const classification = input.classification ?? "STANDARD_VAT";
  let taxRateBps = input.taxRateBps ?? (classification === "STANDARD_VAT" ? KENYA_STANDARD_VAT_BPS : 0);

  // Classifications with zero tax liability
  if (
    classification === "ZERO_RATED" ||
    classification === "EXEMPT" ||
    classification === "NON_TAXABLE"
  ) {
    taxRateBps = 0;
  }

  const grossAmountMinor = unitPriceMinor * quantity;
  const netAfterDiscountMinor = Math.max(0, grossAmountMinor - discountMinor);

  if (taxRateBps === 0 || netAfterDiscountMinor === 0) {
    return {
      unitPriceMinor,
      quantity,
      grossAmountMinor,
      discountMinor,
      taxableAmountMinor: netAfterDiscountMinor,
      taxAmountMinor: 0,
      totalAmountMinor: netAfterDiscountMinor,
      taxRateBps: 0,
      classification,
      pricingModel,
    };
  }

  if (pricingModel === "inclusive") {
    // Total is netAfterDiscountMinor. Back-calculate taxable base:
    // Base = Total * 10000 / (10000 + bps)
    const divisor = 10000 + taxRateBps;
    const taxableAmountMinor = Math.round((netAfterDiscountMinor * 10000) / divisor);
    const taxAmountMinor = netAfterDiscountMinor - taxableAmountMinor;

    return {
      unitPriceMinor,
      quantity,
      grossAmountMinor,
      discountMinor,
      taxableAmountMinor,
      taxAmountMinor,
      totalAmountMinor: netAfterDiscountMinor,
      taxRateBps,
      classification,
      pricingModel: "inclusive",
    };
  } else {
    // Exclusive: Total = Base + Tax
    const taxableAmountMinor = netAfterDiscountMinor;
    const taxAmountMinor = Math.round((taxableAmountMinor * taxRateBps) / 10000);
    const totalAmountMinor = taxableAmountMinor + taxAmountMinor;

    return {
      unitPriceMinor,
      quantity,
      grossAmountMinor,
      discountMinor,
      taxableAmountMinor,
      taxAmountMinor,
      totalAmountMinor,
      taxRateBps,
      classification,
      pricingModel: "exclusive",
    };
  }
}

/**
 * Summarizes tax calculations across multiple cart or order line items.
 */
export function summarizeOrderTax(
  lines: LineTaxCalculation[],
  globalDiscountMinor = 0,
): OrderTaxSummary {
  const summary: OrderTaxSummary = {
    subtotalMinor: 0,
    discountMinor: globalDiscountMinor,
    taxableAmountMinor: 0,
    taxMinor: 0,
    totalMinor: 0,
    byClassification: {
      STANDARD_VAT: { taxableAmountMinor: 0, taxAmountMinor: 0, rateBps: KENYA_STANDARD_VAT_BPS },
      ZERO_RATED: { taxableAmountMinor: 0, taxAmountMinor: 0, rateBps: 0 },
      EXEMPT: { taxableAmountMinor: 0, taxAmountMinor: 0, rateBps: 0 },
      NON_TAXABLE: { taxableAmountMinor: 0, taxAmountMinor: 0, rateBps: 0 },
      REVIEW_REQUIRED: { taxableAmountMinor: 0, taxAmountMinor: 0, rateBps: 0 },
    },
  };

  for (const line of lines) {
    summary.subtotalMinor += line.grossAmountMinor;
    summary.discountMinor += line.discountMinor;
    summary.taxableAmountMinor += line.taxableAmountMinor;
    summary.taxMinor += line.taxAmountMinor;
    summary.totalMinor += line.totalAmountMinor;

    const classSummary = summary.byClassification[line.classification];
    if (classSummary) {
      classSummary.taxableAmountMinor += line.taxableAmountMinor;
      classSummary.taxAmountMinor += line.taxAmountMinor;
      classSummary.rateBps = line.taxRateBps;
    }
  }

  // Deduct global discount proportionally if provided
  if (globalDiscountMinor > 0 && summary.totalMinor > 0) {
    summary.totalMinor = Math.max(0, summary.totalMinor - globalDiscountMinor);
  }

  return summary;
}
