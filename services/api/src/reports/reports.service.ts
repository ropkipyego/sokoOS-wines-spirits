import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dailySummary(
    tenantId: string,
    opts: { date?: string; branchId?: string; departmentId?: string } = {},
  ) {
    const day = opts.date ? new Date(opts.date) : new Date();
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const salesWhere = {
      tenantId,
      status: "completed",
      occurredAt: { gte: start, lt: end },
      ...(opts.branchId ? { branchId: opts.branchId } : {}),
      ...(opts.departmentId ? { departmentId: opts.departmentId } : {}),
    };

    const [salesAgg, saleCount, expensesAgg] = await Promise.all([
      this.prisma.sale.aggregate({
        where: salesWhere,
        _sum: { totalMinor: true, taxMinor: true, discountMinor: true },
      }),
      this.prisma.sale.count({ where: salesWhere }),
      this.prisma.expense.aggregate({
        where: {
          tenantId,
          occurredAt: { gte: start, lt: end },
          ...(opts.branchId ? { branchId: opts.branchId } : {}),
        },
        _sum: { amountMinor: true },
      }),
    ]);

    return {
      date: start.toISOString().slice(0, 10),
      branchId: opts.branchId ?? null,
      departmentId: opts.departmentId ?? null,
      salesCount: saleCount,
      salesTotalMinor: salesAgg._sum.totalMinor ?? 0,
      taxMinor: salesAgg._sum.taxMinor ?? 0,
      discountMinor: salesAgg._sum.discountMinor ?? 0,
      expensesTotalMinor: expensesAgg._sum.amountMinor ?? 0,
      netMinor:
        (salesAgg._sum.totalMinor ?? 0) - (expensesAgg._sum.amountMinor ?? 0),
    };
  }

  /**
   * Finance summary. Folio postings and stock transfers are not counted as revenue.
   * COGS uses product costMinor × sold qty for completed sales in range.
   */
  async financeSummary(
    tenantId: string,
    opts: { from?: string; to?: string; branchId?: string; departmentId?: string } = {},
  ) {
    const where = {
      tenantId,
      status: "completed",
      ...(opts.branchId ? { branchId: opts.branchId } : {}),
      ...(opts.departmentId ? { departmentId: opts.departmentId } : {}),
      ...(opts.from || opts.to
        ? {
            occurredAt: {
              ...(opts.from ? { gte: new Date(opts.from) } : {}),
              ...(opts.to ? { lte: new Date(opts.to) } : {}),
            },
          }
        : {}),
    };

    const sales = await this.prisma.sale.findMany({
      where,
      select: {
        id: true,
        totalMinor: true,
        items: { select: { quantity: true, productId: true, product: { select: { costMinor: true } } } },
        payments: { select: { method: true, amountMinor: true, status: true } },
      },
      take: 5000,
    });

    let revenueMinor = 0;
    let cogsMinor = 0;
    const cashCollected: Record<string, number> = {};
    for (const sale of sales) {
      revenueMinor += sale.totalMinor;
      for (const item of sale.items) {
        cogsMinor += (item.product.costMinor ?? 0) * item.quantity;
      }
      for (const p of sale.payments) {
        if (p.status !== "completed" || p.method === "room_charge") continue;
        cashCollected[p.method] = (cashCollected[p.method] ?? 0) + p.amountMinor;
      }
    }

    const expensesAgg = await this.prisma.expense.aggregate({
      where: {
        tenantId,
        ...(opts.branchId ? { branchId: opts.branchId } : {}),
        ...(opts.from || opts.to
          ? {
              occurredAt: {
                ...(opts.from ? { gte: new Date(opts.from) } : {}),
                ...(opts.to ? { lte: new Date(opts.to) } : {}),
              },
            }
          : {}),
      },
      _sum: { amountMinor: true },
    });
    const expensesMinor = expensesAgg._sum.amountMinor ?? 0;
    const grossProfitMinor = revenueMinor - cogsMinor;
    const netProfitMinor = grossProfitMinor - expensesMinor;

    const inventory = await this.prisma.stockBalance.findMany({
      where: { tenantId, ...(opts.branchId ? { warehouse: { branchId: opts.branchId } } : {}) },
      include: { product: { select: { costMinor: true } } },
      take: 10000,
    });
    const inventoryValuationMinor = inventory.reduce(
      (s, b) => s + b.quantity * (b.product.costMinor ?? 0),
      0,
    );

    return {
      revenueMinor,
      cogsMinor,
      grossProfitMinor,
      expensesMinor,
      netProfitMinor,
      cashCollected,
      inventoryValuationMinor,
      salesCount: sales.length,
      notes: [
        "Folio charges link existing sales and are not additional revenue.",
        "Stock transfers are not sales.",
        "room_charge payments excluded from cash collected.",
      ],
    };
  }

  async departmentSales(
    tenantId: string,
    opts: { from?: string; to?: string; branchId?: string } = {},
  ) {
    const where = {
      tenantId,
      status: "completed",
      ...(opts.branchId ? { branchId: opts.branchId } : {}),
      ...(opts.from || opts.to
        ? {
            occurredAt: {
              ...(opts.from ? { gte: new Date(opts.from) } : {}),
              ...(opts.to ? { lte: new Date(opts.to) } : {}),
            },
          }
        : {}),
    };
    const grouped = await this.prisma.sale.groupBy({
      by: ["departmentId"],
      where,
      _sum: { totalMinor: true, taxMinor: true, discountMinor: true },
      _count: { _all: true },
    });
    const deptIds = grouped.map((g) => g.departmentId).filter(Boolean) as string[];
    const depts = await this.prisma.department.findMany({
      where: { tenantId, id: { in: deptIds } },
      select: { id: true, code: true, name: true },
    });
    const map = new Map(depts.map((d) => [d.id, d]));
    return grouped.map((g) => ({
      departmentId: g.departmentId,
      department: g.departmentId ? map.get(g.departmentId) ?? null : null,
      salesCount: g._count._all,
      salesTotalMinor: g._sum.totalMinor ?? 0,
      taxMinor: g._sum.taxMinor ?? 0,
      discountMinor: g._sum.discountMinor ?? 0,
    }));
  }

  async lowStock(
    tenantId: string,
    opts: { threshold?: number; warehouseId?: string; limit?: number } = {},
  ) {
    const threshold = opts.threshold ?? 5;
    const limit = Math.min(opts.limit ?? 50, 200);

    const balances = await this.prisma.stockBalance.findMany({
      where: {
        tenantId,
        quantity: { lte: threshold },
        ...(opts.warehouseId ? { warehouseId: opts.warehouseId } : {}),
      },
      take: limit,
      orderBy: { quantity: "asc" },
    });

    const productIds = [...new Set(balances.map((b) => b.productId))];
    const products = await this.prisma.product.findMany({
      where: { tenantId, id: { in: productIds } },
      select: { id: true, sku: true, name: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return balances.map((b) => ({
      warehouseId: b.warehouseId,
      productId: b.productId,
      quantity: b.quantity,
      product: productMap.get(b.productId) ?? null,
      threshold,
    }));
  }

  async salesReport(
    tenantId: string,
    opts: { from?: string; to?: string; branchId?: string } = {},
  ) {
    const where = {
      tenantId,
      status: "completed",
      ...(opts.branchId ? { branchId: opts.branchId } : {}),
      ...(opts.from || opts.to
        ? {
            occurredAt: {
              ...(opts.from ? { gte: new Date(opts.from) } : {}),
              ...(opts.to ? { lte: new Date(opts.to) } : {}),
            },
          }
        : {}),
    };

    const [agg, count] = await Promise.all([
      this.prisma.sale.aggregate({
        where,
        _sum: { totalMinor: true, taxMinor: true },
        _avg: { totalMinor: true },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      salesCount: count,
      totalMinor: agg._sum.totalMinor ?? 0,
      taxMinor: agg._sum.taxMinor ?? 0,
      averageMinor: Math.round(agg._avg.totalMinor ?? 0),
    };
  }

  async dashboard(
    tenantId: string,
    opts: { from?: string; to?: string; branchId?: string } = {},
  ) {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const branch = opts.branchId ? { branchId: opts.branchId } : {};
    const completed = { tenantId, status: "completed", ...branch };

    const [today, week, month, products, low, out, expenses, recent, topProducts, byTender] =
      await Promise.all([
        this.periodAgg(completed, startOfDay, now),
        this.periodAgg(completed, startOfWeek, now),
        this.periodAgg(completed, startOfMonth, now),
        this.prisma.product.count({ where: { tenantId, status: "active", archivedAt: null } }),
        this.prisma.stockBalance.count({ where: { tenantId, quantity: { lte: 5, gt: 0 } } }),
        this.prisma.stockBalance.count({ where: { tenantId, quantity: { lte: 0 } } }),
        this.prisma.expense.aggregate({
          where: { tenantId, occurredAt: { gte: startOfDay, lte: now }, ...branch },
          _sum: { amountMinor: true },
        }),
        this.prisma.sale.findMany({
          where: completed,
          include: { cashier: true, payments: true, branch: true },
          orderBy: { occurredAt: "desc" },
          take: 8,
        }),
        this.prisma.saleItem.groupBy({
          by: ["productId", "nameSnapshot"],
          where: { tenantId },
          _sum: { quantity: true, lineTotalMinor: true },
          orderBy: { _sum: { lineTotalMinor: "desc" } },
          take: 8,
        }),
        this.prisma.salePayment.groupBy({
          by: ["method"],
          where: { tenantId, status: "completed" },
          _sum: { amountMinor: true },
        }),
      ]);

    const cogs = await this.grossProfit(tenantId, startOfDay, now, opts.branchId);

    return {
      today,
      week,
      month,
      activeProducts: products,
      lowStock: low,
      outOfStock: out,
      expensesTodayMinor: expenses._sum.amountMinor ?? 0,
      grossProfitTodayMinor: cogs,
      recentSales: recent,
      topProducts,
      paymentBreakdown: byTender,
    };
  }

  async exportSalesCsv(tenantId: string, opts: { from?: string; to?: string; branchId?: string }) {
    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId,
        status: "completed",
        ...(opts.branchId ? { branchId: opts.branchId } : {}),
        ...(opts.from || opts.to
          ? {
              occurredAt: {
                ...(opts.from ? { gte: new Date(opts.from) } : {}),
                ...(opts.to ? { lte: new Date(opts.to) } : {}),
              },
            }
          : {}),
      },
      include: { cashier: true, branch: true, payments: true },
      orderBy: { occurredAt: "desc" },
      take: 2000,
    });
    const header = "receipt,date,branch,cashier,totalMinor,method";
    const lines = sales.map((s) =>
      [
        s.receiptNumber,
        s.occurredAt.toISOString(),
        s.branchNameSnapshot ?? s.branch?.name ?? "",
        s.cashierNameSnapshot ?? s.cashier?.name ?? "",
        s.totalMinor,
        s.payments.map((p) => p.method).join("|"),
      ].join(","),
    );
    return `${header}\n${lines.join("\n")}\n`;
  }

  private async periodAgg(
    where: { tenantId: string; status: string; branchId?: string },
    from: Date,
    to: Date,
  ) {
    const scoped = { ...where, occurredAt: { gte: from, lte: to } };
    const [agg, count] = await Promise.all([
      this.prisma.sale.aggregate({ where: scoped, _sum: { totalMinor: true } }),
      this.prisma.sale.count({ where: scoped }),
    ]);
    const total = agg._sum.totalMinor ?? 0;
    return {
      salesTotalMinor: total,
      salesCount: count,
      averageMinor: count ? Math.round(total / count) : 0,
    };
  }

  private async grossProfit(tenantId: string, from: Date, to: Date, branchId?: string) {
    const items = await this.prisma.saleItem.findMany({
      where: {
        tenantId,
        sale: {
          tenantId,
          status: "completed",
          occurredAt: { gte: from, lte: to },
          ...(branchId ? { branchId } : {}),
        },
      },
      include: { product: { select: { costMinor: true } }, sale: { select: { totalMinor: true } } },
    });
    const revenue = items.reduce((s, i) => s + i.lineTotalMinor, 0);
    const cost = items.reduce((s, i) => s + (i.product.costMinor ?? 0) * i.quantity, 0);
    return revenue - cost;
  }

  /**
   * Comprehensive Wines & Spirits operational report covering:
   * - Gross sales, discounts, returns, net sales, tax, COGS, gross profit & margin
   * - Sales by cashier, branch, product, category, and payment method
   * - Inventory valuation, stock movement breakdown, and low stock
   * - Purchases, supplier balances, and expenses by category
   * - eTIMS submission status & failed/pending transactions
   */
  async comprehensiveReport(
    tenantId: string,
    opts: { from?: string; to?: string; branchId?: string } = {},
  ) {
    const dateFilter =
      opts.from || opts.to
        ? {
            occurredAt: {
              ...(opts.from ? { gte: new Date(opts.from) } : {}),
              ...(opts.to ? { lte: new Date(opts.to) } : {}),
            },
          }
        : {};
    const branchFilter = opts.branchId ? { branchId: opts.branchId } : {};

    const [
      sales,
      returns,
      expenses,
      purchases,
      suppliers,
      customers,
      balances,
      movements,
    ] = await Promise.all([
      this.prisma.sale.findMany({
        where: { tenantId, status: "completed", ...branchFilter, ...dateFilter },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  costMinor: true,
                  category: { select: { id: true, name: true } },
                },
              },
            },
          },
          payments: true,
          cashier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
        orderBy: { occurredAt: "desc" },
        take: 2500,
      }),
      this.prisma.return.findMany({
        where: { tenantId, status: "completed", ...branchFilter, ...dateFilter },
        select: { id: true, totalMinor: true },
      }),
      this.prisma.expense.findMany({
        where: { tenantId, ...branchFilter, ...dateFilter },
        select: { category: true, amountMinor: true, approvalStatus: true },
      }),
      this.prisma.purchase.findMany({
        where: { tenantId, ...branchFilter, status: { not: "cancelled" } },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      }),
      this.prisma.supplier.findMany({
        where: { tenantId, archivedAt: null },
        select: { id: true, name: true, phone: true, extensions: true },
      }),
      this.prisma.customer.findMany({
        where: { tenantId, archivedAt: null },
        select: { id: true, name: true, extensions: true },
      }),
      this.prisma.stockBalance.findMany({
        where: { tenantId, ...(opts.branchId ? { warehouse: { branchId: opts.branchId } } : {}) },
        include: {
          product: { select: { id: true, sku: true, name: true, costMinor: true, priceMinor: true, minStockQty: true } },
          warehouse: { select: { id: true, name: true, branchId: true } },
        },
      }),
      this.prisma.stockMovement.groupBy({
        by: ["type"],
        where: { tenantId, ...branchFilter },
        _sum: { quantityDelta: true },
        _count: { _all: true },
      }),
    ]);

    let grossSalesMinor = 0;
    let discountsMinor = 0;
    let taxMinor = 0;
    let cogsMinor = 0;

    const byCashierMap = new Map<string, { cashierId: string; name: string; salesCount: number; totalMinor: number }>();
    const byBranchMap = new Map<string, { branchId: string; name: string; salesCount: number; totalMinor: number }>();
    const byProductMap = new Map<string, { productId: string; sku: string; name: string; quantity: number; revenueMinor: number; cogsMinor: number; profitMinor: number }>();
    const byCategoryMap = new Map<string, { category: string; quantity: number; revenueMinor: number }>();
    const byPaymentMap = new Map<string, { method: string; count: number; amountMinor: number }>();
    const etimsStatusCounts = {
      ACCEPTED: 0,
      PENDING: 0,
      RETRYING: 0,
      FAILED: 0,
      NOT_CONFIGURED: 0,
    };
    const failedOrPendingEtims: Array<{
      saleId: string;
      receiptNumber: string;
      occurredAt: string;
      totalMinor: number;
      fiscalStatus: string;
    }> = [];

    for (const s of sales) {
      const lineDiscounts = s.items.reduce((acc, i) => acc + i.discountMinor, 0);
      const saleDiscount = s.discountMinor + lineDiscounts;
      grossSalesMinor += s.totalMinor + saleDiscount;
      discountsMinor += saleDiscount;
      taxMinor += s.taxMinor;

      const cashierName = s.cashierNameSnapshot ?? s.cashier?.name ?? "Cashier";
      const cEntry = byCashierMap.get(s.cashierUserId) ?? {
        cashierId: s.cashierUserId,
        name: cashierName,
        salesCount: 0,
        totalMinor: 0,
      };
      cEntry.salesCount += 1;
      cEntry.totalMinor += s.totalMinor;
      byCashierMap.set(s.cashierUserId, cEntry);

      const branchName = s.branchNameSnapshot ?? s.branch?.name ?? "Main";
      const bEntry = byBranchMap.get(s.branchId) ?? {
        branchId: s.branchId,
        name: branchName,
        salesCount: 0,
        totalMinor: 0,
      };
      bEntry.salesCount += 1;
      bEntry.totalMinor += s.totalMinor;
      byBranchMap.set(s.branchId, bEntry);

      for (const item of s.items) {
        const unitCost = item.product?.costMinor ?? 0;
        const lineCogs = unitCost * item.quantity;
        cogsMinor += lineCogs;

        const pEntry = byProductMap.get(item.productId) ?? {
          productId: item.productId,
          sku: item.skuSnapshot || item.product?.sku || "",
          name: item.nameSnapshot || item.product?.name || "",
          quantity: 0,
          revenueMinor: 0,
          cogsMinor: 0,
          profitMinor: 0,
        };
        pEntry.quantity += item.quantity;
        pEntry.revenueMinor += item.lineTotalMinor;
        pEntry.cogsMinor += lineCogs;
        pEntry.profitMinor = pEntry.revenueMinor - pEntry.cogsMinor;
        byProductMap.set(item.productId, pEntry);

        const catName = item.product?.category?.name ?? "Uncategorized";
        const catEntry = byCategoryMap.get(catName) ?? {
          category: catName,
          quantity: 0,
          revenueMinor: 0,
        };
        catEntry.quantity += item.quantity;
        catEntry.revenueMinor += item.lineTotalMinor;
        byCategoryMap.set(catName, catEntry);
      }

      for (const p of s.payments) {
        if (p.status !== "completed") continue;
        const mEntry = byPaymentMap.get(p.method) ?? {
          method: p.method,
          count: 0,
          amountMinor: 0,
        };
        mEntry.count += 1;
        mEntry.amountMinor += p.amountMinor;
        byPaymentMap.set(p.method, mEntry);
      }

      const fStatus = (s.fiscalStatus ?? "not_configured").toUpperCase();
      if (fStatus === "ACCEPTED") {
        etimsStatusCounts.ACCEPTED += 1;
      } else if (fStatus === "PENDING" || fStatus === "QUEUED") {
        etimsStatusCounts.PENDING += 1;
        failedOrPendingEtims.push({
          saleId: s.id,
          receiptNumber: s.receiptNumber,
          occurredAt: s.occurredAt.toISOString(),
          totalMinor: s.totalMinor,
          fiscalStatus: fStatus,
        });
      } else if (fStatus === "RETRYING") {
        etimsStatusCounts.RETRYING += 1;
        failedOrPendingEtims.push({
          saleId: s.id,
          receiptNumber: s.receiptNumber,
          occurredAt: s.occurredAt.toISOString(),
          totalMinor: s.totalMinor,
          fiscalStatus: fStatus,
        });
      } else if (fStatus === "FAILED") {
        etimsStatusCounts.FAILED += 1;
        failedOrPendingEtims.push({
          saleId: s.id,
          receiptNumber: s.receiptNumber,
          occurredAt: s.occurredAt.toISOString(),
          totalMinor: s.totalMinor,
          fiscalStatus: fStatus,
        });
      } else {
        etimsStatusCounts.NOT_CONFIGURED += 1;
      }
    }

    const returnsMinor = returns.reduce((acc, r) => acc + r.totalMinor, 0);
    const totalSalesAfterDiscountMinor = grossSalesMinor - discountsMinor;
    const netSalesMinor = totalSalesAfterDiscountMinor - returnsMinor;
    const grossProfitMinor = netSalesMinor - cogsMinor;
    const expensesMinor = expenses.reduce((acc, e) => acc + e.amountMinor, 0);
    const netProfitMinor = grossProfitMinor - expensesMinor;
    const marginPercent =
      netSalesMinor > 0 ? Number(((grossProfitMinor / netSalesMinor) * 100).toFixed(2)) : 0;

    const expensesByCategoryMap = new Map<string, number>();
    for (const e of expenses) {
      expensesByCategoryMap.set(e.category, (expensesByCategoryMap.get(e.category) ?? 0) + e.amountMinor);
    }

    const stockValuationCostMinor = balances.reduce(
      (acc, b) => acc + b.quantity * (b.product.costMinor ?? 0),
      0,
    );
    const stockValuationRetailMinor = balances.reduce(
      (acc, b) => acc + b.quantity * b.product.priceMinor,
      0,
    );
    const lowStockItems = balances
      .filter((b) => b.quantity <= Math.max(b.product.minStockQty, 5))
      .map((b) => ({
        warehouseId: b.warehouseId,
        warehouseName: b.warehouse.name,
        productId: b.productId,
        sku: b.product.sku,
        name: b.product.name,
        quantity: b.quantity,
        reorderLevel: Math.max(b.product.minStockQty, 5),
      }));

    const supplierBilled = new Map<string, number>();
    for (const p of purchases) {
      if (!p.supplierId) continue;
      const receivedVal = p.items.reduce(
        (acc, i) => acc + i.quantityReceived * i.unitCostMinor,
        0,
      );
      supplierBilled.set(p.supplierId, (supplierBilled.get(p.supplierId) ?? 0) + receivedVal);
    }

    const supplierBalances = suppliers.map((s) => {
      const ext = ((s.extensions ?? {}) as Record<string, unknown>) || {};
      const paidMinor = typeof ext.paidMinor === "number" ? ext.paidMinor : 0;
      const billedMinor = supplierBilled.get(s.id) ?? 0;
      return {
        supplierId: s.id,
        name: s.name,
        phone: s.phone,
        billedMinor,
        paidMinor,
        balanceMinor: Math.max(0, billedMinor - paidMinor),
      };
    });

    const outstandingCustomerCreditMinor = customers.reduce((acc, c) => {
      const ext = ((c.extensions ?? {}) as Record<string, unknown>) || {};
      return acc + (typeof ext.creditBalanceMinor === "number" ? ext.creditBalanceMinor : 0);
    }, 0);
    const outstandingSupplierPayablesMinor = supplierBalances.reduce(
      (acc, s) => acc + s.balanceMinor,
      0,
    );

    return {
      summary: {
        salesCount: sales.length,
        grossSalesMinor,
        discountsMinor,
        returnsMinor,
        netSalesMinor,
        taxMinor,
        cogsMinor,
        grossProfitMinor,
        marginPercent,
        expensesMinor,
        netProfitMinor,
        stockValuationCostMinor,
        stockValuationRetailMinor,
        outstandingCustomerCreditMinor,
        outstandingSupplierPayablesMinor,
      },
      salesByCashier: [...byCashierMap.values()].sort((a, b) => b.totalMinor - a.totalMinor),
      salesByBranch: [...byBranchMap.values()].sort((a, b) => b.totalMinor - a.totalMinor),
      salesByProduct: [...byProductMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor),
      salesByCategory: [...byCategoryMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor),
      salesByPaymentMethod: [...byPaymentMap.values()].sort((a, b) => b.amountMinor - a.amountMinor),
      inventory: {
        totalSkusInWarehouses: balances.length,
        stockValuationCostMinor,
        stockValuationRetailMinor,
        lowStockCount: lowStockItems.length,
        lowStockItems,
        movementSummary: movements.map((m) => ({
          type: m.type,
          count: m._count._all,
          netQuantityDelta: m._sum.quantityDelta ?? 0,
        })),
      },
      purchases: {
        totalPurchaseOrders: purchases.length,
        totalOrderedMinor: purchases.reduce((acc, p) => acc + p.totalMinor, 0),
        supplierBalances,
      },
      expensesByCategory: [...expensesByCategoryMap.entries()].map(([category, amountMinor]) => ({
        category,
        amountMinor,
      })),
      etims: {
        statusCounts: etimsStatusCounts,
        failedOrPendingTransactions: failedOrPendingEtims.slice(0, 50),
      },
    };
  }
}
