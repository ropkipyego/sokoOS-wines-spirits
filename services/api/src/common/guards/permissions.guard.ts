import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  PERMISSION_EQUIVALENTS,
  PRODUCT_EDITION,
  isEditionModuleAllowed,
  type ModuleKey,
} from "@sokoos/types";
import {
  PERMISSIONS_KEY,
  EDITION_MODULE_KEY,
  IS_PUBLIC_KEY,
} from "../decorators/permissions.decorator";
import type { AuthUser } from "../tenant-context";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredModule = this.reflector.getAllAndOverride<ModuleKey>(
      EDITION_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredModule && !isEditionModuleAllowed(requiredModule, PRODUCT_EDITION)) {
      throw new ForbiddenException({
        code: "MODULE_NOT_ENTITLED",
        message: `Module '${requiredModule}' is disabled in ${PRODUCT_EDITION} edition`,
      });
    }

    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      path?: string;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    if (
      request.path?.includes("/platform") ||
      required.some((p) => p.startsWith("platform."))
    ) {
      throw new ForbiddenException({
        code: "PLATFORM_DISABLED",
        message: "Platform administration is disabled in the Wines & Spirits application",
      });
    }

    if (!user.tenantId) {
      throw new ForbiddenException({
        code: "TENANT_REQUIRED",
        message: "Business tenant context is required",
      });
    }

    // Enforce branch-scoped authorization when user is restricted to specific branch(es)
    if (Array.isArray(user.allowedBranchIds) && user.allowedBranchIds.length > 0) {
      const requestedBranchId =
        (typeof request.body?.branchId === "string" ? request.body.branchId : undefined) ??
        (typeof request.query?.branchId === "string" ? request.query.branchId : undefined);
      if (requestedBranchId && !user.allowedBranchIds.includes(requestedBranchId)) {
        throw new ForbiddenException({
          code: "FORBIDDEN_BRANCH",
          message: "User is not authorized to access or mutate this branch",
        });
      }
    }

    const allowed = hasAnyPermission(user.permissions, required);
    if (!allowed) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: `Missing permission: ${required.join(" | ")}`,
        details: required.map((p) => ({
          path: "permission",
          message: p,
          code: "missing_permission",
        })),
      });
    }
    return true;
  }
}

/** Pure helper for unit tests — checks if user perms satisfy required (OR), including canonical aliases. */
export function hasAnyPermission(
  userPermissions: readonly string[],
  required: readonly string[],
): boolean {
  if (required.length === 0) return true;
  const userSet = new Set(userPermissions);
  return required.some((perm) => {
    if (userSet.has(perm)) return true;
    const aliases = PERMISSION_EQUIVALENTS[perm];
    if (aliases?.some((alias) => userSet.has(alias))) return true;
    return false;
  });
}
