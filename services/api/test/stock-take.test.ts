import { describe, it, expect, vi, beforeEach } from "vitest";
import { InventoryService } from "../src/inventory/inventory.service";

describe("Multi-Item Stock Take Lifecycle & Variance Reconciliation", () => {
  let inventoryService: InventoryService;
  let mockPrisma: any;
  let mockTenants: any;
  let storedSessions: Map<string, any>;

  beforeEach(() => {
    storedSessions = new Map();

    mockPrisma = {
      warehouse: {
        findFirst: vi.fn().mockResolvedValue({ id: "wh-1", name: "Main Cellar", branchId: "br-1" }),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([
          { id: "p-1", sku: "WINE-01", name: "Red Wine 750ml", costMinor: 100_000 },
          { id: "p-2", sku: "GIN-01", name: "Dry Gin 750ml", costMinor: 120_000 },
          { id: "p-3", sku: "BEER-01", name: "Lager 500ml", costMinor: 15_000 },
        ]),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([
          { productId: "p-1", quantity: 50 },
          { productId: "p-2", quantity: 30 },
          { productId: "p-3", quantity: 100 },
        ]),
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          const qty = where.tenantId_warehouseId_productId?.productId === "p-1" ? 50 : 30;
          return Promise.resolve({ quantity: qty });
        }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue({ id: "m-1" }),
      },
      configSetting: {
        create: vi.fn().mockImplementation(({ data }: any) => {
          storedSessions.set(data.key, data.value);
          return Promise.resolve({ id: data.key, ...data });
        }),
        findMany: vi.fn().mockImplementation(() => {
          return Promise.resolve(Array.from(storedSessions.values()).map((val) => ({ value: val })));
        }),
        findFirst: vi.fn().mockImplementation(({ where }: any) => {
          const val = storedSessions.get(where.key);
          return Promise.resolve(val ? { value: val } : null);
        }),
        update: vi.fn().mockImplementation(({ where, data }: any) => {
          storedSessions.set(where.tenantId_scopeKey_key.key, data.value);
          return Promise.resolve({ value: data.value });
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "a-1" }),
      },
      $transaction: vi.fn().mockImplementation((fn: any) => fn(mockPrisma)),
    };

    mockTenants = {
      getCurrent: vi.fn().mockResolvedValue({ id: "t-1", currency: "KES" }),
      getNegativeStockPolicy: vi.fn().mockReturnValue("allow"),
    };

    inventoryService = new InventoryService(mockPrisma as any, mockTenants as any);
  });

  it("creates a stock take session by snapshotting system balances", async () => {
    const session = await inventoryService.createStockTakeSession(
      "t-1",
      {
        branchId: "br-1",
        warehouseId: "wh-1",
        notes: "End of month cellar audit",
      },
      "user-stock",
    );

    expect(session.status).toBe("DRAFT");
    expect(session.sessionNumber).toMatch(/^ST-\d{4}-\d{4}$/);
    expect(session.items.length).toBe(3);

    const wine = session.items.find((i) => i.productId === "p-1");
    expect(wine).toBeDefined();
    expect(wine?.expectedQuantity).toBe(50);
    expect(wine?.countedQuantity).toBe(50);
    expect(wine?.varianceQuantity).toBe(0);
    expect(wine?.unitCostMinor).toBe(100_000);
  });

  it("updates physical counts and computes variances and values accurately", async () => {
    const session = await inventoryService.createStockTakeSession(
      "t-1",
      { branchId: "br-1", warehouseId: "wh-1" },
      "user-stock",
    );

    // Physical count:
    // Wine: counted 48 (2 missing/broken, deficit of 2 * 1,000.00 = -2,000.00 KES)
    // Gin: counted 35 (5 found/surplus, surplus of 5 * 1,200.00 = +6,000.00 KES)
    // Beer: counted 100 (matched)
    const updated = await inventoryService.updateStockTakeCounts(
      "t-1",
      session.id,
      [
        { productId: "p-1", countedQuantity: 48, varianceReason: "DAMAGE", notes: "2 broken bottles found in cellar" },
        { productId: "p-2", countedQuantity: 35, varianceReason: "FOUND", notes: "Extra pack located behind shelf" },
      ],
      "user-stock",
    );

    const wine = updated.items.find((i) => i.productId === "p-1")!;
    expect(wine.countedQuantity).toBe(48);
    expect(wine.varianceQuantity).toBe(-2);
    expect(wine.varianceValueMinor).toBe(-200_000); // -2 * 100,000
    expect(wine.varianceReason).toBe("DAMAGE");

    const gin = updated.items.find((i) => i.productId === "p-2")!;
    expect(gin.countedQuantity).toBe(35);
    expect(gin.varianceQuantity).toBe(5);
    expect(gin.varianceValueMinor).toBe(600_000); // 5 * 120,000
    expect(gin.varianceReason).toBe("FOUND");

    // Total net variance value: 600,000 - 200,000 = +400,000
    expect(updated.totalVarianceValueMinor).toBe(400_000);
    expect(updated.totalVarianceQty).toBe(3); // 5 - 2
  });

  it("submits for approval and atomically reconciles inventory", async () => {
    const session = await inventoryService.createStockTakeSession(
      "t-1",
      { branchId: "br-1", warehouseId: "wh-1" },
      "user-stock",
    );

    await inventoryService.updateStockTakeCounts(
      "t-1",
      session.id,
      [{ productId: "p-1", countedQuantity: 45, varianceReason: "MISSING" }],
      "user-stock",
    );

    const submitted = await inventoryService.submitStockTakeSession("t-1", session.id, "user-stock");
    expect(submitted.status).toBe("SUBMITTED");

    const reconciled = await inventoryService.reconcileStockTakeSession("t-1", session.id, "user-manager");
    expect(reconciled.status).toBe("APPROVED");
    expect(reconciled.approvedByUserId).toBe("user-manager");
    expect(reconciled.reconciledAt).toBeDefined();

    // Verify stock movement was created for the deficit
    expect(mockPrisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "p-1",
          quantityDelta: -5,
          referenceType: "stock_take",
          referenceId: session.id,
        }),
      }),
    );
  });
});
