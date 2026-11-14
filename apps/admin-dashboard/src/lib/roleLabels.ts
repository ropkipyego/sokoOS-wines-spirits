/** Clean business labels for the Wines & Spirits user-facing role list. */
const LABELS: Record<string, string> = {
  business_owner: "Owner",
  general_manager: "Manager",
  branch_manager: "Manager",
  cashier: "Cashier",
  sales_agent: "Sales Agent",
  sales_attendant: "Sales Agent",
  stock_controller: "Stock Controller",
  inventory_officer: "Stock Controller",
  accountant: "Accountant",
  auditor: "Auditor",
};

/** Preferred templates shown first in user/role pickers (legacy keys still work). */
export const PRIMARY_ROLE_KEYS = [
  "business_owner",
  "branch_manager",
  "cashier",
  "sales_agent",
  "stock_controller",
  "accountant",
  "auditor",
] as const;

const HIDDEN_LEGACY = new Set([
  "platform_owner",
  "regional_manager",
  "supervisor",
  "procurement_officer",
  "purchasing_officer",
  "customer",
  "supplier",
  "inventory_officer",
  "sales_attendant",
  "general_manager",
]);

export function roleDisplayName(key: string, fallbackName?: string): string {
  return LABELS[key] ?? fallbackName ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isUserFacingRole(key: string, isSystem?: boolean): boolean {
  if (HIDDEN_LEGACY.has(key)) return false;
  if (PRIMARY_ROLE_KEYS.includes(key as (typeof PRIMARY_ROLE_KEYS)[number])) return true;
  // Custom roles (non-system or unknown keys)
  return !isSystem || !key.startsWith("platform_");
}

export function sortRolesForPicker<T extends { key: string; name: string }>(roles: T[]): T[] {
  const rank = new Map(PRIMARY_ROLE_KEYS.map((k, i) => [k, i]));
  return [...roles]
    .filter((r) => isUserFacingRole(r.key))
    .sort((a, b) => {
      const ra = rank.get(a.key as (typeof PRIMARY_ROLE_KEYS)[number]) ?? 100;
      const rb = rank.get(b.key as (typeof PRIMARY_ROLE_KEYS)[number]) ?? 100;
      if (ra !== rb) return ra - rb;
      return roleDisplayName(a.key, a.name).localeCompare(roleDisplayName(b.key, b.name));
    });
}
