import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service";
import { CatalogService } from "../src/catalog/catalog.service";
import { MediaService } from "../src/media/media.service";

describe("catalog import preview", () => {
  it("reconciles SKUs/barcodes without treating suggested or repository costs as actual prices", async () => {
    const existingProduct = [
      {
        id: "product-1",
        sku: "EXISTING-SKU",
        barcode: "111",
        name: "Existing product",
        priceMinor: 1200,
        costMinor: 700,
        imageUrl: null,
        archivedAt: null,
      },
      {
        id: "product-2",
        sku: "OTHER-EXISTING",
        barcode: "333",
        name: "Other product",
        priceMinor: 2000,
        costMinor: 1000,
        imageUrl: null,
        archivedAt: null,
      },
    ];
    const prisma = {
      product: { findMany: vi.fn().mockResolvedValue(existingProduct) },
      supplier: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new CatalogService(prisma, {} as MediaService);

    const preview = await service.previewCatalogRows("tenant-1", [
      {
        sku: "EXISTING-SKU",
        name: "Existing product",
        barcode: "111",
        suggested_sell_kes: "99",
        repo_known_cost_kes: "50",
        actual_supplier_cost_kes: "",
        image_filename: "existing.jpg",
        image_source: "Wikimedia Commons",
        image_license: "CC0",
      },
      { sku: "NEW-SKU", name: "New product", barcode: "222" },
      { sku: "NEW-SKU", name: "Repeated product", barcode: "222" },
      { sku: "OTHER-SKU", name: "Barcode conflict", barcode: "333" },
      { sku: "", name: "Missing SKU" },
    ]);

    expect(preview.summary).toEqual({
      matched: 1,
      new: 1,
      duplicate: 1,
      conflict: 1,
      missing: 1,
    });
    expect(preview.items[0]).toMatchObject({
      reconciliation: "MATCHED",
      action: "SKIP",
      actualSupplierCostMinor: null,
      suggestedSellMinor: 9900,
      repoKnownCostMinor: 5000,
      taxReviewRequired: true,
    });
    expect(preview.items[1]).toMatchObject({
      reconciliation: "NEW",
      action: "REVIEW",
    });
  });

  it("defaults imports to a read-only dry run", async () => {
    const productCreate = vi.fn();
    const prisma = {
      product: {
        findMany: vi.fn().mockResolvedValue([]),
        create: productCreate,
      },
    } as unknown as PrismaService;
    const service = new CatalogService(prisma, {} as MediaService);

    const result = await service.importProducts("tenant-1", [
      {
        sku: "NEW-SKU",
        name: "New product",
        price: "15.00",
        tax: "16",
      },
    ]);

    expect(result).toMatchObject({
      dryRun: true,
      approvalRequired: true,
      accepted: 0,
    });
    expect(productCreate).not.toHaveBeenCalled();
  });

  it("requires an explicit tax value instead of inferring a rate", async () => {
    const prisma = {
      product: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new CatalogService(prisma, {} as MediaService);

    const validation = await service.validateImportRows("tenant-1", [
      { sku: "NEW-SKU", name: "New product", price: "15.00" },
    ]);

    expect(validation.validCount).toBe(0);
    expect(validation.invalidRows[0]?.error).toContain("TAX_REVIEW_REQUIRED");
  });

  it("counts duplicate SKUs before validating unrelated fields", async () => {
    const prisma = {
      product: {
        findMany: vi.fn().mockResolvedValue([{ sku: "JW-BLACK-750ML", barcode: null }]),
      },
    } as unknown as PrismaService;
    const service = new CatalogService(prisma, {} as MediaService);

    const validation = await service.validateImportRows("tenant-1", [
      { sku: "NEW-SKU", name: "Valid product", price: "15.00", tax: "16" },
      { sku: "BAD-PRICE-SKU", name: "Malformed Price Bottle", price: "-100" },
      { sku: "JW-BLACK-750ML", name: "Duplicate Johnnie Walker", price: "3600.00" },
    ]);

    expect(validation.validCount).toBe(1);
    expect(validation.invalidCount).toBe(1);
    expect(validation.duplicateCount).toBe(1);
    expect(validation.duplicateRows[0]?.error).toContain("already exists");
  });
});
