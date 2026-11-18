import type { FunctionComponent } from "react";
import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { PRODUCT_EDITION, isEditionModuleAllowed, type ModuleKey } from "@sokoos/types";
import { useAuthStore } from "./stores/auth";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { SetupPage } from "./pages/SetupPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PosPage } from "./pages/PosPage";
import { ProductsPage } from "./pages/ProductsPage";
import { InventoryPage, MovementsPage } from "./pages/InventoryPage";
import { SalesPage } from "./pages/SalesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { ConfigCentrePage } from "./pages/ConfigCentrePage";
import { DepartmentsPage } from "./pages/DepartmentsPage";
import { ActivatePage } from "./pages/ActivatePage";
import {
  BranchesPage,
  UsersPage,
  CustomersPage,
  SuppliersPage,
  ExpensesPage,
  DeliveriesPage,
  MessagesPage,
  CategoriesPage,
  BrandsPage,
  RolesPage,
  ReturnsPage,
  TransfersPage,
  ReportsPage,
  IntelligencePage,
  IntegrationsPage,
  DevicesPage,
  NotificationsPage,
  WarehousesPage,
  AuditPage,
  EtimsPage,
} from "./pages/ModulesPages";

const rootRoute = createRootRoute();

function requireAuth() {
  if (!useAuthStore.getState().isAuthenticated) {
    throw redirect({ to: "/login" });
  }
}

function requirePasswordOk() {
  requireAuth();
  if (useAuthStore.getState().mustChangePassword) {
    throw redirect({ to: "/change-password" });
  }
}

function requirePerm(perm: string) {
  requirePasswordOk();
  if (!useAuthStore.getState().has(perm)) {
    throw redirect({ to: useAuthStore.getState().defaultLandingRoute() });
  }
}

function r<TPath extends string>(
  path: TPath,
  component: FunctionComponent,
  opts?: { module?: ModuleKey; perm?: string },
) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    beforeLoad: () => {
      if (opts?.perm) {
        requirePerm(opts.perm);
      } else {
        requirePasswordOk();
      }
      if (opts?.module && !isEditionModuleAllowed(opts.module, PRODUCT_EDITION)) {
        throw redirect({ to: useAuthStore.getState().defaultLandingRoute() });
      }
    },
    component,
  });
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    requirePasswordOk();
    throw redirect({ to: useAuthStore.getState().defaultLandingRoute() });
  },
  component: DashboardPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: useAuthStore.getState().defaultLandingRoute() });
    }
  },
  component: LoginPage,
});

const changePasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/change-password",
  beforeLoad: () => {
    requireAuth();
  },
  component: ChangePasswordPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: useAuthStore.getState().defaultLandingRoute() });
    }
  },
  component: SetupPage,
});

const activateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/activate",
  component: ActivatePage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  changePasswordRoute,
  indexRoute,
  r("/dashboard", DashboardPage, { perm: "reports.read" }),
  r("/pos", PosPage, { perm: "sales.create" }),
  r("/analytics", IntelligencePage, { perm: "reports.read" }),
  r("/intelligence", IntelligencePage, { perm: "reports.read" }),
  r("/products", ProductsPage, { perm: "products.edit" }),
  r("/categories", CategoriesPage, { perm: "categories.write" }),
  r("/brands", BrandsPage, { perm: "categories.write" }),
  r("/inventory", InventoryPage, { perm: "inventory.adjust" }),
  r("/movements", MovementsPage, { perm: "inventory.adjust" }),
  r("/transfers", TransfersPage, { perm: "inventory.transfer" }),
  r("/warehouses", WarehousesPage, { perm: "inventory.adjust" }),
  r("/purchases", PurchasesPage, { perm: "purchases.read" }),
  r("/sales", SalesPage, { perm: "sales.read" }),
  r("/returns", ReturnsPage, { perm: "returns.read" }),
  r("/deliveries", DeliveriesPage, { module: "deliveries", perm: "deliveries.read" }),
  r("/customers", CustomersPage, { perm: "customers.edit" }),
  r("/suppliers", SuppliersPage, { perm: "suppliers.read" }),
  r("/expenses", ExpensesPage, { perm: "expenses.read" }),
  r("/config", ConfigCentrePage, { perm: "tenant.settings.write" }),
  r("/departments", DepartmentsPage, { perm: "departments.read" }),
  r("/branches", BranchesPage, { perm: "branches.read" }),
  r("/users", UsersPage, { perm: "users.read" }),
  r("/roles", RolesPage, { perm: "roles.read" }),
  r("/messages", MessagesPage, { perm: "messages.read" }),
  r("/reports", ReportsPage, { perm: "reports.read" }),
  r("/etims", EtimsPage, { module: "e_tims", perm: "etims.view" }),
  r("/audit", AuditPage, { perm: "audit.read" }),
  r("/settings", SettingsPage, { perm: "tenant.settings.read" }),
  r("/integrations", IntegrationsPage, { perm: "settings.manage" }),
  r("/devices", DevicesPage, { perm: "devices.read" }),
  r("/notifications", NotificationsPage, { perm: "notifications.read" }),
  activateRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
