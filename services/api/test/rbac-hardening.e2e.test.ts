/**
 * Wines & Spirits RBAC / auth hardening suite (Definition of Done §18).
 * Uses live DB when available; otherwise skips cleanly.
 */
import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import * as bcrypt from "bcryptjs";
import { createPrismaClient } from "@sokoos/database";
import { SystemRole } from "@sokoos/shared";
import { ROLE_PERMISSION_TEMPLATES } from "../src/roles/roles.service";

const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://sokoos:sokoos@127.0.0.1:5432/sokoos_wines_spirits?schema=public";

describe("Wines & Spirits — RBAC / password / price gating", () => {
  let app: INestApplication | null = null;
  let baseUrl = "";
  let dbAvailable = false;
  const prisma = createPrismaClient(DB_URL);
  const suffix = randomUUID().slice(0, 8);
  const ownerEmail = `owner.rbac.${suffix}@jaywines.test`;
  const managerEmail = `manager.rbac.${suffix}@jaywines.test`;
  const agentEmail = `agent.rbac.${suffix}@jaywines.test`;
  const inactiveEmail = `inactive.rbac.${suffix}@jaywines.test`;
  const ownerPass = "OwnerPass123!";
  const agentTempPass = "TempAgent123!";
  const agentNewPass = "AgentNew456!";
  let tenantId = "";
  let ownerRoleId = "";
  let managerRoleId = "";
  let agentRoleId = "";
  let productId = "";
  let ownerToken = "";
  let agentToken = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    process.env.JWT_ACCESS_SECRET = "dev-only-wines-spirits-access-secret-min-32-chars";
    process.env.JWT_REFRESH_SECRET = "dev-only-wines-spirits-refresh-secret-min-32-chars";

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    // Ensure jaywines exists (do not wipe); create isolated users under it or create tenant if missing
    let tenant = await prisma.tenant.findUnique({ where: { slug: "jaywines" } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: "JAYWINES",
          slug: "jaywines",
          currency: "KES",
          timezone: "Africa/Nairobi",
          locale: "en-KE",
          status: "active",
          businessTypes: ["wines_spirits"],
          modulesEnabled: { retail: true, hotel: false, restaurant: false, pharmacy: false },
        },
      });
      await prisma.authzVersion.create({ data: { tenantId: tenant.id, version: 1 } });
      const branch = await prisma.branch.create({
        data: { tenantId: tenant.id, name: "MAIN BRANCH", code: "MAIN", status: "active" },
      });
      await prisma.warehouse.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          name: "Main Cellar",
          isDefault: true,
          status: "active",
        },
      });
    }
    tenantId = tenant.id;

    const { CORE_PERMISSION_KEYS } = await import("@sokoos/types");
    for (const key of CORE_PERMISSION_KEYS) {
      await prisma.permission.upsert({
        where: { key },
        create: { key, description: key, category: key.split(".")[0] ?? "core" },
        update: {},
      });
    }

    async function ensureRole(key: string, name: string, perms: readonly string[]) {
      let role = await prisma.role.findFirst({ where: { tenantId, key } });
      if (!role) {
        role = await prisma.role.create({
          data: { tenantId, key, name, isSystem: true },
        });
      }
      const permRows = await prisma.permission.findMany({ where: { key: { in: [...perms] } } });
      for (const p of permRows) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
          create: { roleId: role.id, permissionId: p.id },
          update: {},
        });
      }
      // Re-sync: replace with template for sales_agent / sales_attendant
      if (key === SystemRole.SalesAgent || key === SystemRole.SalesAttendant) {
        await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        for (const p of permRows) {
          await prisma.rolePermission.create({
            data: { roleId: role.id, permissionId: p.id },
          });
        }
      }
      return role.id;
    }

    ownerRoleId = await ensureRole(
      SystemRole.BusinessOwner,
      "Business Owner",
      ROLE_PERMISSION_TEMPLATES[SystemRole.BusinessOwner] ?? [],
    );
    managerRoleId = await ensureRole(
      SystemRole.BranchManager,
      "Branch Manager",
      ROLE_PERMISSION_TEMPLATES[SystemRole.BranchManager] ?? [],
    );
    agentRoleId = await ensureRole(
      SystemRole.SalesAgent,
      "Sales Agent",
      ROLE_PERMISSION_TEMPLATES[SystemRole.SalesAgent] ?? [],
    );

    async function makeUser(
      email: string,
      password: string,
      roleId: string,
      opts: { mustChangePassword?: boolean; status?: string } = {},
    ) {
      const hash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: {
          tenantId,
          email,
          name: email.split("@")[0]!,
          passwordHash: hash,
          status: opts.status ?? "active",
          mustChangePassword: opts.mustChangePassword ?? false,
        },
      });
      await prisma.userRole.create({
        data: { tenantId, userId: user.id, roleId, branchId: null },
      });
      return user;
    }

    await makeUser(ownerEmail, ownerPass, ownerRoleId);
    await makeUser(managerEmail, "ManagerPass123!", managerRoleId);
    await makeUser(agentEmail, agentTempPass, agentRoleId, { mustChangePassword: true });
    await makeUser(inactiveEmail, "InactivePass123!", agentRoleId, { status: "disabled" });

    const product = await prisma.product.create({
      data: {
        tenantId,
        sku: `RBAC-${suffix}`,
        name: `RBAC Test Bottle ${suffix}`,
        priceMinor: 250000,
        costMinor: 180000,
        status: "active",
        trackInventory: true,
      },
    });
    productId = product.id;

    const mod = (await import("../dist/app.module.js")) as { AppModule: unknown };
    app = await NestFactory.create(mod.AppModule as never, { logger: false });
    app.use((req: { url: string }, _res: unknown, next: () => void) => {
      if (req.url === "/api/v1" || req.url.startsWith("/api/v1/") || req.url.startsWith("/api/v1?")) {
        req.url = req.url.slice(4);
      }
      next();
    });
    app.setGlobalPrefix("v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, "127.0.0.1");
    const addr = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/v1`;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbAvailable && tenantId) {
      try {
        await prisma.product.deleteMany({ where: { id: productId } });
        await prisma.userRole.deleteMany({
          where: {
            user: {
              email: { in: [ownerEmail, managerEmail, agentEmail, inactiveEmail] },
            },
          },
        });
        await prisma.refreshToken.deleteMany({
          where: {
            user: {
              email: { in: [ownerEmail, managerEmail, agentEmail, inactiveEmail] },
            },
          },
        });
        await prisma.user.deleteMany({
          where: { email: { in: [ownerEmail, managerEmail, agentEmail, inactiveEmail] } },
        });
      } catch {
        /* best-effort cleanup */
      }
    }
    await prisma.$disconnect();
  });

  async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  }

  it("covers the 20 verification points for auth, RBAC, price gating, and JAYWINES integrity", async () => {
    if (!dbAvailable) {
      console.warn("Skipping RBAC e2e — PostgreSQL not reachable");
      return;
    }

    // 1. Owner login (no store code — resolves jaywines)
    const ownerLogin = await api("/auth/login", {
      method: "POST",
      body: { email: ownerEmail, password: ownerPass },
    });
    expect(ownerLogin.status).toBe(201);
    expect(ownerLogin.body.data.tenant.slug).toBe("jaywines");
    ownerToken = ownerLogin.body.data.accessToken;

    // 2. Manager login
    const managerLogin = await api("/auth/login", {
      method: "POST",
      body: { email: managerEmail, password: "ManagerPass123!" },
    });
    expect(managerLogin.status).toBe(201);

    // 3. Sales Agent login
    const agentLogin = await api("/auth/login", {
      method: "POST",
      body: { email: agentEmail, password: agentTempPass },
    });
    expect(agentLogin.status).toBe(201);
    expect(agentLogin.body.data.mustChangePassword).toBe(true);
    agentToken = agentLogin.body.data.accessToken;

    // 4. First-login password-change requirement blocks normal APIs
    const blocked = await api("/users", { token: agentToken });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error?.code ?? blocked.body.code).toMatch(/PASSWORD_CHANGE_REQUIRED|FORBIDDEN/);

    // 5. Successful password change
    const changed = await api("/auth/change-password", {
      method: "POST",
      token: agentToken,
      body: {
        currentPassword: agentTempPass,
        newPassword: agentNewPass,
        confirmPassword: agentNewPass,
      },
    });
    expect(changed.status).toBe(201);
    expect(changed.body.data.mustChangePassword).toBe(false);
    agentToken = changed.body.data.accessToken;

    // 6. Old password rejected after change
    const oldPass = await api("/auth/login", {
      method: "POST",
      body: { email: agentEmail, password: agentTempPass },
    });
    expect(oldPass.status).toBe(401);

    const newLogin = await api("/auth/login", {
      method: "POST",
      body: { email: agentEmail, password: agentNewPass },
    });
    expect(newLogin.status).toBe(201);
    agentToken = newLogin.body.data.accessToken;
    const agentPerms: string[] = newLogin.body.data.permissions ?? [];
    expect(agentPerms).toContain("sales.create");
    expect(agentPerms).toContain("sales.view_own");
    expect(agentPerms).toContain("sales.reprint");
    expect(agentPerms).toContain("pos.customers");
    expect(agentPerms).not.toContain("users.read");
    expect(agentPerms).not.toContain("products.read");
    expect(agentPerms).not.toContain("products.change_price");
    expect(agentPerms).not.toContain("inventory.read");
    expect(agentPerms).not.toContain("reports.read");

    // 7. Sales Agent can access POS (products list for catalog + sales.create)
    const catalog = await api("/products?limit=5", { token: agentToken });
    expect(catalog.status).toBe(200);

    // 8. Sales Agent cannot access users API
    const usersDenied = await api("/users", { token: agentToken });
    expect(usersDenied.status).toBe(403);

    // 9. Sales Agent cannot access products administration (write)
    const productWrite = await api("/products", {
      method: "POST",
      token: agentToken,
      body: { sku: `X-${suffix}`, name: "Nope", priceMinor: 100 },
    });
    expect(productWrite.status).toBe(403);

    // 10. Sales Agent cannot change prices
    const priceDenied = await api(`/products/${productId}`, {
      method: "PATCH",
      token: agentToken,
      body: { priceMinor: 999999 },
    });
    expect(priceDenied.status).toBe(403);

    // 11. Sales Agent cannot access inventory administration
    const invDenied = await api("/inventory/adjust", {
      method: "POST",
      token: agentToken,
      body: { productId, warehouseId: randomUUID(), quantity: 1, reason: "test" },
    });
    expect([403, 404]).toContain(invDenied.status);

    // 12. Sales Agent cannot access reports
    const reportsDenied = await api("/reports/comprehensive", { token: agentToken });
    expect(reportsDenied.status).toBe(403);

    // 13. Owner can create user
    const createdEmail = `created.${suffix}@jaywines.test`;
    const createUser = await api("/users", {
      method: "POST",
      token: ownerToken,
      body: {
        name: "Created Agent",
        email: createdEmail,
        password: "TempCreate99!",
        roleId: agentRoleId,
      },
    });
    expect(createUser.status).toBe(201);
    expect(createUser.body.data.mustChangePassword).toBe(true);
    const createdUserId = createUser.body.data.id as string;

    // 14. Owner can assign role
    const assign = await api(`/users/${createdUserId}/roles`, {
      method: "POST",
      token: ownerToken,
      body: { roleId: managerRoleId },
    });
    expect([200, 201]).toContain(assign.status);

    // 15. Owner can assign individual permissions (custom role)
    const customRole = await api("/roles", {
      method: "POST",
      token: ownerToken,
      body: {
        key: `senior_sales_${suffix}`,
        name: `Senior Sales ${suffix}`,
        permissionKeys: ["sales.create", "sales.view_own", "sales.reprint", "products.view"],
      },
    });
    expect(customRole.status).toBe(201);
    const customRoleId = customRole.body.data.id as string;
    const setPerms = await api(`/roles/${customRoleId}/permissions`, {
      method: "PUT",
      token: ownerToken,
      body: {
        permissionKeys: [
          "sales.create",
          "sales.view_own",
          "sales.reprint",
          "products.read",
          "products.view",
        ],
      },
    });
    expect([200, 201]).toContain(setPerms.status);

    // 16. Product price can be changed by authorized user (owner)
    const priceOk = await api(`/products/${productId}`, {
      method: "PATCH",
      token: ownerToken,
      body: { priceMinor: 260000 },
    });
    expect([200, 201]).toContain(priceOk.status);
    expect(priceOk.body.data.priceMinor).toBe(260000);

    // 17. Unauthorized price change returns 403 — stock controller style user without change_price
    // Re-use agent (no change_price) after password change — already tested in #10.
    // Also: manager has change_price — verify stock-like denial via agent remains 403
    const priceAgain = await api(`/products/${productId}`, {
      method: "PATCH",
      token: agentToken,
      body: { priceMinor: 1 },
    });
    expect(priceAgain.status).toBe(403);

    // 18. Inactive user cannot authenticate
    const inactive = await api("/auth/login", {
      method: "POST",
      body: { email: inactiveEmail, password: "InactivePass123!" },
    });
    expect(inactive.status).toBe(401);

    // 19. Demo tenant/credentials are not required / demo slug rejected as preferred path
    const demoLogin = await api("/auth/login", {
      method: "POST",
      body: { email: ownerEmail, password: ownerPass, tenantSlug: "demo" },
    });
    // demo slug is ignored; jaywines user should still authenticate
    expect(demoLogin.status).toBe(201);
    expect(demoLogin.body.data.tenant.slug).toBe("jaywines");

    // 20. Existing JAYWINES tenant remains intact
    const jay = await prisma.tenant.findUnique({ where: { slug: "jaywines" } });
    expect(jay).toBeTruthy();
    expect(jay!.id).toBe(tenantId);
    expect(jay!.name.length).toBeGreaterThan(0);

    // Cleanup created user/role
    await prisma.userRole.deleteMany({ where: { userId: createdUserId } });
    await prisma.user.delete({ where: { id: createdUserId } }).catch(() => undefined);
    await prisma.rolePermission.deleteMany({ where: { roleId: customRoleId } });
    await prisma.role.delete({ where: { id: customRoleId } }).catch(() => undefined);
  }, 90_000);
});
