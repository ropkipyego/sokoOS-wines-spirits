import { SetMetadata } from "@nestjs/common";
import type { ModuleKey, PermissionKey } from "@sokoos/types";

export const PERMISSIONS_KEY = "permissions";
export const EDITION_MODULE_KEY = "editionModule";

/** Require any of the listed permissions (OR). */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Require a module to be enabled in the active ProductEdition. */
export const RequireEditionModule = (module: ModuleKey) =>
  SetMetadata(EDITION_MODULE_KEY, module);

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
