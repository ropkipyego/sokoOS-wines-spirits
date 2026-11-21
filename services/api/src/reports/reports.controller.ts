import { Body, Controller, Delete, Get, Header, Put, Query, UseGuards } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthUser } from "../common/tenant-context";

@Controller("reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("analytics")
  @RequirePermissions("reports.read")
  async analytics(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      period?: string;
      from?: string;
      to?: string;
      comparison?: string;
      compareFrom?: string;
      compareTo?: string;
      branchId?: string;
    },
  ) {
    return { data: await this.reports.analytics(user.tenantId!, query) };
  }

  @Get("dashboard-config")
  @RequirePermissions("reports.read")
  async getDashboardConfig(@CurrentUser() user: AuthUser) {
    return { data: await this.reports.getDashboardConfig(user.tenantId!, user.id) };
  }

  @Put("dashboard-config")
  @RequirePermissions("reports.read")
  async putDashboardConfig(
    @CurrentUser() user: AuthUser,
    @Body() body: { widgets?: string[]; order?: string[] },
  ) {
    return { data: await this.reports.saveDashboardConfig(user.tenantId!, user.id, body) };
  }

  @Delete("dashboard-config")
  @RequirePermissions("reports.read")
  async resetDashboardConfig(@CurrentUser() user: AuthUser) {
    return { data: await this.reports.resetDashboardConfig(user.tenantId!, user.id) };
  }

  @Get("daily-summary")
  @RequirePermissions("reports.read")
  async dailySummary(
    @CurrentUser() user: AuthUser,
    @Query() query: { date?: string; branchId?: string; departmentId?: string },
  ) {
    return {
      data: await this.reports.dailySummary(user.tenantId!, query),
    };
  }

  @Get("department-sales")
  @RequirePermissions("reports.read")
  async departmentSales(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string; branchId?: string },
  ) {
    return { data: await this.reports.departmentSales(user.tenantId!, query) };
  }

  @Get("finance")
  @RequirePermissions("reports.read")
  async finance(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string; branchId?: string; departmentId?: string },
  ) {
    return { data: await this.reports.financeSummary(user.tenantId!, query) };
  }

  @Get("low-stock")
  @RequirePermissions("reports.read")
  async lowStock(
    @CurrentUser() user: AuthUser,
    @Query()
    query: { threshold?: string; warehouseId?: string; limit?: string },
  ) {
    return {
      data: await this.reports.lowStock(user.tenantId!, {
        threshold: query.threshold ? Number(query.threshold) : undefined,
        warehouseId: query.warehouseId,
        limit: query.limit ? Number(query.limit) : undefined,
      }),
    };
  }

  @Get("sales")
  @RequirePermissions("reports.read")
  async sales(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string; branchId?: string },
  ) {
    return { data: await this.reports.salesReport(user.tenantId!, query) };
  }

  @Get("dashboard")
  @RequirePermissions("reports.read")
  async dashboard(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string; branchId?: string },
  ) {
    return { data: await this.reports.dashboard(user.tenantId!, query) };
  }

  @Get("comprehensive")
  @RequirePermissions("reports.read", "reports.sales", "reports.inventory", "reports.financial")
  async comprehensive(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string; branchId?: string },
  ) {
    return { data: await this.reports.comprehensiveReport(user.tenantId!, query) };
  }

  @Get("export.csv")
  @RequirePermissions("reports.export")
  @Header("Content-Type", "text/csv")
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string; branchId?: string },
  ) {
    return this.reports.exportSalesCsv(user.tenantId!, query);
  }
}
