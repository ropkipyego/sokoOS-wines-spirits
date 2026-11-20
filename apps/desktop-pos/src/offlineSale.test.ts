import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryLocalDb } from "./db/MemoryLocalDb.ts";
import { SEED_PRODUCTS } from "./db/seed.ts";
import { calculateCashChange, cartTotals, formatMoney, useCartStore } from "./stores/cart.ts";

test("formatMoney, cart totals, discounts, and deterministic cash change", () => {
  assert.equal(formatMoney(8500), "KES 85.00");
  const totals = cartTotals(
    [
      { productId: "a", sku: "A", name: "A", unitPriceCents: 1000, qty: 2 },
      { productId: "b", sku: "B", name: "B", unitPriceCents: 500, qty: 1 },
    ],
    200,
  );
  assert.equal(totals.subtotalCents, 2500);
  assert.equal(totals.discountCents, 200);
  assert.equal(totals.totalCents, 2300);

  // Spec requirement: Total 1,250 -> Tendered 2,000 -> Change 750
  const change = calculateCashChange(125_000, 200_000);
  assert.equal(change.changeCents, 75_000);
  assert.equal(change.remainingCents, 0);
  assert.equal(change.sufficient, true);

  const insufficient = calculateCashChange(125_000, 100_000);
  assert.equal(insufficient.changeCents, 0);
  assert.equal(insufficient.remainingCents, 25_000);
  assert.equal(insufficient.sufficient, false);
});

test("blocks offline sales for products awaiting tax review", async () => {
  const db = new MemoryLocalDb();
  const unresolved = {
    ...SEED_PRODUCTS[0]!,
    id: "tax-review-product",
    sku: "TAX-REVIEW",
    taxReviewRequired: true,
  };
  await db.upsertProducts([unresolved]);

  await assert.rejects(
    db.completeSale({
      branchId: "branch-1",
      tender: "cash",
      lines: [{ productId: unresolved.id, qty: 1 }],
    }),
    /Tax mapping required.*administrator must map this product/,
  );
  assert.equal((await db.listSales()).length, 0);
});

test("hold and resume sales in POS cart store", () => {
  const store = useCartStore.getState();
  store.clear();
  const sample = SEED_PRODUCTS[0]!;
  store.addProduct(sample, 10);
  assert.equal(useCartStore.getState().lines.length, 1);

  const held = store.holdCurrentSale({ label: "VIP Customer" });
  assert.ok(held);
  assert.equal(useCartStore.getState().lines.length, 0);
  assert.equal(useCartStore.getState().heldSales.length, 1);

  const resumed = store.resumeHeldSale(held.id);
  assert.ok(resumed);
  assert.equal(useCartStore.getState().lines.length, 1);
  assert.equal(useCartStore.getState().heldSales.length, 0);
  store.clear();
});

test("completeSale writes sale, stock movement, and outbox without network", async () => {
  const db = new MemoryLocalDb();
  await db.upsertProducts(SEED_PRODUCTS.slice(0, 2));
  const before = await db.getProduct("prod_rice");
  assert.ok(before);

  const sale = await db.completeSale({
    branchId: crypto.randomUUID(),
    warehouseId: crypto.randomUUID(),
    tender: "cash",
    cashTenderedCents: 800_000,
    lines: [{ productId: "prod_rice", qty: 2 }],
  });

  assert.equal(sale.lines.length, 1);
  assert.equal(sale.synced, false);
  assert.match(sale.id, /^[0-9a-f-]{36}$/i);

  const after = await db.getProduct("prod_rice");
  assert.equal(after?.stock, (before?.stock ?? 0) - 2);

  const movements = await db.listStockMovements();
  assert.equal(movements.length, 1);
  assert.equal(movements[0]?.delta, -2);

  const outbox = await db.listOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]?.entityType, "sale");
  assert.equal(outbox[0]?.entityId, sale.id);
  const payload = outbox[0]?.payload as { items: unknown[]; payments: unknown[] };
  assert.ok(Array.isArray(payload.items) && payload.items.length === 1);
  assert.ok(Array.isArray(payload.payments) && payload.payments.length === 1);
});
