import { describe, it, expect } from "vitest";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SystemRole } from "@sokoos/shared";
import { PermissionsGuard, hasAnyPermission } from "../src/common/guards/permissions.guard";
import { ROLE_PERMISSION_TEMPLATES } from "../src/roles/roles.service";
import {
  PERMISSIONS_KEY,
  EDITION_MODULE_KEY,
  IS_PUBLIC_KEY,
} from "../src/common/decorators/permissions.decorator";

function mockContext(opts: {
  userPermissions: readonly string[];
  requiredPermissions?: string[];
  requiredModule?: string;
  isPublic?: boolean;
}): { guard: PermissionsGuard; ctx: ExecutionContext } {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
      if (key === EDITION_MODULE_KEY) return opts.requiredModule;
      if (key === PERMISSIONS_KEY) return opts.requiredPermissions ?? [];
      return undefined;
    },
  } as unknown as Reflector;

  const guard = new PermissionsGuard(reflector);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          id: "user-1",
          tenantId: "tenant-1",
          permissions: [...opts.userPermissions],
        },
      }),
    }),
  } as unknown as ExecutionContext;

  return { guard, ctx };
}

describe("PermissionsGuard & Wines & Spirits RBAC enforcement", () => {
  it("allows when user has any required permission (OR)", () => {
    expect(
      hasAnyPermission(["sales.create", "sales.read"], ["sales.create"]),
    ).toBe(true);
    expect(
      hasAnyPermission(["inventory.read"], ["sales.create", "inventory.read"]),
    ).toBe(true);
  });

  it("denies when none of the required permissions are present", () => {
    expect(
      hasAnyPermission(["products.read"], ["sales.create", "sales.void"]),
    ).toBe(false);
  });

  it("allows when required list is empty (no annotation)", () => {
    expect(hasAnyPermission([], [])).toBe(true);
    expect(hasAnyPermission(["sales.read"], [])).toBe(true);
  });

  it("denies Cashier attempting POST /inventory/adjust or manager-only operations", () => {
    const cashierPerms = ROLE_PERMISSION_TEMPLATES[SystemRole.Cashier]!;

    // Cashier can create sales and reprint receipts
    const saleCheck = mockContext({
      userPermissions: cashierPerms,
      requiredPermissions: ["sales.create"],
    });
    expect(saleCheck.guard.canActivate(saleCheck.ctx)).toBe(true);

    // Cashier MUST receive server-side ForbiddenException on POST /inventory/adjust
    const adjustCheck = mockContext({
      userPermissions: cashierPerms,
      requiredPermissions: ["inventory.adjust"],
    });
    expect(() => adjustCheck.guard.canActivate(adjustCheck.ctx)).toThrow(ForbiddenException);

    // Cashier denied on void, discount, refund, purchase approve, expense approve, etims configure
    for (const restricted of [
      "sales.void",
      "sales.discount",
      "sales.refund",
      "inventory.writeoff",
      "purchases.approve",
      "expenses.approve",
      "etims.configure",
      "users.assign_roles",
    ]) {
      const check = mockContext({
        userPermissions: cashierPerms,
        requiredPermissions: [restricted],
      });
      expect(() => check.guard.canActivate(check.ctx)).toThrow(ForbiddenException);
    }
  });

  it("enforces Stock Controller, Procurement Officer, Accountant, and Auditor role boundaries", () => {
    const stockPerms = ROLE_PERMISSION_TEMPLATES[SystemRole.StockController]!;
    const procurementPerms = ROLE_PERMISSION_TEMPLATES[SystemRole.ProcurementOfficer]!;
    const accountantPerms = ROLE_PERMISSION_TEMPLATES[SystemRole.Accountant]!;
    const auditorPerms = ROLE_PERMISSION_TEMPLATES[SystemRole.Auditor]!;

    // Stock Controller can adjust/count/writeoff inventory, but cannot void sales or approve expenses
    expect(hasAnyPermission(stockPerms, ["inventory.adjust"])).toBe(true);
    expect(hasAnyPermission(stockPerms, ["inventory.count"])).toBe(true);
    expect(hasAnyPermission(stockPerms, ["inventory.writeoff"])).toBe(true);
    expect(hasAnyPermission(stockPerms, ["sales.void"])).toBe(false);
    expect(hasAnyPermission(stockPerms, ["expenses.approve"])).toBe(false);

    // Procurement Officer can create/approve purchases and manage suppliers, but cannot adjust stock arbitrarily
    expect(hasAnyPermission(procurementPerms, ["purchases.create"])).toBe(true);
    expect(hasAnyPermission(procurementPerms, ["purchases.approve"])).toBe(true);
    expect(hasAnyPermission(procurementPerms, ["suppliers.edit"])).toBe(true);
    expect(hasAnyPermission(procurementPerms, ["inventory.adjust"])).toBe(false);

    // Accountant can approve expenses and view financial reports/eTIMS, but cannot alter inventory
    expect(hasAnyPermission(accountantPerms, ["expenses.approve"])).toBe(true);
    expect(hasAnyPermission(accountantPerms, ["reports.financial"])).toBe(true);
    expect(hasAnyPermission(accountantPerms, ["etims.retry"])).toBe(true);
    expect(hasAnyPermission(accountantPerms, ["inventory.adjust"])).toBe(false);

    // Auditor is strictly read-only
    expect(hasAnyPermission(auditorPerms, ["audit.read"])).toBe(true);
    expect(hasAnyPermission(auditorPerms, ["reports.sales"])).toBe(true);
    expect(hasAnyPermission(auditorPerms, ["sales.create"])).toBe(false);
    expect(hasAnyPermission(auditorPerms, ["inventory.adjust"])).toBe(false);
    expect(hasAnyPermission(auditorPerms, ["products.write"])).toBe(false);
  });

  it("blocks disabled industry modules (hotel, restaurant, pharmacy, services) in WINES_SPIRITS edition", () => {
    const ownerPerms = ROLE_PERMISSION_TEMPLATES[SystemRole.BusinessOwner]!;

    for (const disabledMod of ["hotel", "restaurant", "pharmacy", "services"]) {
      const check = mockContext({
        userPermissions: ownerPerms,
        requiredPermissions: ["sales.read"],
        requiredModule: disabledMod,
      });
      expect(() => check.guard.canActivate(check.ctx)).toThrow(ForbiddenException);
    }

    for (const enabledMod of ["wines_spirits", "retail", "wholesale", "e_tims"]) {
      const check = mockContext({
        userPermissions: ownerPerms,
        requiredPermissions: ["sales.read"],
        requiredModule: enabledMod,
      });
      expect(check.guard.canActivate(check.ctx)).toBe(true);
    }
  });
});
