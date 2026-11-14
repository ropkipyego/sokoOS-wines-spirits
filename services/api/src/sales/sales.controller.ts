import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { SalesService } from "./sales.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard, hasAnyPermission } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthUser } from "../common/tenant-context";

class SaleItemDto {
  @IsUUID() productId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsInt() unitPriceMinor?: number;
  @IsOptional() @IsInt() discountMinor?: number;
  @IsOptional() @IsInt() taxMinor?: number;
}

class SalePaymentDto {
  @IsString() method!: string;
  @IsInt() @Min(1) amountMinor!: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsInt() tenderedMinor?: number;
  @IsOptional() @IsInt() changeMinor?: number;
  @IsOptional() @IsString() status?: string;
}

class CreateSaleDto {
  @IsOptional() @IsUUID() id?: string;
  @IsUUID() branchId!: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() deviceId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() occurredAt?: string;
  @IsOptional() @IsInt() discountMinor?: number;
  @IsOptional() @IsInt() deliveryFeeMinor?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() orderType?: string;
  @IsOptional() @IsString() tableCode?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() waiterUserId?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SaleItemDto)
  items!: SaleItemDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => SalePaymentDto)
  payments!: SalePaymentDto[];
}

@Controller("sales")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermissions("sales.read", "sales.view", "sales.view_own")
  async list(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      branchId?: string;
      departmentId?: string;
      limit?: string;
      cursor?: string;
      from?: string;
      to?: string;
    },
  ) {
    const canViewAll = hasAnyPermission(user.permissions, ["sales.read", "sales.view"]);
    return this.sales.list(user.tenantId!, {
      branchId: query.branchId,
      departmentId: query.departmentId,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
      from: query.from,
      to: query.to,
      cashierUserId: canViewAll ? undefined : user.id,
    });
  }

  @Post()
  @RequirePermissions("sales.create")
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateSaleDto) {
    const data = await this.sales.create(user.tenantId!, user.id, {
      ...body,
      deviceId: body.deviceId ?? user.deviceId,
      userPermissions: user.permissions,
    });
    return { data };
  }

  @Get(":id")
  @RequirePermissions("sales.read", "sales.view", "sales.view_own")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const canViewAll = hasAnyPermission(user.permissions, ["sales.read", "sales.view"]);
    return {
      data: await this.sales.get(
        user.tenantId!,
        id,
        canViewAll ? undefined : user.id,
      ),
    };
  }

  @Post(":id/reprint")
  @RequirePermissions("sales.reprint", "sales.read", "sales.create")
  async reprint(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.sales.reprintReceipt(user.tenantId!, id, user.id) };
  }

  @Post(":id/void")
  @RequirePermissions("sales.void")
  async voidSale(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.sales.voidSale(user.tenantId!, id, user.id) };
  }
}
