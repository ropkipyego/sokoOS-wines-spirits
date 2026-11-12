import type { LocalDb } from "../db";
import type { SyncWorker } from "../sync";
import { useCartStore } from "../stores/cart";
import { useSession } from "../stores/session";

/**
 * Completing a sale MUST:
 * 1. Write local sale + stock movement + outbox
 * 2. Attempt background sync
 * Never block the cashier on network.
 */
export async function completeSaleOffline(
  db: LocalDb,
  sync: SyncWorker,
  customer?: { id?: string; name?: string | null; phone?: string | null } | null,
): Promise<void> {
  const { lines, tender, discountCents, cashTenderedCents, clear, setLastSale, triggerPaySuccess } =
    useCartStore.getState();
  const session = useSession.getState();
  if (lines.length === 0) return;
  if (!session.branchId) {
    throw new Error("Branch is required for offline sale");
  }

  const sale = await db.completeSale({
    branchId: session.branchId,
    branchName: session.branchName,
    warehouseId: session.warehouseId ?? undefined,
    departmentId: session.departmentId ?? undefined,
    cashierName: session.cashierName,
    customerId: customer?.id,
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    currency: session.currency,
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

  // Fire-and-forget sync — sale already committed locally.
  sync.enqueueFlush();
}
