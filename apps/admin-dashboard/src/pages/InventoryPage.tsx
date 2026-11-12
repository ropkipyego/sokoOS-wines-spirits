import { useEffect, useState, type FormEvent } from "react";
import { Button, Input } from "@sokoos/ui";
import { AppShell, EmptyState } from "../components/AppShell";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { formatMoney } from "../lib/money";

type Balance = { warehouseId: string; productId: string; quantity: number };
type Product = {
  id: string;
  sku: string;
  name: string;
  size?: string | null;
  packSize?: number | null;
  packagingType?: string | null;
  bottleProductId?: string | null;
  conversionFactor?: number | null;
  minStockQty: number;
  costMinor?: number | null;
  priceMinor: number;
};
type Warehouse = { id: string; name: string; branchId: string };
type Movement = {
  id: string;
  type: string;
  quantityDelta: number;
  createdAt: string;
  productId: string;
  warehouseId: string;
  reason?: string | null;
  referenceType?: string | null;
};

type OperationMode = "receive" | "adjust" | "count" | "writeoff" | "convert";

export function InventoryPage() {
  const token = useAuthStore((s) => s.accessToken);
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
  const [balances, setBalances] = useState<Balance[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [mode, setMode] = useState<OperationMode>("receive");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [writeOffType, setWriteOffType] = useState<"DAMAGE" | "EXPIRED" | "WRITE_OFF">("DAMAGE");
  const [bottleProductId, setBottleProductId] = useState("");
  const [bottlesPerCase, setBottlesPerCase] = useState("12");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [b, p, w] = await Promise.all([
      apiRequest<{ data: Balance[] } | Balance[]>("/stock/balances?limit=200", { token }),
      apiRequest<{ data: Product[] } | Product[]>("/products?limit=200", { token }),
      apiRequest<{ data: Warehouse[] } | Warehouse[]>("/warehouses", { token }),
    ]);
    const arr = <T,>(x: T[] | { data: T[] }) => (Array.isArray(x) ? x : x.data);
    const wList = arr(w);
    setBalances(arr(b));
    setProducts(arr(p));
    setWarehouses(wList);
    if (!warehouseId && wList[0]) setWarehouseId(wList[0].id);
  }

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submitOperation(event: FormEvent) {
    event.preventDefault();
    const wh = warehouses.find((w) => w.id === warehouseId);
    if (!wh || !productId) {
      setError("Select a warehouse and product");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const qtyNum = Number(quantity);
      if (mode === "receive") {
        const res = await apiRequest<{ beforeQuantity?: number; afterQuantity?: number }>("/inventory/receive", {
          method: "POST",
          token,
          body: {
            warehouseId,
            branchId: wh.branchId,
            productId,
            type: "OPENING_STOCK",
            quantityDelta: Math.abs(qtyNum),
            reason: reason.trim() || "Opening / received stock",
          },
        });
        setInfo(`Stock received (${res.beforeQuantity ?? 0} → ${res.afterQuantity ?? qtyNum}).`);
      } else if (mode === "adjust") {
        const res = await apiRequest<{ beforeQuantity?: number; afterQuantity?: number }>("/inventory/adjust", {
          method: "POST",
          token,
          body: {
            warehouseId,
            branchId: wh.branchId,
            productId,
            type: "ADJUSTMENT",
            quantityDelta: qtyNum,
            reason: reason.trim() || "Manual inventory adjustment",
          },
        });
        setInfo(`Stock adjusted (${res.beforeQuantity ?? 0} → ${res.afterQuantity ?? 0}).`);
      } else if (mode === "count") {
        const res = await apiRequest<{ beforeQuantity: number; afterQuantity: number; quantityDelta: number }>(
          "/inventory/count",
          {
            method: "POST",
            token,
            body: {
              warehouseId,
              branchId: wh.branchId,
              productId,
              countedQuantity: Math.max(0, qtyNum),
              reason: reason.trim() || "Physical cellar stock count",
            },
          },
        );
        setInfo(
          `Count reconciled: before ${res.beforeQuantity}, counted ${res.afterQuantity} (delta ${res.quantityDelta >= 0 ? `+${res.quantityDelta}` : res.quantityDelta}).`,
        );
      } else if (mode === "writeoff") {
        const res = await apiRequest<{ beforeQuantity?: number; afterQuantity?: number }>("/inventory/writeoff", {
          method: "POST",
          token,
          body: {
            warehouseId,
            branchId: wh.branchId,
            productId,
            quantity: Math.abs(qtyNum),
            writeOffType,
            reason: reason.trim() || `${writeOffType} write-off`,
          },
        });
        setInfo(`${writeOffType} recorded (${res.beforeQuantity ?? 0} → ${res.afterQuantity ?? 0}).`);
      } else if (mode === "convert") {
        const res = await apiRequest<{ casesBroken: number; bottlesAdded: number }>(
          "/inventory/convert-packaging",
          {
            method: "POST",
            token,
            body: {
              warehouseId,
              branchId: wh.branchId,
              caseProductId: productId,
              bottleProductId: bottleProductId || undefined,
              casesToBreak: Math.max(1, qtyNum),
              bottlesPerCase: Math.max(2, Number(bottlesPerCase) || 12),
              reason: reason.trim() || undefined,
            },
          },
        );
        setInfo(`Converted ${res.casesBroken} case(s) into +${res.bottlesAdded} individual bottles.`);
      }
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

  const totalCostValuation = balances.reduce((sum, b) => {
    const p = productMap.get(b.productId);
    return sum + b.quantity * (p?.costMinor ?? 0);
  }, 0);
  const totalRetailValuation = balances.reduce((sum, b) => {
    const p = productMap.get(b.productId);
    return sum + b.quantity * (p?.priceMinor ?? 0);
  }, 0);

  return (
    <AppShell
      title="Inventory Control & Cellar Stock"
      description="Every stock movement records actor, timestamp, branch, warehouse, before/after quantities, reason, and an immutable audit event."
    >
      {error ? <p className="mb-3 text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {info ? <p className="mb-3 text-sm text-[var(--soko-color-primary)]">{info}</p> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
          <p className="text-xs text-[var(--soko-color-text-muted)]">Stock Valuation (Cost)</p>
          <p className="mt-1 font-display text-2xl">{formatMoney(totalCostValuation, currency)}</p>
        </div>
        <div className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
          <p className="text-xs text-[var(--soko-color-text-muted)]">Stock Valuation (Retail)</p>
          <p className="mt-1 font-display text-2xl">{formatMoney(totalRetailValuation, currency)}</p>
        </div>
        <div className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
          <p className="text-xs text-[var(--soko-color-text-muted)]">Low / Out-of-Stock Lines</p>
          <p className="mt-1 font-display text-2xl">
            {balances.filter((b) => b.quantity <= (productMap.get(b.productId)?.minStockQty || 5)).length}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["receive", "Opening / Receive Stock"],
            ["adjust", "Stock Adjustment"],
            ["count", "Stock Count Reconciliation"],
            ["writeoff", "Damage / Expired / Write-Off"],
            ["convert", "Break Case → Bottles (1 Case = N Bottles)"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
              mode === key
                ? "border-[var(--soko-color-primary)] bg-[var(--soko-color-primary-muted)] text-[var(--soko-color-primary)]"
                : "border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] text-[var(--soko-color-text-muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => void submitOperation(e)}
        className="mb-6 grid gap-3 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4 md:grid-cols-6"
      >
        <label className="text-sm">
          Warehouse
          <select
            className="mt-1 w-full rounded-md border border-[var(--soko-color-border)] bg-transparent p-2"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>

        <label className="text-sm md:col-span-2">
          {mode === "convert" ? "Source Case SKU" : "Product SKU"}
          <select
            className="mt-1 w-full rounded-md border border-[var(--soko-color-border)] bg-transparent p-2"
            value={productId}
            onChange={(e) => {
              const id = e.target.value;
              setProductId(id);
              const prod = productMap.get(id);
              if (prod?.bottleProductId) setBottleProductId(prod.bottleProductId);
              if (prod?.conversionFactor || prod?.packSize) {
                setBottlesPerCase(String(prod.conversionFactor ?? prod.packSize ?? 12));
              }
            }}
          >
            <option value="">Select product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name} ({p.packagingType ?? "bottle"})
              </option>
            ))}
          </select>
        </label>

        {mode === "convert" ? (
          <>
            <label className="text-sm">
              Target Bottle SKU
              <select
                className="mt-1 w-full rounded-md border border-[var(--soko-color-border)] bg-transparent p-2"
                value={bottleProductId}
                onChange={(e) => setBottleProductId(e.target.value)}
              >
                <option value="">Select bottle SKU…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Cases to Break"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Input
              label="Bottles per Case"
              value={bottlesPerCase}
              onChange={(e) => setBottlesPerCase(e.target.value)}
            />
          </>
        ) : (
          <>
            {mode === "writeoff" ? (
              <label className="text-sm">
                Write-Off Type
                <select
                  className="mt-1 w-full rounded-md border border-[var(--soko-color-border)] bg-transparent p-2"
                  value={writeOffType}
                  onChange={(e) => setWriteOffType(e.target.value as typeof writeOffType)}
                >
                  <option value="DAMAGE">DAMAGE (Breakage)</option>
                  <option value="EXPIRED">EXPIRED</option>
                  <option value="WRITE_OFF">WRITE_OFF</option>
                </select>
              </label>
            ) : null}
            <Input
              label={
                mode === "count"
                  ? "Physical Counted Qty"
                  : mode === "adjust"
                    ? "Signed Qty Delta (+/-)"
                    : "Quantity"
              }
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Input
              label="Audit Reason / Reference"
              placeholder="e.g. Opening stock count or Bottle breakage"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={mode === "writeoff"}
            />
          </>
        )}

        <div className="flex items-end">
          <Button type="submit" disabled={busy || !productId}>
            {busy ? "Recording…" : "Post Stock Operation"}
          </Button>
        </div>
      </form>

      {!balances.length ? (
        <EmptyState title="No stock balances" body="Receive an LPO or post opening stock above." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--soko-color-text-muted)]">
                <th className="py-2">SKU</th>
                <th>Product</th>
                <th>Packaging</th>
                <th>Warehouse</th>
                <th className="text-right">On Hand</th>
                <th className="text-right">Reorder Level</th>
                <th className="text-right">Cost Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => {
                const p = productMap.get(b.productId);
                const reorder = p?.minStockQty || 5;
                const low = b.quantity <= reorder;
                return (
                  <tr key={`${b.warehouseId}-${b.productId}`} className="border-t border-[var(--soko-color-border)]">
                    <td className="py-2 font-mono text-xs">{p?.sku ?? "—"}</td>
                    <td className="font-semibold">{p?.name ?? b.productId}</td>
                    <td className="text-xs uppercase text-[var(--soko-color-text-muted)]">
                      {p?.packagingType ?? "bottle"}
                      {p?.size ? ` · ${p.size}` : ""}
                    </td>
                    <td>{warehouseMap.get(b.warehouseId)?.name ?? b.warehouseId}</td>
                    <td className="text-right font-bold tabular-nums">{b.quantity}</td>
                    <td className="text-right tabular-nums text-[var(--soko-color-text-muted)]">{reorder}</td>
                    <td className="text-right tabular-nums">
                      {formatMoney(b.quantity * (p?.costMinor ?? 0), currency)}
                    </td>
                    <td>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold ${
                          b.quantity <= 0
                            ? "bg-red-500/15 text-red-600"
                            : low
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-emerald-500/15 text-emerald-700"
                        }`}
                      >
                        {b.quantity <= 0 ? "OUT OF STOCK" : low ? "LOW STOCK" : "IN STOCK"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

export function MovementsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [rows, setRows] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  useEffect(() => {
    void Promise.all([
      apiRequest<{ data: Movement[] } | Movement[]>("/stock/movements?limit=150", { token }),
      apiRequest<{ data: Product[] } | Product[]>("/products?limit=200", { token }),
      apiRequest<{ data: Warehouse[] } | Warehouse[]>("/warehouses", { token }),
    ]).then(([m, p, w]) => {
      const arr = <T,>(x: T[] | { data: T[] }) => (Array.isArray(x) ? x : x.data);
      setRows(arr(m));
      setProducts(arr(p));
      setWarehouses(arr(w));
    });
  }, [token]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <AppShell
      title="Stock Movement History"
      description="Immutable append-only ledger of all sales, LPO receipts, transfers, counts, packaging conversions, and write-offs."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--soko-color-text-muted)]">
              <th className="py-2">Timestamp</th>
              <th>Product</th>
              <th>Warehouse</th>
              <th>Type</th>
              <th className="text-right">Quantity Delta</th>
              <th>Reason / Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const p = productMap.get(m.productId);
              return (
                <tr key={m.id} className="border-t border-[var(--soko-color-border)]">
                  <td className="py-2 whitespace-nowrap">{new Date(m.createdAt).toLocaleString()}</td>
                  <td>
                    <span className="font-mono text-xs">{p?.sku ?? ""}</span>{" "}
                    <span className="font-semibold">{p?.name ?? m.productId}</span>
                  </td>
                  <td>{warehouseMap.get(m.warehouseId)?.name ?? m.warehouseId}</td>
                  <td>
                    <span className="rounded bg-[var(--soko-color-surface-muted)] px-2 py-0.5 font-mono text-xs font-semibold uppercase">
                      {m.type}
                    </span>
                  </td>
                  <td
                    className={`text-right font-bold tabular-nums ${
                      m.quantityDelta >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {m.quantityDelta >= 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                  </td>
                  <td className="text-xs text-[var(--soko-color-text-muted)]">{m.reason ?? m.referenceType ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
