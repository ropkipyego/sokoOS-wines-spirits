/**
 * Production / Clean Store Bootstrap (ZERO Synthetic Demo Products, Sales, or Stock):
 *
 * Initializes a clean Wines & Spirits business database with ONLY:
 * 1. Core RBAC permission keys (99 keys)
 * 2. The tenant business profile (Name, Store Code/Slug, Currency, Timezone)
 * 3. One primary branch (e.g. MAIN) and one default warehouse (Main Cellar)
 * 4. Standard Wines & Spirits role templates (Business Owner, General Manager,
 *    Branch Manager, Cashier, Sales Attendant, Stock Controller, Procurement Officer,
 *    Accountant, Auditor)
 * 5. Standard packaging units (Bottle, Case, Can, Pack, Keg, Piece) and optional
 *    Wines & Spirits categories (Whisky, Vodka, Gin, Wine, Beer, etc.)
 * 6. The initial Business Owner account so the client can sign in and import their
 *    real catalogue via CSV or create products in the UI.
 *
 * Usage:
 *   BOOTSTRAP_BUSINESS_NAME="Vortex Wines & Spirits" \
 *   BOOTSTRAP_TENANT_SLUG="vortex" \
 *   BOOTSTRAP_OWNER_NAME="Store Owner" \
 *   BOOTSTRAP_OWNER_EMAIL="admin@yourdomain.com" \
 *   BOOTSTRAP_OWNER_PASSWORD="YourStrongPassword123!" \
 *   pnpm db:bootstrap
 */
import "reflect-metadata";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as bcrypt from "bcryptjs";
import { createPrismaClient } from "@sokoos/database";
import { CORE_PERMISSION_KEYS, EDITION_CONFIGS } from "@sokoos/types";
import { SystemRole } from "@sokoos/shared";
import { ROLE_PERMISSION_TEMPLATES } from "../roles/roles.service";
import { KENYA_WINES_SPIRITS_TAXONOMY } from "./taxonomy";

function loadEnvFallback() {
  if (process.env.DATABASE_URL) return;
  for (const rel of [".env", "../../.env"]) {
    const p = resolve(process.cwd(), rel);
    if (existsSync(p)) {
      const lines = readFileSync(p, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq > 0) {
          const key = trimmed.slice(0, eq).trim();
          const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgresql://sokoos:sokoos@127.0.0.1:5432/sokoos_wines_spirits?schema=public";
  }
}

loadEnvFallback();

const prisma = createPrismaClient(process.env.DATABASE_URL);

function displayRoleName(key: string): string {
  const labels: Record<string, string> = {
    business_owner: "Owner",
    general_manager: "Manager",
    branch_manager: "Manager",
    cashier: "Cashier",
    sales_agent: "Sales Agent",
    sales_attendant: "Sales Agent",
    stock_controller: "Stock Controller",
    accountant: "Accountant",
    auditor: "Auditor",
  };
  return labels[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  const businessName = (process.env.BOOTSTRAP_BUSINESS_NAME ?? "JAYWINES").trim();
  const tenantSlug = (process.env.BOOTSTRAP_TENANT_SLUG ?? "jaywines")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const ownerName = (process.env.BOOTSTRAP_OWNER_NAME ?? "Business Owner").trim();
  const ownerEmail = (process.env.BOOTSTRAP_OWNER_EMAIL ?? "owner@jaywines.local")
    .trim()
    .toLowerCase();
  const ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD;
  const branchName = (process.env.BOOTSTRAP_BRANCH_NAME ?? "MAIN BRANCH").trim();
  const branchCode = (process.env.BOOTSTRAP_BRANCH_CODE ?? "MAIN").trim().toUpperCase();
  const warehouseName = (process.env.BOOTSTRAP_WAREHOUSE_NAME ?? "Main Cellar & Counter").trim();
  const includeCategories = process.env.BOOTSTRAP_SKIP_CATEGORIES !== "true";
  const forcePasswordChange = process.env.BOOTSTRAP_FORCE_PASSWORD_CHANGE !== "false";

  if (!ownerPassword || ownerPassword.length < 10) {
    throw new Error(
      "BOOTSTRAP_OWNER_PASSWORD is required and must be at least 10 characters. Refusing default credentials.",
    );
  }

  console.log(`Bootstrapping clean Wines & Spirits store '${businessName}' (slug: ${tenantSlug})…`);

  // 1. Permissions
  for (const key of CORE_PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      create: {
        key,
        description: key,
        category: key.split(".")[0] ?? "core",
      },
      update: {},
    });
  }

  const edition = EDITION_CONFIGS.WINES_SPIRITS;

  // 2. Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    create: {
      name: businessName,
      slug: tenantSlug,
      currency: process.env.BOOTSTRAP_CURRENCY ?? "KES",
      timezone: process.env.BOOTSTRAP_TIMEZONE ?? "Africa/Nairobi",
      locale: process.env.BOOTSTRAP_LOCALE ?? "en-KE",
      status: "active",
      businessTypes: ["wines_spirits", "retail", "wholesale"],
      modulesEnabled: edition.modulesAllowed,
      settings: {
        negativeStockPolicy: "block",
        businessMode: "retail",
        restaurantEnabled: false,
      },
    },
    update: {
      name: businessName,
      modulesEnabled: edition.modulesAllowed,
    },
  });

  await prisma.authzVersion.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, version: 1 },
    update: {},
  });

  // 3. Primary Branch & Default Warehouse
  let branch = await prisma.branch.findFirst({
    where: { tenantId: tenant.id, code: branchCode },
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: branchName,
        code: branchCode,
        status: "active",
      },
    });
  }

  let warehouse = await prisma.warehouse.findFirst({
    where: { tenantId: tenant.id, branchId: branch.id, isDefault: true },
  });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        name: warehouseName,
        isDefault: true,
        status: "active",
      },
    });
  }

  // 4. Role Templates
  let ownerRoleId = "";
  for (const [key, perms] of Object.entries(ROLE_PERMISSION_TEMPLATES)) {
    if (key === SystemRole.PlatformOwner) continue;
    let role = await prisma.role.findFirst({
      where: { tenantId: tenant.id, key },
    });
    if (!role) {
      role = await prisma.role.create({
        data: {
          tenantId: tenant.id,
          key,
          name: displayRoleName(key),
          isSystem: true,
        },
      });
    }
    const permRows = await prisma.permission.findMany({
      where: { key: { in: [...perms] } },
    });
    // Fully resync POS lockdown roles so upgraded installs lose broad legacy grants
    if (key === SystemRole.SalesAgent || key === SystemRole.SalesAttendant) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permRows.length) {
        await prisma.rolePermission.createMany({
          data: permRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
        });
      }
    } else {
      for (const p of permRows) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
          create: { roleId: role.id, permissionId: p.id },
          update: {},
        });
      }
    }
    // Ensure owners/managers retain products.change_price after permission expansion
    if (
      key === SystemRole.BusinessOwner ||
      key === SystemRole.GeneralManager ||
      key === SystemRole.BranchManager
    ) {
      const pricePerm = await prisma.permission.findUnique({
        where: { key: "products.change_price" },
      });
      if (pricePerm) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: pricePerm.id },
          },
          create: { roleId: role.id, permissionId: pricePerm.id },
          update: {},
        });
      }
    }
    if (key === SystemRole.BusinessOwner) {
      ownerRoleId = role.id;
    }
  }

  // 5. Standard Packaging Units & Empty Categories (No Demo Products or Stock)
  for (const u of edition.defaultUnits) {
    await prisma.unit.upsert({
      where: {
        tenantId_abbreviation: {
          tenantId: tenant.id,
          abbreviation: u.abbreviation,
        },
      },
      create: {
        tenantId: tenant.id,
        name: u.name,
        abbreviation: u.abbreviation,
      },
      update: { name: u.name },
    });
  }

  if (includeCategories) {
    for (let i = 0; i < KENYA_WINES_SPIRITS_TAXONOMY.length; i++) {
      const node = KENYA_WINES_SPIRITS_TAXONOMY[i]!;
      let parentCat = await prisma.category.findFirst({
        where: { tenantId: tenant.id, name: node.name },
      });
      if (!parentCat) {
        parentCat = await prisma.category.create({
          data: { tenantId: tenant.id, name: node.name, sortOrder: i },
        });
      }

      if (node.subcategories?.length) {
        for (let j = 0; j < node.subcategories.length; j++) {
          const subName = node.subcategories[j]!;
          const existingSub = await prisma.category.findFirst({
            where: { tenantId: tenant.id, name: subName, parentId: parentCat.id },
          });
          if (!existingSub) {
            await prisma.category.create({
              data: {
                tenantId: tenant.id,
                name: subName,
                parentId: parentCat.id,
                sortOrder: j,
              },
            });
          }
        }
      }
    }
  }


  // 6. Initial Owner User
  const passwordHash = await bcrypt.hash(ownerPassword, 12);
  let owner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: ownerEmail },
  });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: ownerEmail,
        name: ownerName,
        passwordHash,
        status: "active",
        mustChangePassword: forcePasswordChange,
      },
    });
  } else {
    owner = await prisma.user.update({
      where: { id: owner.id },
      data: {
        name: ownerName,
        passwordHash,
        status: "active",
        mustChangePassword: forcePasswordChange,
      },
    });
  }

  const binding = await prisma.userRole.findFirst({
    where: { tenantId: tenant.id, userId: owner.id, roleId: ownerRoleId },
  });
  if (!binding) {
    await prisma.userRole.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        roleId: ownerRoleId,
        branchId: null,
      },
    });
  }

  console.log("Clean Wines & Spirits production bootstrap complete (0 demo products, 0 demo sales).");
  console.log({
    businessName: tenant.name,
    storeCode: tenant.slug,
    branch: `${branch.name} (${branch.code})`,
    warehouse: warehouse.name,
    ownerEmail: owner.email,
    unitsSeeded: edition.defaultUnits.length,
    categoriesSeeded: includeCategories ? edition.defaultCategories.length : 0,
    productsSeeded: 0,
    salesSeeded: 0,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
