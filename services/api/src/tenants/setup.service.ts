import {
  Injectable,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { CORE_PERMISSION_KEYS, EDITION_CONFIGS, PRODUCT_EDITION } from "@sokoos/types";
import { SystemRole } from "@sokoos/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE_PERMISSION_TEMPLATES } from "../roles/roles.service";
import { assertPasswordPolicy } from "../auth/password-policy";

export type SetupBusinessInput = {
  businessName: string;
  ownerName: string;
  email: string;
  phone?: string;
  password: string;
  confirmPassword: string;
  tenantSlug?: string;
};

/**
 * First-install business setup. Only allowed when zero tenants exist.
 * Does not wipe or recreate an existing JAYWINES (or any) tenant.
 */
@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async status() {
    const count = await this.prisma.tenant.count();
    return {
      needsSetup: count === 0,
      tenantCount: count,
      productEdition: PRODUCT_EDITION,
    };
  }

  async setupBusiness(input: SetupBusinessInput) {
    const count = await this.prisma.tenant.count();
    if (count > 0) {
      throw new ConflictException({
        code: "SETUP_ALREADY_COMPLETE",
        message: "A business already exists. Login with your owner account.",
      });
    }

    const businessName = input.businessName.trim();
    const ownerName = input.ownerName.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    const confirm = input.confirmPassword;

    if (!businessName || !ownerName || !email) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Business name, owner name, and email are required",
      });
    }
    if (password !== confirm) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Password and confirmation do not match",
      });
    }
    assertPasswordPolicy(password);

    const slug = (input.tenantSlug?.trim() || slugify(businessName) || "jaywines")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "jaywines";

    const edition = EDITION_CONFIGS.WINES_SPIRITS;

    for (const key of CORE_PERMISSION_KEYS) {
      await this.prisma.permission.upsert({
        where: { key },
        create: {
          key,
          description: key,
          category: key.split(".")[0] ?? "core",
        },
        update: {},
      });
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: businessName,
        slug,
        currency: "KES",
        timezone: "Africa/Nairobi",
        locale: "en-KE",
        status: "active",
        email,
        phone: input.phone?.trim() || null,
        businessTypes: ["wines_spirits", "retail", "wholesale"],
        modulesEnabled: edition.modulesAllowed,
        settings: {
          negativeStockPolicy: "block",
          businessMode: "retail",
          restaurantEnabled: false,
        },
        onboardingStatus: "complete",
      },
    });

    await this.prisma.authzVersion.create({
      data: { tenantId: tenant.id, version: 1 },
    });

    const branch = await this.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: "MAIN BRANCH",
        code: "MAIN",
        status: "active",
      },
    });

    await this.prisma.warehouse.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        name: "Main Cellar & Counter",
        isDefault: true,
        status: "active",
      },
    });

    for (const u of edition.defaultUnits) {
      await this.prisma.unit.create({
        data: {
          tenantId: tenant.id,
          name: u.name,
          abbreviation: u.abbreviation,
        },
      });
    }

    let ownerRoleId = "";
    for (const [key, perms] of Object.entries(ROLE_PERMISSION_TEMPLATES)) {
      if (key === SystemRole.PlatformOwner) continue;
      const role = await this.prisma.role.create({
        data: {
          tenantId: tenant.id,
          key,
          name: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          isSystem: true,
        },
      });
      const permRows = await this.prisma.permission.findMany({
        where: { key: { in: [...perms] } },
      });
      if (permRows.length) {
        await this.prisma.rolePermission.createMany({
          data: permRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
        });
      }
      if (key === SystemRole.BusinessOwner) ownerRoleId = role.id;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const owner = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        name: ownerName,
        phone: input.phone?.trim() || null,
        passwordHash,
        status: "active",
        mustChangePassword: false,
      },
    });

    await this.prisma.userRole.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        roleId: ownerRoleId,
        branchId: null,
      },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: owner.id,
          action: "business.setup",
          entityType: "tenant",
          entityId: tenant.id,
          metadata: { slug, ownerEmail: email },
        },
      });
    } catch {
      /* non-blocking */
    }

    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      owner: { id: owner.id, email: owner.email, name: owner.name },
      branch: { id: branch.id, name: branch.name, code: branch.code },
    };
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
