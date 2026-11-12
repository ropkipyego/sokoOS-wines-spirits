import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  SyncService,
  decideSyncIdempotency,
  hashPayload,
} from "../src/sync/sync.service";

describe("sync idempotency handler", () => {
  it("accepts a new changeId", () => {
    const decision = decideSyncIdempotency(null, hashPayload({ a: 1 }));
    expect(decision).toBe("accept_new");
  });

  it("replays when changeId exists with same payload hash", () => {
    const hash = hashPayload({ entity: "sale", total: 100 });
    const decision = decideSyncIdempotency({ payloadHash: hash }, hash);
    expect(decision).toBe("replay");
  });

  it("flags hash mismatch when changeId reused with different payload", () => {
    const original = hashPayload({ qty: 1 });
    const incoming = hashPayload({ qty: 2 });
    const decision = decideSyncIdempotency(
      { payloadHash: original },
      incoming,
    );
    expect(decision).toBe("hash_mismatch");
  });

  it("replays when stored hash is null (legacy row)", () => {
    const decision = decideSyncIdempotency(
      { payloadHash: null },
      hashPayload({ x: true }),
    );
    expect(decision).toBe("replay");
  });

  it("processes an offline sale SyncEnvelope once and deduplicates duplicate replays without creating a second sale", async () => {
    const tenantId = randomUUID();
    const deviceId = randomUUID();
    const branchId = randomUUID();
    const warehouseId = randomUUID();
    const userId = randomUUID();
    const saleId = randomUUID();
    const changeId = randomUUID();
    const productId = randomUUID();

    const syncChanges = new Map<string, { changeId: string; payloadHash: string | null }>();
    const createdSales: unknown[] = [];

    const prisma = {
      device: {
        findFirst: vi.fn().mockResolvedValue({ id: deviceId, tenantId, status: "active" }),
        update: vi.fn().mockResolvedValue({ id: deviceId }),
      },
      syncChange: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { changeId: string } }) =>
          Promise.resolve(syncChanges.get(where.changeId) ?? null),
        ),
        create: vi.fn().mockImplementation(({ data }: { data: { changeId: string; payloadHash: string } }) => {
          syncChanges.set(data.changeId, data);
          return Promise.resolve(data);
        }),
        count: vi.fn().mockImplementation(() => Promise.resolve(syncChanges.size)),
      },
      syncConflict: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const sales = {
      create: vi.fn().mockImplementation((_tId: string, _uId: string, payload: unknown) => {
        createdSales.push(payload);
        return Promise.resolve({ id: saleId });
      }),
    };
    const catalog = {};
    const inventory = {};
    const roles = { getAuthzVersion: vi.fn().mockResolvedValue(1) };

    const syncService = new SyncService(
      prisma as never,
      sales as never,
      catalog as never,
      inventory as never,
      roles as never,
    );

    const envelope = {
      envelopeId: randomUUID(),
      deviceId,
      tenantId,
      branchId,
      producedAt: new Date().toISOString(),
      protocolVersion: 1 as const,
      changes: [
        {
          changeId,
          entityType: "sale",
          entityId: saleId,
          op: "append" as const,
          version: 1,
          baseVersion: 0,
          payload: {
            branchId,
            warehouseId,
            receiptNumber: "R-1001",
            currency: "KES",
            items: [{ productId, quantity: 2, unitPriceMinor: 360000 }],
            payments: [{ method: "cash", amountMinor: 720000, tenderedMinor: 800000, changeMinor: 80000 }],
          },
          occurredAt: new Date().toISOString(),
          actorUserId: userId,
        },
      ],
    };

    // First push (reconnect sync)
    const firstAck = await syncService.push(tenantId, userId, envelope);
    expect(firstAck.acceptedChangeIds).toEqual([changeId]);
    expect(firstAck.conflicts).toEqual([]);
    expect(createdSales.length).toBe(1);

    // Duplicate replay of the exact same envelope
    const replayAck = await syncService.push(tenantId, userId, envelope);
    expect(replayAck.acceptedChangeIds).toEqual([changeId]);
    expect(replayAck.conflicts).toEqual([]);
    // Proof: no second sale was created
    expect(createdSales.length).toBe(1);
    expect(sales.create).toHaveBeenCalledTimes(1);
  });
});
