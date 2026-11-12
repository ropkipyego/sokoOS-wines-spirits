import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  TrendingUp,
  Wine,
  AlertTriangle,
  Receipt,
  Wallet,
  Calendar,
  ArrowUpRight,
  ScanBarcode,
  ShoppingCart,
  FileCheck2,
  PackagePlus,
} from "lucide-react";
import { AppShell, EmptyState } from "../components/AppShell";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { formatMoney } from "../lib/money";

type Dash = {
  today: { salesTotalMinor: number; salesCount: number; averageMinor: number };
  week: { salesTotalMinor: number; salesCount: number };
  month: { salesTotalMinor: number; salesCount: number };
  activeProducts: number;
  lowStock: number;
  outOfStock: number;
  expensesTodayMinor: number;
  grossProfitTodayMinor: number;
  recentSales: Array<{
    id: string;
    receiptNumber: string;
    totalMinor: number;
    occurredAt: string;
    branchNameSnapshot?: string;
    cashierNameSnapshot?: string;
    payments: Array<{ method: string }>;
  }>;
  topProducts: Array<{ nameSnapshot: string; _sum: { quantity: number | null; lineTotalMinor: number | null } }>;
  paymentBreakdown: Array<{ method: string; _sum: { amountMinor: number | null } }>;
};

export function DashboardPage() {
  const token = useAuthStore((s) => s.accessToken);
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        const dash = await apiRequest<Dash>("/reports/dashboard", { token });
        setData(dash);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const cards = data
    ? [
        {
          label: "Today's Revenue",
          value: formatMoney(data.today.salesTotalMinor, currency),
          hint: `${data.today.salesCount} completed receipts`,
          icon: Receipt,
          accent: "text-[var(--soko-color-primary)] bg-[var(--soko-color-primary-muted)]",
        },
        {
          label: "Gross Profit Today",
          value: formatMoney(data.grossProfitTodayMinor, currency),
          hint: "Completed sales minus bottle/case cost",
          icon: TrendingUp,
          accent: "text-emerald-700 bg-emerald-500/15 dark:text-emerald-400",
        },
        {
          label: "This Week",
          value: formatMoney(data.week.salesTotalMinor, currency),
          hint: `${data.week.salesCount} transactions`,
          icon: Calendar,
          accent: "text-[var(--soko-color-accent)] bg-[var(--soko-color-accent-muted)]",
        },
        {
          label: "This Month",
          value: formatMoney(data.month.salesTotalMinor, currency),
          hint: `${data.month.salesCount} transactions`,
          icon: Calendar,
          accent: "text-[var(--soko-color-primary)] bg-[var(--soko-color-primary-muted)]",
        },
        {
          label: "Average Basket",
          value: formatMoney(data.today.averageMinor, currency),
          hint: "Today's average receipt size",
          icon: Wine,
          accent: "text-[var(--soko-color-accent)] bg-[var(--soko-color-accent-muted)]",
        },
        {
          label: "Active Catalogue SKUs",
          value: String(data.activeProducts),
          hint: `${data.lowStock} low · ${data.outOfStock} out of stock`,
          icon: Wine,
          accent: "text-[var(--soko-color-primary)] bg-[var(--soko-color-primary-muted)]",
        },
        {
          label: "Low Stock Alerts",
          value: String(data.lowStock),
          hint: data.lowStock > 0 ? "Cellar replenishment recommended" : "All SKUs above threshold",
          icon: AlertTriangle,
          accent:
            data.lowStock > 0
              ? "text-amber-700 bg-amber-500/15 dark:text-amber-400"
              : "text-emerald-700 bg-emerald-500/15 dark:text-emerald-400",
        },
        {
          label: "Expenses Today",
          value: formatMoney(data.expensesTodayMinor, currency),
          hint: "Recorded operating expenses",
          icon: Wallet,
          accent: "text-[var(--soko-color-text-muted)] bg-[var(--soko-color-surface-muted)]",
        },
      ]
    : [];

  const posHref = import.meta.env.PROD
    ? "/pos"
    : `http://${typeof window === "undefined" ? "127.0.0.1" : window.location.hostname}:5174`;

  return (
    <AppShell
      title="Cellar & Trading Overview"
      description="Live commercial snapshot backed by PostgreSQL. Revenue reflects completed sales; stock movements are append-only."
    >
      {error ? (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-[var(--soko-color-danger)]">
          {error}
        </div>
      ) : null}

      {/* Quick Operational Shortcuts */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <a
          href={posHref}
          target="_blank"
          rel="noreferrer"
          className="soko-card-interactive soko-stagger-item flex items-center justify-between rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-3.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--soko-color-primary)] text-white">
              <ScanBarcode size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">Launch POS Terminal</p>
              <p className="text-xs text-[var(--soko-color-text-muted)]">Barcode & bottle/case checkout</p>
            </div>
          </div>
          <ArrowUpRight size={16} className="text-[var(--soko-color-text-muted)]" />
        </a>

        <Link
          to="/inventory"
          className="soko-card-interactive soko-stagger-item flex items-center justify-between rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-3.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--soko-color-primary-muted)] text-[var(--soko-color-primary)]">
              <PackagePlus size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">Cellar Stock & Cases</p>
              <p className="text-xs text-[var(--soko-color-text-muted)]">Receive, count, or break cases</p>
            </div>
          </div>
          <ArrowUpRight size={16} className="text-[var(--soko-color-text-muted)]" />
        </Link>

        <Link
          to="/purchases"
          className="soko-card-interactive soko-stagger-item flex items-center justify-between rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-3.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--soko-color-accent-muted)] text-[var(--soko-color-accent)]">
              <ShoppingCart size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">Purchase Orders (LPO)</p>
              <p className="text-xs text-[var(--soko-color-text-muted)]">Distributor orders & receiving</p>
            </div>
          </div>
          <ArrowUpRight size={16} className="text-[var(--soko-color-text-muted)]" />
        </Link>

        <Link
          to="/etims"
          className="soko-card-interactive soko-stagger-item flex items-center justify-between rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-3.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <FileCheck2 size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">KRA eTIMS Queue</p>
              <p className="text-xs text-[var(--soko-color-text-muted)]">OSCU/VSCU status & retries</p>
            </div>
          </div>
          <ArrowUpRight size={16} className="text-[var(--soko-color-text-muted)]" />
        </Link>
      </div>

      {/* KPI Grid */}
      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="soko-shimmer h-28 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="soko-card-interactive soko-stagger-item rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold tracking-wider text-[var(--soko-color-text-muted)] uppercase">
                    {card.label}
                  </p>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.accent}`}>
                    <Icon size={16} />
                  </span>
                </div>
                <p className="mt-2 font-display text-2xl tabular-nums">{card.value}</p>
                <p className="mt-1 text-xs text-[var(--soko-color-text-muted)]">{card.hint}</p>
              </div>
            );
          })}
        </div>
      )}

      {data?.paymentBreakdown?.length ? (
        <section className="soko-card-interactive mt-8 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl">Tender & Payment Mix</h2>
              <p className="text-xs text-[var(--soko-color-text-muted)]">
                Completed payment allocations — pending M-Pesa STK requests are excluded until verified.
              </p>
            </div>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.paymentBreakdown.map((row) => {
              const amount = row._sum.amountMinor ?? 0;
              const max = Math.max(...data.paymentBreakdown.map((r) => r._sum.amountMinor ?? 0), 1);
              const pct = Math.round((amount / max) * 100);
              return (
                <li
                  key={row.method}
                  className="rounded-lg border border-[var(--soko-color-border)]/70 bg-[var(--soko-color-bg-elevated)] p-3"
                >
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="uppercase">{row.method.replace("_", " ")}</span>
                    <span className="tabular-nums text-[var(--soko-color-primary)]">
                      {formatMoney(amount, currency)}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--soko-color-surface-muted)]">
                    <div
                      className="soko-bar-fill h-full rounded-full bg-[var(--soko-color-primary)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="soko-card-interactive rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Recent POS Receipts</h2>
            <Link to="/sales" className="text-xs font-semibold text-[var(--soko-color-primary)] hover:underline">
              View all sales →
            </Link>
          </div>
          {!data?.recentSales.length ? (
            <div className="mt-4">
              <EmptyState title="No sales yet" body="Completed receipts will appear here immediately after POS checkout." />
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-[var(--soko-color-text-muted)]">
                    <th className="py-2">Receipt</th>
                    <th>Cashier</th>
                    <th>Tender</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales.map((sale) => (
                    <tr key={sale.id} className="border-t border-[var(--soko-color-border)]">
                      <td className="py-2.5 font-mono text-xs font-semibold">{sale.receiptNumber}</td>
                      <td>{sale.cashierNameSnapshot ?? "—"}</td>
                      <td>
                        <span className="rounded bg-[var(--soko-color-surface-muted)] px-2 py-0.5 text-xs font-semibold uppercase">
                          {sale.payments.map((p) => p.method).join(", ")}
                        </span>
                      </td>
                      <td className="text-right font-semibold tabular-nums">
                        {formatMoney(sale.totalMinor, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="soko-card-interactive rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Top Moving Bottles & Cases</h2>
            <Link to="/reports" className="text-xs font-semibold text-[var(--soko-color-primary)] hover:underline">
              Full report →
            </Link>
          </div>
          {!data?.topProducts.length ? (
            <div className="mt-4">
              <EmptyState title="No product mix yet" body="Sales lines feed this ranking automatically." />
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.topProducts.map((p, idx) => {
                const maxRev = Math.max(
                  ...data.topProducts.map((x) => x._sum.lineTotalMinor ?? 0),
                  1,
                );
                const rev = p._sum.lineTotalMinor ?? 0;
                const pct = Math.round((rev / maxRev) * 100);
                return (
                  <li key={p.nameSnapshot} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">
                        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--soko-color-primary-muted)] text-xs font-bold text-[var(--soko-color-primary)]">
                          {idx + 1}
                        </span>
                        {p.nameSnapshot}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-[var(--soko-color-text-muted)]">
                        {p._sum.quantity ?? 0} sold · {formatMoney(rev, currency)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--soko-color-surface-muted)]">
                      <div
                        className="soko-bar-fill h-full rounded-full bg-[var(--soko-color-accent)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
