import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { CORE_PERMISSION_KEYS } from "@sokoos/types";
import { SystemRole } from "@sokoos/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Default permission sets for platform and Wines & Spirits role templates. */
export const ROLE_PERMISSION_TEMPLATES: Record<string, readonly string[]> = {
  [SystemRole.PlatformOwner]: CORE_PERMISSION_KEYS.filter((k) => k.startsWith("platform.")),
  [SystemRole.BusinessOwner]: CORE_PERMISSION_KEYS.filter(
    (k) => !k.startsWith("platform."),
  ),
  [SystemRole.GeneralManager]: CORE_PERMISSION_KEYS.filter(
    (k) => !k.startsWith("platform."),
  ),
  [SystemRole.BranchManager]: [
    "branches.read",
    "devices.read",
    "devices.write",
    "users.read",
    "users.view",
    "users.invite",
    "users.edit",
    "users.create",
    "users.deactivate",
    "users.assign_roles",
    "users.reset_password",
    "roles.read",
    "roles.view",
    "products.read",
    "products.view",
    "products.write",
    "products.create",
    "products.edit",
    "products.change_price",
    "products.archive",
    "products.import",
    "categories.read",
    "categories.write",
    "inventory.read",
    "inventory.view",
    "inventory.receive",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.count",
    "inventory.writeoff",
    "sales.create",
    "sales.read",
    "sales.view",
    "sales.void",
    "sales.refund",
    "sales.discount",
    "sales.reprint",
    "returns.create",
    "returns.read",
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
    "expenses.read",
    "expenses.view",
    "expenses.write",
    "expenses.create",
    "expenses.approve",
    "reports.read",
    "reports.view",
    "reports.sales",
    "reports.inventory",
    "reports.purchases",
    "reports.financial",
    "reports.export",
    "etims.view",
    "etims.submit",
    "etims.retry",
    "audit.read",
    "audit.view",
    "notifications.read",
    "tenant.settings.read",
    "settings.view",
    "deliveries.read",
    "deliveries.write",
    "messages.read",
    "messages.write",
    "customers.read",
    "customers.view",
    "customers.write",
    "customers.create",
    "customers.edit",
    "customers.credit",
  ],
  [SystemRole.Cashier]: [
    "sales.create",
    "sales.view_own",
    "sales.reprint",
    "pos.customers",
  ],
  /** Legacy key — locked down to POS-only (same as SalesAgent). */
  [SystemRole.SalesAttendant]: [
    "sales.create",
    "sales.view_own",
    "sales.reprint",
    "pos.customers",
  ],
  /** SALES_AGENT — POS operator only. Catalog via sales.create; customers via pos.customers. */
  [SystemRole.SalesAgent]: [
    "sales.create",
    "sales.view_own",
    "sales.reprint",
    "pos.customers",
  ],
  [SystemRole.StockController]: [
    "products.read",
    "products.view",
    "products.write",
    "products.create",
    "products.edit",
    "categories.read",
    "categories.write",
    "inventory.read",
    "inventory.view",
    "inventory.receive",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.count",
    "inventory.writeoff",
    "purchases.read",
    "purchases.view",
    "purchases.receive",
    "suppliers.read",
    "suppliers.view",
    "reports.read",
    "reports.view",
    "reports.inventory",
    "notifications.read",
  ],
  [SystemRole.InventoryOfficer]: [
    "products.read",
    "products.view",
    "products.write",
    "products.create",
    "products.edit",
    "categories.read",
    "inventory.read",
    "inventory.view",
    "inventory.receive",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.count",
    "inventory.writeoff",
    "purchases.read",
    "purchases.view",
    "purchases.receive",
    "suppliers.read",
    "suppliers.view",
    "reports.read",
    "reports.view",
    "reports.inventory",
    "notifications.read",
  ],
  [SystemRole.ProcurementOfficer]: [
    "products.read",
    "products.view",
    "categories.read",
    "inventory.read",
    "inventory.view",
    "inventory.receive",
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
    "reports.read",
    "reports.purchases",
    "notifications.read",
  ],
  [SystemRole.PurchasingOfficer]: [
    "products.read",
    "products.view",
    "categories.read",
    "inventory.read",
    "inventory.view",
    "inventory.receive",
    "purchases.read",
    "purchases.view",
    "purchases.write",
    "purchases.create",
    "purchases.receive",
    "suppliers.read",
    "suppliers.view",
    "suppliers.write",
    "suppliers.create",
    "suppliers.edit",
    "reports.read",
    "reports.purchases",
    "notifications.read",
  ],
  [SystemRole.Accountant]: [
    "products.read",
    "products.view",
    "inventory.read",
    "inventory.view",
    "sales.read",
    "sales.view",
    "returns.read",
    "purchases.read",
    "purchases.view",
    "suppliers.read",
    "suppliers.view",
    "customers.read",
    "customers.view",
    "customers.credit",
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
    "etims.view",
    "etims.submit",
    "etims.retry",
    "audit.read",
    "notifications.read",
  ],
  [SystemRole.Auditor]: [
    "products.read",
    "products.view",
    "categories.read",
    "inventory.read",
    "inventory.view",
    "sales.read",
    "sales.view",
    "returns.read",
    "purchases.read",
    "purchases.view",
    "suppliers.read",
    "suppliers.view",
    "customers.read",
    "customers.view",
    "expenses.read",
    "expenses.view",
    "reports.read",
    "reports.sales",
    "reports.inventory",
    "reports.purchases",
    "reports.financial",
    "etims.view",
    "audit.read",
    "notifications.read",
  ],
};

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserPermissionKeys(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    const keys = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) {
        keys.add(rp.permission.key);
      }
    }
    return [...keys].sort();
  }

  async getAuthzVersion(tenantId: string): Promise<number> {
    const row = await this.prisma.authzVersion.findUnique({
      where: { tenantId },
    });
    return row?.version ?? 1;
  }

  async bumpAuthzVersion(tenantId: string): Promise<number> {
    const row = await this.prisma.authzVersion.upsert({
      where: { tenantId },
      create: { tenantId, version: 1 },
      update: { version: { increment: 1 } },
    });
    return row.version;
  }

  async listRoles(tenantId: string) {
    // Tenant-scoped only — never surface platform roles (null tenantId / platform_* keys)
    return this.prisma.role.findMany({
      where: { tenantId },
      include: {
        rolePermissions: { include: { permission: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: "asc" } });
  }

  async getRole(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: {
        rolePermissions: { include: { permission: true } },
      },
    });
    if (!role) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Role not found" });
    }
    return role;
  }

  async createRole(
    tenantId: string,
    input: { key: string; name: string; permissionKeys?: string[] },
  ) {
    if (input.key === "platform_owner" || input.key.startsWith("platform_")) {
      throw new ConflictException({
        code: "PLATFORM_ROLE_FORBIDDEN",
        message: "Cannot create platform-scoped roles in a tenant",
      });
    }
    const existing = await this.prisma.role.findFirst({
      where: { tenantId, key: input.key },
    });
    if (existing) {
      throw new ConflictException({
        code: "CONFLICT",
        message: "Role key already exists",
      });
    }

    const role = await this.prisma.role.create({
      data: {
        tenantId,
        key: input.key,
        name: input.name,
        isSystem: false,
      },
    });

    if (input.permissionKeys?.length) {
      await this.setRolePermissions(tenantId, role.id, input.permissionKeys);
    }

    await this.bumpAuthzVersion(tenantId);
    return this.getRole(tenantId, role.id);
  }

  async setRolePermissions(
    tenantId: string,
    roleId: string,
    permissionKeys: string[],
  ) {
    const role = await this.getRole(tenantId, roleId);
    if (role.isSystem && role.tenantId === null) {
      throw new ConflictException({
        code: "CONFLICT",
        message: "Cannot modify platform system role permissions",
      });
    }
    if (permissionKeys.some((k) => k.startsWith("platform."))) {
      throw new ConflictException({
        code: "PLATFORM_PERMISSION_FORBIDDEN",
        message: "Platform permissions cannot be granted through tenant roles",
      });
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({
            roleId,
            permissionId: p.id,
          })),
        });
      }
    });

    await this.bumpAuthzVersion(tenantId);
    return this.getRole(tenantId, roleId);
  }

  /** Ensure CORE_PERMISSION_KEYS exist in DB. */
  async ensurePermissionsSeeded(): Promise<void> {
    for (const key of CORE_PERMISSION_KEYS) {
      await this.prisma.permission.upsert({
        where: { key },
        create: {
          key,
          description: key,
          category: key.split(".")[0] ?? "core",
        },
        update: {},
      });
    }
  }
}
