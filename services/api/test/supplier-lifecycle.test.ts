import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service";
import { SuppliersService } from "../src/suppliers/suppliers.service";
import { PurchasesService } from "../src/purchases/purchases.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { TenantsService } from "../src/tenants/tenants.service";

describe("supplier lifecycle", () => {
  it("deactivates without archiving or deleting the supplier and records an audit event", async () => {
    const activeSupplier = {
      id: "supplier-1",
      tenantId: "tenant-1",
      name: "Example Distributor",
      status: "active",
      archivedAt: null,
      extensions: {},
    };
    const update = vi.fn().mockResolvedValue({ ...activeSupplier, status: "inactive" });
    const auditCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      supplier: {
        findFirst: vi.fn().mockResolvedValue(activeSupplier),
        update,
      },
      auditLog: { create: auditCreate },
    } as unknown as PrismaService;

    const result = await new SuppliersService(prisma).setStatus(
      "tenant-1",
      "supplier-1",
      "inactive",
      "user-1",
    );

    expect(result.status).toBe("inactive");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "supplier-1" },
        data: expect.objectContaining({ status: "inactive" }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "supplier.deactivated",
          entityId: "supplier-1",
        }),
      }),
    );
  });

  it("prevents new purchase orders from using an inactive supplier", async () => {
    const purchaseCreate = vi.fn();
    const prisma = {
      supplier: {
        findFirst: vi.fn().mockResolvedValue({
          id: "supplier-1",
          status: "inactive",
          archivedAt: null,
        }),
      },
      purchase: { create: purchaseCreate },
    } as unknown as PrismaService;
    const service = new PurchasesService(
      prisma,
      {} as InventoryService,
      {} as TenantsService,
    );

    await expect(
      service.create("tenant-1", {
        branchId: "branch-1",
        supplierId: "supplier-1",
        items: [{ productId: "product-1", quantity: 1, unitCostMinor: 100 }],
      }),
    ).rejects.toThrow("inactive");
    expect(purchaseCreate).not.toHaveBeenCalled();
  });
});
