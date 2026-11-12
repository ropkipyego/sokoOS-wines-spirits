import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { CustomersService } from "./customers.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthUser } from "../common/tenant-context";

class CreateCustomerDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() address?: unknown;
  @IsOptional() creditLimitMinor?: number;
  @IsOptional() @IsString() notes?: string;
}

@Controller("customers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions("sales.read", "customers.read")
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: { limit?: string; cursor?: string; q?: string },
  ) {
    return this.customers.list(user.tenantId!, {
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
      q: query.q,
    });
  }

  @Post()
  @RequirePermissions("sales.create", "customers.write", "customers.create")
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateCustomerDto) {
    return { data: await this.customers.create(user.tenantId!, body, user.id) };
  }

  @Get(":id/statement")
  @RequirePermissions("sales.read", "customers.read")
  async statement(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.customers.statement(user.tenantId!, id) };
  }

  @Get(":id")
  @RequirePermissions("sales.read", "customers.read")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.customers.get(user.tenantId!, id) };
  }

  @Patch(":id")
  @RequirePermissions("sales.create", "customers.write", "customers.edit")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body()
    body: Partial<CreateCustomerDto> & {
      status?: string;
      creditBalanceMinor?: number;
      loyaltyPoints?: number;
    },
  ) {
    return { data: await this.customers.update(user.tenantId!, id, body, user.id) };
  }
}
