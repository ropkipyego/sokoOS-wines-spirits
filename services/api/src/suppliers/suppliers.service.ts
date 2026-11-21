import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { decodeCursor, encodeCursor, paginateMeta } from "../common/pagination";

export type SupplierPaymentRecord = {
  id: string;
  amountMinor: number;
  method: string;
  reference?: string | null;
  notes?: string | null;
  paidAt: string;
  recordedBy?: string | null;
};

export type SupplierBill = {
  id: string;
  tenantId: string;
  supplierId: string;
  purchaseId?: string | null;
  billNumber: string;
  billDate: string;
  dueDate?: string | null;
  status: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "VOID";
  amountMinor: number;
  paidMinor: number;
  balanceMinor: number;
  currency: string;
  notes?: string | null;
  receivedAmountMinor?: number;
  warning?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  payments: Array<{
    id: string;
    amountMinor: number;
    paymentMethod: string;
    reference?: string | null;
    paidAt: string;
    recordedBy?: string | null;
  }>;
};

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(private readonly prisma: PrismaService) {}

  private hydrate<T extends { extensions?: unknown }>(row: T) {
    const ext = ((row.extensions ?? {}) as Record<string, unknown>) || {};
    const payments = Array.isArray(ext.payments)
      ? (ext.payments as SupplierPaymentRecord[])
      : [];
    return {
      ...row,
      contactPerson: typeof ext.contactPerson === "string" ? ext.contactPerson : null,
      taxPin: typeof ext.taxPin === "string" ? ext.taxPin : null,
      paymentTerms: typeof ext.paymentTerms === "string" ? ext.paymentTerms : "Net 30",
      address: typeof ext.address === "string" ? ext.address : null,
      supplierType: typeof ext.supplierType === "string" ? ext.supplierType : "other",
      registrationNumber:
        typeof ext.registrationNumber === "string" ? ext.registrationNumber : null,
      town: typeof ext.town === "string" ? ext.town : null,
      creditLimitMinor:
        typeof ext.creditLimitMinor === "number" ? ext.creditLimitMinor : null,
      notes: typeof ext.notes === "string" ? ext.notes : null,
      paidMinor: typeof ext.paidMinor === "number" ? ext.paidMinor : 0,
      payments,
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
      include: { items: true },
    });
    const billedBySupplier = new Map<string, number>();
    for (const p of purchases) {
      if (!p.supplierId) continue;
      const receivedVal = p.items.reduce(
        (acc, i) => acc + i.quantityReceived * i.unitCostMinor,
        0,
      );
      const val = receivedVal > 0 ? receivedVal : p.totalMinor;
      billedBySupplier.set(p.supplierId, (billedBySupplier.get(p.supplierId) ?? 0) + val);
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
    const activity = await this.prisma.auditLog.findMany({
      where: { tenantId, entityType: "supplier", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, createdAt: true },
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
      payments: supplier.payments,
      purchases,
      activity,
    };
  }

  async recordPayment(
    tenantId: string,
    id: string,
    input: {
      amountMinor: number;
      method?: string;
      reference?: string;
      notes?: string;
    },
    userId?: string,
  ) {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new UnprocessableEntityException({
        code: "VALIDATION_FAILED",
        message: "Payment amountMinor must be a positive integer",
      });
    }
    const existing = await this.get(tenantId, id);
    const ext = ((existing.extensions ?? {}) as Record<string, unknown>) || {};
    const prevPaid = typeof ext.paidMinor === "number" ? ext.paidMinor : 0;
    const prevPayments = Array.isArray(ext.payments)
      ? (ext.payments as SupplierPaymentRecord[])
      : [];
    const paymentRecord: SupplierPaymentRecord = {
      id: randomUUID(),
      amountMinor: input.amountMinor,
      method: input.method ?? "bank",
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      paidAt: new Date().toISOString(),
      recordedBy: userId ?? null,
    };
    const nextPaid = prevPaid + input.amountMinor;
    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        extensions: {
          ...ext,
          paidMinor: nextPaid,
          payments: [paymentRecord, ...prevPayments],
        },
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    await this.writeAudit(tenantId, userId, "supplier.payment", id, {
      amountMinor: input.amountMinor,
      method: paymentRecord.method,
      totalPaidMinor: nextPaid,
    });
    return this.hydrate(updated);
  }

  async setStatus_PLACEHOLDER_REMOVED() { /* removed duplicate block */ }

  async createBill_REMOVED_DUPLICATE() { /* placeholder */ }

  // ── setStatus moved below – see line 725 ──
      notes?: string;
    },
    userId?: string,
  ): Promise<SupplierBill> {
    await this.get(tenantId, input.supplierId);
    let warning: string | null = null;
    let receivedAmountMinor = 0;

    if (input.purchaseId) {
      const purchase = await this.prisma.purchase.findFirst({
        where: { id: input.purchaseId, tenantId, supplierId: input.supplierId },
        include: { items: true },
      });
      if (!purchase) {
        throw new NotFoundException({
          code: "NOT_FOUND",
          message: "Linked LPO not found for this supplier",
        });
      }
      receivedAmountMinor = purchase.items.reduce(
        (s, i) => s + i.quantityReceived * i.unitCostMinor,
        0,
      );
      if (input.amountMinor > receivedAmountMinor && receivedAmountMinor > 0) {
        warning = `Bill amount (${input.amountMinor}) exceeds received goods value (${receivedAmountMinor})`;
      }
    }

    const billId = randomUUID();
    const nowIso = new Date().toISOString();
    const bill: SupplierBill = {
      id: billId,
      tenantId,
      supplierId: input.supplierId,
      purchaseId: input.purchaseId ?? null,
      billNumber: input.billNumber,
      billDate: input.billDate ?? nowIso.slice(0, 10),
      dueDate: input.dueDate ?? null,
      status: "UNPAID",
      amountMinor: input.amountMinor,
      paidMinor: 0,
      balanceMinor: input.amountMinor,
      currency: "KES",
      notes: input.notes ?? null,
      receivedAmountMinor,
      warning,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: userId ?? null,
      payments: [],
    };

    await this.prisma.configSetting.create({
      data: {
        tenantId,
        layer: "tenant",
        scopeKey: "supplier_bill",
        key: billId,
        value: bill as unknown as object,
        updatedBy: userId ?? null,
      },
    });

    await this.writeAudit(tenantId, userId, "supplier.bill_created", input.supplierId, {
      billId,
      billNumber: input.billNumber,
      amountMinor: input.amountMinor,
      purchaseId: input.purchaseId,
      warning,
    });

    return bill;
  }

  async listBills(
    tenantId: string,
    opts: { supplierId?: string; status?: string } = {},
  ): Promise<SupplierBill[]> {
    const rows = await this.prisma.configSetting.findMany({
      where: {
        tenantId,
        scopeKey: "supplier_bill",
      },
      orderBy: { createdAt: "desc" },
    });

    let bills = rows.map((r) => r.value as unknown as SupplierBill);
    if (opts.supplierId) {
      bills = bills.filter((b) => b.supplierId === opts.supplierId);
    }
    if (opts.status) {
      bills = bills.filter((b) => b.status === opts.status);
    }
    return bills;
  }

  async getBill(tenantId: string, id: string): Promise<SupplierBill> {
    const row = await this.prisma.configSetting.findFirst({
      where: { tenantId, scopeKey: "supplier_bill", key: id },
    });
    if (!row) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Supplier bill not found" });
    }
    return row.value as unknown as SupplierBill;
  }

  async recordBillPayment(
    tenantId: string,
    billId: string,
    input: { amountMinor: number; paymentMethod?: string; reference?: string; notes?: string },
    userId?: string,
  ): Promise<SupplierBill> {
    const bill = await this.getBill(tenantId, billId);
    if (bill.status === "PAID" || bill.status === "VOID") {
      throw new UnprocessableEntityException({
        code: "INVALID_STATE",
        message: `Cannot record payment against a ${bill.status} bill`,
      });
    }
    if (input.amountMinor <= 0 || input.amountMinor > bill.balanceMinor) {
      throw new UnprocessableEntityException({
        code: "INVALID_AMOUNT",
        message: `Payment amount must be between 1 and remaining balance ${bill.balanceMinor}`,
      });
    }

    const nowIso = new Date().toISOString();
    const nextPaidMinor = bill.paidMinor + input.amountMinor;
    const nextBalanceMinor = bill.amountMinor - nextPaidMinor;
    const nextStatus = nextBalanceMinor === 0 ? "PAID" : "PARTIALLY_PAID";

    const paymentEntry = {
      id: randomUUID(),
      amountMinor: input.amountMinor,
      paymentMethod: input.paymentMethod ?? "bank",
      reference: input.reference ?? null,
      paidAt: nowIso,
      recordedBy: userId ?? null,
    };

    const updatedBill: SupplierBill = {
      ...bill,
      paidMinor: nextPaidMinor,
      balanceMinor: nextBalanceMinor,
      status: nextStatus,
      updatedAt: nowIso,
      payments: [...bill.payments, paymentEntry],
    };

    await this.prisma.configSetting.update({
      where: {
        tenantId_scopeKey_key: {
          tenantId,
          scopeKey: "supplier_bill",
          key: billId,
        },
      },
      data: {
        value: updatedBill as unknown as object,
        updatedBy: userId ?? null,
      },
    });

    // Also update overall supplier paidMinor
    const supplier = await this.get(tenantId, bill.supplierId);
    await this.update(
      tenantId,
      bill.supplierId,
      {
        paidMinor: (supplier.paidMinor ?? 0) + input.amountMinor,
      },
      userId,
    );

    await this.writeAudit(tenantId, userId, "supplier.bill_payment", bill.supplierId, {
      billId,
      billNumber: bill.billNumber,
      amountMinor: input.amountMinor,
      newBalanceMinor: nextBalanceMinor,
      status: nextStatus,
    });

    return updatedBill;
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
      supplierType?: string;
      registrationNumber?: string;
      town?: string;
      creditLimitMinor?: number;
      notes?: string;
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
          supplierType: input.supplierType ?? "other",
          registrationNumber: input.registrationNumber ?? null,
          town: input.town ?? null,
          creditLimitMinor: input.creditLimitMinor ?? null,
          notes: input.notes ?? null,
          paidMinor: 0,
          payments: [],
        },
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await this.writeAudit(tenantId, userId, "supplier.created", created.id, {
      name: created.name,
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
      supplierType?: string;
      registrationNumber?: string;
      town?: string;
      creditLimitMinor?: number;
      notes?: string;
    },
    userId?: string,
  ) {
    const existing = await this.get(tenantId, id);
    const {
      contactPerson,
      taxPin,
      paymentTerms,
      address,
      paidMinor,
      supplierType,
      registrationNumber,
      town,
      creditLimitMinor,
      notes,
      ...data
    } = input;
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
          ...(supplierType !== undefined ? { supplierType } : {}),
          ...(registrationNumber !== undefined ? { registrationNumber } : {}),
          ...(town !== undefined ? { town } : {}),
          ...(creditLimitMinor !== undefined ? { creditLimitMinor } : {}),
          ...(notes !== undefined ? { notes } : {}),
        },
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    await this.writeAudit(tenantId, userId, "supplier.updated", id, {
      fields: Object.keys(input),
    });
    return this.hydrate(updated);
  }

  async setStatus_PLACEHOLDER_REMOVED() { /* removed duplicate block */ }

  async createBill_REMOVED_DUPLICATE() { /* placeholder */ }

  // ── setStatus moved below – see line 725 ──
      notes?: string;
    },
    userId?: string,
  ): Promise<SupplierBill> {
    await this.get(tenantId, input.supplierId);
    let warning: string | null = null;
    let receivedAmountMinor = 0;

    if (input.purchaseId) {
      const purchase = await this.prisma.purchase.findFirst({
        where: { id: input.purchaseId, tenantId, supplierId: input.supplierId },
        include: { items: true },
      });
      if (!purchase) {
        throw new NotFoundException({
          code: "NOT_FOUND",
          message: "Linked LPO not found for this supplier",
        });
      }
      receivedAmountMinor = purchase.items.reduce(
        (s, i) => s + i.quantityReceived * i.unitCostMinor,
        0,
      );
      if (input.amountMinor > receivedAmountMinor && receivedAmountMinor > 0) {
        warning = `Bill amount (${input.amountMinor}) exceeds received goods value (${receivedAmountMinor})`;
      }
    }

    const billId = randomUUID();
    const nowIso = new Date().toISOString();
    const bill: SupplierBill = {
      id: billId,
      tenantId,
      supplierId: input.supplierId,
      purchaseId: input.purchaseId ?? null,
      billNumber: input.billNumber,
      billDate: input.billDate ?? nowIso.slice(0, 10),
      dueDate: input.dueDate ?? null,
      status: "UNPAID",
      amountMinor: input.amountMinor,
      paidMinor: 0,
      balanceMinor: input.amountMinor,
      currency: "KES",
      notes: input.notes ?? null,
      receivedAmountMinor,
      warning,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: userId ?? null,
      payments: [],
    };

    await this.prisma.configSetting.create({
      data: {
        tenantId,
        layer: "tenant",
        scopeKey: "supplier_bill",
        key: billId,
        value: bill as unknown as object,
        updatedBy: userId ?? null,
      },
    });

    await this.writeAudit(tenantId, userId, "supplier.bill_created", input.supplierId, {
      billId,
      billNumber: input.billNumber,
      amountMinor: input.amountMinor,
      purchaseId: input.purchaseId,
      warning,
    });

    return bill;
  }

  async listBills(
    tenantId: string,
    opts: { supplierId?: string; status?: string } = {},
  ): Promise<SupplierBill[]> {
    const rows = await this.prisma.configSetting.findMany({
      where: {
        tenantId,
        scopeKey: "supplier_bill",
      },
      orderBy: { createdAt: "desc" },
    });

    let bills = rows.map((r) => r.value as unknown as SupplierBill);
    if (opts.supplierId) {
      bills = bills.filter((b) => b.supplierId === opts.supplierId);
    }
    if (opts.status) {
      bills = bills.filter((b) => b.status === opts.status);
    }
    return bills;
  }

  async getBill(tenantId: string, id: string): Promise<SupplierBill> {
    const row = await this.prisma.configSetting.findFirst({
      where: { tenantId, scopeKey: "supplier_bill", key: id },
    });
    if (!row) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Supplier bill not found" });
    }
    return row.value as unknown as SupplierBill;
  }

  async recordBillPayment(
    tenantId: string,
    billId: string,
    input: { amountMinor: number; paymentMethod?: string; reference?: string; notes?: string },
    userId?: string,
  ): Promise<SupplierBill> {
    const bill = await this.getBill(tenantId, billId);
    if (bill.status === "PAID" || bill.status === "VOID") {
      throw new UnprocessableEntityException({
        code: "INVALID_STATE",
        message: `Cannot record payment against a ${bill.status} bill`,
      });
    }
    if (input.amountMinor <= 0 || input.amountMinor > bill.balanceMinor) {
      throw new UnprocessableEntityException({
        code: "INVALID_AMOUNT",
        message: `Payment amount must be between 1 and remaining balance ${bill.balanceMinor}`,
      });
    }

    const nowIso = new Date().toISOString();
    const nextPaidMinor = bill.paidMinor + input.amountMinor;
    const nextBalanceMinor = bill.amountMinor - nextPaidMinor;
    const nextStatus = nextBalanceMinor === 0 ? "PAID" : "PARTIALLY_PAID";

    const paymentEntry = {
      id: randomUUID(),
      amountMinor: input.amountMinor,
      paymentMethod: input.paymentMethod ?? "bank",
      reference: input.reference ?? null,
      paidAt: nowIso,
      recordedBy: userId ?? null,
    };

    const updatedBill: SupplierBill = {
      ...bill,
      paidMinor: nextPaidMinor,
      balanceMinor: nextBalanceMinor,
      status: nextStatus,
      updatedAt: nowIso,
      payments: [...bill.payments, paymentEntry],
    };

    await this.prisma.configSetting.update({
      where: {
        tenantId_scopeKey_key: {
          tenantId,
          scopeKey: "supplier_bill",
          key: billId,
        },
      },
      data: {
        value: updatedBill as unknown as object,
        updatedBy: userId ?? null,
      },
    });

    // Also update overall supplier paidMinor
    const supplier = await this.get(tenantId, bill.supplierId);
    await this.update(
      tenantId,
      bill.supplierId,
      {
        paidMinor: (supplier.paidMinor ?? 0) + input.amountMinor,
      },
      userId,
    );

    await this.writeAudit(tenantId, userId, "supplier.bill_payment", bill.supplierId, {
      billId,
      billNumber: bill.billNumber,
      amountMinor: input.amountMinor,
      newBalanceMinor: nextBalanceMinor,
      status: nextStatus,
    });

    return updatedBill;
  }

  async setStatus(tenantId: string, id: string, status: "active" | "inactive", userId?: string) {
    const existing = await this.get(tenantId, id);
    if (existing.status === status) return existing;

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: { status, updatedBy: userId, version: { increment: 1 } },
    });
    await this.writeAudit(
      tenantId,
      userId,
      status === "active" ? "supplier.reactivated" : "supplier.deactivated",
      id,
      { previousStatus: existing.status, status },
    );
    return this.hydrate(updated);
  }

  private async writeAudit(
    tenantId: string,
    userId: string | undefined,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId ?? null,
          action,
          entityType: "supplier",
          entityId,
          metadata: metadata as object,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write supplier audit event '${action}' for ${entityId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
