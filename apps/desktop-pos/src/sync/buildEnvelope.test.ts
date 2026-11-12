import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryLocalDb } from "../db/MemoryLocalDb.ts";
import { SEED_PRODUCTS } from "../db/seed.ts";
import { SyncWorker } from "./SyncWorker.ts";
import { buildSyncEnvelope } from "./buildEnvelope.ts";

test("buildSyncEnvelope maps outbox to protocol v1 SyncEnvelope", () => {
  const changeId = crypto.randomUUID();
  const saleId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();
  const branchId = crypto.randomUUID();

  const envelope = buildSyncEnvelope({
    tenantId,
    deviceId,
    branchId,
    actorUserId,
    items: [
      {
        id: changeId,
        entityType: "sale",
        entityId: saleId,
        payload: { branchId, items: [], payments: [] },
        createdAt: new Date().toISOString(),
        attempts: 0,
      },
    ],
  });

  assert.equal(envelope.protocolVersion, 1);
  assert.equal(envelope.tenantId, tenantId);
  assert.equal(envelope.deviceId, deviceId);
  assert.equal(envelope.changes.length, 1);
  assert.equal(envelope.changes[0]?.changeId, changeId);
  assert.equal(envelope.changes[0]?.entityId, saleId);
  assert.equal(envelope.changes[0]?.op, "append");
  assert.equal(envelope.changes[0]?.actorUserId, actorUserId);
});

test("offline sale -> local persistence -> reconnect sync -> ack removes outbox item", async () => {
  const db = new MemoryLocalDb();
  await db.upsertProducts(SEED_PRODUCTS.slice(0, 2));

  const tenantId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const warehouseId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();

  // 1. Create sale offline
  const sale = await db.completeSale({
    branchId,
    warehouseId,
    tender: "cash",
    cashTenderedCents: 400_000,
    lines: [{ productId: "prod_rice", qty: 1 }],
  });
  assert.equal(sale.synced, false);

  const outboxBefore = await db.listOutbox();
  assert.equal(outboxBefore.length, 1);
  const queuedChangeId = outboxBefore[0]!.id;

  // 2. Reconnect & sync via SyncWorker against mocked /v1/sync/push endpoint
  const originalFetch = globalThis.fetch;
  let pushedEnvelope: ReturnType<typeof buildSyncEnvelope> | null = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    pushedEnvelope = JSON.parse(String(init?.body)) as ReturnType<typeof buildSyncEnvelope>;
    return new Response(
      JSON.stringify({
        data: {
          acceptedChangeIds: [queuedChangeId],
          conflicts: [],
          serverSeq: 1,
          authzVersion: 1,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const worker = new SyncWorker(db, {
      tenantId,
      branchId,
      deviceId,
      actorUserId,
      accessToken: "test-jwt-token",
    });
    await worker.flush();
    worker.dispose();

    assert.ok(pushedEnvelope);
    assert.equal(pushedEnvelope.protocolVersion, 1);
    assert.equal(pushedEnvelope.changes[0]?.changeId, queuedChangeId);

    // 3. Outbox removes acknowledged item and marks local sale synced
    const outboxAfter = await db.listOutbox();
    assert.equal(outboxAfter.length, 0);
    const salesAfter = await db.listSales();
    assert.equal(salesAfter[0]?.synced, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
