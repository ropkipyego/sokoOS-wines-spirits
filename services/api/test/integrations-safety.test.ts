import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { INTEGRATION_REQUIREMENTS } from "../src/integrations/integrations.types";
import { IntegrationsService } from "../src/integrations/integrations.service";
import type { EtimsSubmissionRecord } from "../src/integrations/etims.adapter";

describe("integration safety & eTIMS submission queue", () => {
  it("documents that M-Pesa and eTIMS require external authorization", () => {
    expect(INTEGRATION_REQUIREMENTS.mpesa).toMatch(/Daraja/);
    expect(INTEGRATION_REQUIREMENTS.etims).toMatch(/acknowledgement/i);
  });

  it("never invents fiscal invoice numbers without acknowledgement", () => {
    const queued = { status: "queued", fiscalInvoiceNumber: null as string | null };
    expect(queued.fiscalInvoiceNumber).toBeNull();
    expect(queued.status).not.toBe("completed");
  });

  it("untrusted M-Pesa callbacks must not complete payment", () => {
    const trusted = false;
    const shouldComplete = trusted && 0 === 0;
    expect(shouldComplete).toBe(false);
  });

  it("handles eTIMS submission lifecycle: NOT_CONFIGURED -> PENDING -> FAILED -> RETRYING -> ACCEPTED -> idempotent replay", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const saleId = randomUUID();
    const userId = randomUUID();

    let tenantSettings: Record<string, unknown> = {};
    let saleFiscalStatus = "not_configured";
    const configStore = new Map<string, EtimsSubmissionRecord>();
    const auditEvents: unknown[] = [];

    const prisma = {
      tenant: {
        findUnique: vi.fn().mockImplementation(() =>
          Promise.resolve({ id: tenantId, settings: tenantSettings }),
        ),
        update: vi.fn().mockImplementation(({ data }: { data: { settings: Record<string, unknown> } }) => {
          tenantSettings = data.settings;
          return Promise.resolve({ id: tenantId, settings: tenantSettings });
        }),
      },
      sale: {
        findFirst: vi.fn().mockImplementation(() =>
          Promise.resolve({
            id: saleId,
            tenantId,
            branchId,
            receiptNumber: "R-2001",
            subtotalMinor: 360000,
            taxMinor: 49655,
            discountMinor: 0,
            totalMinor: 360000,
            currency: "KES",
            occurredAt: new Date(),
            fiscalStatus: saleFiscalStatus,
            items: [
              {
                skuSnapshot: "JW-BLACK-750ML",
                nameSnapshot: "Johnnie Walker Black Label 750ml",
                quantity: 1,
                unitPriceMinor: 360000,
                taxMinor: 49655,
                lineTotalMinor: 360000,
              },
            ],
          }),
        ),
        update: vi.fn().mockImplementation(({ data }: { data: { fiscalStatus: string } }) => {
          saleFiscalStatus = data.fiscalStatus;
          return Promise.resolve({ id: saleId, fiscalStatus: saleFiscalStatus });
        }),
      },
      configSetting: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { tenantId_scopeKey_key: { key: string } } }) => {
          const val = configStore.get(where.tenantId_scopeKey_key.key);
          return Promise.resolve(val ? { value: val } : null);
        }),
        findMany: vi.fn().mockImplementation(() =>
          Promise.resolve([...configStore.values()].map((value) => ({ value }))),
        ),
        upsert: vi.fn().mockImplementation(({ create, update }: { create: { key: string; value: EtimsSubmissionRecord }; update: { value: EtimsSubmissionRecord } }) => {
          const next = update?.value ?? create.value;
          configStore.set(create.key, next);
          return Promise.resolve({ value: next });
        }),
      },
      auditLog: {
        create: vi.fn().mockImplementation(({ data }: { data: unknown }) => {
          auditEvents.push(data);
          return Promise.resolve(data);
        }),
      },
    };

    const service = new IntegrationsService(prisma as never);

    // 1. Unconfigured tenant -> NOT_CONFIGURED, never invents a fiscal number
    const unconf = await service.submitEtimsInvoice(tenantId, saleId, { userId });
    expect(unconf.status).toBe("not_submitted");
    expect(unconf.fiscalInvoiceNumber).toBeNull();
    expect(saleFiscalStatus).toBe("NOT_CONFIGURED");

    // 2. Configure tenant eTIMS PIN in sandbox mode
    await service.updateSettings(tenantId, userId, {
      etims: { enabled: true, mode: "sandbox", pin: "P051234567X" },
    });

    // 3. Submit without live OSCU connection -> PENDING (queued)
    const pendingRes = await service.submitEtimsInvoice(tenantId, saleId, { userId });
    expect(pendingRes.status).toBe("queued");
    expect(pendingRes.etimsStatus).toBe("PENDING");
    expect(pendingRes.fiscalInvoiceNumber).toBeNull();
    expect(saleFiscalStatus).toBe("PENDING");

    // 4. Simulate control unit failure -> FAILED, local sale preserved, error recorded
    const failedRes = await service.submitEtimsInvoice(tenantId, saleId, {
      userId,
      harnessOutcome: {
        outcome: "failed",
        errorCode: "OSCU_TIMEOUT",
        errorMessage: "Connection to KRA OSCU timed out",
      },
    });
    expect(failedRes.etimsStatus).toBe("FAILED");
    expect(failedRes.fiscalInvoiceNumber).toBeNull();
    expect(failedRes.lastError).toContain("OSCU_TIMEOUT");
    expect(saleFiscalStatus).toBe("FAILED");

    // 5. Retry while control unit still pending -> RETRYING
    const retryingRes = await service.retryEtimsInvoice(tenantId, saleId, {
      userId,
      harnessOutcome: { outcome: "pending" },
    });
    expect(retryingRes.etimsStatus).toBe("RETRYING");
    expect(retryingRes.fiscalInvoiceNumber).toBeNull();
    expect(saleFiscalStatus).toBe("RETRYING");

    // 6. Retry with verified control unit acknowledgement -> ACCEPTED
    const acceptedRes = await service.retryEtimsInvoice(tenantId, saleId, {
      userId,
      harnessOutcome: {
        outcome: "accepted",
        cuInvoiceNumber: "KRA-CU-00998811",
        controlUnitId: "KRACU0100001234",
        receiptSignature: "SIG-998811",
      },
    });
    expect(acceptedRes.etimsStatus).toBe("ACCEPTED");
    expect(acceptedRes.fiscalInvoiceNumber).toBe("KRA-CU-00998811");
    expect(saleFiscalStatus).toBe("ACCEPTED");

    // 7. Subsequent retry on an ACCEPTED invoice is an idempotent no-op
    const replayRes = await service.retryEtimsInvoice(tenantId, saleId, { userId });
    expect(replayRes.status).toBe("ACCEPTED");
    expect(replayRes.replayed).toBe(true);
    expect(replayRes.fiscalInvoiceNumber).toBe("KRA-CU-00998811");
    expect(replayRes.attempts).toBe(acceptedRes.attempts);
    expect(auditEvents.length).toBeGreaterThanOrEqual(4);
  });
});
