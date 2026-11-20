import { describe, expect, it, vi } from "vitest";
import { SalesService } from "../src/sales/sales.service";
import { isTaxReviewRequired } from "../src/catalog/tax-review";
import { PrismaService } from "../src/prisma/prisma.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { TenantsService } from "../src/tenants/tenants.service";

describe("sales tax review protection", () => {
  function createService(product: Record<string, unknown>) {
    const prisma = {
      branch: { findFirst: vi.fn().mockResolvedValue({ id: "branch-1" }) },
      departmentMember: { findFirst: vi.fn().mockResolvedValue(null) },
      product: { findMany: vi.fn().mockResolvedValue([product]) },
      sale: { create: vi.fn() },
    } as unknown as PrismaService;
    const inventory = {
      getDefaultWarehouse: vi.fn().mockResolvedValue({ id: "warehouse-1" }),
    } as unknown as InventoryService;
    const tenants = {
      getCurrent: vi.fn().mockResolvedValue({ currency: "KES" }),
      getNegativeStockPolicy: vi.fn().mockReturnValue("block"),
    } as unknown as TenantsService;
    return { service: new SalesService(prisma, inventory, tenants), prisma };
  }

  async function attemptSale(service: SalesService) {
    return service.create("tenant-1", "cashier-1", {
      branchId: "branch-1",
      items: [{ productId: "product-1", quantity: 1, taxMinor: 0 }],
      payments: [{ method: "cash", amountMinor: 1500 }],
    });
  }

  it("blocks sale of a product awaiting tax mapping with an actionable error", async () => {
    const { service, prisma } = createService({
      id: "product-1",
      sku: "REVIEW",
      name: "Review product",
      priceMinor: 1500,
      taxRateBps: 0,
      extensions: { taxReviewRequired: true, taxReviewStatus: "TAX_REVIEW_REQUIRED" },
    });

    await expect(attemptSale(service)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "TAX_REVIEW_REQUIRED",
        message: expect.stringContaining("An administrator must map this product"),
      }),
    });
    expect(prisma.sale.create).not.toHaveBeenCalled();
  });

  it("recognizes an explicitly mapped zero rate as distinct from the database default", () => {
    expect(
      isTaxReviewRequired({
        taxRateBps: 0,
        extensions: { taxReviewRequired: false, taxReviewStatus: "MAPPED" },
      }),
    ).toBe(false);
  });
});
