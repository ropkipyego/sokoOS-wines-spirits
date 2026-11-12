import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { decodeCursor, encodeCursor, paginateMeta } from "../common/pagination";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private hydrate<T extends { extensions?: unknown }>(row: T) {
    const ext = ((row.extensions ?? {}) as Record<string, unknown>) || {};
    return {
      ...row,
      creditLimitMinor: typeof ext.creditLimitMinor === "number" ? ext.creditLimitMinor : 0,
      creditBalanceMinor: typeof ext.creditBalanceMinor === "number" ? ext.creditBalanceMinor : 0,
      loyaltyPoints: typeof ext.loyaltyPoints === "number" ? ext.loyaltyPoints : 0,
      notes: typeof ext.notes === "string" ? ext.notes : null,
    };
  }

  async list(tenantId: string, opts: { limit?: number; cursor?: string; q?: string } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const cursor = decodeCursor<{ id: string }>(opts.cursor);
    const rows = await this.prisma.customer.findMany({
      where: {
        tenantId,
        archivedAt: null,
        ...(cursor ? { id: { gt: cursor.id } } : {}),
        ...(opts.q
          ? {
              OR: [
                { name: { contains: opts.q, mode: "insensitive" } },
                { phone: { contains: opts.q } },
                { email: { contains: opts.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map((r) => this.hydrate(r));
    const last = data[data.length - 1];
    return {
      data,
      meta: paginateMeta(hasMore, limit, last ? encodeCursor({ id: last.id }) : null),
    };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND", message: "Customer not found" });
    return this.hydrate(row);
  }

  async statement(tenantId: string, id: string) {
    const customer = await this.get(tenantId, id);
    const sales = await this.prisma.sale.findMany({
      where: { tenantId, customerId: id, status: { not: "voided" } },
      include: { payments: true, items: true, branch: { select: { name: true, code: true } } },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
    const totalPurchasedMinor = sales.reduce((sum, s) => sum + s.totalMinor, 0);
    const creditSalesMinor = sales.reduce(
      (sum, s) =>
        sum +
        s.payments
          .filter((p) => p.method === "credit")
          .reduce((ps, p) => ps + p.amountMinor, 0),
      0,
    );
    return {
      customer,
      summary: {
        totalPurchasesCount: sales.length,
        totalPurchasedMinor,
        creditLimitMinor: customer.creditLimitMinor,
        creditBalanceMinor: Math.max(customer.creditBalanceMinor, creditSalesMinor),
        loyaltyPoints: customer.loyaltyPoints + Math.floor(totalPurchasedMinor / 10000),
      },
      sales,
    };
  }

  async create(
    tenantId: string,
    input: {
      name: string;
      phone?: string;
      email?: string;
      address?: unknown;
      creditLimitMinor?: number;
      notes?: string;
    },
    userId?: string,
  ) {
    const created = await this.prisma.customer.create({
      data: {
        tenantId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address as object | undefined,
        extensions: {
          creditLimitMinor: input.creditLimitMinor ?? 0,
          creditBalanceMinor: 0,
          loyaltyPoints: 0,
          notes: input.notes ?? null,
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
      creditLimitMinor?: number;
      creditBalanceMinor?: number;
      loyaltyPoints?: number;
      notes?: string;
    },
    userId?: string,
  ) {
    const existing = await this.get(tenantId, id);
    const { creditLimitMinor, creditBalanceMinor, loyaltyPoints, notes, ...data } = input;
    const ext = ((existing.extensions ?? {}) as Record<string, unknown>) || {};
    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...data,
        extensions: {
          ...ext,
          ...(creditLimitMinor !== undefined ? { creditLimitMinor } : {}),
          ...(creditBalanceMinor !== undefined ? { creditBalanceMinor } : {}),
          ...(loyaltyPoints !== undefined ? { loyaltyPoints } : {}),
          ...(notes !== undefined ? { notes } : {}),
        },
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    return this.hydrate(updated);
  }
}
