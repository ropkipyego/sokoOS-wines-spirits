import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney, parseMoneyToMinor } from "./lib/money.ts";
import { resolveLandingRoute } from "./stores/auth.ts";
import { calculateCashChange, cartTotals } from "./pos/cart.ts";

test("formatMoney and parseMoneyToMinor render and parse KES minor units", () => {
  assert.equal(formatMoney(125000), "KES 1,250.00");
  assert.equal(parseMoneyToMinor("1,250.00"), 125000);
});

test("resolveLandingRoute directs each Wines & Spirits role to its primary workspace", () => {
  assert.equal(
    resolveLandingRoute(
      [{ id: "1", roleKey: "cashier", roleName: "Cashier", branchId: "b1" }],
      ["sales.create", "sales.read"],
    ),
    "/pos",
  );
  assert.equal(
    resolveLandingRoute(
      [{ id: "2", roleKey: "stock_controller", roleName: "Stock Controller", branchId: "b1" }],
      ["inventory.adjust", "inventory.read"],
    ),
    "/inventory",
  );
  assert.equal(
    resolveLandingRoute(
      [{ id: "3", roleKey: "accountant", roleName: "Accountant", branchId: null }],
      ["reports.financial", "expenses.approve"],
    ),
    "/reports",
  );
  assert.equal(
    resolveLandingRoute(
      [{ id: "4", roleKey: "business_owner", roleName: "Owner", branchId: null }],
      ["reports.read", "sales.create"],
    ),
    "/dashboard",
  );
});

test("integrated POS cart math and deterministic cash change", () => {
  const totals = cartTotals(
    [{ productId: "p1", sku: "JW-BLACK", name: "JW Black", unitPriceCents: 360000, qty: 2 }],
    20000,
  );
  assert.equal(totals.subtotalCents, 720000);
  assert.equal(totals.discountCents, 20000);
  assert.equal(totals.totalCents, 700000);

  const change = calculateCashChange(125000, 200000);
  assert.equal(change.changeCents, 75000);
  assert.equal(change.sufficient, true);
});
