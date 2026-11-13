import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { IsObject, IsOptional, IsString } from "class-validator";
import { TenantsService } from "./tenants.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
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

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

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
