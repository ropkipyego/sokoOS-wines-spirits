import { describe, expect, it, vi } from "vitest";
import { UnprocessableEntityException } from "@nestjs/common";
import { SalesService } from "../src/sales/sales.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { TenantsService } from "../src/tenants/tenants.service";

describe("sales tax review protection", () => {
  it("blocks sale of a product awaiting tax mapping with an actionable error", async () => {
    const prisma = {
      branch: { findFirst: vi.fn().mockResolvedValue({ id: "branch-1" }) },
      departmentMember: { findFirst: vi.fn().mockResolvedValue(null) },
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "product-1",
            sku: "REVIEW",
            name: "Review product",
            priceMinor: 1500,
            extensions: { taxReviewRequired: true, taxReviewStatus: "TAX_REVIEW_REQUIRED" },
          },
        ]),
      },
      sale: { create: vi.fn() },
    } as unknown as PrismaService;
    const inventory = {
      getDefaultWarehouse: vi.fn().mockResolvedValue({ id: "warehouse-1" }),
    } as unknown as InventoryService;
    const tenants = {
      getCurrent: vi.fn().mockResolvedValue({ currency: "KES" }),
      getNegativeStockPolicy: vi.fn().mockReturnValue("block"),
    } as unknown as TenantsService;
    const service = new SalesService(prisma, inventory, tenants);

    await expect(
      service.create("tenant-1", "cashier-1", {
        branchId: "branch-1",
        items: [{ productId: "product-1", quantity: 1, taxMinor: 0 }],
        payments: [{ method: "cash", amountMinor: 1500 }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "TAX_REVIEW_REQUIRED",
        message: expect.stringContaining("An administrator must map this product"),
      }),
    });
    expect(prisma.sale.create).not.toHaveBeenCalled();
  });
});
