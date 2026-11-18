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
  PackagePlus,
  Users,
  Store,
  Plus,
  Check,
  Circle,
  type LucideIcon,
} from "lucide-react";
import { AppShell, EmptyState } from "../components/AppShell";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { formatMoney } from "../lib/money";
import { Button } from "@sokoos/ui";

type OnboardingChecklist = {
  status: string;
  completedCount: number;
  totalCount: number;
  items: Array<{
    id: string;
    label: string;
    to: string;
    complete: boolean;
    optional?: boolean;
  }>;
};
type QuickAction = {
  label: string;
  description: string;
  to: "/pos" | "/purchases" | "/products" | "/customers" | "/suppliers" | "/expenses";
  icon: LucideIcon;
};

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
  const tenant = useAuthStore((s) => s.tenant);
  const hasPermission = useAuthStore((s) => s.has);
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<OnboardingChecklist | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);

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

  useEffect(() => {
    if (tenant?.onboardingStatus !== "draft" || !hasPermission("tenant.settings.read")) {
      setChecklist(null);
      return;
    }
    setOnboardingError(null);
    void apiRequest<OnboardingChecklist>("/tenant/onboarding", { token })
      .then(setChecklist)
      .catch((err: unknown) => {
        setOnboardingError(err instanceof Error ? err.message : "Unable to load setup checklist");
      });
  }, [hasPermission, tenant?.onboardingStatus, token]);

  async function completeOnboarding() {
    setCompletingOnboarding(true);
    setOnboardingError(null);
    try {
      await apiRequest("/tenant/onboarding/complete", { method: "POST", token });
      setChecklist(null);
      useAuthStore.setState((state) => ({
        tenant: state.tenant
          ? { ...state.tenant, onboardingStatus: "complete" }
          : state.tenant,
      }));
    } catch (err) {
      setOnboardingError(err instanceof Error ? err.message : "Unable to update setup status");
    } finally {
      setCompletingOnboarding(false);
    }
  }

  const quickActions: QuickAction[] = [];
  if (hasPermission("sales.create")) {
    quickActions.push({
      label: "New Sale",
      description: "Open the POS and start a sale",
      to: "/pos",
      icon: ScanBarcode,
    });
  }
  if (hasPermission("purchases.read") && hasPermission("purchases.receive")) {
    quickActions.push({
      label: "Receive Stock",
      description: "Receive items against a purchase order",
      to: "/purchases",
      icon: PackagePlus,
    });
  }
  if (hasPermission("purchases.read") && hasPermission("purchases.write")) {
    quickActions.push({
      label: "New Purchase Order",
      description: "Create a supplier order",
      to: "/purchases",
      icon: ShoppingCart,
    });
  }
  if (hasPermission("products.edit")) {
    quickActions.push({
      label: "Add Product",
      description: "Add a product to your catalogue",
      to: "/products",
      icon: Plus,
    });
  }
  if (hasPermission("customers.edit")) {
    quickActions.push({
      label: "Add Customer",
      description: "Create a customer profile",
      to: "/customers",
      icon: Users,
    });
  }
  if (
    hasPermission("suppliers.read") &&
    (hasPermission("suppliers.write") || hasPermission("suppliers.create"))
  ) {
    quickActions.push({
      label: "Add Supplier",
      description: "Open supplier onboarding",
      to: "/suppliers",
      icon: Store,
    });
  }
  if (hasPermission("expenses.read") && hasPermission("expenses.write")) {
    quickActions.push({
      label: "Record Expense",
      description: "Record a business expense",
      to: "/expenses",
      icon: Wallet,
    });
  }

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

      {checklist ? (
        <section className="soko-stagger-item mb-6 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-wider text-[var(--soko-color-primary)] uppercase">Getting started</p>
              <h2 className="mt-1 font-display text-xl">Welcome to SokoOS</h2>
              <p className="mt-1 text-sm text-[var(--soko-color-text-muted)]">
                {checklist.completedCount} of {checklist.totalCount} setup steps complete. You can continue working while you set up the rest.
              </p>
            </div>
            <Button variant="secondary" disabled={completingOnboarding} onClick={() => void completeOnboarding()}>
              {completingOnboarding ? "Saving…" : "Skip setup guide"}
            </Button>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--soko-color-surface-muted)]">
            <div
              className="soko-bar-fill h-full rounded-full bg-[var(--soko-color-primary)]"
              style={{ width: `${Math.round((checklist.completedCount / checklist.totalCount) * 100)}%` }}
            />
          </div>
          {onboardingError ? (
            <p role="alert" className="mt-3 text-sm text-[var(--soko-color-danger)]">{onboardingError}</p>
          ) : null}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {checklist.items.map((item) => {
              const Icon = item.complete ? Check : Circle;
              return (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--soko-color-border)] px-3 py-2 text-sm transition hover:border-[var(--soko-color-primary)] hover:bg-[var(--soko-color-primary-muted)] focus-visible:outline-2 focus-visible:outline-[var(--soko-color-focus)]"
                  >
                    <Icon
                      size={16}
                      className={item.complete ? "text-emerald-600" : "text-[var(--soko-color-text-muted)]"}
                    />
                    <span className={item.complete ? "flex-1 line-through text-[var(--soko-color-text-muted)]" : "flex-1"}>
                      {item.label}{item.optional ? " (optional)" : ""}
                    </span>
                    {!item.complete ? <ArrowUpRight size={14} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="mb-6">
        <h2 className="mb-3 font-display text-xl">Quick Actions</h2>
        {quickActions.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {quickActions.map(({ label, description, to, icon: Icon }) => (
              <Link
                key={label}
                to={to}
                className="soko-card-interactive soko-stagger-item flex min-h-16 items-center justify-between gap-3 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-3.5 focus-visible:outline-2 focus-visible:outline-[var(--soko-color-focus)]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--soko-color-primary-muted)] text-[var(--soko-color-primary)]">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs text-[var(--soko-color-text-muted)]">{description}</span>
                  </span>
                </span>
                <ArrowUpRight size={16} className="shrink-0 text-[var(--soko-color-text-muted)]" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--soko-color-text-muted)]">No quick actions are available for your role.</p>
        )}
      </section>

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
