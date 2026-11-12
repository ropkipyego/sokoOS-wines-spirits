import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { decodeCursor, encodeCursor, paginateMeta } from "../common/pagination";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  private hydrate<T extends { extensions?: unknown }>(row: T) {
    const ext = ((row.extensions ?? {}) as Record<string, unknown>) || {};
    return {
      ...row,
      contactPerson: typeof ext.contactPerson === "string" ? ext.contactPerson : null,
      taxPin: typeof ext.taxPin === "string" ? ext.taxPin : null,
      paymentTerms: typeof ext.paymentTerms === "string" ? ext.paymentTerms : "Net 30",
      address: typeof ext.address === "string" ? ext.address : null,
      paidMinor: typeof ext.paidMinor === "number" ? ext.paidMinor : 0,
    };
  }

  async list(tenantId: string, opts: { limit?: number; cursor?: string } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const cursor = decodeCursor<{ id: string }>(opts.cursor);
    const rows = await this.prisma.supplier.findMany({
      where: {
        tenantId,
        archivedAt: null,
        ...(cursor ? { id: { gt: cursor.id } } : {}),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;

    const purchases = await this.prisma.purchase.findMany({
      where: {
        tenantId,
        supplierId: { in: slice.map((s) => s.id) },
        status: { in: ["issued", "partial", "received"] },
      },
      select: { supplierId: true, totalMinor: true, status: true },
    });
    const billedBySupplier = new Map<string, number>();
    for (const p of purchases) {
      if (!p.supplierId) continue;
      billedBySupplier.set(p.supplierId, (billedBySupplier.get(p.supplierId) ?? 0) + p.totalMinor);
    }

    const data = slice.map((s) => {
      const h = this.hydrate(s);
      const totalBilledMinor = billedBySupplier.get(s.id) ?? 0;
      const balanceMinor = Math.max(0, totalBilledMinor - h.paidMinor);
      return {
        ...h,
        totalBilledMinor,
        balanceMinor,
      };
    });
    const last = data[data.length - 1];
    return {
      data,
      meta: paginateMeta(hasMore, limit, last ? encodeCursor({ id: last.id }) : null),
    };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND", message: "Supplier not found" });
    return this.hydrate(row);
  }

  async statement(tenantId: string, id: string) {
    const supplier = await this.get(tenantId, id);
    const purchases = await this.prisma.purchase.findMany({
      where: { tenantId, supplierId: id, status: { not: "cancelled" } },
      include: { items: { include: { product: { select: { sku: true, name: true } } } }, branch: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const totalOrderedMinor = purchases.reduce((s, p) => s + p.totalMinor, 0);
    const totalReceivedMinor = purchases
      .filter((p) => p.status === "received" || p.status === "partial")
      .reduce(
        (s, p) =>
          s + p.items.reduce((is, item) => is + item.quantityReceived * item.unitCostMinor, 0),
        0,
      );
    const outstandingBalanceMinor = Math.max(0, totalReceivedMinor - supplier.paidMinor);
    return {
      supplier,
      summary: {
        purchaseOrderCount: purchases.length,
        totalOrderedMinor,
        totalReceivedMinor,
        totalPaidMinor: supplier.paidMinor,
        outstandingBalanceMinor,
      },
      purchases,
    };
  }

  async create(
    tenantId: string,
    input: {
      name: string;
      phone?: string;
      email?: string;
      contactPerson?: string;
      taxPin?: string;
      paymentTerms?: string;
      address?: string;
    },
    userId?: string,
  ) {
    const created = await this.prisma.supplier.create({
      data: {
        tenantId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        extensions: {
          contactPerson: input.contactPerson ?? null,
          taxPin: input.taxPin ?? null,
          paymentTerms: input.paymentTerms ?? "Net 30",
          address: input.address ?? null,
          paidMinor: 0,
        },
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return this.hydrate(created);
  }

  async update(
    tenantId: string,
    id: string,
    input: {
      name?: string;
      phone?: string;
      email?: string;
      status?: string;
      contactPerson?: string;
      taxPin?: string;
      paymentTerms?: string;
      address?: string;
      paidMinor?: number;
    },
    userId?: string,
  ) {
    const existing = await this.get(tenantId, id);
    const { contactPerson, taxPin, paymentTerms, address, paidMinor, ...data } = input;
    const ext = ((existing.extensions ?? {}) as Record<string, unknown>) || {};
    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...data,
        extensions: {
          ...ext,
          ...(contactPerson !== undefined ? { contactPerson } : {}),
          ...(taxPin !== undefined ? { taxPin } : {}),
          ...(paymentTerms !== undefined ? { paymentTerms } : {}),
          ...(address !== undefined ? { address } : {}),
          ...(paidMinor !== undefined ? { paidMinor } : {}),
        },
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    return this.hydrate(updated);
  }
}
