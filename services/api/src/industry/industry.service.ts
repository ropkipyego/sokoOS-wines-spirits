import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class IndustryService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Wholesale price lists ----
  listPriceLists(tenantId: string) {
    return this.prisma.priceList.findMany({
      where: { tenantId },
      include: { _count: { select: { items: true, customers: true } } },
      orderBy: { name: "asc" },
    });
  }

  createPriceList(tenantId: string, input: { code: string; name: string }) {
    return this.prisma.priceList.create({
      data: { tenantId, code: input.code.toUpperCase(), name: input.name },
    });
  }

  async upsertPriceListItem(
    tenantId: string,
    priceListId: string,
    input: { productId: string; priceMinor: number; minQuantity?: number },
  ) {
    const list = await this.prisma.priceList.findFirst({ where: { id: priceListId, tenantId } });
    if (!list) throw new NotFoundException({ code: "NOT_FOUND", message: "Price list not found" });
    const minQuantity = input.minQuantity ?? 1;
    return this.prisma.priceListItem.upsert({
      where: {
        priceListId_productId_minQuantity: {
          priceListId,
          productId: input.productId,
          minQuantity,
        },
      },
      create: {
        tenantId,
        priceListId,
        productId: input.productId,
        priceMinor: input.priceMinor,
        minQuantity,
      },
      update: { priceMinor: input.priceMinor },
    });
  }

  listPriceListItems(tenantId: string, priceListId: string) {
    return this.prisma.priceListItem.findMany({
      where: { tenantId, priceListId },
      include: { product: { select: { sku: true, name: true, priceMinor: true } } },
      orderBy: { minQuantity: "asc" },
    });
  }

  async assignCustomerPriceList(tenantId: string, customerId: string, priceListId: string | null) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) throw new NotFoundException({ code: "NOT_FOUND", message: "Customer not found" });
    if (priceListId) {
      const list = await this.prisma.priceList.findFirst({ where: { id: priceListId, tenantId } });
      if (!list) throw new NotFoundException({ code: "NOT_FOUND", message: "Price list not found" });
    }
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { priceListId },
    });
  }
}
