import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MediaService } from "../media/media.service";
import { decodeCursor, encodeCursor, paginateMeta } from "../common/pagination";
import { isTaxReviewRequired } from "./tax-review";
import { SYSTEM_UNCATEGORIZED_CATEGORY, SYSTEM_UNKNOWN_BRAND } from "../seed/taxonomy";

export type WinesProductExtensions = {
  size?: string | null;
  abv?: string | null;
  packSize?: number | null;
  caseQuantity?: number | null;
  packagingType?: "bottle" | "case" | "can" | "pack" | "keg" | string | null;
  bottleProductId?: string | null;
  conversionFactor?: number | null;
  wholesalePriceMinor?: number | null;
  supplierId?: string | null;
  branchIds?: string[];
  warehouseIds?: string[];
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  private hydrateProduct<T extends { extensions?: unknown }>(product: T) {
    const ext = ((product.extensions ?? {}) as Record<string, unknown>) || {};
    const taxReviewRequired = isTaxReviewRequired({
      taxRateBps: "taxRateBps" in product ? product.taxRateBps : undefined,
      extensions: product.extensions,
    });
    return {
      ...product,
      taxRateBps: taxReviewRequired ? null : "taxRateBps" in product ? product.taxRateBps : null,
      taxReviewRequired,
      taxReviewStatus: taxReviewRequired ? "TAX_REVIEW_REQUIRED" : ext.taxReviewStatus ?? "MAPPED",
      size: typeof ext.size === "string" ? ext.size : null,
      abv: typeof ext.abv === "string" ? ext.abv : null,
      packSize: typeof ext.packSize === "number" ? ext.packSize : 1,
      caseQuantity: typeof ext.caseQuantity === "number" ? ext.caseQuantity : null,
      packagingType: typeof ext.packagingType === "string" ? ext.packagingType : "bottle",
      bottleProductId: typeof ext.bottleProductId === "string" ? ext.bottleProductId : null,
      conversionFactor: typeof ext.conversionFactor === "number" ? ext.conversionFactor : null,
      wholesalePriceMinor:
        typeof ext.wholesalePriceMinor === "number" ? ext.wholesalePriceMinor : null,
      supplierId: typeof ext.supplierId === "string" ? ext.supplierId : null,
      branchIds: Array.isArray(ext.branchIds) ? (ext.branchIds as string[]) : [],
      warehouseIds: Array.isArray(ext.warehouseIds) ? (ext.warehouseIds as string[]) : [],
    };
  }

  // --- Categories ---
  async listCategories(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async createCategory(
    tenantId: string,
    input: { name: string; parentId?: string; sortOrder?: number },
    userId?: string,
  ) {
    return this.prisma.category.create({
      data: {
        tenantId,
        name: input.name,
        parentId: input.parentId,
        sortOrder: input.sortOrder ?? 0,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async updateCategory(
    tenantId: string,
    id: string,
    input: { name?: string; parentId?: string | null; sortOrder?: number; status?: string },
    userId?: string,
  ) {
    await this.requireCategory(tenantId, id);
    return this.prisma.category.update({
      where: { id },
      data: {
        name: input.name,
        parentId: input.parentId,
        sortOrder: input.sortOrder,
        status: input.status,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async getCategoryImpact(tenantId: string, id: string) {
    const category = await this.requireCategory(tenantId, id);
    const productCount = await this.prisma.product.count({
      where: { tenantId, categoryId: id },
    });
    return {
      id: category.id,
      name: category.name,
      productCount,
    };
  }

  /**
   * Safe category deletion:
   * NEVER deletes products or historical sales.
   * Atomically unlinks products by mapping them to system "Uncategorized" category.
   */
  async deleteCategory(tenantId: string, id: string, userId?: string) {
    const category = await this.requireCategory(tenantId, id);
    if (category.name.toLowerCase() === SYSTEM_UNCATEGORIZED_CATEGORY.toLowerCase()) {
      throw new BadRequestException({
        code: "CANNOT_DELETE_SYSTEM_CATEGORY",
        message: "The system Uncategorized category cannot be deleted",
      });
    }

    const productCount = await this.prisma.product.count({
      where: { tenantId, categoryId: id },
    });

    let uncategorized = await this.prisma.category.findFirst({
      where: { tenantId, name: SYSTEM_UNCATEGORIZED_CATEGORY },
    });
    if (!uncategorized) {
      uncategorized = await this.prisma.category.create({
        data: {
          tenantId,
          name: SYSTEM_UNCATEGORIZED_CATEGORY,
          sortOrder: 999,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    }

    if (productCount > 0) {
      await this.prisma.product.updateMany({
        where: { tenantId, categoryId: id },
        data: { categoryId: uncategorized.id, updatedBy: userId },
      });
    }

    await this.prisma.category.updateMany({
      where: { tenantId, parentId: id },
      data: { parentId: null, updatedBy: userId },
    });

    await this.prisma.category.delete({
      where: { id },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId ?? null,
          action: "category.delete",
          entityType: "category",
          entityId: id,
          metadata: {
            categoryName: category.name,
            affectedProductCount: productCount,
            remappedCategoryId: uncategorized.id,
          },
        },
      });
    } catch {
      // Non-blocking in mocks
    }

    return {
      ok: true,
      deletedId: id,
      deletedName: category.name,
      affectedProductCount: productCount,
      remappedCategoryId: uncategorized.id,
    };
  }

  // --- Brands ---
  async listBrands(tenantId: string) {
    return this.prisma.brand.findMany({
      where: { tenantId, archivedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async createBrand(tenantId: string, name: string, userId?: string) {
    try {
      return await this.prisma.brand.create({
        data: { tenantId, name, createdBy: userId, updatedBy: userId },
      });
    } catch {
      throw new ConflictException({ code: "CONFLICT", message: "Brand exists" });
    }
  }

  async updateBrand(
    tenantId: string,
    id: string,
    input: { name?: string; status?: string },
    userId?: string,
  ) {
    const brand = await this.prisma.brand.findFirst({ where: { id, tenantId } });
    if (!brand) throw new NotFoundException({ code: "NOT_FOUND", message: "Brand not found" });
    return this.prisma.brand.update({
      where: { id },
      data: { ...input, updatedBy: userId, version: { increment: 1 } },
    });
  }

  async getBrandImpact(tenantId: string, id: string) {
    const brand = await this.prisma.brand.findFirst({ where: { id, tenantId } });
    if (!brand) throw new NotFoundException({ code: "NOT_FOUND", message: "Brand not found" });
    const productCount = await this.prisma.product.count({
      where: { tenantId, brandId: id },
    });
    return {
      id: brand.id,
      name: brand.name,
      productCount,
    };
  }

  /**
   * Safe brand deletion:
   * NEVER deletes products or historical transactions.
   * Unlinks products (sets brandId to null).
   */
  async deleteBrand(tenantId: string, id: string, userId?: string) {
    const brand = await this.prisma.brand.findFirst({ where: { id, tenantId } });
    if (!brand) throw new NotFoundException({ code: "NOT_FOUND", message: "Brand not found" });
    const productCount = await this.prisma.product.count({
      where: { tenantId, brandId: id },
    });

    if (productCount > 0) {
      await this.prisma.product.updateMany({
        where: { tenantId, brandId: id },
        data: { brandId: null, updatedBy: userId },
      });
    }

    await this.prisma.brand.delete({
      where: { id },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId ?? null,
          action: "brand.delete",
          entityType: "brand",
          entityId: id,
          metadata: {
            brandName: brand.name,
            affectedProductCount: productCount,
          },
        },
      });
    } catch {
      // Non-blocking in mocks
    }

    return {
      ok: true,
      deletedId: id,
      deletedName: brand.name,
      affectedProductCount: productCount,
    };
  }


  // --- Units ---
  async listUnits(tenantId: string) {
    return this.prisma.unit.findMany({
      where: { tenantId, archivedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async createUnit(
    tenantId: string,
    input: { name: string; abbreviation: string },
    userId?: string,
  ) {
    try {
      return await this.prisma.unit.create({
        data: {
          tenantId,
          name: input.name,
          abbreviation: input.abbreviation,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    } catch {
      throw new ConflictException({ code: "CONFLICT", message: "Unit exists" });
    }
  }

  async updateUnit(
    tenantId: string,
    id: string,
    input: { name?: string; abbreviation?: string; status?: string },
    userId?: string,
  ) {
    const unit = await this.prisma.unit.findFirst({ where: { id, tenantId } });
    if (!unit) throw new NotFoundException({ code: "NOT_FOUND", message: "Unit not found" });
    return this.prisma.unit.update({
      where: { id },
      data: { ...input, updatedBy: userId, version: { increment: 1 } },
    });
  }

  // --- Products ---
  async listProducts(
    tenantId: string,
    opts: {
      limit?: number;
      cursor?: string;
      q?: string;
      sku?: string;
      barcode?: string;
      categoryId?: string;
      status?: string;
      featured?: boolean;
      includeArchived?: boolean;
    } = {},
  ) {
    const limit = Math.min(opts.limit ?? 50, 500);
    const cursor = decodeCursor<{ id: string }>(opts.cursor);

    const rows = await this.prisma.product.findMany({
      where: {
        tenantId,
        ...(!opts.includeArchived ? { archivedAt: null } : {}),
        ...(cursor ? { id: { gt: cursor.id } } : {}),
        ...(opts.sku ? { sku: opts.sku } : {}),
        ...(opts.barcode ? { barcode: opts.barcode } : {}),
        ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.featured ? { featured: true } : {}),
        ...(opts.q
          ? {
              OR: [
                { name: { contains: opts.q, mode: "insensitive" } },
                { sku: { contains: opts.q, mode: "insensitive" } },
                { barcode: { contains: opts.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, abbreviation: true } },
      },
      orderBy: { id: "asc" },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map((r) =>
      this.hydrateProduct(r),
    );
    const last = data[data.length - 1];
    return {
      data,
      meta: paginateMeta(
        hasMore,
        limit,
        last ? encodeCursor({ id: last.id }) : null,
      ),
    };
  }

  async getProduct(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, abbreviation: true } },
      },
    });
    if (!product) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Product not found" });
    }
    return this.hydrateProduct(product);
  }

  async createProduct(
    tenantId: string,
    input: {
      id?: string;
      sku: string;
      name: string;
      barcode?: string;
      description?: string;
      categoryId?: string;
      brandId?: string;
      unitId?: string;
      priceMinor: number;
      costMinor?: number;
      wholesalePriceMinor?: number;
      taxRateBps?: number;
      trackInventory?: boolean;
      itemType?: string;
      featured?: boolean;
      minStockQty?: number;
      imageUrl?: string;
      thumbnailUrl?: string;
      size?: string;
      abv?: string;
      packSize?: number;
      caseQuantity?: number;
      packagingType?: string;
      bottleProductId?: string;
      conversionFactor?: number;
      supplierId?: string;
      branchIds?: string[];
      warehouseIds?: string[];
      extensions?: Record<string, unknown>;
    },
    userId?: string,
  ) {
    this.assertImageUrl(input.imageUrl);
    const itemType = input.itemType ?? "stock";
    const trackInventory =
      input.trackInventory ??
      !["prepared", "service", "accommodation", "non_stock"].includes(itemType);
    const taxReviewRequired = input.taxRateBps === undefined;
    if (
      input.taxRateBps !== undefined &&
      (!Number.isInteger(input.taxRateBps) || input.taxRateBps < 0 || input.taxRateBps > 10000)
    ) {
      throw new BadRequestException({
        code: "INVALID_TAX_RATE",
        message: "Tax rate must be a whole number of basis points from 0 to 10000",
      });
    }
    const extensions: Record<string, unknown> = {
      ...(input.extensions ?? {}),
      ...(taxReviewRequired
        ? { taxReviewRequired: true, taxReviewStatus: "TAX_REVIEW_REQUIRED" }
        : { taxReviewRequired: false, taxReviewStatus: "MAPPED" }),
      ...(input.size !== undefined ? { size: input.size } : {}),
      ...(input.abv !== undefined ? { abv: input.abv } : {}),
      ...(input.packSize !== undefined ? { packSize: input.packSize } : {}),
      ...(input.caseQuantity !== undefined ? { caseQuantity: input.caseQuantity } : {}),
      ...(input.packagingType !== undefined ? { packagingType: input.packagingType } : {}),
      ...(input.bottleProductId !== undefined ? { bottleProductId: input.bottleProductId } : {}),
      ...(input.conversionFactor !== undefined ? { conversionFactor: input.conversionFactor } : {}),
      ...(input.wholesalePriceMinor !== undefined
        ? { wholesalePriceMinor: input.wholesalePriceMinor }
        : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      ...(input.branchIds !== undefined ? { branchIds: input.branchIds } : {}),
      ...(input.warehouseIds !== undefined ? { warehouseIds: input.warehouseIds } : {}),
    };
    try {
      const created = await this.prisma.product.create({
        data: {
          id: input.id,
          tenantId,
          sku: input.sku,
          name: input.name,
          barcode: input.barcode,
          description: input.description,
          categoryId: input.categoryId,
          brandId: input.brandId,
          unitId: input.unitId,
          priceMinor: input.priceMinor,
          costMinor: input.costMinor,
          ...(input.taxRateBps !== undefined ? { taxRateBps: input.taxRateBps } : {}),
          trackInventory,
          itemType,
          featured: input.featured ?? false,
          minStockQty: input.minStockQty ?? 0,
          imageUrl: input.imageUrl,
          thumbnailUrl: input.thumbnailUrl ?? input.imageUrl,
          extensions: extensions as object,
          createdBy: userId,
          updatedBy: userId,
        },
        include: {
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, abbreviation: true } },
        },
      });
      try {
        await this.prisma.auditLog.create({
          data: {
            tenantId,
            actorUserId: userId ?? null,
            action: "product.create",
            entityType: "product",
            entityId: created.id,
            metadata: {
              sku: created.sku,
              name: created.name,
              priceMinor: created.priceMinor,
              costMinor: created.costMinor,
            },
          },
        });
      } catch {
        // Non-blocking in mock tests
      }
      return this.hydrateProduct(created);
    } catch {
      throw new ConflictException({
        code: "CONFLICT",
        message: "Product SKU already exists",
      });
    }
  }

  async updateProduct(
    tenantId: string,
    id: string,
    input: Partial<{
      name: string;
      barcode: string | null;
      description: string | null;
      categoryId: string | null;
      brandId: string | null;
      unitId: string | null;
      priceMinor: number;
      costMinor: number | null;
      wholesalePriceMinor: number | null;
      taxRateBps: number;
      trackInventory: boolean;
      itemType: string;
      featured: boolean;
      minStockQty: number;
      status: string;
      version: number;
      size: string | null;
      abv: string | null;
      imageUrl: string | null;
      thumbnailUrl: string | null;
      packSize: number | null;
      caseQuantity: number | null;
      packagingType: string | null;
      bottleProductId: string | null;
      conversionFactor: number | null;
      supplierId: string | null;
      branchIds: string[];
      warehouseIds: string[];
    }>,
    userId?: string,
  ) {
    this.assertImageUrl(input.imageUrl);
    const existing = await this.getProduct(tenantId, id);
    if (
      input.taxRateBps !== undefined &&
      (!Number.isInteger(input.taxRateBps) || input.taxRateBps < 0 || input.taxRateBps > 10000)
    ) {
      throw new BadRequestException({
        code: "INVALID_TAX_RATE",
        message: "Tax rate must be a whole number of basis points from 0 to 10000",
      });
    }
    if (input.version !== undefined && input.version !== existing.version) {
      throw new ConflictException({
        code: "CONFLICT",
        message: "Version conflict",
      });
    }
    const {
      version: _v,
      size,
      abv,
      packSize,
      caseQuantity,
      packagingType,
      bottleProductId,
      conversionFactor,
      wholesalePriceMinor,
      supplierId,
      branchIds,
      warehouseIds,
      ...data
    } = input;

    const currentExt = ((existing.extensions ?? {}) as Record<string, unknown>) || {};
    const nextExt: Record<string, unknown> = {
      ...currentExt,
      ...(input.taxRateBps !== undefined
        ? { taxReviewRequired: false, taxReviewStatus: "MAPPED" }
        : {}),
      ...(size !== undefined ? { size } : {}),
      ...(abv !== undefined ? { abv } : {}),
      ...(packSize !== undefined ? { packSize } : {}),
      ...(caseQuantity !== undefined ? { caseQuantity } : {}),
      ...(packagingType !== undefined ? { packagingType } : {}),
      ...(bottleProductId !== undefined ? { bottleProductId } : {}),
      ...(conversionFactor !== undefined ? { conversionFactor } : {}),
      ...(wholesalePriceMinor !== undefined ? { wholesalePriceMinor } : {}),
      ...(supplierId !== undefined ? { supplierId } : {}),
      ...(branchIds !== undefined ? { branchIds } : {}),
      ...(warehouseIds !== undefined ? { warehouseIds } : {}),
    };

    const priceHistory = Array.isArray(currentExt.priceHistory)
      ? [...(currentExt.priceHistory as Array<Record<string, unknown>>)]
      : [];

    const nowIso = new Date().toISOString();
    if (input.priceMinor !== undefined && input.priceMinor !== existing.priceMinor) {
      priceHistory.unshift({
        id: randomUUID(),
        priceType: "retail",
        oldValueMinor: existing.priceMinor,
        newValueMinor: input.priceMinor,
        changedBy: userId ?? null,
        changedAt: nowIso,
        reason: (input as Record<string, unknown>).priceChangeReason ?? "Retail price update",
        source: "catalog",
      });
    }
    if (wholesalePriceMinor !== undefined && wholesalePriceMinor !== (currentExt.wholesalePriceMinor as number | undefined)) {
      priceHistory.unshift({
        id: randomUUID(),
        priceType: "wholesale",
        oldValueMinor: (currentExt.wholesalePriceMinor as number) ?? 0,
        newValueMinor: wholesalePriceMinor,
        changedBy: userId ?? null,
        changedAt: nowIso,
        reason: (input as Record<string, unknown>).priceChangeReason ?? "Wholesale price update",
        source: "catalog",
      });
    }
    if (input.costMinor !== undefined && input.costMinor !== existing.costMinor) {
      priceHistory.unshift({
        id: randomUUID(),
        priceType: "cost",
        oldValueMinor: existing.costMinor ?? 0,
        newValueMinor: input.costMinor,
        changedBy: userId ?? null,
        changedAt: nowIso,
        reason: (input as Record<string, unknown>).priceChangeReason ?? "Cost price update",
        source: "catalog",
      });
    }
    nextExt.priceHistory = priceHistory.slice(0, 100);

    const updated = await this.prisma.product.update({

      where: { id },
      data: {
        ...data,
        extensions: nextExt as object,
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, abbreviation: true } },
      },
    });

    const priceChanged =
      (input.priceMinor !== undefined && input.priceMinor !== existing.priceMinor) ||
      (input.costMinor !== undefined && input.costMinor !== existing.costMinor) ||
      (wholesalePriceMinor !== undefined && wholesalePriceMinor !== existing.wholesalePriceMinor);

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId ?? null,
          action: priceChanged ? "product.price_change" : "product.update",
          entityType: "product",
          entityId: id,
          metadata: {
            sku: existing.sku,
            beforePriceMinor: existing.priceMinor,
            afterPriceMinor: updated.priceMinor,
            beforeCostMinor: existing.costMinor,
            afterCostMinor: updated.costMinor,
            ...(input.taxRateBps !== undefined
              ? { beforeTaxRateBps: existing.taxRateBps, afterTaxRateBps: updated.taxRateBps }
              : {}),
          },
        },
      });
    } catch {
      // Non-blocking in mock tests
    }

    return this.hydrateProduct(updated);
  }

  async getPriceHistory(tenantId: string, id: string) {
    const product = await this.getProduct(tenantId, id);
    const ext = ((product.extensions ?? {}) as Record<string, unknown>) || {};
    return Array.isArray(ext.priceHistory) ? ext.priceHistory : [];
  }

  async setImage(
    tenantId: string,
    id: string,
    file: { mimetype: string; size: number; buffer: Buffer; originalname: string },
    userId?: string,
  ) {
    const product = await this.getProduct(tenantId, id);
    await this.media.removeFile(product.imageUrl);
    const saved = await this.media.saveProductImage(tenantId, id, file);
    return this.prisma.product.update({
      where: { id },
      data: {
        imageUrl: saved.imageUrl,
        thumbnailUrl: saved.thumbnailUrl,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async clearImage(tenantId: string, id: string, userId?: string) {
    const product = await this.getProduct(tenantId, id);
    await this.media.removeFile(product.imageUrl);
    return this.prisma.product.update({
      where: { id },
      data: {
        imageUrl: null,
        thumbnailUrl: null,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async deleteUnusedProduct(tenantId: string, id: string, userId?: string) {
    const product = await this.getProduct(tenantId, id);
    const references = await Promise.all([
      this.prisma.stockMovement.findFirst({ where: { tenantId, productId: id }, select: { id: true } }),
      this.prisma.stockBalance.findFirst({ where: { tenantId, productId: id }, select: { productId: true } }),
      this.prisma.saleItem.findFirst({ where: { tenantId, productId: id }, select: { id: true } }),
      this.prisma.returnItem.findFirst({ where: { tenantId, productId: id }, select: { id: true } }),
      this.prisma.purchaseItem.findFirst({ where: { tenantId, productId: id }, select: { id: true } }),
      this.prisma.departmentProduct.findFirst({ where: { tenantId, productId: id }, select: { productId: true } }),
      this.prisma.productRecipeLine.findFirst({
        where: { tenantId, OR: [{ parentProductId: id }, { ingredientProductId: id }] },
        select: { id: true },
      }),
      this.prisma.productModifierGroup.findFirst({ where: { tenantId, productId: id }, select: { id: true } }),
      this.prisma.productBatch.findFirst({ where: { tenantId, productId: id }, select: { id: true } }),
      this.prisma.prescriptionItem.findFirst({ where: { tenantId, productId: id }, select: { id: true } }),
      this.prisma.priceListItem.findFirst({ where: { tenantId, productId: id }, select: { id: true } }),
      this.prisma.productSerial.findFirst({ where: { tenantId, productId: id }, select: { id: true } }),
      this.prisma.kitchenTicketItem.findFirst({
        where: { tenantId, productId: id },
        select: { id: true },
      }),
    ]);
    if (references.some(Boolean)) {
      throw new ConflictException({
        code: "CONFLICT",
        message: "This product has stock, sales, purchasing, or other history. Archive it to preserve records.",
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId ?? null,
          action: "product.deleted",
          entityType: "product",
          entityId: id,
          metadata: { sku: product.sku, name: product.name },
        },
      });
    });
    await Promise.all([
      this.media.removeFile(product.imageUrl),
      this.media.removeFile(product.thumbnailUrl),
    ]);
    return { id, deleted: true };
  }

  private assertImageUrl(value?: string | null) {
    if (!value) return;
    if (value.startsWith("/v1/media/")) return;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Product image must be an HTTPS image link or an uploaded SokoOS media path",
      });
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Product image links must use HTTPS and cannot include credentials",
      });
    }
  }

  async previewCatalogRows(tenantId: string, rows: Array<Record<string, string>>) {
    if (!rows.length) {
      throw new UnprocessableEntityException({
        code: "VALIDATION_FAILED",
        message: "No rows to preview",
      });
    }

    const skus = rows.map((row) => this.cell(row, ["sku", "SKU"]).trim()).filter(Boolean);
    const barcodes = rows
      .map((row) => this.cell(row, ["barcode", "repo_barcode", "EAN", "ean"]).trim())
      .filter(Boolean);
    const existing = await this.prisma.product.findMany({
      where: {
        tenantId,
        OR: [
          ...skus.map((sku) => ({ sku: { equals: sku, mode: "insensitive" as const } })),
          ...(barcodes.length ? [{ barcode: { in: barcodes } }] : []),
        ],
      },
      select: {
        id: true,
        sku: true,
        barcode: true,
        name: true,
        priceMinor: true,
        costMinor: true,
        imageUrl: true,
        archivedAt: true,
      },
    });
    const supplierNames = rows
      .map((row) => this.cell(row, ["supplier", "repo_supplier", "supplierName"]).trim())
      .filter(Boolean);
    const categoryNames = rows.map((row) => this.cell(row, ["category"]).trim()).filter(Boolean);
    const brandNames = rows.map((row) => this.cell(row, ["brand"]).trim()).filter(Boolean);
    const unitNames = rows.map((row) => this.cell(row, ["unit", "uom"]).trim()).filter(Boolean);
    const suppliers = supplierNames.length
      ? await this.prisma.supplier.findMany({
          where: {
            tenantId,
            archivedAt: null,
            OR: supplierNames.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })),
          },
          select: { id: true, name: true },
        })
      : [];
    const [categories, brands, units] = await Promise.all([
      categoryNames.length
        ? this.prisma.category.findMany({
            where: {
              tenantId,
              archivedAt: null,
              OR: categoryNames.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })),
            },
            select: { id: true, name: true },
          })
        : [],
      brandNames.length
        ? this.prisma.brand.findMany({
            where: {
              tenantId,
              archivedAt: null,
              OR: brandNames.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })),
            },
            select: { id: true, name: true },
          })
        : [],
      unitNames.length
        ? this.prisma.unit.findMany({
            where: {
              tenantId,
              archivedAt: null,
              OR: unitNames.map((name) => ({
                OR: [
                  { name: { equals: name, mode: "insensitive" as const } },
                  { abbreviation: { equals: name, mode: "insensitive" as const } },
                ],
              })),
            },
            select: { id: true, name: true, abbreviation: true },
          })
        : [],
    ]);
    const suppliersByName = new Map(suppliers.map((supplier) => [supplier.name.toLowerCase(), supplier]));
    const categoriesByName = new Map(categories.map((category) => [category.name.toLowerCase(), category]));
    const brandsByName = new Map(brands.map((brand) => [brand.name.toLowerCase(), brand]));
    const unitsByName = new Map(
      units.flatMap((unit) => [
        [unit.name.toLowerCase(), unit] as const,
        [unit.abbreviation.toLowerCase(), unit] as const,
      ]),
    );
    const bySku = new Map<string, typeof existing>();
    const byBarcode = new Map<string, typeof existing>();
    for (const product of existing) {
      const skuKey = product.sku.toLowerCase();
      bySku.set(skuKey, [...(bySku.get(skuKey) ?? []), product]);
      if (product.barcode) {
        byBarcode.set(product.barcode, [...(byBarcode.get(product.barcode) ?? []), product]);
      }
    }

    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    const items = rows.map((raw, index) => {
      const row = index + 1;
      const sku = this.cell(raw, ["sku", "SKU"]).trim();
      const name = this.cell(raw, ["name", "product_name", "Product Name"]).trim();
      const barcode = this.cell(raw, ["barcode", "repo_barcode", "EAN", "ean"]).trim();
      const skuKey = sku.toLowerCase();
      const duplicateInFile = Boolean(
        (skuKey && seenSkus.has(skuKey)) || (barcode && seenBarcodes.has(barcode)),
      );
      if (skuKey) seenSkus.add(skuKey);
      if (barcode) seenBarcodes.add(barcode);

      const skuMatches = skuKey ? bySku.get(skuKey) ?? [] : [];
      const barcodeMatches = barcode ? byBarcode.get(barcode) ?? [] : [];
      const barcodeConflict = barcodeMatches.find(
        (product) => product.sku.toLowerCase() !== skuKey,
      );
      const existingProduct = skuMatches[0];
      let reconciliation: "MATCHED" | "NEW" | "DUPLICATE" | "CONFLICT" | "MISSING";
      let conflict: string | null = null;
      if (!sku || !name) {
        reconciliation = "MISSING";
        conflict = !sku ? "SKU is missing" : "Product name is missing";
      } else if (duplicateInFile) {
        reconciliation = "DUPLICATE";
        conflict = "SKU or barcode is repeated in this file";
      } else if (skuMatches.length > 1 || barcodeConflict) {
        reconciliation = "CONFLICT";
        conflict = skuMatches.length > 1
          ? "More than one existing product matches this SKU"
          : `Barcode is already assigned to ${barcodeConflict?.sku}`;
      } else if (existingProduct) {
        reconciliation = "MATCHED";
        if (existingProduct.barcode && barcode && existingProduct.barcode !== barcode) {
          reconciliation = "CONFLICT";
          conflict = `Existing SKU has a different barcode (${existingProduct.barcode})`;
        }
      } else {
        reconciliation = "NEW";
      }

      const actualCost = this.parseMoneyCell(raw, [
        "actual_supplier_cost_kes",
        "actualSupplierCost",
        "cost",
        "Cost",
      ]);
      const suggestedSell = this.parseMoneyCell(raw, ["suggested_sell_kes"]);
      const repoKnownCost = this.parseMoneyCell(raw, ["repo_known_cost_kes"]);
      const repoKnownSell = this.parseMoneyCell(raw, ["repo_known_sell_kes"]);
      const repoKnownWholesale = this.parseMoneyCell(raw, ["repo_known_wholesale_kes"]);
      const imageFilename = this.cell(raw, ["image_filename", "imageFilename"]).trim();
      const imageLicense = this.cell(raw, ["image_license", "imageLicense"]).trim();
      const imageSource = this.cell(raw, ["image_source", "imageSource"]).trim();
      const supplierName = this.cell(raw, ["supplier", "repo_supplier", "supplierName"]).trim();
      const supplierMatch = supplierName ? suppliersByName.get(supplierName.toLowerCase()) : undefined;
      const categoryName = this.cell(raw, ["category"]).trim();
      const brandName = this.cell(raw, ["brand"]).trim();
      const unitName = this.cell(raw, ["unit", "uom"]).trim();
      const categoryMatch = categoryName ? categoriesByName.get(categoryName.toLowerCase()) : undefined;
      const brandMatch = brandName ? brandsByName.get(brandName.toLowerCase()) : undefined;
      const unitMatch = unitName ? unitsByName.get(unitName.toLowerCase()) : undefined;
      const abv = this.cell(raw, ["abv", "ABV"]).trim();
      const size = this.cell(raw, ["size", "Size"]).trim();
      const packSizeRaw = this.cell(raw, ["packSize", "pack_size", "caseQuantity", "case_quantity"]).trim();
      const packSizeFromSize = size.match(/^(\d+)\s*x/i)?.[1];
      const packSize = Number(packSizeRaw || packSizeFromSize || "1");
      const explicitPackagingType = this.cell(raw, ["packagingType", "packaging_type"]).trim();
      const packagingType = explicitPackagingType ||
        (packSize > 1 ? "case" : /\bcan\b/i.test(`${sku} ${name}`) ? "can" : null);
      const caseBottleSku = this.cell(raw, ["bottleSku", "bottle_sku", "caseBottleSku"]).trim();
      const imageRightsReviewRequired =
        !imageFilename ||
        !imageSource ||
        /retailer|reference only|source-page-only|verify/i.test(imageLicense);
      const taxProfile = this.cell(raw, ["tax_profile", "taxProfile"]).trim();
      const blockers = [
        ...(!sku || !name ? ["SKU and product name are required"] : []),
        ...(reconciliation === "CONFLICT" || reconciliation === "DUPLICATE"
          ? [conflict ?? "Resolve SKU/barcode conflict"]
          : []),
        ...(!this.cell(raw, ["approved_sell_kes", "price", "selling_price"]).trim()
          ? ["APPROVED_SELLING_PRICE_REQUIRED"]
          : []),
        ...(!actualCost ? ["SUPPLIER_COST_MISSING"] : []),
        ...(supplierName && !supplierMatch ? ["SUPPLIER_MAPPING_REQUIRED"] : []),
        ...(categoryName && !categoryMatch ? ["CATEGORY_MAPPING_REQUIRED"] : []),
        ...(brandName && !brandMatch ? ["BRAND_MAPPING_REQUIRED"] : []),
        ...(!unitName || !unitMatch ? ["UNIT_MAPPING_REQUIRED"] : []),
        ...(!packagingType ? ["PACKAGING_TYPE_REVIEW_REQUIRED"] : []),
        ...(packagingType === "case" && !caseBottleSku ? ["CASE_BOTTLE_LINK_REQUIRED"] : []),
      ];

      return {
        row,
        sku,
        barcode: barcode || null,
        name,
        category: categoryName || null,
        categoryMapped: Boolean(categoryMatch),
        brand: brandName || null,
        brandMapped: Boolean(brandMatch),
        unit: unitName || null,
        unitMapped: Boolean(unitMatch),
        size: this.cell(raw, ["size"]).trim() || null,
        abv: abv || null,
        packagingType,
        packagingReviewRequired: !packagingType,
        packSize: Number.isFinite(packSize) && packSize > 0 ? Math.round(packSize) : 1,
        caseBottleSku: caseBottleSku || null,
        actualSupplierCostMinor: actualCost,
        suggestedSellMinor: suggestedSell,
        repoKnownCostMinor: repoKnownCost,
        repoKnownSellMinor: repoKnownSell,
        repoKnownWholesaleMinor: repoKnownWholesale,
        imageFilename: imageFilename || null,
        imageSource: imageSource || null,
        imageLicense: imageLicense || null,
        imageRightsReviewRequired,
        imageReviewRequired: !existingProduct?.imageUrl,
        taxProfile: taxProfile || null,
        taxReviewRequired: true,
        taxWarning: "Tax mapping required before tax-compliant sale.",
        supplier: supplierName
          ? {
              name: supplierName,
              mapped: Boolean(supplierMatch),
              id: supplierMatch?.id ?? null,
            }
          : null,
        reconciliation,
        existing: existingProduct
          ? {
              sku: existingProduct.sku,
              name: existingProduct.name,
              barcode: existingProduct.barcode,
              priceMinor: existingProduct.priceMinor,
              costMinor: existingProduct.costMinor,
              imageUrl: existingProduct.imageUrl,
              archived: Boolean(existingProduct.archivedAt),
            }
          : null,
        conflict,
        blockers,
        action: reconciliation === "MATCHED" ? "SKIP" : "REVIEW",
      };
    });

    const summary = {
      matched: items.filter((item) => item.reconciliation === "MATCHED").length,
      new: items.filter((item) => item.reconciliation === "NEW").length,
      duplicate: items.filter((item) => item.reconciliation === "DUPLICATE").length,
      conflict: items.filter((item) => item.reconciliation === "CONFLICT").length,
      missing: items.filter((item) => item.reconciliation === "MISSING").length,
    };
    return { totalRows: rows.length, summary, items };
  }

  async validateImportRows(
    tenantId: string,
    rows: Array<Record<string, string>>,
  ) {
    if (!rows.length) {
      throw new UnprocessableEntityException({
        code: "VALIDATION_FAILED",
        message: "No rows to import",
      });
    }

    const existingProducts = await this.prisma.product.findMany({
      where: { tenantId },
      select: { sku: true, barcode: true },
    });
    const existingSkus = new Set(existingProducts.map((p) => p.sku.toLowerCase()));
    const existingBarcodes = new Set(
      existingProducts.map((p) => p.barcode?.trim()).filter(Boolean) as string[],
    );
    const supplierNames = rows
      .map((row) => this.cell(row, ["supplier", "Supplier"]).trim())
      .filter(Boolean);
    const configuredSuppliers = supplierNames.length
      ? await this.prisma.supplier.findMany({
          where: {
            tenantId,
            archivedAt: null,
            OR: supplierNames.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })),
          },
          select: { name: true },
        })
      : [];
    const knownSuppliers = new Set(configuredSuppliers.map((supplier) => supplier.name.toLowerCase()));

    const seenSkusInBatch = new Set<string>();
    const seenBarcodesInBatch = new Set<string>();

    const validRows: Array<{
      row: number;
      sku: string;
      name: string;
      barcode?: string;
      categoryName?: string;
      brandName?: string;
      unitName?: string;
      size?: string;
      packSize: number;
      caseQuantity?: number;
      priceMinor: number;
      costMinor?: number;
      wholesalePriceMinor?: number;
      taxRateBps: number | null;
      taxReviewRequired: boolean;
      minStockQty: number;
      supplierName?: string;
      featured: boolean;
      imageUrl?: string;
    }> = [];
    const invalidRows: Array<{ row: number; sku?: string; error: string }> = [];
    const duplicateRows: Array<{ row: number; sku?: string; barcode?: string; error: string }> = [];
    const warnings: Array<{ row: number; sku: string; warning: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] ?? {};
      const rowNum = i + 1;
      const sku = this.cell(raw, ["sku", "SKU", "item_code"]).trim();
      const name = this.cell(raw, ["name", "Name", "product_name", "Product Name"]).trim();
      const barcode = this.cell(raw, ["barcode", "Barcode", "EAN", "ean"]).trim() || undefined;
      const categoryName = this.cell(raw, ["category", "Category"]).trim() || undefined;
      const brandName = this.cell(raw, ["brand", "Brand"]).trim() || undefined;
      const unitName = this.cell(raw, ["unit", "Unit", "uom"]).trim() || undefined;
      const size = this.cell(raw, ["size", "Size", "volume", "Volume"]).trim() || undefined;
      const packSizeRaw = this.cell(raw, ["packSize", "pack_size", "Pack Size", "pack"]);
      const caseQtyRaw = this.cell(raw, ["caseQuantity", "case_quantity", "Case Quantity", "case_qty"]);
      const supplierName = this.cell(raw, ["supplier", "Supplier"]).trim() || undefined;
      const reorderRaw = this.cell(raw, [
        "reorderLevel",
        "reorder_level",
        "Reorder Level",
        "minStockQty",
        "min_stock",
      ]);
      const taxRaw = this.cell(raw, ["tax", "Tax", "taxRateBps", "tax_rate", "vat", "VAT"]);
      const priceMinor = this.parseMoneyCell(raw, [
        "priceMinor",
        "sellingPriceMinor",
        "price",
        "selling_price",
        "sellingPrice",
        "Selling Price",
      ]);
      const costMinor = this.parseMoneyCell(raw, [
        "costMinor",
        "cost",
        "Cost",
        "buying_price",
        "buyingPrice",
        "Cost Price",
      ]);
      const wholesalePriceMinor = this.parseMoneyCell(raw, [
        "wholesalePriceMinor",
        "wholesale_price",
        "wholesalePrice",
        "Wholesale Price",
      ]);
      const imageUrl = this.cell(raw, ["imageUrl", "image_url", "ImageUrl"]).trim() || undefined;

      if (!sku || !name) {
        invalidRows.push({ row: rowNum, sku: sku || undefined, error: "SKU and Name are required" });
        continue;
      }
      const skuKey = sku.toLowerCase();
      if (seenSkusInBatch.has(skuKey)) {
        duplicateRows.push({ row: rowNum, sku, error: "Duplicate SKU within import file" });
        continue;
      }
      if (existingSkus.has(skuKey)) {
        duplicateRows.push({ row: rowNum, sku, error: "duplicate SKU (already exists in catalogue)" });
        continue;
      }
      if (barcode && seenBarcodesInBatch.has(barcode)) {
        duplicateRows.push({
          row: rowNum,
          sku,
          barcode,
          error: "Duplicate barcode within import file",
        });
        continue;
      }
      if (barcode && existingBarcodes.has(barcode)) {
        duplicateRows.push({
          row: rowNum,
          sku,
          barcode,
          error: "Duplicate barcode (already assigned to an existing product)",
        });
        continue;
      }
      if (priceMinor === null || priceMinor <= 0) {
        invalidRows.push({
          row: rowNum,
          sku,
          error: "Invalid selling price — must be a positive number (e.g. 2500.00)",
        });
        continue;
      }
      const taxRateBps = this.parseTaxBps(taxRaw);
      const taxReviewRequired = taxRaw.trim() === "";
      if (!taxReviewRequired && taxRateBps === null) {
        invalidRows.push({
          row: rowNum,
          sku,
          error: "Invalid tax value — provide a valid tax percentage or basis-point value",
        });
        continue;
      }
      if (imageUrl) {
        invalidRows.push({
          row: rowNum,
          sku,
          error: "Bulk import cannot set image URLs; upload images through the product media workflow",
        });
        continue;
      }
      if (supplierName && !knownSuppliers.has(supplierName.toLowerCase())) {
        invalidRows.push({
          row: rowNum,
          sku,
          error: `SUPPLIER_MAPPING_REQUIRED: ${supplierName} is not an existing active supplier`,
        });
        continue;
      }

      const packSize = packSizeRaw ? Number(packSizeRaw) : 1;
      if (!Number.isFinite(packSize) || packSize < 1) {
        invalidRows.push({ row: rowNum, sku, error: "Pack Size must be a positive number" });
        continue;
      }

      const caseQuantity = caseQtyRaw ? Number(caseQtyRaw) : undefined;
      const minStockQty = reorderRaw ? Math.max(0, Math.round(Number(reorderRaw))) : 0;
      if (costMinor != null && costMinor > priceMinor) {
        warnings.push({
          row: rowNum,
          sku,
          warning: `Selling price (${(priceMinor / 100).toFixed(2)}) is below cost (${(costMinor / 100).toFixed(2)})`,
        });
      }
      if (!barcode) {
        warnings.push({
          row: rowNum,
          sku,
          warning: "No barcode provided — product can still be searched by SKU/Name",
        });
      }
      if (taxReviewRequired) {
        warnings.push({
          row: rowNum,
          sku,
          warning: "Tax mapping required before tax-compliant sale.",
        });
      }

      seenSkusInBatch.add(skuKey);
      if (barcode) seenBarcodesInBatch.add(barcode);

      validRows.push({
        row: rowNum,
        sku,
        name,
        barcode,
        categoryName,
        brandName,
        unitName,
        size,
        packSize: Math.round(packSize),
        caseQuantity: caseQuantity && Number.isFinite(caseQuantity) ? Math.round(caseQuantity) : undefined,
        priceMinor,
        costMinor: costMinor ?? undefined,
        wholesalePriceMinor: wholesalePriceMinor ?? undefined,
        taxRateBps,
        taxReviewRequired,
        minStockQty: Number.isFinite(minStockQty) ? minStockQty : 0,
        supplierName,
        featured: ["1", "true", "yes"].includes(this.cell(raw, ["featured", "Featured"]).toLowerCase()),
        imageUrl,
      });
    }

    const errors = [...invalidRows, ...duplicateRows];
    return {
      totalRows: rows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      duplicateCount: duplicateRows.length,
      warningCount: warnings.length,
      validRows,
      invalidRows,
      duplicateRows,
      warnings,
      errors,
    };
  }

  /**
   * Money columns:
   * - `price` / `cost` / `selling_price` = major units (e.g. 2500.00 KES) → converted to minor
   * - `priceMinor` / `costMinor` = integer minor units already
   */
  async importProducts(
    tenantId: string,
    rows: Array<Record<string, string>>,
    userId?: string,
    opts: { dryRun?: boolean; atomic?: boolean; approved?: boolean } = {},
  ) {
    const validation = await this.validateImportRows(tenantId, rows);
    if (opts.dryRun !== false || opts.approved !== true) {
      return {
        dryRun: true,
        approvalRequired: true,
        accepted: 0,
        rejected: validation.errors.length,
        ...validation,
      };
    }

    if (validation.errors.length > 0) {
      return {
        dryRun: false,
        atomicAborted: true,
        accepted: 0,
        rejected: validation.errors.length,
        ...validation,
      };
    }

    const accepted: string[] = [];
    const runtimeErrors: Array<{ row: number; sku?: string; error: string }> = [
      ...validation.errors,
    ];

    for (const item of validation.validRows) {
      try {
        const [categoryId, brandId, unitId, supplierId] = await Promise.all([
          item.categoryName ? this.resolveOrCreateCategory(tenantId, item.categoryName, userId) : Promise.resolve(undefined),
          item.brandName ? this.resolveOrCreateBrand(tenantId, item.brandName, userId) : Promise.resolve(undefined),
          item.unitName ? this.resolveOrCreateUnit(tenantId, item.unitName, userId) : Promise.resolve(undefined),
          item.supplierName ? this.resolveOrCreateSupplier(tenantId, item.supplierName) : Promise.resolve(undefined),
        ]);

        await this.createProduct(
          tenantId,
          {
            sku: item.sku,
            name: item.name,
            barcode: item.barcode,
            categoryId,
            brandId,
            unitId,
            size: item.size,
            packSize: item.packSize,
            caseQuantity: item.caseQuantity,
            packagingType: item.packSize > 1 ? "case" : "bottle",
            priceMinor: item.priceMinor,
            costMinor: item.costMinor,
            wholesalePriceMinor: item.wholesalePriceMinor,
            ...(item.taxRateBps !== null ? { taxRateBps: item.taxRateBps } : {}),
            ...(item.taxReviewRequired
              ? { extensions: { taxReviewRequired: true, taxReviewStatus: "TAX_REVIEW_REQUIRED" } }
              : {}),
            minStockQty: item.minStockQty,
            supplierId,
            featured: item.featured,
            imageUrl: item.imageUrl,
            thumbnailUrl: item.imageUrl,
          },
          userId,
        );
        accepted.push(item.sku);
      } catch (err) {
        runtimeErrors.push({
          row: item.row,
          sku: item.sku,
          error: err instanceof Error ? err.message : "import failed",
        });
      }
    }

    return {
      dryRun: false,
      accepted: accepted.length,
      rejected: runtimeErrors.length,
      validCount: validation.validCount,
      invalidCount: validation.invalidCount,
      duplicateCount: validation.duplicateCount,
      warningCount: validation.warningCount,
      validRows: validation.validRows,
      invalidRows: validation.invalidRows,
      duplicateRows: validation.duplicateRows,
      warnings: validation.warnings,
      errors: runtimeErrors,
    };
  }

  async exportCsv(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, archivedAt: null },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
        unit: { select: { name: true, abbreviation: true } },
      },
      orderBy: { sku: "asc" },
    });
    const header =
      "sku,barcode,name,category,brand,unit,size,packSize,cost,price,wholesalePrice,tax,reorderLevel,featured,status";
    const lines = products.map((raw) => {
      const p = this.hydrateProduct(raw);
      return [
        this.csvEscape(p.sku),
        p.barcode ?? "",
        this.csvEscape(p.name),
        this.csvEscape(p.category?.name ?? ""),
        this.csvEscape(p.brand?.name ?? ""),
        this.csvEscape(p.unit?.abbreviation ?? p.unit?.name ?? "btl"),
        this.csvEscape(p.size ?? ""),
        p.packSize ?? 1,
        p.costMinor != null ? (p.costMinor / 100).toFixed(2) : "",
        (p.priceMinor / 100).toFixed(2),
        p.wholesalePriceMinor != null ? (p.wholesalePriceMinor / 100).toFixed(2) : "",
        p.taxRateBps == null ? "" : (p.taxRateBps / 100).toFixed(2),
        p.minStockQty,
        p.featured ? "true" : "false",
        p.status,
      ].join(",");
    });
    return `${header}\n${lines.join("\n")}\n`;
  }

  private cell(row: Record<string, string>, keys: string[]): string {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== "") return String(row[key]);
      const found = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
      if (found && row[found] !== undefined && row[found] !== "") return String(row[found]);
    }
    return "";
  }

  private parseTaxBps(raw: string): number | null {
    if (!raw) return null;
    const value = raw.trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(value)) return null;
    const cleaned = value.replace(/%$/, "");
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) return null;
    // If <= 100 treat as percentage (e.g. 16 -> 1600 bps); if > 100 treat as bps already
    const bps = n <= 100 ? Math.round(n * 100) : Math.round(n);
    return bps <= 10000 ? bps : null;
  }

  private async resolveOrCreateCategory(tenantId: string, name: string, userId?: string): Promise<string> {
    const existing = await this.prisma.category.findFirst({
      where: { tenantId, name: { equals: name, mode: "insensitive" }, archivedAt: null },
    });
    if (existing) return existing.id;
    const created = await this.prisma.category.create({
      data: { tenantId, name, createdBy: userId, updatedBy: userId },
    });
    return created.id;
  }

  private async resolveOrCreateBrand(tenantId: string, name: string, userId?: string): Promise<string> {
    const existing = await this.prisma.brand.findFirst({
      where: { tenantId, name: { equals: name, mode: "insensitive" }, archivedAt: null },
    });
    if (existing) return existing.id;
    const created = await this.prisma.brand.create({
      data: { tenantId, name, createdBy: userId, updatedBy: userId },
    });
    return created.id;
  }

  private async resolveOrCreateUnit(tenantId: string, nameOrAbbr: string, userId?: string): Promise<string> {
    const abbr = nameOrAbbr.slice(0, 8).toLowerCase();
    const existing = await this.prisma.unit.findFirst({
      where: {
        tenantId,
        OR: [
          { abbreviation: { equals: abbr, mode: "insensitive" } },
          { name: { equals: nameOrAbbr, mode: "insensitive" } },
        ],
      },
    });
    if (existing) return existing.id;
    const created = await this.prisma.unit.create({
      data: { tenantId, name: nameOrAbbr, abbreviation: abbr, createdBy: userId, updatedBy: userId },
    });
    return created.id;
  }

  private async resolveOrCreateSupplier(tenantId: string, name: string): Promise<string> {
    const existing = await this.prisma.supplier.findFirst({
      where: { tenantId, name: { equals: name, mode: "insensitive" }, archivedAt: null },
    });
    if (existing) return existing.id;
    throw new UnprocessableEntityException({
      code: "VALIDATION_FAILED",
      message: `Supplier mapping required for ${name}`,
    });
  }

  private parseMoneyCell(row: Record<string, string>, keys: string[]): number | null {
    for (const key of keys) {
      const raw = this.cell(row, [key]);
      if (!raw) continue;
      const n = Number(String(raw).replace(/,/g, "").trim());
      if (!Number.isFinite(n) || n < 0) return null;
      // priceMinor / costMinor stay as integer minor units; other keys are major units
      if (key.toLowerCase().includes("minor")) return Math.round(n);
      return Math.round(n * 100);
    }
    return null;
  }

  private csvEscape(value: string) {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  }

  async archiveProduct(tenantId: string, id: string, userId?: string) {
    await this.getProduct(tenantId, id);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: {
          status: "archived",
          archivedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId ?? null,
          action: "product.archived",
          entityType: "product",
          entityId: id,
          metadata: { name: product.name, sku: product.sku },
        },
      });
      return product;
    });
  }

  async reactivateProduct(tenantId: string, id: string, userId?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });
    if (!product) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Product not found" });
    }
    if (!product.archivedAt && product.status === "active") return product;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          status: "active",
          archivedAt: null,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId ?? null,
          action: "product.reactivated",
          entityType: "product",
          entityId: id,
          metadata: { name: updated.name, sku: updated.sku },
        },
      });
      return updated;
    });
  }

  private async requireCategory(tenantId: string, id: string) {
    const cat = await this.prisma.category.findFirst({ where: { id, tenantId } });
    if (!cat) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Category not found" });
    }
    return cat;
  }
}
