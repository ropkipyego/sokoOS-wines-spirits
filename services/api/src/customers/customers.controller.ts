import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsEmail, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { CustomersService } from "./customers.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard, hasAnyPermission } from "../common/guards/permissions.guard";
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

class CustomerPaymentDto {
  @IsInt() @Min(1) amountMinor!: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() notes?: string;
}

@Controller("customers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  /** Admin CRM or POS lookup (`pos.customers` / sales.create during sell). */
  @Get()
  @RequirePermissions("customers.read", "pos.customers", "sales.create")
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
  @RequirePermissions("customers.create", "customers.write", "pos.customers", "sales.create")
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateCustomerDto) {
    const canAdmin = hasAnyPermission(user.permissions, [
      "customers.create",
      "customers.write",
      "customers.edit",
      "customers.credit",
    ]);
    // POS-only operators may create a minimal customer (name/phone/email) — no credit admin.
    const safeBody = canAdmin
      ? body
      : {
          name: body.name,
          phone: body.phone,
          email: body.email,
        };
    return { data: await this.customers.create(user.tenantId!, safeBody, user.id) };
  }

  @Get(":id/statement")
  @RequirePermissions("customers.read", "sales.read", "sales.view")
  async statement(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.customers.statement(user.tenantId!, id) };
  }

  @Post(":id/payments")
  @RequirePermissions("customers.credit")
  async recordPayment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: CustomerPaymentDto,
  ) {
    return {
      data: await this.customers.recordPayment(user.tenantId!, id, body, user.id),
    };
  }

  @Get(":id")
  @RequirePermissions("customers.read", "pos.customers", "sales.create")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return { data: await this.customers.get(user.tenantId!, id) };
  }

  @Patch(":id")
  @RequirePermissions("customers.edit", "customers.write")
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
    if (
      (body.creditLimitMinor !== undefined || body.creditBalanceMinor !== undefined) &&
      !hasAnyPermission(user.permissions, ["customers.credit"])
    ) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Missing permission: customers.credit",
      });
    }
    return { data: await this.customers.update(user.tenantId!, id, body, user.id) };
  }
}
