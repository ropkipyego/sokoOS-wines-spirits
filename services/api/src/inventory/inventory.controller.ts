import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";
import { InventoryService } from "./inventory.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthUser } from "../common/tenant-context";

class CreateWarehouseDto {
  @IsUUID() branchId!: string;
  @IsString() name!: string;
  @IsOptional() isDefault?: boolean;
}

class CreateMovementDto {
  @IsOptional() @IsUUID() id?: string;
  @IsUUID() warehouseId!: string;
  @IsUUID() productId!: string;
  @IsUUID() branchId!: string;
  @IsString() type!: string;
  @IsInt() quantityDelta!: number;
  @IsOptional() @IsInt() unitCostMinor?: number;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsUUID() referenceId?: string;
  @IsOptional() @IsString() reason?: string;
}

class TransferDto {
  @IsUUID() fromWarehouseId!: string;
  @IsUUID() toWarehouseId!: string;
  @IsUUID() productId!: string;
  @IsUUID() branchId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() reason?: string;
}

class CountReconcileDto {
  @IsUUID() warehouseId!: string;
  @IsUUID() branchId!: string;
  @IsUUID() productId!: string;
  @IsInt() @Min(0) countedQuantity!: number;
  @IsOptional() @IsString() reason?: string;
}

class WriteOffDto {
  @IsUUID() warehouseId!: string;
  @IsUUID() branchId!: string;
  @IsUUID() productId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() writeOffType?: "DAMAGE" | "EXPIRED" | "WRITE_OFF";
  @IsString() reason!: string;
}

class ConvertPackagingDto {
  @IsUUID() warehouseId!: string;
  @IsUUID() branchId!: string;
  @IsUUID() caseProductId!: string;
  @IsOptional() @IsUUID() bottleProductId?: string;
  @IsInt() @Min(1) casesToBreak!: number;
  @IsOptional() @IsInt() @Min(2) bottlesPerCase?: number;
  @IsOptional() @IsString() reason?: string;
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("warehouses")
  @RequirePermissions("inventory.read")
  async warehouses(
    @CurrentUser() user: AuthUser,
    @Query("branchId") branchId?: string,
  ) {
    return {
      data: await this.inventory.listWarehouses(user.tenantId!, branchId),
    };
  }

  @Post("warehouses")
  @RequirePermissions("inventory.adjust")
  async createWarehouse(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateWarehouseDto,
  ) {
    return {
      data: await this.inventory.createWarehouse(user.tenantId!, body, user.id),
    };
  }

  /** Stock levels for inventory admin, or read-only availability during POS sale. */
  @Get("stock/balances")
  @RequirePermissions("inventory.read", "sales.create")
  async balances(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      warehouseId?: string;
      productId?: string;
      limit?: string;
      cursor?: string;
    },
  ) {
    return this.inventory.listBalances(user.tenantId!, {
      warehouseId: query.warehouseId,
      productId: query.productId,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    });
  }

  @Get("stock/movements")
  @RequirePermissions("inventory.read")
  async movements(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      warehouseId?: string;
      productId?: string;
      type?: string;
      from?: string;
      to?: string;
      limit?: string;
      cursor?: string;
    },
  ) {
    return this.inventory.listMovements(user.tenantId!, {
      ...query,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @Post("stock/movements")
  @RequirePermissions("inventory.adjust")
  async createMovement(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateMovementDto,
  ) {
    return {
      data: await this.inventory.createMovement(
        user.tenantId!,
        {
          ...body,
          deviceId: user.deviceId ?? null,
        },
        user.id,
      ),
    };
  }

  @Post("stock/transfers")
  @RequirePermissions("inventory.transfer")
  async transfer(@CurrentUser() user: AuthUser, @Body() body: TransferDto) {
    return {
      data: await this.inventory.transfer(user.tenantId!, body, user.id),
    };
  }

  @Post("inventory/adjust")
  @RequirePermissions("inventory.adjust")
  async adjustStock(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateMovementDto,
  ) {
    return {
      data: await this.inventory.createMovement(
        user.tenantId!,
        {
          ...body,
          type: body.type || "ADJUSTMENT",
          deviceId: user.deviceId ?? null,
        },
        user.id,
      ),
    };
  }

  @Post("inventory/receive")
  @RequirePermissions("inventory.receive", "inventory.adjust")
  async receiveOpeningOrDirectStock(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateMovementDto,
  ) {
    return {
      data: await this.inventory.createMovement(
        user.tenantId!,
        {
          ...body,
          type: body.type || "OPENING_STOCK",
          quantityDelta: Math.abs(body.quantityDelta),
          deviceId: user.deviceId ?? null,
        },
        user.id,
      ),
    };
  }

  @Post("inventory/count")
  @RequirePermissions("inventory.count", "inventory.adjust")
  async reconcileCount(
    @CurrentUser() user: AuthUser,
    @Body() body: CountReconcileDto,
  ) {
    return {
      data: await this.inventory.reconcileCount(user.tenantId!, body, user.id),
    };
  }

  @Post("inventory/writeoff")
  @RequirePermissions("inventory.writeoff", "inventory.adjust")
  async writeOff(@CurrentUser() user: AuthUser, @Body() body: WriteOffDto) {
    return {
      data: await this.inventory.writeOff(user.tenantId!, body, user.id),
    };
  }

  @Post("inventory/convert-packaging")
  @RequirePermissions("inventory.adjust", "inventory.transfer")
  async convertPackaging(
    @CurrentUser() user: AuthUser,
    @Body() body: ConvertPackagingDto,
  ) {
    return {
      data: await this.inventory.convertPackaging(user.tenantId!, body, user.id),
    };
  }

  // --- Multi-Item Stock Take Endpoints ---

  @Get("inventory/stock-take")
  @RequirePermissions("inventory.read")
  async listStockTakes(
    @CurrentUser() user: AuthUser,
    @Query("branchId") branchId?: string,
  ) {
    return { data: await this.inventory.listStockTakeSessions(user.tenantId!, branchId) };
  }

  @Post("inventory/stock-take")
  @RequirePermissions("inventory.count", "inventory.adjust")
  async createStockTake(
    @CurrentUser() user: AuthUser,
    @Body() body: { branchId: string; warehouseId: string; categoryId?: string; brandId?: string; notes?: string },
  ) {
    return { data: await this.inventory.createStockTakeSession(user.tenantId!, body, user.id) };
  }

  @Get("inventory/stock-take/:id")
  @RequirePermissions("inventory.read")
  async getStockTake(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.inventory.getStockTakeSession(user.tenantId!, id) };
  }

  @Put("inventory/stock-take/:id")
  @RequirePermissions("inventory.count", "inventory.adjust")
  async updateStockTake(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { items: Array<{ productId: string; countedQuantity: number; varianceReason?: string; notes?: string }> },
  ) {
    return { data: await this.inventory.updateStockTakeCounts(user.tenantId!, id, body.items ?? [], user.id) };
  }

  @Post("inventory/stock-take/:id/submit")
  @RequirePermissions("inventory.count", "inventory.adjust")
  async submitStockTake(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.inventory.submitStockTakeSession(user.tenantId!, id, user.id) };
  }

  @Post("inventory/stock-take/:id/reconcile")
  @RequirePermissions("inventory.adjust")
  async reconcileStockTake(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.inventory.reconcileStockTakeSession(user.tenantId!, id, user.id) };
  }

  @Post("inventory/stock-take/:id/cancel")
  @RequirePermissions("inventory.adjust")
  async cancelStockTake(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.inventory.cancelStockTakeSession(user.tenantId!, id, user.id) };
  }
}

