import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CatalogService } from "./catalog.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard, hasAnyPermission } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthUser } from "../common/tenant-context";

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // Categories
  @Get("categories")
  @RequirePermissions("categories.read")
  async listCategories(@CurrentUser() user: AuthUser) {
    return { data: await this.catalog.listCategories(user.tenantId!) };
  }

  @Post("categories")
  @RequirePermissions("categories.write")
  async createCategory(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string; parentId?: string; sortOrder?: number },
  ) {
    return {
      data: await this.catalog.createCategory(user.tenantId!, body, user.id),
    };
  }

  @Patch("categories/:id")
  @RequirePermissions("categories.write")
  async updateCategory(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      parentId?: string | null;
      sortOrder?: number;
      status?: string;
    },
  ) {
    return {
      data: await this.catalog.updateCategory(user.tenantId!, id, body, user.id),
    };
  }

  // Brands
  @Get("brands")
  @RequirePermissions("categories.read")
  async listBrands(@CurrentUser() user: AuthUser) {
    return { data: await this.catalog.listBrands(user.tenantId!) };
  }

  @Post("brands")
  @RequirePermissions("categories.write")
  async createBrand(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string },
  ) {
    return {
      data: await this.catalog.createBrand(user.tenantId!, body.name, user.id),
    };
  }

  @Patch("brands/:id")
  @RequirePermissions("categories.write")
  async updateBrand(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { name?: string; status?: string },
  ) {
    return {
      data: await this.catalog.updateBrand(user.tenantId!, id, body, user.id),
    };
  }

  // Units
  @Get("units")
  @RequirePermissions("categories.read")
  async listUnits(@CurrentUser() user: AuthUser) {
    return { data: await this.catalog.listUnits(user.tenantId!) };
  }

  @Post("units")
  @RequirePermissions("categories.write")
  async createUnit(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string; abbreviation: string },
  ) {
    return {
      data: await this.catalog.createUnit(user.tenantId!, body, user.id),
    };
  }

  @Patch("units/:id")
  @RequirePermissions("categories.write")
  async updateUnit(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { name?: string; abbreviation?: string; status?: string },
  ) {
    return {
      data: await this.catalog.updateUnit(user.tenantId!, id, body, user.id),
    };
  }

  // Products
  @Get("products")
  @RequirePermissions("products.read")
  async listProducts(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      limit?: string;
      cursor?: string;
      q?: string;
      sku?: string;
      barcode?: string;
      categoryId?: string;
      status?: string;
      featured?: string;
    },
  ) {
    return this.catalog.listProducts(user.tenantId!, {
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
      q: query.q,
      sku: query.sku,
      barcode: query.barcode,
      categoryId: query.categoryId,
      status: query.status,
      featured: query.featured === "true",
    });
  }

  @Get("products/export.csv")
  @RequirePermissions("products.read")
  @Header("Content-Type", "text/csv")
  async exportCsv(@CurrentUser() user: AuthUser) {
    return this.catalog.exportCsv(user.tenantId!);
  }

  @Get("products/import-template.csv")
  @RequirePermissions("products.import", "products.read")
  @Header("Content-Type", "text/csv")
  importTemplate() {
    return [
      "sku,barcode,name,category,brand,unit,size,packSize,cost,price,wholesalePrice,tax,reorderLevel,supplier,featured",
      "JW-BLACK-750ML,5000267023656,Johnnie Walker Black Label 750ml,Whisky,Johnnie Walker,Bottle,750ml,1,2850.00,3600.00,3350.00,16,12,KBL Distributors,true",
      "JW-BLACK-CASE12,5000267023663,Johnnie Walker Black Label Case (12x750ml),Whisky,Johnnie Walker,Case,12x750ml,12,33000.00,39600.00,38400.00,16,3,KBL Distributors,false",
      "FOUR-COUSINS-750ML,6009609860081,Four Cousins Natural Sweet Red 750ml,Wine,Four Cousins,Bottle,750ml,1,920.00,1350.00,1200.00,16,18,Viva Global Wine,true",
      "TUSKER-500ML-CAN,6161101600128,Tusker Lager Can 500ml,Beer,Tusker,Can,500ml,1,195.00,260.00,235.00,16,48,KBL Distributors,true",
      "",
    ].join("\n");
  }

  @Post("products/import/validate")
  @RequirePermissions("products.import", "products.write")
  async validateImport(
    @CurrentUser() user: AuthUser,
    @Body() body: { rows: Array<Record<string, string>> },
  ) {
    return {
      data: await this.catalog.validateImportRows(user.tenantId!, body.rows ?? []),
    };
  }

  @Post("products/import")
  @RequirePermissions("products.import", "products.write")
  async importProducts(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      rows: Array<Record<string, string>>;
      dryRun?: boolean;
      atomic?: boolean;
    },
  ) {
    return {
      data: await this.catalog.importProducts(
        user.tenantId!,
        body.rows ?? [],
        user.id,
        { dryRun: body.dryRun, atomic: body.atomic },
      ),
    };
  }

  @Post("products")
  @RequirePermissions("products.write", "products.create")
  async createProduct(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
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
    },
  ) {
    return {
      data: await this.catalog.createProduct(user.tenantId!, body, user.id),
    };
  }

  @Get("products/:id")
  @RequirePermissions("products.read")
  async getProduct(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.catalog.getProduct(user.tenantId!, id) };
  }

  @Patch("products/:id")
  @RequirePermissions("products.write", "products.edit")
  async updateProduct(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      barcode?: string | null;
      description?: string | null;
      categoryId?: string | null;
      brandId?: string | null;
      unitId?: string | null;
      priceMinor?: number;
      costMinor?: number | null;
      wholesalePriceMinor?: number | null;
      taxRateBps?: number;
      trackInventory?: boolean;
      featured?: boolean;
      minStockQty?: number;
      status?: string;
      version?: number;
      size?: string | null;
      abv?: string | null;
      packSize?: number | null;
      caseQuantity?: number | null;
      packagingType?: string | null;
      bottleProductId?: string | null;
      conversionFactor?: number | null;
      supplierId?: string | null;
      branchIds?: string[];
      warehouseIds?: string[];
    },
  ) {
    const touchesPrice =
      body.priceMinor !== undefined ||
      body.costMinor !== undefined ||
      body.wholesalePriceMinor !== undefined;
    if (
      touchesPrice &&
      !hasAnyPermission(user.permissions, ["products.change_price"])
    ) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Missing permission: products.change_price",
        details: [
          {
            path: "permission",
            message: "products.change_price",
            code: "missing_permission",
          },
        ],
      });
    }
    return {
      data: await this.catalog.updateProduct(user.tenantId!, id, body, user.id),
    };
  }

  @Post("products/:id/image")
  @RequirePermissions("products.write")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 2_000_000 } }))
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      return { error: { code: "VALIDATION_FAILED", message: "file is required" } };
    }
    return {
      data: await this.catalog.setImage(user.tenantId!, id, file, user.id),
    };
  }

  @Delete("products/:id/image")
  @RequirePermissions("products.write")
  async clearImage(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.catalog.clearImage(user.tenantId!, id, user.id) };
  }

  @Post("products/:id/archive")
  @RequirePermissions("products.write")
  async archiveProduct(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return {
      data: await this.catalog.archiveProduct(user.tenantId!, id, user.id),
    };
  }
}
