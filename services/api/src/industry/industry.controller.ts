import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";
import { IndustryService } from "./industry.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthUser } from "../common/tenant-context";

class PriceListDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
}

class PriceItemDto {
  @IsUUID() productId!: string;
  @IsInt() @Min(0) priceMinor!: number;
  @IsOptional() @IsInt() @Min(1) minQuantity?: number;
}

class AssignPriceListDto {
  @IsOptional() @IsUUID() priceListId?: string | null;
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IndustryController {
  constructor(private readonly industry: IndustryService) {}

  @Get("wholesale/price-lists")
  @RequirePermissions("products.read", "customers.read")
  priceLists(@CurrentUser() user: AuthUser) {
    return this.industry.listPriceLists(user.tenantId!).then((data) => ({ data }));
  }

  @Post("wholesale/price-lists")
  @RequirePermissions("products.write")
  createList(@CurrentUser() user: AuthUser, @Body() body: PriceListDto) {
    return this.industry.createPriceList(user.tenantId!, body).then((data) => ({ data }));
  }

  @Get("wholesale/price-lists/:id/items")
  @RequirePermissions("products.read")
  listItems(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.industry.listPriceListItems(user.tenantId!, id).then((data) => ({ data }));
  }

  @Post("wholesale/price-lists/:id/items")
  @RequirePermissions("products.write")
  upsertItem(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: PriceItemDto) {
    return this.industry.upsertPriceListItem(user.tenantId!, id, body).then((data) => ({ data }));
  }

  @Patch("wholesale/customers/:customerId/price-list")
  @RequirePermissions("customers.write")
  assignList(
    @CurrentUser() user: AuthUser,
    @Param("customerId") customerId: string,
    @Body() body: AssignPriceListDto,
  ) {
    return this.industry
      .assignCustomerPriceList(user.tenantId!, customerId, body.priceListId ?? null)
      .then((data) => ({ data }));
  }
}
