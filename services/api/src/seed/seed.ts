/**
 * Wines & Spirits Demo Seed (Synthetic Development Data Only):
 * - Tenant "demo" ("SokoOS Wines & Spirits Demo")
 *   - Owner: demo@sokoos.local / Demo123!
 *   - Cashier: cashier@sokoos.local / Cashier123!
 *   - Stock Controller: stock@sokoos.local / Stock123!
 * - Second isolated tenant "cellar-b" ("Westlands Cellar B") for cross-tenant isolation verification
 *   - Owner: owner@cellar-b.local / CellarB123!
 * - All 14 Wines & Spirits categories, brands, units (Bottle/Case/Can/Pack),
 *   realistic synthetic SKUs including linked Bottle + Case (1 Case = 12 Bottles),
 *   suppliers, and opening stock movements + balances.
 *
 * Usage: pnpm --filter @sokoos/api seed
 */
import "reflect-metadata";
import * as bcrypt from "bcryptjs";
import { createPrismaClient } from "@sokoos/database";
import { CORE_PERMISSION_KEYS, EDITION_CONFIGS } from "@sokoos/types";
import { SystemRole } from "@sokoos/shared";
import { ROLE_PERMISSION_TEMPLATES } from "../roles/roles.service";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("Refusing to seed synthetic demo data when NODE_ENV=production.");
  process.exit(1);
}

const prisma = createPrismaClient(process.env.DATABASE_URL);

async function upsertPermission(key: string) {
  return prisma.permission.upsert({
    where: { key },
    create: {
      key,
      description: key,
      category: key.split(".")[0] ?? "core",
    },
    update: {},
  });
}

async function ensureRoleWithPermissions(
  tenantId: string | null,
  key: string,
  name: string,
  permissionKeys: readonly string[],
  isSystem = true,
) {
  let role = await prisma.role.findFirst({
    where: { tenantId, key },
  });
  if (!role) {
    role = await prisma.role.create({
      data: { tenantId, key, name, isSystem },
    });
  }

  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...permissionKeys] } },
  });

  for (const perm of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: perm.id,
        },
      },
      create: { roleId: role.id, permissionId: perm.id },
      update: {},
    });
  }

  return role;
}

async function main() {
  console.log("Seeding SokoOS Wines & Spirits synthetic demo data…");

  for (const key of CORE_PERMISSION_KEYS) {
    await upsertPermission(key);
  }
  console.log(`Permissions seeded: ${CORE_PERMISSION_KEYS.length}`);

  const edition = EDITION_CONFIGS.WINES_SPIRITS;

  // Platform owner template (tenantId null)
  const platformRole = await ensureRoleWithPermissions(
    null,
    SystemRole.PlatformOwner,
    "Platform Owner",
    CORE_PERMISSION_KEYS.filter((k) => k.startsWith("platform.")),
  );

  let tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "SokoOS Wines & Spirits — Kilimani Cellar",
        slug: "demo",
        currency: "KES",
        timezone: "Africa/Nairobi",
        locale: "en-KE",
        status: "active",
        businessTypes: ["wines_spirits", "retail", "wholesale"],
        modulesEnabled: edition.modulesAllowed,
        settings: {
          negativeStockPolicy: "block",
          businessMode: "retail",
          restaurantEnabled: false,
          company: {
            address: "Kilimani Mall, Argwings Kodhek Rd, Nairobi",
            phone: "+254 700 111 222",
            email: "sales@kilimanicellar.demo",
            taxId: "P051999888Z",
          },
          receipts: {
            profile: "80mm",
            header: "KILIMANI WINES & SPIRITS EMPORIUM",
            footer: "Strictly Not for Sale to Persons Under 18 · Goods Sold with Official Receipt",
          },
        },
      },
    });
    console.log("Created tenant demo");
  } else {
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        name: "SokoOS Wines & Spirits — Kilimani Cellar",
        businessTypes: ["wines_spirits", "retail", "wholesale"],
        modulesEnabled: edition.modulesAllowed,
      },
    });
    console.log("Updated tenant demo for Wines & Spirits edition");
  }

  await prisma.authzVersion.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, version: 1 },
    update: {},
  });

  let branch = await prisma.branch.findFirst({
    where: { tenantId: tenant.id, code: "MAIN" },
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: "Kilimani Flagship Branch",
        code: "MAIN",
        status: "active",
      },
    });
  }

  let secondBranch = await prisma.branch.findFirst({
    where: { tenantId: tenant.id, code: "KAREN" },
  });
  if (!secondBranch) {
    secondBranch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: "Karen Wine Lounge & Retail",
        code: "KAREN",
        status: "active",
      },
    });
  }

  // Seed all Wines & Spirits role templates
  const rolesByKey: Record<string, { id: string; key: string }> = {};
  for (const [key, perms] of Object.entries(ROLE_PERMISSION_TEMPLATES)) {
    if (key === SystemRole.PlatformOwner) continue;
    const role = await ensureRoleWithPermissions(
      tenant.id,
      key,
      key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      perms,
    );
    rolesByKey[key] = role;
  }

  const ownerRole = rolesByKey[SystemRole.BusinessOwner]!;
  const cashierRole = rolesByKey[SystemRole.Cashier]!;
  const stockRole = rolesByKey[SystemRole.StockController]!;

  // 1. Owner User
  const ownerHash = await bcrypt.hash("Demo123!", 12);
  let ownerUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "demo@sokoos.local" },
  });
  if (!ownerUser) {
    ownerUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: "demo@sokoos.local",
        name: "Brian Kipyego (Owner)",
        passwordHash: ownerHash,
        status: "active",
      },
    });
  } else {
    await prisma.user.update({
      where: { id: ownerUser.id },
      data: { passwordHash: ownerHash },
    });
  }

  const ownerBinding = await prisma.userRole.findFirst({
    where: { tenantId: tenant.id, userId: ownerUser.id, roleId: ownerRole.id, branchId: null },
  });
  if (!ownerBinding) {
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: ownerUser.id, roleId: ownerRole.id, branchId: null },
    });
  }

  // 2. Cashier-only User (for strict RBAC testing)
  const cashierHash = await bcrypt.hash("Cashier123!", 12);
  let cashierUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "cashier@sokoos.local" },
  });
  if (!cashierUser) {
    cashierUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: "cashier@sokoos.local",
        name: "Grace Wanjiku (Cashier)",
        passwordHash: cashierHash,
        status: "active",
      },
    });
  } else {
    await prisma.user.update({
      where: { id: cashierUser.id },
      data: { passwordHash: cashierHash },
    });
  }
  await prisma.userRole.deleteMany({ where: { userId: cashierUser.id } });
  await prisma.userRole.create({
    data: {
      tenantId: tenant.id,
      userId: cashierUser.id,
      roleId: cashierRole.id,
      branchId: branch.id,
    },
  });

  // 3. Stock Controller User
  const stockHash = await bcrypt.hash("Stock123!", 12);
  let stockUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "stock@sokoos.local" },
  });
  if (!stockUser) {
    stockUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: "stock@sokoos.local",
        name: "David Ochieng (Cellar Controller)",
        passwordHash: stockHash,
        status: "active",
      },
    });
  } else {
    await prisma.user.update({
      where: { id: stockUser.id },
      data: { passwordHash: stockHash },
    });
  }
  await prisma.userRole.deleteMany({ where: { userId: stockUser.id } });
  await prisma.userRole.create({
    data: {
      tenantId: tenant.id,
      userId: stockUser.id,
      roleId: stockRole.id,
      branchId: branch.id,
    },
  });

  // Warehouses
  let mainWarehouse = await prisma.warehouse.findFirst({
    where: { tenantId: tenant.id, branchId: branch.id, isDefault: true },
  });
  if (!mainWarehouse) {
    mainWarehouse = await prisma.warehouse.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        name: "Main Retail Cellar & Counter",
        isDefault: true,
        status: "active",
      },
    });
  }

  let backroomWarehouse = await prisma.warehouse.findFirst({
    where: { tenantId: tenant.id, branchId: branch.id, name: "Bonded Case Reserve Store" },
  });
  if (!backroomWarehouse) {
    backroomWarehouse = await prisma.warehouse.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        name: "Bonded Case Reserve Store",
        isDefault: false,
        status: "active",
      },
    });
  }

  // Units
  const unitMap = new Map<string, string>();
  for (const u of edition.defaultUnits) {
    const row = await prisma.unit.upsert({
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
    unitMap.set(u.abbreviation, row.id);
  }

  // Categories (all 14 Wines & Spirits categories)
  const catMap = new Map<string, string>();
  for (let i = 0; i < edition.defaultCategories.length; i++) {
    const catName = edition.defaultCategories[i]!;
    let cat = await prisma.category.findFirst({
      where: { tenantId: tenant.id, name: catName },
    });
    if (!cat) {
      cat = await prisma.category.create({
        data: { tenantId: tenant.id, name: catName, sortOrder: i },
      });
    }
    catMap.set(catName, cat.id);
  }

  // Suppliers
  const supplierNames = [
    { name: "KBL / EABL Distributors (Demo)", phone: "+254711000111", email: "orders@kbl.demo", taxPin: "P051111222A" },
    { name: "Viva Global Wine & Spirits (Demo)", phone: "+254722000222", email: "trade@vivaglobal.demo", taxPin: "P051222333B" },
    { name: "KWAL Beverage Distributors (Demo)", phone: "+254733000333", email: "sales@kwal.demo", taxPin: "P051333444C" },
  ];
  const supplierMap = new Map<string, string>();
  for (const s of supplierNames) {
    let sup = await prisma.supplier.findFirst({
      where: { tenantId: tenant.id, name: s.name },
    });
    if (!sup) {
      sup = await prisma.supplier.create({
        data: {
          tenantId: tenant.id,
          name: s.name,
          phone: s.phone,
          email: s.email,
          extensions: { taxPin: s.taxPin, paymentTerms: "Net 30", paidMinor: 0 },
        },
      });
    }
    supplierMap.set(s.name, sup.id);
  }

  // Brands & Products
  const catalogItems = [
    {
      sku: "JW-BLACK-750ML",
      name: "Johnnie Walker Black Label 12Y 750ml",
      brand: "Johnnie Walker",
      category: "Whisky",
      unit: "btl",
      size: "750ml",
      abv: "40%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 360000,
      wholesalePriceMinor: 335000,
      costMinor: 285000,
      barcode: "5000267023656",
      featured: true,
      minStockQty: 12,
      initialQty: 48,
    },
    {
      sku: "JW-BLACK-CASE12",
      name: "Johnnie Walker Black Label Case (12 × 750ml)",
      brand: "Johnnie Walker",
      category: "Whisky",
      unit: "case",
      size: "12x750ml",
      abv: "40%",
      packagingType: "case",
      packSize: 12,
      linkedBottleSku: "JW-BLACK-750ML",
      priceMinor: 3960000,
      wholesalePriceMinor: 3840000,
      costMinor: 3300000,
      barcode: "5000267023663",
      featured: false,
      minStockQty: 3,
      initialQty: 10,
    },
    {
      sku: "GLENFIDDICH-12Y-750ML",
      name: "Glenfiddich 12 Year Old Single Malt 750ml",
      brand: "Glenfiddich",
      category: "Whisky",
      unit: "btl",
      size: "750ml",
      abv: "40%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 650000,
      wholesalePriceMinor: 610000,
      costMinor: 510000,
      barcode: "5010327325125",
      featured: true,
      minStockQty: 6,
      initialQty: 24,
    },
    {
      sku: "JAMESON-750ML",
      name: "Jameson Irish Whiskey 750ml",
      brand: "Jameson",
      category: "Whisky",
      unit: "btl",
      size: "750ml",
      abv: "40%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 280000,
      wholesalePriceMinor: 260000,
      costMinor: 215000,
      barcode: "5011007003234",
      featured: true,
      minStockQty: 12,
      initialQty: 36,
    },
    {
      sku: "SMIRNOFF-VODKA-750ML",
      name: "Smirnoff No. 21 Red Label Vodka 750ml",
      brand: "Smirnoff",
      category: "Vodka",
      unit: "btl",
      size: "750ml",
      abv: "37.5%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 175000,
      wholesalePriceMinor: 160000,
      costMinor: 132000,
      barcode: "5000289925440",
      featured: true,
      minStockQty: 18,
      initialQty: 60,
    },
    {
      sku: "GILBEYS-GIN-750ML",
      name: "Gilbey's London Dry Gin 750ml",
      brand: "Gilbey's",
      category: "Gin",
      unit: "btl",
      size: "750ml",
      abv: "37.5%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 165000,
      wholesalePriceMinor: 150000,
      costMinor: 125000,
      barcode: "6161101600456",
      featured: true,
      minStockQty: 18,
      initialQty: 54,
    },
    {
      sku: "TANQUERAY-DRY-750ML",
      name: "Tanqueray London Dry Gin 750ml",
      brand: "Tanqueray",
      category: "Gin",
      unit: "btl",
      size: "750ml",
      abv: "43.1%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 340000,
      wholesalePriceMinor: 315000,
      costMinor: 265000,
      barcode: "5000289110884",
      featured: true,
      minStockQty: 8,
      initialQty: 30,
    },
    {
      sku: "CAPTAIN-MORGAN-750ML",
      name: "Captain Morgan Original Spiced Gold Rum 750ml",
      brand: "Captain Morgan",
      category: "Rum",
      unit: "btl",
      size: "750ml",
      abv: "35%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 210000,
      wholesalePriceMinor: 195000,
      costMinor: 160000,
      barcode: "5000299223017",
      featured: false,
      minStockQty: 10,
      initialQty: 30,
    },
    {
      sku: "VICEROY-BRANDY-750ML",
      name: "Viceroy 5 Year Old Brandy 750ml",
      brand: "Viceroy",
      category: "Brandy",
      unit: "btl",
      size: "750ml",
      abv: "38%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 195000,
      wholesalePriceMinor: 180000,
      costMinor: 148000,
      barcode: "6001452224101",
      featured: false,
      minStockQty: 10,
      initialQty: 24,
    },
    {
      sku: "CUERVO-SILVER-750ML",
      name: "Jose Cuervo Especial Silver Tequila 750ml",
      brand: "Jose Cuervo",
      category: "Tequila",
      unit: "btl",
      size: "750ml",
      abv: "38%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 320000,
      wholesalePriceMinor: 295000,
      costMinor: 245000,
      barcode: "7501035010208",
      featured: false,
      minStockQty: 6,
      initialQty: 18,
    },
    {
      sku: "FOUR-COUSINS-RED-750ML",
      name: "Four Cousins Natural Sweet Red Wine 750ml",
      brand: "Four Cousins",
      category: "Wine",
      unit: "btl",
      size: "750ml",
      abv: "8%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 135000,
      wholesalePriceMinor: 120000,
      costMinor: 92000,
      barcode: "6009609860081",
      featured: true,
      minStockQty: 18,
      initialQty: 60,
    },
    {
      sku: "MOET-IMPERIAL-750ML",
      name: "Moët & Chandon Impérial Brut Champagne 750ml",
      brand: "Moët & Chandon",
      category: "Champagne",
      unit: "btl",
      size: "750ml",
      abv: "12%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 980000,
      wholesalePriceMinor: 920000,
      costMinor: 760000,
      barcode: "3185370001233",
      featured: false,
      minStockQty: 4,
      initialQty: 12,
    },
    {
      sku: "TUSKER-LAGER-500ML",
      name: "Tusker Lager Can 500ml",
      brand: "Tusker",
      category: "Beer",
      unit: "can",
      size: "500ml",
      abv: "4.2%",
      packagingType: "can",
      packSize: 1,
      priceMinor: 26000,
      wholesalePriceMinor: 23500,
      costMinor: 19500,
      barcode: "6161101600128",
      featured: true,
      minStockQty: 48,
      initialQty: 144,
    },
    {
      sku: "SAVANNA-DRY-330ML",
      name: "Savanna Dry Premium Cider 330ml",
      brand: "Savanna",
      category: "Cider",
      unit: "btl",
      size: "330ml",
      abv: "5.5%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 32000,
      wholesalePriceMinor: 29000,
      costMinor: 24000,
      barcode: "6001108001234",
      featured: false,
      minStockQty: 24,
      initialQty: 72,
    },
    {
      sku: "BAILEYS-IRISH-750ML",
      name: "Baileys Original Irish Cream Liqueur 750ml",
      brand: "Baileys",
      category: "Liqueurs",
      unit: "btl",
      size: "750ml",
      abv: "17%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 290000,
      wholesalePriceMinor: 270000,
      costMinor: 220000,
      barcode: "5011013100156",
      featured: false,
      minStockQty: 8,
      initialQty: 24,
    },
    {
      sku: "SCHWEPPES-TONIC-300ML",
      name: "Schweppes Indian Tonic Water 300ml",
      brand: "Schweppes",
      category: "Mixers",
      unit: "can",
      size: "300ml",
      abv: "0%",
      packagingType: "can",
      packSize: 1,
      priceMinor: 12000,
      wholesalePriceMinor: 10000,
      costMinor: 8000,
      barcode: "5449000011527",
      featured: false,
      minStockQty: 36,
      initialQty: 96,
    },
    {
      sku: "COCA-COLA-500ML",
      name: "Coca-Cola Original PET 500ml",
      brand: "Coca-Cola",
      category: "Soft Drinks",
      unit: "btl",
      size: "500ml",
      abv: "0%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 10000,
      wholesalePriceMinor: 8500,
      costMinor: 7000,
      barcode: "5449000000996",
      featured: false,
      minStockQty: 36,
      initialQty: 96,
    },
    {
      sku: "KERINGET-STILL-1L",
      name: "Keringet Natural Mineral Water 1L",
      brand: "Keringet",
      category: "Water",
      unit: "btl",
      size: "1L",
      abv: "0%",
      packagingType: "bottle",
      packSize: 1,
      priceMinor: 12000,
      wholesalePriceMinor: 10000,
      costMinor: 7500,
      barcode: "6161100500115",
      featured: false,
      minStockQty: 24,
      initialQty: 72,
    },
  ];

  const productIdBySku = new Map<string, string>();
  for (const item of catalogItems) {
    const brandRow = await prisma.brand.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: item.brand } },
      create: { tenantId: tenant.id, name: item.brand },
      update: {},
    });

    const bottleProductId = item.linkedBottleSku
      ? productIdBySku.get(item.linkedBottleSku) ?? null
      : null;

    const extensions = {
      size: item.size,
      abv: item.abv,
      packagingType: item.packagingType,
      packSize: item.packSize,
      caseQuantity: item.packagingType === "case" ? item.packSize : null,
      bottleProductId,
      conversionFactor: item.packagingType === "case" ? item.packSize : null,
      wholesalePriceMinor: item.wholesalePriceMinor,
      supplierId: supplierMap.get("KBL / EABL Distributors (Demo)") ?? null,
    };

    const product = await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: item.sku } },
      create: {
        tenantId: tenant.id,
        sku: item.sku,
        name: item.name,
        barcode: item.barcode,
        categoryId: catMap.get(item.category),
        brandId: brandRow.id,
        unitId: unitMap.get(item.unit),
        priceMinor: item.priceMinor,
        costMinor: item.costMinor,
        taxRateBps: 1600,
        featured: item.featured,
        minStockQty: item.minStockQty,
        trackInventory: true,
        status: "active",
        extensions,
      },
      update: {
        name: item.name,
        barcode: item.barcode,
        categoryId: catMap.get(item.category),
        brandId: brandRow.id,
        unitId: unitMap.get(item.unit),
        priceMinor: item.priceMinor,
        costMinor: item.costMinor,
        taxRateBps: 1600,
        featured: item.featured,
        minStockQty: item.minStockQty,
        extensions,
      },
    });
    productIdBySku.set(item.sku, product.id);

    const existingBal = await prisma.stockBalance.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: tenant.id,
          warehouseId: mainWarehouse.id,
          productId: product.id,
        },
      },
    });
    if (!existingBal) {
      await prisma.stockMovement.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          warehouseId: mainWarehouse.id,
          productId: product.id,
          type: "OPENING_STOCK",
          quantityDelta: item.initialQty,
          unitCostMinor: item.costMinor,
          referenceType: "seed",
          reason: "Initial cellar opening stock",
          createdBy: ownerUser.id,
        },
      });
      await prisma.stockBalance.create({
        data: {
          tenantId: tenant.id,
          warehouseId: mainWarehouse.id,
          productId: product.id,
          quantity: item.initialQty,
        },
      });
    }
  }

  // Demo customer
  const existingCustomer = await prisma.customer.findFirst({
    where: { tenantId: tenant.id, phone: "+254700555666" },
  });
  if (!existingCustomer) {
    await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: "Kilimani Lounge Corporate Account (Demo)",
        phone: "+254700555666",
        email: "events@kilimanilounge.demo",
        extensions: {
          creditLimitMinor: 15000000,
          creditBalanceMinor: 0,
          loyaltyPoints: 250,
        },
      },
    });
  }

  // Seed Second Isolated Tenant ("cellar-b") for cross-tenant security verification
  let tenantB = await prisma.tenant.findUnique({ where: { slug: "cellar-b" } });
  if (!tenantB) {
    tenantB = await prisma.tenant.create({
      data: {
        name: "Westlands Cellar B (Isolated Tenant)",
        slug: "cellar-b",
        currency: "KES",
        timezone: "Africa/Nairobi",
        locale: "en-KE",
        status: "active",
        businessTypes: ["wines_spirits", "retail"],
        modulesEnabled: edition.modulesAllowed,
        settings: { negativeStockPolicy: "block" },
      },
    });
  }
  await prisma.authzVersion.upsert({
    where: { tenantId: tenantB.id },
    create: { tenantId: tenantB.id, version: 1 },
    update: {},
  });
  let branchB = await prisma.branch.findFirst({
    where: { tenantId: tenantB.id, code: "WEST" },
  });
  if (!branchB) {
    branchB = await prisma.branch.create({
      data: {
        tenantId: tenantB.id,
        name: "Westlands Main",
        code: "WEST",
        status: "active",
      },
    });
  }
  const ownerRoleB = await ensureRoleWithPermissions(
    tenantB.id,
    SystemRole.BusinessOwner,
    "Business Owner",
    ROLE_PERMISSION_TEMPLATES[SystemRole.BusinessOwner]!,
  );
  const hashB = await bcrypt.hash("CellarB123!", 12);
  let userB = await prisma.user.findFirst({
    where: { tenantId: tenantB.id, email: "owner@cellar-b.local" },
  });
  if (!userB) {
    userB = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: "owner@cellar-b.local",
        name: "Tenant B Owner",
        passwordHash: hashB,
        status: "active",
      },
    });
  }
  const bindingB = await prisma.userRole.findFirst({
    where: { tenantId: tenantB.id, userId: userB.id, roleId: ownerRoleB.id },
  });
  if (!bindingB) {
    await prisma.userRole.create({
      data: {
        tenantId: tenantB.id,
        userId: userB.id,
        roleId: ownerRoleB.id,
        branchId: null,
      },
    });
  }
  await prisma.product.upsert({
    where: { tenantId_sku: { tenantId: tenantB.id, sku: "TENANT-B-PRIVATE-WINE" } },
    create: {
      tenantId: tenantB.id,
      sku: "TENANT-B-PRIVATE-WINE",
      name: "Tenant B Private Reserve Wine 750ml",
      priceMinor: 450000,
      costMinor: 310000,
      trackInventory: true,
      status: "active",
    },
    update: {},
  });

  // Platform operator (tenantId null)
  const platformHash = await bcrypt.hash("Platform123!", 12);
  let platformUser = await prisma.user.findFirst({
    where: { email: "platform@sokoos.local", tenantId: null },
  });
  if (!platformUser) {
    platformUser = await prisma.user.create({
      data: {
        tenantId: null,
        email: "platform@sokoos.local",
        name: "Platform Operator",
        passwordHash: platformHash,
        status: "active",
      },
    });
  } else {
    await prisma.user.update({
      where: { id: platformUser.id },
      data: { passwordHash: platformHash },
    });
  }
  const platformBinding = await prisma.userRole.findFirst({
    where: { userId: platformUser.id, roleId: platformRole.id },
  });
  if (!platformBinding) {
    await prisma.userRole.create({
      data: {
        tenantId: tenant.id,
        userId: platformUser.id,
        roleId: platformRole.id,
        branchId: null,
      },
    });
  }

  const baseDomain = process.env.SOKOOS_BASE_DOMAIN ?? "sokoos.com";
  const demoHost = `${tenant.slug}.${baseDomain}`;
  await prisma.tenantDomain.upsert({
    where: { hostname: demoHost },
    create: {
      tenantId: tenant.id,
      hostname: demoHost,
      kind: "subdomain",
      status: "active",
      isPrimary: true,
      verifiedAt: new Date(),
      tlsStatus: "unknown",
    },
    update: { status: "active", isPrimary: true },
  });

  console.log("Wines & Spirits seed complete.");
  console.log({
    edition: "WINES_SPIRITS",
    tenant: tenant.slug,
    branches: [branch.code, secondBranch.code],
    ownerLogin: "demo@sokoos.local / Demo123!",
    cashierLogin: "cashier@sokoos.local / Cashier123!",
    stockControllerLogin: "stock@sokoos.local / Stock123!",
    isolatedSecondTenant: "cellar-b (owner@cellar-b.local / CellarB123!)",
    warehouses: [mainWarehouse.name, backroomWarehouse.name],
    categories: edition.defaultCategories.length,
    products: catalogItems.length,
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
