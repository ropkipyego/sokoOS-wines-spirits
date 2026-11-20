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

  it("allows products without a tax value and flags them for tax review", async () => {
    const prisma = {
      product: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new CatalogService(prisma, {} as MediaService);

    const validation = await service.validateImportRows("tenant-1", [
      { sku: "NEW-SKU", name: "New product", price: "15.00" },
    ]);

    expect(validation.validCount).toBe(1);
    expect(validation.invalidCount).toBe(0);
    expect(validation.validRows[0]).toMatchObject({
      taxRateBps: null,
      taxReviewRequired: true,
    });
    expect(validation.warnings.some((warning) => warning.warning ===
      "Tax mapping required before tax-compliant sale.",
    )).toBe(true);
  });

  it("rejects malformed supplied tax values", async () => {
    const prisma = {
      product: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new CatalogService(prisma, {} as MediaService);

    const validation = await service.validateImportRows("tenant-1", [
      { sku: "NEW-SKU", name: "New product", price: "15.00", tax: "not-a-rate" },
    ]);

    expect(validation.validCount).toBe(0);
    expect(validation.invalidRows[0]?.error).toContain("Invalid tax value");
  });

  it("imports explicitly mapped tax and leaves missing tax in review state", async () => {
    const productCreate = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({ ...data, id: "created-product", extensions: data.extensions }),
    );
    const prisma = {
      product: {
        findMany: vi.fn().mockResolvedValue([]),
        create: productCreate,
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new CatalogService(prisma, {} as MediaService);

    const mapped = await service.importProducts(
      "tenant-1",
      [{ sku: "MAPPED", name: "Mapped product", price: "15.00", tax: "16" }],
      "admin-1",
      { dryRun: false, approved: true },
    );
    const missing = await service.importProducts(
      "tenant-1",
      [{ sku: "REVIEW", name: "Review product", price: "15.00" }],
      "admin-1",
      { dryRun: false, approved: true },
    );

    expect(mapped.accepted).toBe(1);
    expect(productCreate.mock.calls[0]?.[0].data).toMatchObject({
      taxRateBps: 1600,
      extensions: { taxReviewRequired: false, taxReviewStatus: "MAPPED" },
    });
    expect(missing.accepted).toBe(1);
    expect(missing.warnings.some((warning) => warning.warning ===
      "Tax mapping required before tax-compliant sale.",
    )).toBe(true);
    expect(productCreate.mock.calls[1]?.[0].data).toMatchObject({
      extensions: { taxReviewRequired: true, taxReviewStatus: "TAX_REVIEW_REQUIRED" },
    });
    expect(productCreate.mock.calls[1]?.[0].data).not.toHaveProperty("taxRateBps");

    const unresolved = await service.createProduct("tenant-1", {
      sku: "NO-RATE",
      name: "No rate product",
      priceMinor: 1500,
    });
    expect(unresolved).toMatchObject({
      taxRateBps: null,
      taxReviewRequired: true,
      taxReviewStatus: "TAX_REVIEW_REQUIRED",
    });
  });

  it("allows an administrator to map tax on an imported product later", async () => {
    const existing = {
      id: "product-1",
      tenantId: "tenant-1",
      sku: "REVIEW",
      name: "Review product",
      taxRateBps: 0,
      extensions: { taxReviewRequired: true, taxReviewStatus: "TAX_REVIEW_REQUIRED" },
      version: 1,
    };
    const prisma = {
      product: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...existing, ...data, extensions: data.extensions }),
        ),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new CatalogService(prisma, {} as MediaService);

    const updated = await service.updateProduct(
      "tenant-1",
      "product-1",
      { taxRateBps: 1600 },
      "admin-1",
    );

    expect(updated).toMatchObject({
      taxRateBps: 1600,
      taxReviewRequired: false,
      taxReviewStatus: "MAPPED",
    });
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taxRateBps: 1600,
          extensions: expect.objectContaining({ taxReviewRequired: false, taxReviewStatus: "MAPPED" }),
        }),
      }),
    );
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
