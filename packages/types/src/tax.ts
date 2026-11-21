import { z } from "zod";

/**
 * Standard tax classifications for Kenyan commerce & eTIMS alignment.
 */
export const TaxClassificationSchema = z.enum([
  "STANDARD_VAT", // 16% VAT in Kenya
  "ZERO_RATED",   // 0% VAT (e.g. exports, certain agricultural supplies)
  "EXEMPT",       // Exempt from VAT (e.g. specific financial/educational items)
  "NON_TAXABLE",  // Outside the scope of VAT
  "REVIEW_REQUIRED", // Flagged for administrator review before sale
]);

export type TaxClassification = z.infer<typeof TaxClassificationSchema>;

/**
 * Tax rule definition with jurisdiction and effective dates.
 */
export const TaxRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  jurisdiction: z.string().default("KE"),
  classification: TaxClassificationSchema,
  rateBps: z.number().int().min(0).max(10000), // e.g. 1600 = 16.00%
  pricingModel: z.enum(["inclusive", "exclusive"]).default("inclusive"),
  effectiveFrom: z.string(), // ISO date
  effectiveTo: z.string().optional().nullable(),
  active: z.boolean().default(true),
  notes: z.string().optional(),
});

export type TaxRule = z.infer<typeof TaxRuleSchema>;

/**
 * Line-level calculated tax breakdown.
 */
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

/**
 * Order-level aggregated tax breakdown.
 */
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
