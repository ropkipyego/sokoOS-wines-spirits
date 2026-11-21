import { describe, it, expect, vi, beforeEach } from "vitest";
import { SuppliersService } from "../src/suppliers/suppliers.service";

describe("Supplier Bills & Procurement Accounts Payable Lifecycle", () => {
  let suppliersService: SuppliersService;
  let mockPrisma: any;
  let storedBills: Map<string, any>;
  let storedSupplier: any;

  beforeEach(() => {
    storedBills = new Map();
    storedSupplier = {
      id: "sup-1",
      name: "KBL Kenya Breweries Ltd",
      tenantId: "t-1",
      status: "active",
      extensions: {
        paidMinor: 0,
      },
    };

    mockPrisma = {
      supplier: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(storedSupplier)),
        findMany: vi.fn().mockResolvedValue([storedSupplier]),
        update: vi.fn().mockImplementation(({ data }: any) => {
          storedSupplier = { ...storedSupplier, ...data, extensions: { ...storedSupplier.extensions, ...data.extensions } };
          return Promise.resolve(storedSupplier);
        }),
      },
      purchase: {
        findFirst: vi.fn().mockImplementation(({ where }: any) => {
          if (where.id === "po-1") {
            return Promise.resolve({
              id: "po-1",
              tenantId: "t-1",
              supplierId: "sup-1",
              status: "partial",
              items: [
                { productId: "p-1", quantity: 100, quantityReceived: 80, unitCostMinor: 10_000 },
              ],
            });
          }
          return Promise.resolve(null);
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      configSetting: {
        create: vi.fn().mockImplementation(({ data }: any) => {
          storedBills.set(data.key, data.value);
          return Promise.resolve({ id: data.key, ...data });
        }),
        findMany: vi.fn().mockImplementation(() => {
          return Promise.resolve(Array.from(storedBills.values()).map((val) => ({ value: val })));
        }),
        findFirst: vi.fn().mockImplementation(({ where }: any) => {
          const val = storedBills.get(where.key);
          return Promise.resolve(val ? { value: val } : null);
        }),
        update: vi.fn().mockImplementation(({ where, data }: any) => {
          storedBills.set(where.tenantId_scopeKey_key.key, data.value);
          return Promise.resolve({ value: data.value });
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    suppliersService = new SuppliersService(mockPrisma as any);
  });

  it("creates a supplier bill linked to a partially received LPO", async () => {
    // Received: 80 units * KES 100.00 = KES 8,000.00 (800,000 cents)
    const bill = await suppliersService.createBill(
      "t-1",
      {
        supplierId: "sup-1",
        purchaseId: "po-1",
        billNumber: "INV-KBL-9812",
        amountMinor: 800_000,
        billDate: "2026-11-21",
        dueDate: "2026-12-21",
        notes: "Invoice for 80 cases received",
      },
      "user-procurement",
    );

    expect(bill.status).toBe("UNPAID");
    expect(bill.amountMinor).toBe(800_000);
    expect(bill.paidMinor).toBe(0);
    expect(bill.balanceMinor).toBe(800_000);
    expect(bill.receivedAmountMinor).toBe(800_000);
    expect(bill.warning).toBeNull();
  });

  it("flags a warning when supplier invoice amount exceeds received goods", async () => {
    // Received: 800,000 cents; Bill: 950,000 cents
    const bill = await suppliersService.createBill(
      "t-1",
      {
        supplierId: "sup-1",
        purchaseId: "po-1",
        billNumber: "INV-KBL-9813",
        amountMinor: 950_000,
      },
      "user-procurement",
    );

    expect(bill.warning).toContain("exceeds received goods value");
  });

  it("records partial and full payments against a supplier bill deterministically", async () => {
    const bill = await suppliersService.createBill(
      "t-1",
      {
        supplierId: "sup-1",
        billNumber: "INV-KBL-9814",
        amountMinor: 500_000, // KES 5,000.00
      },
      "user-procurement",
    );

    // Partial payment: KES 2,000.00
    const partial = await suppliersService.recordBillPayment(
      "t-1",
      bill.id,
      { amountMinor: 200_000, paymentMethod: "bank", reference: "EFT-88127" },
      "user-accountant",
    );

    expect(partial.status).toBe("PARTIALLY_PAID");
    expect(partial.paidMinor).toBe(200_000);
    expect(partial.balanceMinor).toBe(300_000);
    expect(partial.payments.length).toBe(1);

    // Final payment: KES 3,000.00
    const settled = await suppliersService.recordBillPayment(
      "t-1",
      bill.id,
      { amountMinor: 300_000, paymentMethod: "mpesa", reference: "QH182991" },
      "user-accountant",
    );

    expect(settled.status).toBe("PAID");
    expect(settled.paidMinor).toBe(500_000);
    expect(settled.balanceMinor).toBe(0);
    expect(settled.payments.length).toBe(2);

    // Attempting further payment fails
    await expect(
      suppliersService.recordBillPayment(
        "t-1",
        bill.id,
        { amountMinor: 50_000 },
        "user-accountant",
      ),
    ).rejects.toThrow(/Cannot record payment against a PAID bill/);
  });
});
