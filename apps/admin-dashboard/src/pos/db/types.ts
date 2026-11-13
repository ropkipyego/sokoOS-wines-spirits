export type ProductRecord = {
  id: string;
  sku: string;
  name: string;
  category: string;
  priceCents: number;
  wholesalePriceCents?: number | null;
  taxRateBps?: number;
  size?: string | null;
  packSize?: number | null;
  packagingType?: string | null;
  stock: number;
  barcode?: string | null;
  imageUrl?: string | null;
  featured?: boolean;
};

export type SaleLineRecord = {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  discountCents?: number;
  taxCents?: number;
  lineTotalCents: number;
};

export type SaleRecord = {
  id: string;
  receiptNo: string;
  branchId: string;
  tender: PaymentTender;
  subtotalCents: number;
  discountCents?: number;
  taxCents: number;
  totalCents: number;
  lines: SaleLineRecord[];
  createdAt: string;
  synced: boolean;
  cashTenderedCents?: number;
  changeCents?: number;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  cashierName?: string | null;
  branchName?: string | null;
  fiscalStatus?: string | null;
  fiscalInvoiceNumber?: string | null;
};

export type StockMovementRecord = {
  id: string;
  productId: string;
  delta: number;
  reason: "sale" | "adjustment" | "receive";
  saleId?: string;
  createdAt: string;
};

export type OutboxRecord = {
  id: string;
  entityType: "sale" | "stock_movement";
  entityId: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

export type PaymentTender = "cash" | "mpesa" | "card" | "bank" | "credit";

export type CompleteSaleInput = {
  branchId: string;
  branchName?: string;
  warehouseId?: string;
  departmentId?: string;
  cashierName?: string;
  customerId?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  currency?: string;
  discountCents?: number;
  cashTenderedCents?: number;
  tender: PaymentTender;
  lines: Array<{
    productId: string;
    qty: number;
    unitPriceCents?: number;
    discountCents?: number;
  }>;
};
