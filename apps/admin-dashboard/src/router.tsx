import type { FunctionComponent } from "react";
import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { PRODUCT_EDITION, isEditionModuleAllowed, type ModuleKey } from "@sokoos/types";
import { useAuthStore } from "./stores/auth";
import { LoginPage } from "./pages/LoginPage";
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

function r<TPath extends string>(
  path: TPath,
  component: FunctionComponent,
  module?: ModuleKey,
) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    beforeLoad: () => {
      requireAuth();
      if (module && !isEditionModuleAllowed(module, PRODUCT_EDITION)) {
        throw redirect({ to: "/dashboard" });
      }
    },
    component,
  });
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    requireAuth();
    const landing = useAuthStore.getState().defaultLandingRoute();
    if (landing !== "/dashboard") {
      throw redirect({ to: landing });
    }
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

const activateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/activate",
  component: ActivatePage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  indexRoute,
  r("/dashboard", DashboardPage),
  r("/pos", PosPage),
  r("/analytics", IntelligencePage),
  r("/intelligence", IntelligencePage),
  r("/products", ProductsPage),
  r("/categories", CategoriesPage),
  r("/brands", BrandsPage),
  r("/inventory", InventoryPage),
  r("/movements", MovementsPage),
  r("/transfers", TransfersPage),
  r("/warehouses", WarehousesPage),
  r("/purchases", PurchasesPage),
  r("/sales", SalesPage),
  r("/returns", ReturnsPage),
  r("/deliveries", DeliveriesPage, "deliveries"),
  r("/customers", CustomersPage),
  r("/suppliers", SuppliersPage),
  r("/expenses", ExpensesPage),
  r("/config", ConfigCentrePage),
  r("/departments", DepartmentsPage),
  r("/branches", BranchesPage),
  r("/users", UsersPage),
  r("/roles", RolesPage),
  r("/messages", MessagesPage),
  r("/reports", ReportsPage),
  r("/etims", EtimsPage, "e_tims"),
  r("/audit", AuditPage),
  r("/settings", SettingsPage),
  r("/integrations", IntegrationsPage),
  r("/devices", DevicesPage),
  r("/notifications", NotificationsPage),
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
