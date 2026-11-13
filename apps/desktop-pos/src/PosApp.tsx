import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@sokoos/ui";
import { getLocalDb, type LocalDb, type ProductRecord } from "./db";
import { SyncWorker, type SyncStatus } from "./sync";
import { completeSaleOffline } from "./lib/completeSale";
import { calculateCashChange, cartTotals, formatMoney, useCartStore } from "./stores/cart";
import { useThemeStore } from "./stores/theme";
import { useSession } from "./stores/session";
import { apiRequest, mediaUrl } from "./api/client";

type Customer = { id: string; name: string; phone?: string | null };

export function PosApp() {
  const accessToken = useSession((s) => s.accessToken);
  const login = useSession((s) => s.login);
  const [email, setEmail] = useState("demo@sokoos.local");
  const [password, setPassword] = useState("Demo123!");
  const [tenantSlug, setTenantSlug] = useState("demo");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [busyLogin, setBusyLogin] = useState(false);

  useEffect(() => {
    useSession.getState().hydrate();
  }, []);

  if (!accessToken) {
    return (
      <div className="soko-ui pos-login flex min-h-screen items-center justify-center p-6">
        <form
          className="pos-login-card w-full max-w-sm space-y-3 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-6 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            setBusyLogin(true);
            setLoginError(null);
            void login(email, password, tenantSlug)
              .catch((err: Error) => setLoginError(err.message))
              .finally(() => setBusyLogin(false));
          }}
        >
          <span className="inline-block rounded bg-[var(--soko-color-primary-muted)] px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-[var(--soko-color-primary)]">
            Wines & Spirits Edition
          </span>
          <p className="font-display text-3xl text-[var(--soko-color-primary)]">SokoOS POS</p>
          <p className="text-sm text-[var(--soko-color-text-muted)]">
            Bottle & Case Retail · Barcode Wedge · Offline-First
          </p>
          <Input label="Tenant Slug" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {loginError ? <p className="text-sm text-[var(--soko-color-danger)]">{loginError}</p> : null}
          <Button type="submit" className="w-full" disabled={busyLogin}>
            {busyLogin ? "Signing in…" : "Sign in to Terminal"}
          </Button>
          {import.meta.env.DEV ? (
            <div className="border-t border-[var(--soko-color-border)]/70 pt-3">
              <p className="mb-1.5 text-[10px] font-bold tracking-wider uppercase text-[var(--soko-color-text-muted)]">
                Dev Terminal Demo Logins
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setTenantSlug("demo");
                    setEmail("cashier@sokoos.local");
                    setPassword("Cashier123!");
                  }}
                  className="rounded border border-[var(--soko-color-border)] bg-[var(--soko-color-bg-elevated)] px-2 py-1.5 text-left text-xs font-semibold hover:border-[var(--soko-color-primary)]"
                >
                  <div>Cashier Role</div>
                  <div className="truncate font-mono text-[10px] opacity-75">cashier@sokoos.local</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTenantSlug("demo");
                    setEmail("demo@sokoos.local");
                    setPassword("Demo123!");
                  }}
                  className="rounded border border-[var(--soko-color-border)] bg-[var(--soko-color-bg-elevated)] px-2 py-1.5 text-left text-xs font-semibold hover:border-[var(--soko-color-primary)]"
                >
                  <div>Owner / Manager</div>
                  <div className="truncate font-mono text-[10px] opacity-75">demo@sokoos.local</div>
                </button>
              </div>
            </div>
          ) : null}
        </form>
      </div>
    );
  }

  return <PosTerminal />;
}

function PosTerminal() {
  const [db, setDb] = useState<LocalDb | null>(null);
  const [sync, setSync] = useState<SyncWorker | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [pendingSync, setPendingSync] = useState(0);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState<string | null>(null);
  const [scanUnknown, setScanUnknown] = useState<string | null>(null);
  const [customerQ, setCustomerQ] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [printOpen, setPrintOpen] = useState(false);
  const [printProfile, setPrintProfile] = useState<"thermal-80" | "thermal-58" | "a4">("thermal-80");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitSecondMethod, setSplitSecondMethod] = useState<"mpesa" | "card" | "bank">("mpesa");
  const [splitSecondMinor, setSplitSecondMinor] = useState(0);
  const [scannerArmed, setScannerArmed] = useState(true);
  const [heldModalOpen, setHeldModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("Customer return");
  const [returnMsg, setReturnMsg] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const wedgeRef = useRef<HTMLInputElement>(null);
  const payRef = useRef<() => Promise<void>>(async () => undefined);
  const productsRef = useRef<ProductRecord[]>([]);
  const scanBuf = useRef("");
  const scanAt = useRef(0);

  const session = useSession();
  const lines = useCartStore((s) => s.lines);
  const tender = useCartStore((s) => s.tender);
  const discountCents = useCartStore((s) => s.discountCents);
  const cashTenderedCents = useCartStore((s) => s.cashTenderedCents);
  const lastSale = useCartStore((s) => s.lastSale);
  const heldSales = useCartStore((s) => s.heldSales);
  const paySuccessPulse = useCartStore((s) => s.paySuccessPulse);
  const addProduct = useCartStore((s) => s.addProduct);
  const setQty = useCartStore((s) => s.setQty);
  const togglePriceTier = useCartStore((s) => s.togglePriceTier);
  const setDiscountCents = useCartStore((s) => s.setDiscountCents);
  const removeLine = useCartStore((s) => s.removeLine);
  const holdCurrentSale = useCartStore((s) => s.holdCurrentSale);
  const resumeHeldSale = useCartStore((s) => s.resumeHeldSale);
  const discardHeldSale = useCartStore((s) => s.discardHeldSale);
  const setTender = useCartStore((s) => s.setTender);
  const setCashTendered = useCartStore((s) => s.setCashTendered);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const hydrateTheme = useThemeStore((s) => s.hydrate);

  const totals = cartTotals(lines, discountCents);
  const secondSplit = splitEnabled ? Math.max(0, Math.min(splitSecondMinor, totals.totalCents)) : 0;
  const primaryDue = Math.max(0, totals.totalCents - secondSplit);
  const cashMath = calculateCashChange(primaryDue, cashTenderedCents);

  const canDiscount = session.hasPermission("sales.discount");
  const canRefund = session.hasPermission("sales.refund");
  const canCredit = session.hasPermission("customers.credit") || session.hasPermission("sales.void");

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  function stockFor(productId: string) {
    return productsRef.current.find((p) => p.id === productId)?.stock;
  }

  function addFromCatalog(product: ProductRecord) {
    if (product.stock > 0) addProduct(product, product.stock);
    else addProduct(product);
    setScanFlash(product.name);
    window.setTimeout(() => setScanFlash(null), 700);
  }

  async function refreshBalances(token: string | null) {
    if (!token) return;
    try {
      const balances = await apiRequest<
        Array<{ productId: string; quantity: number }> | { data: Array<{ productId: string; quantity: number }> }
      >("/stock/balances?limit=400", { token });
      const bal = Array.isArray(balances) ? balances : balances.data;
      const qty = new Map<string, number>();
      for (const b of bal) qty.set(b.productId, (qty.get(b.productId) ?? 0) + b.quantity);
      setProducts((prev) =>
        prev.map((p) => ({ ...p, stock: qty.has(p.id) ? (qty.get(p.id) as number) : p.stock })),
      );
    } catch {
      /* keep */
    }
  }

  useEffect(() => {
    hydrateTheme();
    let worker: SyncWorker | null = null;
    void (async () => {
      const localDb = await getLocalDb();
      setDb(localDb);
      worker = new SyncWorker(localDb, {
        accessToken: session.accessToken,
        deviceId: session.deviceId ?? sessionStorage.getItem("sokoos.pos.deviceId") ?? undefined,
        tenantId: session.tenantId,
        branchId: session.branchId,
        actorUserId: session.cashierId,
      });
      setSync(worker);
      worker.subscribe((status, pending) => {
        setSyncStatus(status);
        setPendingSync(pending);
      });
      void worker.flush();
      try {
        const remote = await apiRequest<
          | Array<{
              id: string;
              sku: string;
              name: string;
              barcode?: string | null;
              priceMinor: number;
              wholesalePriceMinor?: number | null;
              taxRateBps?: number;
              size?: string | null;
              packSize?: number | null;
              packagingType?: string | null;
              imageUrl?: string | null;
              thumbnailUrl?: string | null;
              featured?: boolean;
              category?: { name: string } | null;
            }>
          | {
              data: Array<{
                id: string;
                sku: string;
                name: string;
                barcode?: string | null;
                priceMinor: number;
                wholesalePriceMinor?: number | null;
                taxRateBps?: number;
                size?: string | null;
                packSize?: number | null;
                packagingType?: string | null;
                imageUrl?: string | null;
                thumbnailUrl?: string | null;
                featured?: boolean;
                category?: { name: string } | null;
              }>;
            }
        >("/products?limit=400", { token: session.accessToken });
        const list = Array.isArray(remote) ? remote : remote.data;
        const balances = await apiRequest<
          Array<{ productId: string; quantity: number }> | { data: Array<{ productId: string; quantity: number }> }
        >("/stock/balances?limit=400", { token: session.accessToken });
        const bal = Array.isArray(balances) ? balances : balances.data;
        const qty = new Map<string, number>();
        for (const b of bal) qty.set(b.productId, (qty.get(b.productId) ?? 0) + b.quantity);
        const mapped: ProductRecord[] = list.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category?.name ?? "General",
          priceCents: p.priceMinor,
          wholesalePriceCents: p.wholesalePriceMinor ?? null,
          taxRateBps: p.taxRateBps ?? 1600,
          size: p.size ?? null,
          packSize: p.packSize ?? 1,
          packagingType: p.packagingType ?? "bottle",
          stock: qty.get(p.id) ?? 0,
          barcode: p.barcode,
          imageUrl: p.thumbnailUrl ?? p.imageUrl,
          featured: p.featured,
        }));
        if (mapped.length) {
          await localDb.upsertProducts(mapped);
          setProducts(mapped);
        } else {
          setProducts(await localDb.listProducts());
        }
      } catch {
        setProducts(await localDb.listProducts());
      }
    })();
    return () => worker?.dispose();
  }, [hydrateTheme, session.accessToken, session.branchId, session.cashierId, session.deviceId, session.tenantId]);

  async function handlePay() {
    if (!db || !sync || lines.length === 0 || busy) return;
    const second = splitEnabled ? Math.max(0, Math.min(splitSecondMinor, totals.totalCents)) : 0;
    const primaryAmount = totals.totalCents - second;
    if (primaryAmount < 0 || (splitEnabled && second <= 0)) {
      setError("Split amounts must reconcile to the sale total");
      return;
    }
    if (tender === "cash" && cashTenderedCents < primaryAmount) {
      setError("Cash tendered is less than the cash portion due");
      return;
    }
    if (tender === "credit" && !canCredit) {
      setError("Credit sales require customer credit permission");
      return;
    }
    if ((tender === "mpesa" || (splitEnabled && splitSecondMethod === "mpesa")) && !navigator.onLine) {
      setError("M-Pesa needs internet. Take cash or wait for a connection.");
      return;
    }
    if (splitEnabled && !navigator.onLine) {
      setError("Split payments require an online API sale.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const online = navigator.onLine && !!session.accessToken && !!session.branchId;
      const snapshotCustomer = customer;
      const snapshotCash = cashTenderedCents;
      const snapshotTender = tender;
      const snapshotDiscount = totals.discountCents;
      if (online) {
        const method = tender === "mpesa" ? "mobile_money" : tender;
        const payments = [
          {
            method,
            amountMinor: primaryAmount,
            tenderedMinor: tender === "cash" ? cashTenderedCents : undefined,
            changeMinor: tender === "cash" ? Math.max(0, cashTenderedCents - primaryAmount) : undefined,
            status: tender === "mpesa" ? "pending" : "completed",
          },
          ...(second > 0
            ? [
                {
                  method: splitSecondMethod === "mpesa" ? "mobile_money" : splitSecondMethod,
                  amountMinor: second,
                  status: splitSecondMethod === "mpesa" ? "pending" : "completed",
                },
              ]
            : []),
        ];
        const sale = await apiRequest<{
          id: string;
          receiptNumber: string;
          subtotalMinor?: number;
          taxMinor?: number;
          discountMinor?: number;
          totalMinor: number;
          fiscalStatus?: string;
          occurredAt: string;
          items: Array<{ productId: string; nameSnapshot: string; quantity: number; lineTotalMinor: number }>;
        }>("/sales", {
          method: "POST",
          token: session.accessToken,
          body: {
            branchId: session.branchId,
            warehouseId: session.warehouseId,
            departmentId: session.departmentId ?? undefined,
            customerId: customer?.id,
            discountMinor: snapshotDiscount > 0 ? snapshotDiscount : undefined,
            orderType: "retail",
            items: lines.map((l) => ({
              productId: l.productId,
              quantity: l.qty,
              unitPriceMinor: l.unitPriceCents,
              discountMinor: l.discountCents,
            })),
            payments,
          },
        });
        const cartLines = useCartStore.getState().lines;
        useCartStore.getState().clear();
        useCartStore.getState().setLastSale({
          id: sale.id,
          receiptNo: sale.receiptNumber,
          branchId: session.branchId!,
          branchName: session.branchName,
          cashierName: session.cashierName,
          tender: snapshotTender,
          subtotalCents: sale.subtotalMinor ?? sale.totalMinor + snapshotDiscount,
          discountCents: sale.discountMinor ?? snapshotDiscount,
          taxCents: sale.taxMinor ?? 0,
          totalCents: sale.totalMinor,
          createdAt: sale.occurredAt,
          synced: true,
          cashTenderedCents: snapshotCash,
          changeCents: snapshotTender === "cash" ? Math.max(0, snapshotCash - primaryAmount) : 0,
          customerId: snapshotCustomer?.id ?? null,
          customerName: snapshotCustomer?.name ?? null,
          customerPhone: snapshotCustomer?.phone ?? null,
          fiscalStatus: sale.fiscalStatus ?? "not_configured",
          lines: (sale.items ?? []).map((i) => {
            const fromCart = cartLines.find((l) => l.productId === i.productId);
            return {
              productId: i.productId,
              sku: fromCart?.sku ?? "",
              name: i.nameSnapshot,
              qty: i.quantity,
              unitPriceCents: fromCart?.unitPriceCents ?? 0,
              lineTotalCents: i.lineTotalMinor,
            };
          }),
        });
        useCartStore.getState().triggerPaySuccess();
        setSplitEnabled(false);
        setSplitSecondMinor(0);
        setCustomer(null);
        await refreshBalances(session.accessToken);
      } else {
        await completeSaleOffline(db, sync, customer);
        setProducts((prev) =>
          prev.map((p) => {
            const line = lines.find((l) => l.productId === p.id);
            return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
          }),
        );
        setCustomer(null);
      }
      setPrintOpen(true);
      searchRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
    } finally {
      setBusy(false);
    }
  }

  payRef.current = handlePay;

  async function processLastSaleReturn() {
    if (!lastSale || !session.accessToken) return;
    setReturnMsg(null);
    setError(null);
    try {
      await apiRequest("/returns", {
        method: "POST",
        token: session.accessToken,
        body: {
          saleId: lastSale.id,
          branchId: lastSale.branchId,
          warehouseId: session.warehouseId ?? undefined,
          reason: returnReason.trim() || "POS customer return",
          items: lastSale.lines.map((l) => ({
            productId: l.productId,
            quantity: l.qty,
            unitPriceMinor: l.unitPriceCents,
          })),
        },
      });
      setReturnMsg(`Return recorded for ${lastSale.receiptNo} and stock restored.`);
      await refreshBalances(session.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Return failed");
    }
  }

  function consumeBarcode(code: string) {
    const trimmed = code.trim();
    if (trimmed.length < 3) return;
    const match = productsRef.current.find((p) => p.barcode === trimmed || p.sku === trimmed);
    if (match) {
      addFromCatalog(match);
      setScanUnknown(null);
    } else {
      setScanUnknown(`Unknown barcode ${trimmed}`);
    }
  }

  // HID keyboard-wedge scanners (Honeywell / Symbol / Zebra): rapid keys + Enter
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === "F4") {
        event.preventDefault();
        const held = useCartStore.getState().holdCurrentSale({
          customerId: customer?.id,
          customerName: customer?.name,
          customerPhone: customer?.phone,
        });
        if (held) setCustomer(null);
        return;
      }
      if (event.key === "F9") {
        event.preventDefault();
        void payRef.current();
        return;
      }
      if (!scannerArmed) return;
      const target = event.target as HTMLElement | null;
      const typingInField = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      const now = Date.now();
      const gap = now - scanAt.current;
      if (gap > 120) scanBuf.current = "";
      scanAt.current = now;
      if (event.key === "Enter") {
        if (scanBuf.current.length >= 4) {
          event.preventDefault();
          const code = scanBuf.current;
          scanBuf.current = "";
          consumeBarcode(code);
          if (wedgeRef.current) wedgeRef.current.value = "";
        }
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (typingInField && target !== wedgeRef.current && gap > 45 && scanBuf.current.length < 3) {
          scanBuf.current = "";
          return;
        }
        scanBuf.current += event.key;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addProduct, scannerArmed, customer]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (scannerArmed && document.activeElement === document.body) {
        wedgeRef.current?.focus({ preventScroll: true });
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [scannerArmed]);

  async function searchCustomers(q: string) {
    setCustomerQ(q);
    if (q.trim().length < 2 || !session.accessToken) return;
    const res = await apiRequest<Customer[] | { data: Customer[] }>(`/customers?q=${encodeURIComponent(q)}`, {
      token: session.accessToken,
    });
    setCustomers(Array.isArray(res) ? res : res.data);
  }

  async function createCustomer() {
    if (!session.accessToken || !newCustomer.name) return;
    const created = await apiRequest<Customer>("/customers", {
      method: "POST",
      token: session.accessToken,
      body: newCustomer,
    });
    setCustomer(created);
    setNewCustomer({ name: "", phone: "" });
  }

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return ["All", "Featured", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      if (category === "Featured" && !product.featured) return false;
      const catOk = category === "All" || category === "Featured" || product.category === category;
      if (!catOk) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        (product.barcode ?? "").includes(q)
      );
    });
  }, [products, query, category]);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const exact = products.find(
        (p) => p.barcode === query.trim() || p.sku.toLowerCase() === query.trim().toLowerCase(),
      );
      if (exact) {
        addFromCatalog(exact);
        setQuery("");
        setScanUnknown(null);
      }
    }
  }

  return (
    <div className="soko-ui pos-shell flex h-full min-h-screen flex-col">
      <input
        ref={wedgeRef}
        aria-label="Barcode scanner capture"
        className="scanner-wedge"
        autoComplete="off"
        tabIndex={-1}
        onChange={() => undefined}
      />
      <header className="pos-header flex flex-wrap items-center justify-between gap-3 border-b border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-2xl text-[var(--soko-color-primary)]">{session.tenantName}</p>
          <span className="rounded bg-[var(--soko-color-primary-muted)] px-2 py-0.5 text-xs font-bold uppercase text-[var(--soko-color-primary)]">
            Wines & Spirits POS
          </span>
          <span className="text-sm text-[var(--soko-color-text-muted)]">
            {session.branchName} · Served by <strong>{session.cashierName}</strong>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <SyncPill status={syncStatus} pending={pendingSync} />
          <button
            type="button"
            className="rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-2.5 py-1 text-xs font-semibold"
            onClick={() => setHeldModalOpen(true)}
          >
            Held Sales ({heldSales.length})
          </button>
          {canRefund && lastSale ? (
            <button
              type="button"
              className="rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-2.5 py-1 text-xs font-semibold"
              onClick={() => {
                setReturnMsg(null);
                setReturnModalOpen(true);
              }}
            >
              Return / Refund
            </button>
          ) : null}
          <button
            type="button"
            className={`rounded-[var(--soko-radius-md)] border px-2 py-1 text-xs font-semibold ${
              scannerArmed
                ? "border-[var(--soko-color-accent)] bg-[var(--soko-color-accent-muted)]"
                : "border-[var(--soko-color-border)]"
            }`}
            onClick={() => setScannerArmed((v) => !v)}
            title="USB/HID wedge barcode scanner"
          >
            {scannerArmed ? "Scanner ON" : "Scanner OFF"}
          </button>
          <span className="hidden rounded-[var(--soko-radius-md)] bg-[var(--soko-color-surface-muted)] px-2 py-1 text-xs text-[var(--soko-color-text-muted)] xl:inline">
            F2 search · F4 hold · F9 pay
          </span>
          <Button variant="ghost" size="sm" className="touch-btn" onClick={toggleTheme}>
            {theme === "light" ? "Dark" : "Light"}
          </Button>
          <Button variant="secondary" size="sm" onClick={session.logout}>
            Sign Out
          </Button>
        </div>
      </header>

      {scanFlash ? (
        <div className="scan-toast" role="status">
          {scanFlash} added
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]">
        <section className="flex min-h-0 flex-col gap-3 border-b border-[var(--soko-color-border)] p-4 lg:border-r lg:border-b-0">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Barcode Scan / Instant Search (F2)</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Scan bottle/case barcode or type brand / SKU…"
              className="w-full rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-4 py-3 text-lg outline-none focus:shadow-[var(--soko-shadow-focus)]"
              aria-label="Product search"
              autoFocus
            />
          </label>
          {scanUnknown ? <p className="text-sm text-[var(--soko-color-danger)]">{scanUnknown}</p> : null}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`touch-btn rounded-[var(--soko-radius-md)] border px-4 text-sm font-semibold whitespace-nowrap ${
                  category === cat
                    ? "border-[var(--soko-color-primary)] bg-[var(--soko-color-primary-muted)] text-[var(--soko-color-primary)]"
                    : "border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] text-[var(--soko-color-text-muted)]"
                }`}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="product-grid grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product) => (
              <button
                key={product.id}
                type="button"
                className="product-card touch-btn flex min-h-[116px] flex-col overflow-hidden rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] text-left"
                onClick={() => addFromCatalog(product)}
              >
                <div className="relative aspect-[4/3] w-full bg-[var(--soko-color-surface-muted)]">
                  {product.imageUrl ? (
                    <img
                      src={mediaUrl(product.imageUrl) ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs font-semibold text-[var(--soko-color-text-muted)]">
                      {product.category}
                    </div>
                  )}
                  <span className="absolute top-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    {product.packagingType ?? "btl"}
                    {product.size ? ` · ${product.size}` : ""}
                  </span>
                </div>
                <span className="px-3 pt-2 text-sm font-semibold leading-tight">{product.name}</span>
                <span className="mt-auto flex w-full items-end justify-between gap-2 px-3 pb-3">
                  <span className="text-sm font-bold tabular-nums text-[var(--soko-color-primary)]">
                    {formatMoney(product.priceCents, session.currency)}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      product.stock <= 5 ? "text-amber-600" : "text-[var(--soko-color-text-muted)]"
                    }`}
                  >
                    {product.stock > 0 ? `${product.stock} in stock` : "0 stock"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col bg-[var(--soko-color-surface-muted)] p-4" aria-label="Cart">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Current Sale ({lines.reduce((s, l) => s + l.qty, 0)} items)</h2>
            <div className="flex gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={lines.length === 0}
                onClick={() => {
                  const held = holdCurrentSale({
                    customerId: customer?.id,
                    customerName: customer?.name,
                    customerPhone: customer?.phone,
                  });
                  if (held) setCustomer(null);
                }}
              >
                Hold (F4)
              </Button>
              {lines.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => useCartStore.getState().clear()}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-2 rounded-md border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-2">
            <p className="text-xs font-semibold text-[var(--soko-color-text-muted)]">Customer (walk-in or account)</p>
            {customer ? (
              <p className="text-sm font-semibold">
                {customer.name} {customer.phone ? `· ${customer.phone}` : ""}{" "}
                <button
                  type="button"
                  className="ml-2 text-xs text-[var(--soko-color-danger)]"
                  onClick={() => setCustomer(null)}
                >
                  clear
                </button>
              </p>
            ) : (
              <>
                <input
                  className="mt-1 w-full rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-1 text-sm"
                  placeholder="Search customer name or phone…"
                  value={customerQ}
                  onChange={(e) => void searchCustomers(e.target.value)}
                />
                {customers.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="mt-1 block text-left text-sm font-medium text-[var(--soko-color-primary)]"
                    onClick={() => setCustomer(c)}
                  >
                    {c.name} {c.phone ? `(${c.phone})` : ""}
                  </button>
                ))}
                <div className="mt-2 flex gap-1">
                  <input
                    className="w-1/2 rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-1 text-xs"
                    placeholder="New customer name"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  />
                  <input
                    className="w-1/2 rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-1 text-xs"
                    placeholder="Phone"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold text-[var(--soko-color-primary)]"
                  onClick={() => void createCustomer()}
                >
                  + Save & attach customer
                </button>
              </>
            )}
          </div>

          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--soko-color-text-muted)]">
                Scan barcode or tap bottle/case to add to cart.
              </p>
            ) : (
              lines.map((line) => (
                <div
                  key={line.productId}
                  className="cart-line-enter flex items-center justify-between gap-2 rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{line.name}</p>
                    <div className="flex items-center gap-2 text-xs text-[var(--soko-color-text-muted)]">
                      <span className="tabular-nums">{formatMoney(line.unitPriceCents, session.currency)}</span>
                      {line.wholesalePriceCents ? (
                        <button
                          type="button"
                          onClick={() => togglePriceTier(line.productId)}
                          className="rounded border border-[var(--soko-color-border)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--soko-color-primary)]"
                        >
                          {line.priceTier === "wholesale" ? "Wholesale" : "Retail"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="touch-btn rounded-[var(--soko-radius-sm)] border px-3 text-lg"
                      onClick={() => setQty(line.productId, line.qty - 1)}
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-lg font-semibold tabular-nums">{line.qty}</span>
                    <button
                      type="button"
                      className="touch-btn rounded-[var(--soko-radius-sm)] border px-3 text-lg"
                      onClick={() => setQty(line.productId, line.qty + 1, stockFor(line.productId))}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="touch-btn px-1 text-sm text-[var(--soko-color-danger)]"
                      onClick={() => removeLine(line.productId)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div
            className={`mt-4 space-y-1.5 border-t border-[var(--soko-color-border)] pt-3 ${
              paySuccessPulse ? "pay-success-pulse" : ""
            }`}
          >
            <div className="flex justify-between text-xs text-[var(--soko-color-text-muted)]">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(totals.subtotalCents, session.currency)}</span>
            </div>
            {canDiscount ? (
              <label className="flex items-center justify-between text-xs">
                <span>Discount ({session.currency})</span>
                <input
                  className="w-24 rounded border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-2 py-0.5 text-right"
                  value={discountCents ? (discountCents / 100).toString() : ""}
                  placeholder="0"
                  onChange={(e) => setDiscountCents(Math.round(Number(e.target.value || 0) * 100))}
                />
              </label>
            ) : null}
            <div className="flex justify-between text-2xl font-bold">
              <span>Total</span>
              <span className="tabular-nums text-[var(--soko-color-primary)]">
                {formatMoney(totals.totalCents, session.currency)}
              </span>
            </div>
            {tender === "cash" ? (
              <>
                <label className="flex items-center justify-between text-sm">
                  <span>Cash tendered</span>
                  <input
                    className="w-32 rounded border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-2 py-1 text-right font-semibold"
                    value={cashTenderedCents ? (cashTenderedCents / 100).toString() : ""}
                    placeholder={(primaryDue / 100).toFixed(0)}
                    onChange={(e) => setCashTendered(Math.round(Number(e.target.value || 0) * 100))}
                  />
                </label>
                <div className="flex flex-wrap gap-1 pt-1">
                  {[primaryDue, 50000, 100000, 200000, 500000].map((amt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCashTendered(amt)}
                      className="rounded border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-2 py-0.5 text-xs font-semibold"
                    >
                      {idx === 0 ? "Exact" : `${amt / 100}`}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-sm">
                  <span>Change due</span>
                  <span className="font-bold tabular-nums text-emerald-600">
                    {formatMoney(cashMath.changeCents, session.currency)}
                  </span>
                </div>
                {cashMath.remainingCents > 0 ? (
                  <div className="flex justify-between text-xs text-[var(--soko-color-warning)]">
                    <span>Remaining due</span>
                    <span className="tabular-nums">{formatMoney(cashMath.remainingCents, session.currency)}</span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {(["cash", "mpesa", "card", "bank", "credit"] as const).map((method) => (
              <button
                key={method}
                type="button"
                disabled={method === "credit" && !canCredit}
                className={`touch-btn rounded-[var(--soko-radius-md)] border px-2 text-xs font-semibold uppercase ${
                  tender === method
                    ? "border-[var(--soko-color-accent)] bg-[var(--soko-color-accent-muted)]"
                    : "border-[var(--soko-color-border)] bg-[var(--soko-color-surface)]"
                } ${method === "credit" && !canCredit ? "opacity-40" : ""}`}
                onClick={() => setTender(method)}
              >
                {method === "mpesa" ? "M-Pesa" : method}
              </button>
            ))}
          </div>
          {tender === "mpesa" ? (
            <p className="mt-1 text-xs text-[var(--soko-color-warning)]">
              STK push stays pending until verified callback. Cash works offline.
            </p>
          ) : null}
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={splitEnabled} onChange={(e) => setSplitEnabled(e.target.checked)} />
            Split payment across two methods
          </label>
          {splitEnabled ? (
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <select
                className="rounded border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-2 py-1"
                value={splitSecondMethod}
                onChange={(e) => setSplitSecondMethod(e.target.value as typeof splitSecondMethod)}
              >
                <option value="mpesa">M-Pesa</option>
                <option value="card">Card</option>
                <option value="bank">Bank</option>
              </select>
              <input
                className="rounded border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-2 py-1 text-right"
                placeholder="Second amount"
                value={splitSecondMinor ? (splitSecondMinor / 100).toString() : ""}
                onChange={(e) => setSplitSecondMinor(Math.round(Number(e.target.value || 0) * 100))}
              />
              <p className="col-span-2 text-xs text-[var(--soko-color-text-muted)]">
                Primary ({tender}): {formatMoney(primaryDue, session.currency)}
              </p>
            </div>
          ) : null}

          {error ? <p className="mt-2 text-sm text-[var(--soko-color-danger)]">{error}</p> : null}

          <div className="mt-3 grid gap-2">
            <Button
              size="lg"
              className="touch-btn w-full text-lg"
              disabled={lines.length === 0 || busy || !db}
              onClick={() => void handlePay()}
            >
              {busy ? "Completing Sale…" : "Complete Sale (F9)"}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="touch-btn w-full"
              disabled={!lastSale}
              onClick={() => setPrintOpen(true)}
            >
              Receipt / Reprint
            </Button>
          </div>
        </aside>
      </div>

      {heldModalOpen ? (
        <div
          className="soko-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setHeldModalOpen(false)}
        >
          <div
            className="soko-modal-panel w-full max-w-md rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Suspended / Held Sales</h2>
              <Button size="sm" variant="ghost" onClick={() => setHeldModalOpen(false)}>
                Close
              </Button>
            </div>
            {heldSales.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--soko-color-text-muted)]">
                No held sales. Press F4 or click Hold to park a customer&apos;s cart.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {heldSales.map((h) => {
                  const t = cartTotals(h.lines, h.discountCents);
                  return (
                    <li
                      key={h.id}
                      className="flex items-center justify-between rounded-md border border-[var(--soko-color-border)] p-3 text-sm"
                    >
                      <div>
                        <p className="font-semibold">{h.label}</p>
                        <p className="text-xs text-[var(--soko-color-text-muted)]">
                          {new Date(h.heldAt).toLocaleTimeString()} · {formatMoney(t.totalCents, session.currency)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const resumed = resumeHeldSale(h.id);
                            if (resumed?.customerName) {
                              setCustomer({
                                id: resumed.customerId ?? "",
                                name: resumed.customerName,
                                phone: resumed.customerPhone,
                              });
                            }
                            setHeldModalOpen(false);
                          }}
                        >
                          Resume
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => discardHeldSale(h.id)}>
                          Discard
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {returnModalOpen && lastSale ? (
        <div
          className="soko-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setReturnModalOpen(false)}
        >
          <div
            className="soko-modal-panel w-full max-w-md rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl">Return & Restock — {lastSale.receiptNo}</h2>
            <p className="mt-1 text-xs text-[var(--soko-color-text-muted)]">
              Creates an auditable return record and restores warehouse stock for {lastSale.lines.length} line(s).
            </p>
            <div className="mt-3 space-y-2">
              <Input
                label="Return reason"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
              {returnMsg ? <p className="text-sm text-emerald-600">{returnMsg}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setReturnModalOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => void processLastSaleReturn()}>Confirm Return & Refund</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {printOpen && lastSale ? (
        <div
          className="receipt-print soko-modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/45 p-4"
          onClick={() => setPrintOpen(false)}
        >
          <div
            className={`receipt-paper soko-modal-panel max-w-full rounded-lg bg-white p-5 text-black ${printProfile}`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-lg font-bold">{session.tenantName}</p>
            <p className="text-center text-xs font-semibold uppercase tracking-wide">
              SokoOS Wines & Spirits — {lastSale.branchName ?? session.branchName}
            </p>
            <p className="mt-2 text-xs">
              Receipt No: <strong>{lastSale.receiptNo}</strong>
            </p>
            <p className="text-xs">Date: {new Date(lastSale.createdAt).toLocaleString()}</p>
            <p className="text-xs">Served by: {lastSale.cashierName ?? session.cashierName}</p>
            {lastSale.customerName ? (
              <p className="text-xs">
                Customer: {lastSale.customerName} {lastSale.customerPhone ? `(${lastSale.customerPhone})` : ""}
              </p>
            ) : null}
            <hr className="my-2 border-neutral-300" />
            {printProfile === "a4" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-300 text-left">
                    <th>Item</th>
                    <th>Qty</th>
                    <th className="text-right">Unit</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lastSale.lines.map((l) => (
                    <tr key={l.productId} className="border-b border-neutral-100">
                      <td>{l.name}</td>
                      <td>{l.qty}</td>
                      <td className="text-right">{formatMoney(l.unitPriceCents, session.currency)}</td>
                      <td className="text-right">{formatMoney(l.lineTotalCents, session.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              lastSale.lines.map((l) => (
                <div key={l.productId} className="flex justify-between text-xs py-0.5">
                  <span>
                    {l.name} × {l.qty}
                  </span>
                  <span className="tabular-nums">{formatMoney(l.lineTotalCents, session.currency)}</span>
                </div>
              ))
            )}
            <hr className="my-2 border-neutral-300" />
            <div className="space-y-0.5 text-xs">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatMoney(lastSale.subtotalCents, session.currency)}</span>
              </div>
              {(lastSale.discountCents ?? 0) > 0 ? (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>−{formatMoney(lastSale.discountCents ?? 0, session.currency)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-sm font-bold pt-1">
                <span>TOTAL</span>
                <span>{formatMoney(lastSale.totalCents, session.currency)}</span>
              </div>
            </div>
            <p className="mt-1 text-xs uppercase">
              Payment: {lastSale.tender}
              {lastSale.tender === "cash"
                ? ` · Tendered ${formatMoney(lastSale.cashTenderedCents ?? 0, session.currency)} · Change ${formatMoney(lastSale.changeCents ?? 0, session.currency)}`
                : ""}
            </p>
            <div className="mt-2 rounded border border-dashed border-neutral-400 p-1.5 text-[10px]">
              {lastSale.fiscalStatus === "ACCEPTED" && lastSale.fiscalInvoiceNumber ? (
                <>
                  <p className="font-bold">KRA eTIMS VERIFIED</p>
                  <p>CU Invoice: {lastSale.fiscalInvoiceNumber}</p>
                </>
              ) : (
                <p>
                  eTIMS Status: {(lastSale.fiscalStatus ?? "NOT_CONFIGURED").toUpperCase()} — Commercial receipt (not a
                  KRA fiscal tax invoice until OSCU/VSCU confirms).
                </p>
              )}
            </div>
            <p className="mt-2 text-center text-[11px]">Drink Responsibly · Not for Sale to Persons Under 18</p>
            <div className="mt-3 flex flex-wrap gap-2 print:hidden">
              <select
                className="rounded border border-neutral-300 px-2 py-1 text-sm"
                value={printProfile}
                onChange={(e) => setPrintProfile(e.target.value as typeof printProfile)}
              >
                <option value="thermal-80">X-80 (80mm Thermal)</option>
                <option value="thermal-58">58mm Thermal</option>
                <option value="a4">A4 Tax / Commercial Invoice</option>
              </select>
              <Button onClick={() => window.print()}>Print Receipt</Button>
              <Button variant="secondary" onClick={() => setPrintOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SyncPill({ status, pending }: { status: SyncStatus; pending: number }) {
  const label =
    status === "synced"
      ? "ONLINE · synced"
      : status === "syncing"
        ? `SYNCING${pending ? ` · ${pending}` : ""}`
        : status === "offline"
          ? `OFFLINE${pending ? ` · ${pending} queued` : ""}`
          : status === "error"
            ? `SYNC_ERROR${pending ? ` · ${pending} queued` : ""}`
            : pending > 0
              ? `PENDING · ${pending}`
              : "IDLE";
  return (
    <span className="rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-2 py-1 font-semibold text-[var(--soko-color-text-muted)]">
      {label}
    </span>
  );
}
