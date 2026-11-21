import { describe, it, expect } from "vitest";
import { computeLineTax, summarizeOrderTax, KENYA_STANDARD_VAT_BPS } from "@sokoos/utils";

describe("SokoOS Tax Engine — Kenyan Commerce & eTIMS Alignment", () => {
  it("computes inclusive 16% standard VAT accurately", () => {
    // 1 Bottle of Glenfiddich retailing at KES 5,800.00 (tax-inclusive)
    const result = computeLineTax({
      unitPriceMinor: 580_000,
      quantity: 1,
      taxRateBps: KENYA_STANDARD_VAT_BPS,
      classification: "STANDARD_VAT",
      pricingModel: "inclusive",
    });

    expect(result.totalAmountMinor).toBe(580_000);
    // Base = 580000 * 10000 / 11600 = 500000
    expect(result.taxableAmountMinor).toBe(500_000);
    // Tax = 580000 - 500000 = 80000 (KES 800.00)
    expect(result.taxAmountMinor).toBe(80_000);
    expect(result.taxRateBps).toBe(1600);
  });

  it("computes exclusive 16% standard VAT accurately for commercial/wholesale orders", () => {
    // 1 Case of Tusker wholesale net cost KES 3,000.00 + 16% VAT
    const result = computeLineTax({
      unitPriceMinor: 300_000,
      quantity: 2,
      taxRateBps: KENYA_STANDARD_VAT_BPS,
      classification: "STANDARD_VAT",
      pricingModel: "exclusive",
    });

    expect(result.grossAmountMinor).toBe(600_000);
    expect(result.taxableAmountMinor).toBe(600_000);
    // Tax = 600000 * 16% = 96000 (KES 960.00)
    expect(result.taxAmountMinor).toBe(96_000);
    expect(result.totalAmountMinor).toBe(696_000); // KES 6,960.00
  });

  it("handles zero-rated, exempt, and non-taxable lines with zero tax liability", () => {
    const zeroRated = computeLineTax({
      unitPriceMinor: 250_000,
      quantity: 1,
      classification: "ZERO_RATED",
      pricingModel: "inclusive",
    });
    expect(zeroRated.taxAmountMinor).toBe(0);
    expect(zeroRated.taxableAmountMinor).toBe(250_000);
    expect(zeroRated.totalAmountMinor).toBe(250_000);

    const exempt = computeLineTax({
      unitPriceMinor: 150_000,
      quantity: 1,
      classification: "EXEMPT",
      pricingModel: "inclusive",
    });
    expect(exempt.taxAmountMinor).toBe(0);
    expect(exempt.taxableAmountMinor).toBe(150_000);

    const nonTaxable = computeLineTax({
      unitPriceMinor: 100_000,
      quantity: 1,
      classification: "NON_TAXABLE",
      pricingModel: "inclusive",
    });
    expect(nonTaxable.taxAmountMinor).toBe(0);
    expect(nonTaxable.taxableAmountMinor).toBe(100_000);
  });

  it("applies line-level discounts before calculating taxable base", () => {
    // KES 1,160.00 inclusive item discounted by KES 160.00 -> Net KES 1,000.00
    const result = computeLineTax({
      unitPriceMinor: 116_000,
      quantity: 1,
      discountMinor: 16_000,
      taxRateBps: KENYA_STANDARD_VAT_BPS,
      classification: "STANDARD_VAT",
      pricingModel: "inclusive",
    });

    expect(result.grossAmountMinor).toBe(116_000);
    expect(result.discountMinor).toBe(16_000);
    expect(result.totalAmountMinor).toBe(100_000);
    // Taxable base = round(100000 * 10000 / 11600) = 86207
    expect(result.taxableAmountMinor).toBe(86_207);
    // Tax = 100000 - 86207 = 13793
    expect(result.taxAmountMinor).toBe(13_793);
  });

  it("aggregates mixed-classification orders into a deterministic summary", () => {
    const line1 = computeLineTax({
      unitPriceMinor: 116_000, // VAT 16% inclusive
      quantity: 2, // 232,000
      classification: "STANDARD_VAT",
      taxRateBps: 1600,
    });
    const line2 = computeLineTax({
      unitPriceMinor: 50_000, // Zero rated export
      quantity: 1,
      classification: "ZERO_RATED",
    });

    const summary = summarizeOrderTax([line1, line2]);

    expect(summary.subtotalMinor).toBe(282_000);
    expect(summary.totalMinor).toBe(282_000);
    expect(summary.byClassification.STANDARD_VAT.taxableAmountMinor).toBe(200_000);
    expect(summary.byClassification.STANDARD_VAT.taxAmountMinor).toBe(32_000);
    expect(summary.byClassification.ZERO_RATED.taxableAmountMinor).toBe(50_000);
    expect(summary.byClassification.ZERO_RATED.taxAmountMinor).toBe(0);
  });
});
