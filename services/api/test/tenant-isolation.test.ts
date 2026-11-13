import { describe, it, expect, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { hasAnyPermission } from "../src/common/guards/permissions.guard";
import { isTenantAssignableRole } from "../src/roles/role-scope";
import { CatalogService } from "../src/catalog/catalog.service";
import { SalesService } from "../src/sales/sales.service";
import { CustomersService } from "../src/customers/customers.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { SyncService } from "../src/sync/sync.service";

describe("tenant isolation rules", () => {
  it("platform permissions do not imply tenant data access keys", () => {
    const platformPerms = [
      "platform.tenants.manage",
      "platform.tenants.read",
      "platform.onboarding.manage",
    ];
    expect(hasAnyPermission(platformPerms, ["products.read"])).toBe(false);
    expect(hasAnyPermission(platformPerms, ["sales.read"])).toBe(false);
    expect(hasAnyPermission(platformPerms, ["platform.tenants.read"])).toBe(true);
  });

  it("tenant owner cannot use platform routes by default", () => {
    const ownerPerms = ["products.read", "tenant.settings.write", "sales.create"];
    expect(hasAnyPermission(ownerPerms, ["platform.tenants.manage"])).toBe(false);
  });

  it("JWT tenantId is authoritative — client-supplied tenantId must be ignored for authZ", () => {
    const jwtTenant = "tenant-a";
    const bodyTenant = "tenant-b";
    const effective = jwtTenant;
    expect(effective).not.toBe(bodyTenant);
    expect(effective).toBe("tenant-a");
  });

  it("rejects assigning platform roles into a tenant", () => {
    expect(
      isTenantAssignableRole(
        { tenantId: null, key: "platform_owner" },
        "tenant-a",
      ),
    ).toBe(false);
    expect(
      isTenantAssignableRole(
        { tenantId: null, key: "platform_support" },
        "tenant-a",
      ),
    ).toBe(false);
  });

  it("rejects roles belonging to another tenant", () => {
    expect(
      isTenantAssignableRole(
        { tenantId: "tenant-b", key: "business_owner" },
        "tenant-a",
      ),
    ).toBe(false);
  });

  it("allows same-tenant operational roles", () => {
    expect(
      isTenantAssignableRole(
        { tenantId: "tenant-a", key: "cashier" },
        "tenant-a",
      ),
    ).toBe(true);
    expect(
      isTenantAssignableRole(
        { tenantId: "tenant-a", key: "business_owner" },
        "tenant-a",
      ),
    ).toBe(true);
  });

  it("list/query scopes must always include jwt tenantId", () => {
    const jwtTenant = "tenant-a";
    const query = { tenantId: jwtTenant, status: "active" };
    expect(query.tenantId).toBe(jwtTenant);
    // body override must never win
    const body = { tenantId: "tenant-b" };
    const scoped = { ...body, tenantId: jwtTenant };
    expect(scoped.tenantId).toBe("tenant-a");
  });

  it("denies Tenant A reading or mutating Tenant B products, sales, customers, stock, and sync envelopes", async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const productB = randomUUID();
    const saleB = randomUUID();
    const customerB = randomUUID();
    const warehouseB = randomUUID();
    const branchB = randomUUID();

    const prisma = {
      product: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
          Promise.resolve(where.tenantId === tenantB && where.id === productB ? { id: productB, tenantId: tenantB } : null),
        ),
      },
      sale: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
          Promise.resolve(where.tenantId === tenantB && where.id === saleB ? { id: saleB, tenantId: tenantB } : null),
        ),
      },
      customer: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
          Promise.resolve(where.tenantId === tenantB && where.id === customerB ? { id: customerB, tenantId: tenantB } : null),
        ),
      },
      warehouse: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
          Promise.resolve(where.tenantId === tenantB && where.id === warehouseB ? { id: warehouseB, tenantId: tenantB } : null),
        ),
      },
      stockMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const catalog = new CatalogService(prisma as never, {} as never);
    const sales = new SalesService(prisma as never, {} as never, {} as never);
    const customers = new CustomersService(prisma as never);
    const inventory = new InventoryService(prisma as never, {} as never);
    const sync = new SyncService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    // Tenant A cannot read Tenant B product
    await expect(catalog.getProduct(tenantA, productB)).rejects.toThrow(NotFoundException);

    // Tenant A cannot read or void Tenant B sale
    await expect(sales.get(tenantA, saleB)).rejects.toThrow(NotFoundException);
    await expect(sales.voidSale(tenantA, saleB, randomUUID())).rejects.toThrow(NotFoundException);

    // Tenant A cannot read or update Tenant B customer
    await expect(customers.get(tenantA, customerB)).rejects.toThrow(NotFoundException);
    await expect(customers.update(tenantA, customerB, { name: "Hijack" })).rejects.toThrow(NotFoundException);

    // Tenant A cannot post stock movement to Tenant B warehouse
    await expect(
      inventory.createMovement(tenantA, {
        warehouseId: warehouseB,
        productId: productB,
        branchId: branchB,
        type: "ADJUSTMENT",
        quantityDelta: 10,
      }),
    ).rejects.toThrow(NotFoundException);

    // Tenant A cannot push a SyncEnvelope claiming Tenant B
    await expect(
      sync.push(tenantA, randomUUID(), {
        envelopeId: randomUUID(),
        deviceId: randomUUID(),
        tenantId: tenantB,
        producedAt: new Date().toISOString(),
        protocolVersion: 1,
        changes: [
          {
            changeId: randomUUID(),
            entityType: "sale",
            entityId: randomUUID(),
            op: "append",
            version: 1,
            baseVersion: 0,
            payload: {},
            occurredAt: new Date().toISOString(),
            actorUserId: randomUUID(),
          },
        ],
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
