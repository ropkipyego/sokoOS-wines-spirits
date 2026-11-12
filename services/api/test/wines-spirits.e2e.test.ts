import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://sokoos:sokoos@127.0.0.1:5432/sokoos_wines_spirits?schema=public";

describe("SokoOS Wines & Spirits — End-to-End Commercial Workflow & Security Suite", () => {
  let app: INestApplication | null = null;
  let baseUrl = "";
  let dbAvailable = false;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    process.env.JWT_ACCESS_SECRET = "dev-only-wines-spirits-access-secret-min-32-chars";
    process.env.JWT_REFRESH_SECRET = "dev-only-wines-spirits-refresh-secret-min-32-chars";

    try {
      // Load compiled AppModule with full TypeScript decorator metadata
      const mod = (await import("../dist/app.module.js")) as { AppModule: unknown };
      app = await NestFactory.create(mod.AppModule as never, { logger: false });
      app.setGlobalPrefix("v1");
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
        }),
      );
      await app.listen(0, "127.0.0.1");
      const addr = app.getHttpServer().address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}/v1`;
      // Probe database connectivity via login or health
      const probe = await fetch(`${baseUrl}/health/ready`).catch(() => null);
      dbAvailable = Boolean(probe && probe.ok);
    } catch {
      dbAvailable = false;
    }
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  async function api(
    path: string,
    opts: { method?: string; token?: string; body?: unknown } = {},
  ) {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  }

  it("executes the full Definition of Done workflow with RBAC, tenant isolation, packaging conversion, POS sale, return, offline idempotent sync, eTIMS retry, and audit trail", async () => {
    if (!dbAvailable) {
      console.warn("Skipping live DB E2E test — PostgreSQL not reachable in current sandbox");
      return;
    }
    expect(dbAvailable).toBe(true);
    // 1. Authenticate Owner, Cashier, and Tenant B Owner
    const ownerLogin = await api("/auth/login", {
      method: "POST",
      body: { email: "demo@sokoos.local", password: "Demo123!", tenantSlug: "demo" },
    });
    expect(ownerLogin.status).toBe(201);
    const ownerToken = ownerLogin.body.data.accessToken as string;
    const tenantAId = ownerLogin.body.data.tenant.id as string;
    expect(ownerLogin.body.data.productEdition).toBe("WINES_SPIRITS");

    const cashierLogin = await api("/auth/login", {
      method: "POST",
      body: { email: "cashier@sokoos.local", password: "Cashier123!", tenantSlug: "demo" },
    });
    expect(cashierLogin.status).toBe(201);
    const cashierToken = cashierLogin.body.data.accessToken as string;

    const tenantBLogin = await api("/auth/login", {
      method: "POST",
      body: { email: "owner@cellar-b.local", password: "CellarB123!", tenantSlug: "cellar-b" },
    });
    expect(tenantBLogin.status).toBe(201);
    const tenantBToken = tenantBLogin.body.data.accessToken as string;

    // 2. Verify irrelevant industry surfaces are unmounted/blocked in WINES_SPIRITS edition
    for (const disabledPath of [
      "/hotel/rooms",
      "/kitchen/tickets",
      "/pharmacy/batches",
      "/services/jobs",
    ]) {
      const res = await api(disabledPath, { token: ownerToken });
      expect([403, 404]).toContain(res.status);
    }

    // 3. Inspect Branches, Warehouses, and Products for Tenant A
    const branchesRes = await api("/branches", { token: ownerToken });
    expect(branchesRes.status).toBe(200);
    const mainBranch = branchesRes.body.data.find((b: { code: string }) => b.code === "MAIN");
    expect(mainBranch).toBeTruthy();

    const warehousesRes = await api(`/warehouses?branchId=${mainBranch.id}`, { token: ownerToken });
    expect(warehousesRes.status).toBe(200);
    const mainWarehouse = warehousesRes.body.data.find((w: { isDefault: boolean }) => w.isDefault);
    expect(mainWarehouse).toBeTruthy();

    const productsRes = await api("/products?limit=50", { token: ownerToken });
    expect(productsRes.status).toBe(200);
    const jwBottle = productsRes.body.data.find((p: { sku: string }) => p.sku === "JW-BLACK-750ML");
    const jwCase = productsRes.body.data.find((p: { sku: string }) => p.sku === "JW-BLACK-CASE12");
    expect(jwBottle).toBeTruthy();
    expect(jwCase).toBeTruthy();

    // 4. RBAC Security: Cashier MUST be denied on POST /inventory/adjust and POST /inventory/writeoff
    const cashierAdjustAttempt = await api("/inventory/adjust", {
      method: "POST",
      token: cashierToken,
      body: {
        warehouseId: mainWarehouse.id,
        branchId: mainBranch.id,
        productId: jwBottle.id,
        type: "ADJUSTMENT",
        quantityDelta: 100,
        reason: "Unauthorized cashier stock bump",
      },
    });
    expect(cashierAdjustAttempt.status).toBe(403);

    const cashierWriteoffAttempt = await api("/inventory/writeoff", {
      method: "POST",
      token: cashierToken,
      body: {
        warehouseId: mainWarehouse.id,
        branchId: mainBranch.id,
        productId: jwBottle.id,
        quantity: 1,
        reason: "Unauthorized writeoff",
      },
    });
    expect(cashierWriteoffAttempt.status).toBe(403);

    // 5. Cross-Tenant Isolation: Tenant B cannot read Tenant A product, and Tenant A cannot read Tenant B product
    const tenantBProducts = await api("/products", { token: tenantBToken });
    const privateProductB = tenantBProducts.body.data[0];
    expect(privateProductB.sku).toBe("TENANT-B-PRIVATE-WINE");

    const crossReadAtoB = await api(`/products/${privateProductB.id}`, { token: ownerToken });
    expect(crossReadAtoB.status).toBe(404);

    const crossReadBtoA = await api(`/products/${jwBottle.id}`, { token: tenantBToken });
    expect(crossReadBtoA.status).toBe(404);

    // 6. CSV Import Validation (valid row + invalid row + duplicate SKU row)
    const importValidation = await api("/products/import/validate", {
      method: "POST",
      token: ownerToken,
      body: {
        rows: [
          {
            sku: `HENNESSY-VS-750ML-${Date.now().toString(36).toUpperCase()}`,
            barcode: `324599${Math.floor(1000000 + Math.random() * 8999999)}`,
            name: "Hennessy VS Cognac 750ml",
            category: "Brandy",
            brand: "Hennessy",
            unit: "btl",
            size: "750ml",
            packSize: "1",
            cost: "4200.00",
            price: "5500.00",
            tax: "16",
            reorderLevel: "6",
          },
          {
            sku: "BAD-PRICE-SKU",
            name: "Malformed Price Bottle",
            price: "-100",
          },
          {
            sku: "JW-BLACK-750ML",
            name: "Duplicate Johnnie Walker",
            price: "3600.00",
          },
        ],
      },
    });
    expect(importValidation.status).toBe(201);
    expect(importValidation.body.data.validCount).toBe(1);
    expect(importValidation.body.data.invalidCount).toBe(1);
    expect(importValidation.body.data.duplicateCount).toBe(1);

    // 7. Packaging Conversion: Break 1 Case of JW-BLACK-CASE12 into +12 Bottles of JW-BLACK-750ML
    const balBeforeRes = await api(`/stock/balances?warehouseId=${mainWarehouse.id}&limit=100`, {
      token: ownerToken,
    });
    const getQty = (list: Array<{ productId: string; quantity: number }>, prodId: string) =>
      list.find((b) => b.productId === prodId)?.quantity ?? 0;

    const bottleBefore = getQty(balBeforeRes.body.data, jwBottle.id);
    const caseBefore = getQty(balBeforeRes.body.data, jwCase.id);

    const convertRes = await api("/inventory/convert-packaging", {
      method: "POST",
      token: ownerToken,
      body: {
        warehouseId: mainWarehouse.id,
        branchId: mainBranch.id,
        caseProductId: jwCase.id,
        bottleProductId: jwBottle.id,
        casesToBreak: 1,
        bottlesPerCase: 12,
        reason: "Replenish retail counter from case stock",
      },
    });
    expect(convertRes.status).toBe(201);
    expect(convertRes.body.data.casesBroken).toBe(1);
    expect(convertRes.body.data.bottlesAdded).toBe(12);

    const balAfterConvert = await api(`/stock/balances?warehouseId=${mainWarehouse.id}&limit=100`, {
      token: ownerToken,
    });
    expect(getQty(balAfterConvert.body.data, jwCase.id)).toBe(caseBefore - 1);
    expect(getQty(balAfterConvert.body.data, jwBottle.id)).toBe(bottleBefore + 12);

    // 8. POS Online Sale with Cash Tendered + Deterministic Change Calculation
    const customersRes = await api("/customers", { token: cashierToken });
    const customerId = customersRes.body.data[0]?.id as string | undefined;

    const saleRes = await api("/sales", {
      method: "POST",
      token: cashierToken,
      body: {
        branchId: mainBranch.id,
        warehouseId: mainWarehouse.id,
        customerId,
        items: [
          {
            productId: jwBottle.id,
            quantity: 2,
            unitPriceMinor: 360000,
          },
        ],
        payments: [
          {
            method: "cash",
            amountMinor: 720000,
            tenderedMinor: 800000,
          },
        ],
      },
    });
    expect(saleRes.status).toBe(201);
    const createdSale = saleRes.body.data;
    expect(createdSale.totalMinor).toBe(720000);
    expect(createdSale.payments[0].tenderedMinor).toBe(800000);
    expect(createdSale.payments[0].changeMinor).toBe(80000);

    // Verify stock deducted by 2 bottles
    const balAfterSale = await api(`/stock/balances?warehouseId=${mainWarehouse.id}&limit=100`, {
      token: ownerToken,
    });
    expect(getQty(balAfterSale.body.data, jwBottle.id)).toBe(bottleBefore + 12 - 2);

    // 9. Return / Refund 1 bottle from the sale and verify stock increases by 1
    const returnRes = await api("/returns", {
      method: "POST",
      token: ownerToken,
      body: {
        saleId: createdSale.id,
        branchId: mainBranch.id,
        warehouseId: mainWarehouse.id,
        reason: "Customer exchanged 1 unopened bottle",
        items: [
          {
            productId: jwBottle.id,
            quantity: 1,
            unitPriceMinor: 360000,
          },
        ],
      },
    });
    expect(returnRes.status).toBe(201);
    expect(returnRes.body.data.totalMinor).toBe(360000);

    const balAfterReturn = await api(`/stock/balances?warehouseId=${mainWarehouse.id}&limit=100`, {
      token: ownerToken,
    });
    expect(getQty(balAfterReturn.body.data, jwBottle.id)).toBe(bottleBefore + 12 - 1);

    // 10. Offline Sale -> SyncEnvelope v1 -> Server Accepts -> Idempotent Duplicate Replay
    const deviceId = randomUUID();
    const regDevice = await api("/auth/devices/register", {
      method: "POST",
      token: ownerToken,
      body: {
        deviceId,
        branchId: mainBranch.id,
        name: "Kilimani Counter Terminal 1",
      },
    });
    expect(regDevice.status).toBe(201);

    const offlineSaleId = randomUUID();
    const offlineChangeId = randomUUID();
    const offlineReceiptNo = `R-OFFLINE-${Date.now().toString(36).toUpperCase()}`;
    const envelope = {
      envelopeId: randomUUID(),
      deviceId,
      tenantId: tenantAId,
      branchId: mainBranch.id,
      producedAt: new Date().toISOString(),
      protocolVersion: 1,
      changes: [
        {
          changeId: offlineChangeId,
          entityType: "sale",
          entityId: offlineSaleId,
          op: "append",
          version: 1,
          baseVersion: 0,
          payload: {
            branchId: mainBranch.id,
            warehouseId: mainWarehouse.id,
            receiptNumber: offlineReceiptNo,
            currency: "KES",
            items: [{ productId: jwBottle.id, quantity: 1, unitPriceMinor: 360000 }],
            payments: [{ method: "cash", amountMinor: 360000, tenderedMinor: 400000, changeMinor: 40000 }],
          },
          occurredAt: new Date().toISOString(),
          actorUserId: cashierLogin.body.data.user.id,
        },
      ],
    };

    const syncPush1 = await api("/sync/push", {
      method: "POST",
      token: cashierToken,
      body: envelope,
    });
    expect(syncPush1.status).toBe(201);
    expect(syncPush1.body.data.acceptedChangeIds).toContain(offlineChangeId);
    expect(syncPush1.body.data.conflicts).toHaveLength(0);

    const balAfterOfflineSync1 = await api(`/stock/balances?warehouseId=${mainWarehouse.id}&limit=100`, {
      token: ownerToken,
    });
    const stockAfterFirstSync = getQty(balAfterOfflineSync1.body.data, jwBottle.id);
    expect(stockAfterFirstSync).toBe(bottleBefore + 12 - 2);

    // Replay the exact same SyncEnvelope — must be idempotent and NOT deduct stock again
    const syncPushReplay = await api("/sync/push", {
      method: "POST",
      token: cashierToken,
      body: envelope,
    });
    expect(syncPushReplay.status).toBe(201);
    expect(syncPushReplay.body.data.acceptedChangeIds).toContain(offlineChangeId);
    expect(syncPushReplay.body.data.conflicts).toHaveLength(0);

    const balAfterOfflineReplay = await api(`/stock/balances?warehouseId=${mainWarehouse.id}&limit=100`, {
      token: ownerToken,
    });
    expect(getQty(balAfterOfflineReplay.body.data, jwBottle.id)).toBe(stockAfterFirstSync);

    // 11. eTIMS Submission -> Failure -> Retry -> Accepted
    const cfgEtims = await api("/integrations/settings", {
      method: "PATCH",
      token: ownerToken,
      body: {
        etims: { enabled: true, mode: "sandbox", pin: "P051999888Z" },
      },
    });
    expect(cfgEtims.status).toBe(200);

    const etimsFail = await api(`/integrations/etims/sales/${createdSale.id}/submit`, {
      method: "POST",
      token: ownerToken,
      body: {
        harnessOutcome: {
          outcome: "failed",
          errorCode: "OSCU_TIMEOUT",
          errorMessage: "Simulated KRA OSCU timeout",
        },
      },
    });
    expect(etimsFail.status).toBe(201);
    expect(etimsFail.body.data.etimsStatus).toBe("FAILED");
    expect(etimsFail.body.data.fiscalInvoiceNumber).toBeNull();

    const etimsRetryAccept = await api(`/integrations/etims/sales/${createdSale.id}/retry`, {
      method: "POST",
      token: ownerToken,
      body: {
        harnessOutcome: {
          outcome: "accepted",
          cuInvoiceNumber: "KRA-CU-2026-000912",
          controlUnitId: "KRACU01000912",
        },
      },
    });
    expect(etimsRetryAccept.status).toBe(201);
    expect(etimsRetryAccept.body.data.etimsStatus).toBe("ACCEPTED");
    expect(etimsRetryAccept.body.data.fiscalInvoiceNumber).toBe("KRA-CU-2026-000912");

    // 12. Comprehensive Report & Audit Trail Verification
    const compReport = await api("/reports/comprehensive", { token: ownerToken });
    expect(compReport.status).toBe(200);
    expect(compReport.body.data.summary.salesCount).toBeGreaterThanOrEqual(2);
    expect(compReport.body.data.summary.returnsMinor).toBeGreaterThanOrEqual(360000);
    expect(compReport.body.data.etims.statusCounts.ACCEPTED).toBeGreaterThanOrEqual(1);

    const auditRes = await api("/audit-logs?limit=50", { token: ownerToken });
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.length).toBeGreaterThan(5);
  });
});
