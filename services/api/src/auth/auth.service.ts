import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { PRODUCT_EDITION, getEditionConfig } from "@sokoos/types";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtPayload } from "./jwt.strategy";
import { RolesService } from "../roles/roles.service";

export type LoginInput = {
  email: string;
  password: string;
  deviceId?: string;
  branchId?: string;
  tenantSlug?: string;
  host?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly roles: RolesService,
  ) {}

  async login(input: LoginInput) {
    const email = input.email.trim().toLowerCase();
    const effectiveSlug = input.tenantSlug?.trim() || undefined;

    const users = await this.prisma.user.findMany({
      where: {
        email,
        status: "active",
        tenantId: { not: null },
        ...(effectiveSlug ? { tenant: { slug: effectiveSlug } } : {}),
      },
      include: {
        tenant: true,
        userRoles: { include: { role: true, branch: true } },
      },
      take: 5,
    });

    if (users.length === 0) {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }

    let matched = null as (typeof users)[number] | null;
    for (const u of users) {
      const ok = await bcrypt.compare(input.password, u.passwordHash);
      if (ok) {
        matched = u;
        break;
      }
    }
    if (!matched || !matched.tenantId || !matched.tenant) {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }

    if (matched.tenant.status !== "active") {
      throw new ForbiddenException({
        code: "TENANT_SUSPENDED",
        message: "Business account is not active",
      });
    }

    if (input.deviceId) {
      const device = await this.prisma.device.findFirst({
        where: {
          id: input.deviceId,
          tenantId: matched.tenantId,
        },
      });
      if (device && device.status === "disabled") {
        throw new ForbiddenException({
          code: "DEVICE_DISABLED",
          message: "Device is disabled",
        });
      }
    }

    const permissions = await this.roles.getUserPermissionKeys(matched.id);
    if (permissions.some((p) => p.startsWith("platform."))) {
      throw new ForbiddenException({
        code: "PLATFORM_LOGIN_DISABLED",
        message: "Platform-only accounts are not permitted in the Wines & Spirits application",
      });
    }
    const authzVersion = await this.roles.getAuthzVersion(matched.tenantId);

    const sessionId = randomUUID();
    const tokens = await this.issueTokenPair({
      userId: matched.id,
      email: matched.email,
      name: matched.name,
      tenantId: matched.tenantId,
      sessionId,
      authzVersion,
      deviceId: input.deviceId,
      permissions,
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: matched.tenantId,
          actorUserId: matched.id,
          deviceId: input.deviceId ?? null,
          action: "auth.login",
          entityType: "user",
          entityId: matched.id,
          metadata: { email: matched.email, sessionId },
        },
      });
    } catch {
      // Non-blocking in unit tests without full audit table mock
    }

    const editionCfg = getEditionConfig(PRODUCT_EDITION);
    const roles = (matched.userRoles ?? []).map((ur) => ({
      id: ur.id,
      roleKey: ur.role.key,
      roleName: ur.role.name,
      branchId: ur.branchId,
      branchName: ur.branch?.name ?? null,
    }));

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      productEdition: PRODUCT_EDITION,
      productName: editionCfg.productName,
      user: {
        id: matched.id,
        name: matched.name,
        email: matched.email,
      },
      roles,
      tenant: {
        id: matched.tenant.id,
        name: matched.tenant.name,
        slug: matched.tenant.slug,
        currency: matched.tenant.currency,
        timezone: matched.tenant.timezone,
        locale: matched.tenant.locale,
        productEdition: PRODUCT_EDITION,
      },
      authzVersion,
      permissions,
    };
  }

  async refresh(refreshToken: string) {
    const refreshSecret = this.config.get<string>(
      "JWT_REFRESH_SECRET",
      "change-me-refresh-secret-min-32-chars",
    );

    let payload: {
      sub: string;
      session_id: string;
      typ: string;
      device_id?: string;
    };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Invalid refresh token",
      });
    }

    if (payload.typ !== "refresh") {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Invalid token type",
      });
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        tokenHash,
        revokedAt: null,
      },
    });

    if (!stored || stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Refresh token revoked or expired",
      });
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, status: "active", tenantId: { not: null } },
      include: { tenant: true },
    });
    if (!user || !user.tenantId) {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    const permissions = await this.roles.getUserPermissionKeys(user.id);
    const authzVersion = await this.roles.getAuthzVersion(user.tenantId);

    const tokens = await this.issueTokenPair({
      userId: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      sessionId: payload.session_id,
      authzVersion,
      deviceId: payload.device_id ?? stored.deviceId ?? undefined,
      permissions,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      authzVersion,
      permissions,
    };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: true,
        userRoles: {
          include: { role: true, branch: true },
        },
      },
    });
    if (!user || !user.tenantId || !user.tenant) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "User not found" });
    }
    const permissions = await this.roles.getUserPermissionKeys(userId);
    const authzVersion = await this.roles.getAuthzVersion(user.tenantId);

    const editionCfg = getEditionConfig(PRODUCT_EDITION);
    const rawModules = (user.tenant.modulesEnabled ?? {}) as Record<string, boolean>;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      status: user.status,
      productEdition: PRODUCT_EDITION,
      productName: editionCfg.productName,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        currency: user.tenant.currency,
        productEdition: PRODUCT_EDITION,
        productName: editionCfg.productName,
        settings: {
          ...((user.tenant.settings ?? {}) as Record<string, unknown>),
          businessMode: "retail",
          restaurantEnabled: false,
        },
        businessTypes: user.tenant.businessTypes ?? editionCfg.defaultBusinessTypes,
        modulesEnabled: {
          ...editionCfg.modulesAllowed,
          ...rawModules,
          hotel: editionCfg.modulesAllowed.hotel,
          restaurant: editionCfg.modulesAllowed.restaurant,
          pharmacy: editionCfg.modulesAllowed.pharmacy,
          services: editionCfg.modulesAllowed.services,
        },
        status: user.tenant.status,
      },
      roles: user.userRoles.map((ur) => ({
        id: ur.id,
        roleKey: ur.role.key,
        roleName: ur.role.name,
        branchId: ur.branchId,
        branchName: ur.branch?.name ?? null,
      })),
      authzVersion,
      permissions,
    };
  }

  async listDevices(tenantId: string) {
    return this.prisma.device.findMany({
      where: { tenantId },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async registerDevice(
    tenantId: string,
    input: { name: string; branchId: string; deviceId?: string },
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, tenantId },
    });
    if (!branch) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Branch not found",
      });
    }

    if (input.deviceId) {
      const existing = await this.prisma.device.findFirst({
        where: { id: input.deviceId, tenantId },
      });
      if (existing) {
        if (existing.status === "disabled") {
          throw new ConflictException({
            code: "DEVICE_DISABLED",
            message: "Device is disabled",
          });
        }
        return this.prisma.device.update({
          where: { id: existing.id },
          data: {
            name: input.name || existing.name,
            branchId: input.branchId,
            lastSeenAt: new Date(),
          },
        });
      }
    }

    return this.prisma.device.create({
      data: {
        id: input.deviceId,
        tenantId,
        branchId: input.branchId,
        name: input.name,
        status: "active",
      },
    });
  }

  private async issueTokenPair(args: {
    userId: string;
    email: string;
    name: string;
    tenantId: string | null;
    sessionId: string;
    authzVersion: number;
    deviceId?: string;
    permissions: string[];
  }) {
    const accessPayload: JwtPayload = {
      sub: args.userId,
      tenant_id: args.tenantId,
      session_id: args.sessionId,
      authz_version: args.authzVersion,
      device_id: args.deviceId,
      typ: "access",
      email: args.email,
      name: args.name,
      permissions: args.permissions,
    };

    const accessTtl = this.config.get<string>("JWT_ACCESS_TTL", "15m");
    const refreshTtl = this.config.get<string>("JWT_REFRESH_TTL", "30d");
    const refreshSecret = this.config.get<string>(
      "JWT_REFRESH_SECRET",
      "change-me-refresh-secret-min-32-chars",
    );

    const accessToken = await this.jwt.signAsync(
      accessPayload as unknown as Record<string, unknown>,
      {
        expiresIn: accessTtl,
      } as Parameters<JwtService["signAsync"]>[1],
    );

    const refreshToken = await this.jwt.signAsync(
      {
        sub: args.userId,
        session_id: args.sessionId,
        typ: "refresh",
        device_id: args.deviceId,
      },
      {
        secret: refreshSecret,
        expiresIn: refreshTtl,
      } as Parameters<JwtService["signAsync"]>[1],
    );

    const expiresAt = new Date(
      Date.now() + parseDurationMs(refreshTtl, 30 * 24 * 60 * 60 * 1000),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: args.userId,
        deviceId: args.deviceId ?? null,
        tokenHash: hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(parseDurationMs(accessTtl, 900_000) / 1000),
    };
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseDurationMs(value: string, fallback: number): number {
  const m = /^(\d+)([smhd])$/.exec(value.trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = m[2];
  switch (unit) {
    case "s":
      return n * 1000;
    case "m":
      return n * 60_000;
    case "h":
      return n * 3_600_000;
    case "d":
      return n * 86_400_000;
    default:
      return fallback;
  }
}
