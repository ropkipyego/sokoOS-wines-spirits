import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { SuppliersService } from "./suppliers.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthUser } from "../common/tenant-context";

class CreateSupplierDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() taxPin?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() address?: string;
}

@Controller("suppliers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions("suppliers.read")
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: { limit?: string; cursor?: string },
  ) {
    return this.suppliers.list(user.tenantId!, {
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    });
  }

  @Post()
  @RequirePermissions("suppliers.write", "suppliers.create")
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateSupplierDto) {
    return { data: await this.suppliers.create(user.tenantId!, body, user.id) };
  }

  @Get(":id/statement")
  @RequirePermissions("suppliers.read")
  async statement(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.suppliers.statement(user.tenantId!, id) };
  }

  @Get(":id")
  @RequirePermissions("suppliers.read")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.suppliers.get(user.tenantId!, id) };
  }

  @Patch(":id")
  @RequirePermissions("suppliers.write", "suppliers.edit")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: Partial<CreateSupplierDto> & { status?: string; paidMinor?: number },
  ) {
    return { data: await this.suppliers.update(user.tenantId!, id, body, user.id) };
  }
}
