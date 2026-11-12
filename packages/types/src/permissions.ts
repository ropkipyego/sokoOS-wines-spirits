import { z } from "zod";

/**
 * Core permission keys (`domain.action`).
 * Plugin permissions use a namespaced prefix (e.g. `pharmacy.manage_batches`).
 */
export const CORE_PERMISSION_KEYS = [
  // Platform
  "platform.tenants.manage",
  "platform.tenants.read",
  "platform.onboarding.manage",
  "platform.audit.read",
  "platform.users.manage",
  "platform.health.read",
  "platform.domains.read",
  "platform.domains.manage",
  "platform.billing.manage",
  "platform.billing.read",
  "platform.support.manage",
  "platform.support.read",
  "platform.email.manage",
  "platform.email.read",
  "platform.devices.read",
  "platform.settings.read",
  "platform.settings.manage",
  "platform.integrations.read",
  // Tenant / branch / department
  "tenant.settings.read",
  "tenant.settings.write",
  "branches.read",
  "branches.write",
  "departments.read",
  "departments.write",
  "devices.read",
  "devices.write",
  // Users / RBAC
  "users.read",
  "users.view",
  "users.write",
  "users.invite",
  "users.edit",
  "users.assign_roles",
  "roles.read",
  "roles.write",
  // Catalog
  "products.read",
  "products.view",
  "products.write",
  "products.create",
  "products.edit",
  "products.archive",
  "products.import",
  "categories.read",
  "categories.write",
  // Inventory
  "inventory.read",
  "inventory.view",
  "inventory.receive",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.count",
  "inventory.writeoff",
  // Sales
  "sales.create",
  "sales.read",
  "sales.view",
  "sales.void",
  "sales.refund",
  "sales.discount",
  "sales.reprint",
  "returns.create",
  "returns.read",
  // Customers
  "customers.read",
  "customers.view",
  "customers.write",
  "customers.create",
  "customers.edit",
  "customers.credit",
  "deliveries.read",
  "deliveries.write",
  // Procurement & Suppliers
  "purchases.read",
  "purchases.view",
  "purchases.write",
  "purchases.create",
  "purchases.approve",
  "purchases.receive",
  "suppliers.read",
  "suppliers.view",
  "suppliers.write",
  "suppliers.create",
  "suppliers.edit",
  // Finance & Reports
  "expenses.read",
  "expenses.view",
  "expenses.write",
  "expenses.create",
  "expenses.approve",
  "reports.read",
  "reports.sales",
  "reports.inventory",
  "reports.purchases",
  "reports.financial",
  "reports.export",
  // eTIMS / KRA Fiscal
  "etims.view",
  "etims.submit",
  "etims.retry",
  "etims.configure",
  // Communication & Settings
  "messages.read",
  "messages.write",
  "settings.manage",
  // Sync / audit
  "sync.force",
  "audit.read",
  "notifications.read",
] as const;

/**
 * Bidirectional permission equivalences between legacy SokoOS keys (`*.read` / `*.write`)
 * and granular Wines & Spirits permission keys (`*.view` / `*.create` / `*.edit`).
 * Destructive or sensitive operations (`inventory.adjust`, `inventory.writeoff`,
 * `sales.void`, `sales.refund`, `sales.discount`, `purchases.approve`, `expenses.approve`,
 * `customers.credit`, `etims.configure`) are NOT implied by read/view permissions.
 */
export const PERMISSION_EQUIVALENTS: Readonly<Record<string, readonly string[]>> = {
  "sales.read": ["sales.view"],
  "sales.view": ["sales.read"],
  "returns.read": ["sales.view", "sales.read"],
  "returns.create": ["sales.refund"],
  "sales.refund": ["returns.create"],
  "inventory.read": ["inventory.view"],
  "inventory.view": ["inventory.read"],
  "products.read": ["products.view"],
  "products.view": ["products.read"],
  "products.write": ["products.create", "products.edit", "products.archive"],
  "products.create": ["products.write"],
  "products.edit": ["products.write"],
  "products.archive": ["products.write"],
  "purchases.read": ["purchases.view"],
  "purchases.view": ["purchases.read"],
  "purchases.write": ["purchases.create", "purchases.approve"],
  "purchases.create": ["purchases.write"],
  "purchases.receive": ["inventory.receive"],
  "inventory.receive": ["purchases.receive"],
  "customers.read": ["customers.view"],
  "customers.view": ["customers.read"],
  "customers.write": ["customers.create", "customers.edit"],
  "customers.create": ["customers.write"],
  "customers.edit": ["customers.write"],
  "suppliers.read": ["suppliers.view"],
  "suppliers.view": ["suppliers.read"],
  "suppliers.write": ["suppliers.create", "suppliers.edit"],
  "suppliers.create": ["suppliers.write"],
  "suppliers.edit": ["suppliers.write"],
  "expenses.read": ["expenses.view"],
  "expenses.view": ["expenses.read"],
  "expenses.write": ["expenses.create"],
  "expenses.create": ["expenses.write"],
  "users.read": ["users.view"],
  "users.view": ["users.read"],
  "users.write": ["users.invite", "users.edit", "users.assign_roles"],
  "users.invite": ["users.write"],
  "users.edit": ["users.write"],
  "users.assign_roles": ["users.write", "roles.write"],
  "reports.read": ["reports.sales", "reports.inventory", "reports.purchases", "reports.financial"],
  "reports.sales": ["reports.read"],
  "reports.inventory": ["reports.read"],
  "reports.purchases": ["reports.read"],
  "reports.financial": ["reports.read"],
  "settings.manage": ["etims.configure", "tenant.settings.write"],
};

export type PermissionKey = (typeof CORE_PERMISSION_KEYS)[number] | (string & {});

export const PermissionKeySchema = z.string().min(3).regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);

export function isCorePermissionKey(key: string): key is (typeof CORE_PERMISSION_KEYS)[number] {
  return (CORE_PERMISSION_KEYS as readonly string[]).includes(key);
}
