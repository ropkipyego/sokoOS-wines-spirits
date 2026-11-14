import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { TenantsService } from "./tenants.service";
import { SetupService } from "./setup.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { Public, RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthUser } from "../common/tenant-context";

class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsObject() taxConfig?: object;
  @IsOptional() @IsObject() settings?: object;
  @IsOptional() businessTypes?: unknown;
  @IsOptional() modulesEnabled?: unknown;
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
}

class SetupBusinessDto {
  @IsString() @MinLength(2) businessName!: string;
  @IsString() @MinLength(2) ownerName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @MinLength(10) password!: string;
  @IsString() @MinLength(10) confirmPassword!: string;
  @IsOptional() @IsString() tenantSlug?: string;
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly setup: SetupService,
  ) {}

  @Public()
  @Get("setup/status")
  async setupStatus() {
    return { data: await this.setup.status() };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("setup/business")
  async setupBusiness(@Body() body: SetupBusinessDto) {
    const data = await this.setup.setupBusiness(body);
    return { data };
  }

  @Get("tenant")
  @RequirePermissions("tenant.settings.read")
  async current(@CurrentUser() user: AuthUser) {
    const data = await this.tenants.getCurrent(user.tenantId!);
    return { data };
  }

  @Patch("tenant")
  @RequirePermissions("tenant.settings.write")
  async update(@CurrentUser() user: AuthUser, @Body() body: UpdateTenantDto) {
    const data = await this.tenants.updateCurrent(user.tenantId!, body);
    return { data };
  }
}
