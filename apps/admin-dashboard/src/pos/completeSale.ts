import type { LocalDb } from "./db";
import type { SyncWorker } from "./sync";
import { useCartStore } from "./cart";
import { useAuthStore } from "../stores/auth";

export async function completeSaleOffline(
  db: LocalDb,
  sync: SyncWorker,
  customer?: { id?: string; name?: string | null; phone?: string | null } | null,
): Promise<void> {
  const { lines, tender, discountCents, cashTenderedCents, clear, setLastSale, triggerPaySuccess } =
    useCartStore.getState();
  const auth = useAuthStore.getState();
  if (lines.length === 0) return;
  if (!auth.branchId) {
    throw new Error("Branch is required for offline sale");
  }

  const sale = await db.completeSale({
    branchId: auth.branchId,
    branchName: auth.branchName,
    warehouseId: auth.warehouseId ?? undefined,
    departmentId: auth.departmentId ?? undefined,
    cashierName: auth.user?.name ?? "Cashier",
    customerId: customer?.id,
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    currency: auth.tenant?.currency ?? "KES",
    discountCents,
    cashTenderedCents: tender === "cash" ? cashTenderedCents : undefined,
    tender,
    lines: lines.map((line) => ({
      productId: line.productId,
      qty: line.qty,
      unitPriceCents: line.unitPriceCents,
      discountCents: line.discountCents,
    })),
  });

  clear();
  setLastSale(sale);
  triggerPaySuccess();
  sync.enqueueFlush();
}
