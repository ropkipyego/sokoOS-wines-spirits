import { create } from "zustand";
import type { PaymentTender, ProductRecord, SaleRecord } from "../db";

export type CartLine = {
  productId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  retailPriceCents?: number;
  wholesalePriceCents?: number | null;
  priceTier?: "retail" | "wholesale";
  discountCents?: number;
  qty: number;
};

export type HeldSale = {
  id: string;
  label: string;
  heldAt: string;
  lines: CartLine[];
  discountCents: number;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
};

type CartState = {
  lines: CartLine[];
  tender: PaymentTender;
  discountCents: number;
  cashTenderedCents: number;
  lastSale: SaleRecord | null;
  heldSales: HeldSale[];
  paySuccessPulse: boolean;
  addProduct: (product: ProductRecord, maxStock?: number) => void;
  setQty: (productId: string, qty: number, maxStock?: number) => void;
  togglePriceTier: (productId: string) => void;
  setDiscountCents: (cents: number) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
  holdCurrentSale: (meta?: { label?: string; customerId?: string | null; customerName?: string | null; customerPhone?: string | null }) => HeldSale | null;
  resumeHeldSale: (id: string) => HeldSale | null;
  discardHeldSale: (id: string) => void;
  setTender: (tender: PaymentTender) => void;
  setCashTendered: (cents: number) => void;
  setLastSale: (sale: SaleRecord | null) => void;
  triggerPaySuccess: () => void;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  tender: "cash",
  discountCents: 0,
  cashTenderedCents: 0,
  lastSale: null,
  heldSales: [],
  paySuccessPulse: false,

  addProduct: (product, maxStock) => {
    const existing = get().lines.find((line) => line.productId === product.id);
    const nextQty = (existing?.qty ?? 0) + 1;
    if (typeof maxStock === "number" && maxStock >= 0 && nextQty > maxStock) return;
    if (existing) {
      set({
        lines: get().lines.map((line) =>
          line.productId === product.id ? { ...line, qty: nextQty } : line,
        ),
      });
      return;
    }
    set({
      lines: [
        ...get().lines,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unitPriceCents: product.priceCents,
          retailPriceCents: product.priceCents,
          wholesalePriceCents: product.wholesalePriceCents ?? null,
          priceTier: "retail",
          qty: 1,
        },
      ],
    });
  },

  setQty: (productId, qty, maxStock) => {
    if (qty <= 0) {
      get().removeLine(productId);
      return;
    }
    const capped = typeof maxStock === "number" && maxStock >= 0 ? Math.min(qty, maxStock) : qty;
    set({
      lines: get().lines.map((line) => (line.productId === productId ? { ...line, qty: capped } : line)),
    });
  },

  togglePriceTier: (productId) => {
    set({
      lines: get().lines.map((line) => {
        if (line.productId !== productId || !line.wholesalePriceCents) return line;
        const nextTier = line.priceTier === "wholesale" ? "retail" : "wholesale";
        const nextPrice =
          nextTier === "wholesale"
            ? line.wholesalePriceCents
            : (line.retailPriceCents ?? line.unitPriceCents);
        return {
          ...line,
          priceTier: nextTier,
          unitPriceCents: nextPrice,
        };
      }),
    });
  },

  setDiscountCents: (cents) => set({ discountCents: Math.max(0, Math.round(cents)) }),

  removeLine: (productId) => {
    set({ lines: get().lines.filter((line) => line.productId !== productId) });
  },

  clear: () => set({ lines: [], discountCents: 0, cashTenderedCents: 0, tender: "cash" }),

  holdCurrentSale: (meta) => {
    const state = get();
    if (state.lines.length === 0) return null;
    const held: HeldSale = {
      id: crypto.randomUUID(),
      label:
        meta?.label?.trim() ||
        meta?.customerName ||
        `Held #${state.heldSales.length + 1} (${state.lines.length} item${state.lines.length === 1 ? "" : "s"})`,
      heldAt: new Date().toISOString(),
      lines: state.lines.map((l) => ({ ...l })),
      discountCents: state.discountCents,
      customerId: meta?.customerId ?? null,
      customerName: meta?.customerName ?? null,
      customerPhone: meta?.customerPhone ?? null,
    };
    set({
      heldSales: [held, ...state.heldSales],
      lines: [],
      discountCents: 0,
      cashTenderedCents: 0,
      tender: "cash",
    });
    return held;
  },

  resumeHeldSale: (id) => {
    const state = get();
    const target = state.heldSales.find((h) => h.id === id);
    if (!target) return null;
    set({
      lines: target.lines.map((l) => ({ ...l })),
      discountCents: target.discountCents,
      heldSales: state.heldSales.filter((h) => h.id !== id),
    });
    return target;
  },

  discardHeldSale: (id) => {
    set({ heldSales: get().heldSales.filter((h) => h.id !== id) });
  },

  setTender: (tender) => set({ tender }),
  setCashTendered: (cents) => set({ cashTenderedCents: cents }),

  setLastSale: (sale) => set({ lastSale: sale }),

  triggerPaySuccess: () => {
    set({ paySuccessPulse: true });
    window.setTimeout(() => set({ paySuccessPulse: false }), 420);
  },
}));

export function cartTotals(lines: CartLine[], cartDiscountCents = 0) {
  const grossSubtotalCents = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.qty,
    0,
  );
  const lineDiscountCents = lines.reduce(
    (sum, line) => sum + (line.discountCents ?? 0),
    0,
  );
  const discountCents = Math.min(
    grossSubtotalCents,
    Math.max(0, lineDiscountCents + cartDiscountCents),
  );
  const subtotalCents = grossSubtotalCents;
  const taxCents = 0;
  const totalCents = Math.max(0, subtotalCents - discountCents + taxCents);
  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
  };
}

/**
 * Deterministic cash tendered and change calculation.
 * Example: Total 1,250.00 (125000), Tendered 2,000.00 (200000) -> Change 750.00 (75000).
 */
export function calculateCashChange(totalCents: number, tenderedCents: number): {
  totalCents: number;
  tenderedCents: number;
  changeCents: number;
  remainingCents: number;
  sufficient: boolean;
} {
  const total = Math.max(0, Math.round(totalCents));
  const tendered = Math.max(0, Math.round(tenderedCents));
  return {
    totalCents: total,
    tenderedCents: tendered,
    changeCents: Math.max(0, tendered - total),
    remainingCents: Math.max(0, total - tendered),
    sufficient: tendered >= total,
  };
}

export function formatMoney(cents: number, currency = "KES"): string {
  return `${currency} ${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
