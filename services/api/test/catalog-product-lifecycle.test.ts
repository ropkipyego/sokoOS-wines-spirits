import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { CatalogService } from "../src/catalog/catalog.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { MediaService } from "../src/media/media.service";

function createService(historyReference: string | null = null) {
  const referenceModelNames = [
    "stockMovement",
    "stockBalance",
    "saleItem",
    "returnItem",
    "purchaseItem",
    "departmentProduct",
    "productRecipeLine",
    "productModifierGroup",
    "productBatch",
    "prescriptionItem",
    "priceListItem",
    "productSerial",
    "kitchenTicketItem",
  ] as const;
  const transactionClient = {
    product: { delete: vi.fn().mockResolvedValue({ id: "product-1" }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    product: {
      findFirst: vi.fn().mockResolvedValue({
        id: "product-1",
        sku: "SKU-1",
        name: "Product",
        extensions: {},
        imageUrl: null,
        thumbnailUrl: null,
      }),
    },
    ...Object.fromEntries(
      referenceModelNames.map((name) => [
        name,
        { findFirst: vi.fn().mockResolvedValue(name === historyReference ? { id: "reference-1" } : null) },
      ]),
    ),
    $transaction: vi.fn((work: (tx: typeof transactionClient) => Promise<unknown>) => work(transactionClient)),
  } as unknown as PrismaService;
  const media = { removeFile: vi.fn().mockResolvedValue(undefined) } as unknown as MediaService;
  return { service: new CatalogService(prisma, media), prisma, transactionClient };
}

describe("product lifecycle deletion", () => {
  it("deletes only an unused product and records the action atomically", async () => {
    const { service, transactionClient } = createService();

    await expect(service.deleteUnusedProduct("tenant-1", "product-1", "user-1")).resolves.toEqual({
      id: "product-1",
      deleted: true,
    });
    expect(transactionClient.product.delete).toHaveBeenCalledWith({ where: { id: "product-1" } });
    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "product.deleted", entityId: "product-1" }),
    });
  });

  it("blocks permanent deletion when historical references exist", async () => {
    const { service, prisma, transactionClient } = createService("saleItem");

    await expect(service.deleteUnusedProduct("tenant-1", "product-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transactionClient.product.delete).not.toHaveBeenCalled();
  });
});
