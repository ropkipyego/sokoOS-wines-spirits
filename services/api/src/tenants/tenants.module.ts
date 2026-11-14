import { Module } from "@nestjs/common";
import { TenantsService } from "./tenants.service";
import { SetupService } from "./setup.service";
import { TenantsController } from "./tenants.controller";

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, SetupService],
  exports: [TenantsService, SetupService],
})
export class TenantsModule {}
