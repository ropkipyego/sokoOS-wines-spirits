import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  History,
  Undo2,
  Truck,
  Package,
  Tags,
  Award,
  Warehouse,
  ArrowLeftRight,
  ClipboardList,
  Users,
  Store,
  UserRound,
  Shield,
  MessageSquare,
  BarChart3,
  Wallet,
  Plug,
  Smartphone,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  ScanBarcode,
  Menu,
  X,
  SlidersHorizontal,
  Building,
  FileCheck2,
  ShieldAlert,
  Wine,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@sokoos/ui";
import {
  PERMISSION_EQUIVALENTS,
  PRODUCT_EDITION,
  getEditionConfig,
  isEditionModuleAllowed,
  type ModuleKey,
} from "@sokoos/types";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { useEffect, useState } from "react";

const EDITION = getEditionConfig(PRODUCT_EDITION);

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm?: string;
  module?: ModuleKey;
  external?: boolean;
};
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "reports.read" },
      { to: "/analytics", label: "Business Analytics", icon: BarChart3, perm: "reports.read" },
    ],
  },
  {
    title: "Sales & POS",
    items: [
      {
        to: "/pos",
        label: "POS Terminal",
        icon: ScanBarcode,
        perm: "sales.create",
      },
      { to: "/sales", label: "Sales History", icon: History, perm: "sales.read" },
      { to: "/returns", label: "Returns & Refunds", icon: Undo2, perm: "returns.read" },
      { to: "/deliveries", label: "Deliveries", icon: Truck, perm: "deliveries.read", module: "deliveries" },
    ],
  },
  {
    title: "Inventory & Cellar",
    items: [
      // Admin catalog — not products.view alone (POS operators have view for selling)
      { to: "/products", label: "Products & Packaging", icon: Wine, perm: "products.edit" },
      { to: "/categories", label: "Categories", icon: Tags, perm: "categories.write" },
      { to: "/brands", label: "Brands", icon: Award, perm: "categories.write" },
      { to: "/inventory", label: "Inventory Control", icon: Package, perm: "inventory.adjust" },
      { to: "/movements", label: "Stock Movements", icon: ClipboardList, perm: "inventory.adjust" },
      { to: "/transfers", label: "Stock Transfers", icon: ArrowLeftRight, perm: "inventory.transfer" },
      { to: "/warehouses", label: "Warehouses & Cellars", icon: Warehouse, perm: "inventory.adjust" },
    ],
  },
  {
    title: "Purchasing",
    items: [
      { to: "/purchases", label: "Purchase Orders (LPO)", icon: ShoppingCart, perm: "purchases.read" },
      { to: "/suppliers", label: "Suppliers", icon: Store, perm: "suppliers.read" },
    ],
  },
  {
    title: "Customers & Finance",
    items: [
      // Full customer admin (credit) — POS agents get lookup inside POS only
      { to: "/customers", label: "Customers & Credit", icon: Users, perm: "customers.edit" },
      { to: "/expenses", label: "Expenses", icon: Wallet, perm: "expenses.read" },
      { to: "/reports", label: "Financial Reports", icon: BarChart3, perm: "reports.read" },
      { to: "/etims", label: "eTIMS / KRA Queue", icon: FileCheck2, perm: "etims.view", module: "e_tims" },
    ],
  },
  {
    title: "Administration",
    items: [
      { to: "/users", label: "Users & Invitations", icon: UserRound, perm: "users.read" },
      { to: "/roles", label: "Roles & Permissions", icon: Shield, perm: "roles.read" },
      { to: "/branches", label: "Branches", icon: Store, perm: "branches.read" },
      { to: "/departments", label: "Departments", icon: Building, perm: "departments.read" },
      { to: "/devices", label: "POS Devices", icon: Smartphone, perm: "devices.read" },
      { to: "/audit", label: "Audit Trail", icon: ShieldAlert, perm: "audit.read" },
      { to: "/settings", label: "Settings", icon: Settings, perm: "tenant.settings.read" },
      { to: "/integrations", label: "Integrations", icon: Plug, perm: "settings.manage" },
      { to: "/config", label: "Config Centre", icon: SlidersHorizontal, perm: "tenant.settings.write" },
      { to: "/messages", label: "Staff Announcements", icon: MessageSquare, perm: "messages.read" },
      { to: "/notifications", label: "Notifications", icon: Bell, perm: "notifications.read" },
    ],
  },
];

type AppShellProps = {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
};

export function AppShell({ title, description, action, children }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const permissions = useAuthStore((s) => s.permissions);
  const logout = useAuthStore((s) => s.logout);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const can = (perm?: string) => {
    if (!perm) return true;
    if (permissions.includes(perm)) return true;
    const aliases = PERMISSION_EQUIVALENTS[perm];
    return Boolean(aliases?.some((a) => permissions.includes(a)));
  };
  const moduleAllowed = (module?: ModuleKey) =>
    !module || isEditionModuleAllowed(module, PRODUCT_EDITION);
  const sidebarWidth = collapsed ? 76 : 256;

  function NavBody({ compact }: { compact?: boolean }) {
    return (
      <>
        <div className="flex items-center justify-between border-b border-[var(--soko-color-border)]/60 px-4 py-4">
          {!compact ? (
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--soko-color-primary)] text-white shadow-sm">
                <Wine size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-display text-xl tracking-tight text-[var(--soko-color-primary)]">SokoOS</p>
                  <span className="rounded bg-[var(--soko-color-primary-muted)] px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[var(--soko-color-primary)] uppercase">
                    {EDITION.shortName}
                  </span>
                </div>
                <p className="truncate text-xs text-[var(--soko-color-text-muted)]">
                  {tenant?.name ?? EDITION.productName}
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--soko-color-primary)] text-white">
              <Wine size={18} />
            </div>
          )}
          <button
            type="button"
            className="hidden rounded-md p-1.5 text-[var(--soko-color-text-muted)] hover:bg-[var(--soko-color-surface-muted)] lg:inline-flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            type="button"
            className="inline-flex rounded-md p-1.5 text-[var(--soko-color-text-muted)] lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-col gap-1 overflow-y-auto px-2.5 py-3">
          {GROUPS.map((group) => {
            const items = group.items.filter((item) => moduleAllowed(item.module) && can(item.perm));
            if (!items.length) return null;
            return (
              <div key={group.title} className="mb-3">
                {!compact ? (
                  <p className="px-3 pb-1.5 text-[10px] font-bold tracking-wider text-[var(--soko-color-text-muted)] uppercase">
                    {group.title}
                  </p>
                ) : null}
                {items.map((item) => {
                  const href = item.external
                    ? item.to.replace("POS_HOST", typeof window === "undefined" ? "localhost" : window.location.hostname)
                    : item.to;
                  const active =
                    !item.external &&
                    (pathname === item.to || (item.to === "/dashboard" && pathname === "/"));
                  const Icon = item.icon;
                  const className = `nav-item-link flex items-center gap-2.5 rounded-[var(--soko-radius-md)] px-3 py-2 text-sm font-semibold ${
                    active
                      ? "nav-item-active bg-[var(--soko-color-primary-muted)] text-[var(--soko-color-primary)]"
                      : "text-[var(--soko-color-text-muted)] hover:bg-[var(--soko-color-surface-muted)] hover:text-[var(--soko-color-text)]"
                  }`;
                  if (item.external) {
                    return (
                      <a key={item.label} href={href} title={item.label} className={className} target="_blank" rel="noreferrer">
                        <Icon size={16} className="shrink-0" />
                        {!compact ? item.label : null}
                      </a>
                    );
                  }
                  return (
                    <Link key={item.to} to={item.to} title={item.label} className={className}>
                      <Icon size={16} className="shrink-0" />
                      {!compact ? item.label : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </>
    );
  }

  return (
    <div className="soko-ui min-h-screen bg-[var(--soko-color-bg)]">
      {/* Desktop / tablet: permanent left sidebar with smooth width transition */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden overflow-y-auto border-r border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] transition-[width] duration-200 ease-out md:flex md:flex-col"
        style={{ width: sidebarWidth }}
      >
        <NavBody compact={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="soko-modal-backdrop fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close overlay"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="soko-modal-panel absolute inset-y-0 left-0 flex w-[256px] flex-col overflow-y-auto bg-[var(--soko-color-surface)] shadow-xl">
            <NavBody />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-col">
        <div
          className="flex min-h-screen min-w-0 flex-col transition-[padding-left] duration-200 ease-out md:pl-[var(--soko-sidebar)]"
          style={{ ["--soko-sidebar" as string]: `${sidebarWidth}px` }}
        >
          <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--soko-color-border)] bg-[var(--soko-color-surface)]/85 px-4 py-3 backdrop-blur-md md:px-6">
            <div className="flex items-center gap-2.5 text-sm">
              <button
                type="button"
                className="inline-flex rounded-md border border-[var(--soko-color-border)] p-2 md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={18} />
              </button>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  online
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-[var(--soko-color-warning)]/15 text-[var(--soko-color-warning)]"
                }`}
              >
                <span className="soko-live-dot" />
                {online ? "ONLINE" : "OFFLINE"}
              </span>
              <span className="hidden font-medium text-[var(--soko-color-text-muted)] sm:inline">
                {tenant?.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {can("sales.create") ? (
                <Link
                  to="/pos"
                  className="hidden items-center gap-1.5 rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--soko-color-primary)] transition hover:border-[var(--soko-color-primary)] sm:inline-flex"
                >
                  <ScanBarcode size={14} />
                  Open POS
                </Link>
              ) : null}
              <Button variant="ghost" size="sm" className="btn-press" onClick={toggleTheme}>
                {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
                <span className="hidden sm:inline">{theme === "light" ? "Dark" : "Light"}</span>
              </Button>
              <span className="hidden text-sm font-medium text-[var(--soko-color-text-muted)] sm:inline">
                {user?.name}
              </span>
              <Button variant="secondary" size="sm" className="btn-press" onClick={logout}>
                Sign out
              </Button>
            </div>
          </header>

          <main className="page-fade flex-1 px-4 py-6 md:px-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--soko-color-border)]/60 pb-4">
              <div>
                <h1 className="font-display text-3xl text-[var(--soko-color-text)]">{title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-[var(--soko-color-text-muted)]">{description}</p>
              </div>
              {action}
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="soko-stagger-item rounded-[var(--soko-radius-lg)] border border-dashed border-[var(--soko-color-border)] bg-[var(--soko-color-surface)]/50 p-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--soko-color-text-muted)]">{body}</p>
    </div>
  );
}

export function ProductImage({
  src,
  alt,
  className = "h-12 w-12",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-md border border-[var(--soko-color-border)]/50 bg-[var(--soko-color-surface-muted)] ${className}`}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[var(--soko-color-text-muted)]">
          Bottle
        </div>
      )}
    </div>
  );
}
