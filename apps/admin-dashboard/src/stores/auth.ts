import { create } from "zustand";
import { PERMISSION_EQUIVALENTS } from "@sokoos/types";
import { apiRequest } from "../api/client";

const REFRESH_KEY = "sokoos.wines.refreshToken";
const ACCESS_KEY = "sokoos.wines.accessToken";
const SESSION_KEY = "sokoos.wines.session";
const DEVICE_KEY = "sokoos.pos.deviceId";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  mustChangePassword?: boolean;
};

export type AuthRole = {
  id: string;
  roleKey: string;
  roleName: string;
  branchId: string | null;
  branchName?: string | null;
};

export type AuthTenant = {
  id: string;
  name: string;
  slug?: string;
  currency?: string;
  timezone?: string;
  locale?: string;
} | null;

type LoginPayload = {
  accessToken: string;
  refreshToken: string;
  mustChangePassword?: boolean;
  user: AuthUser;
  roles?: AuthRole[];
  tenant: AuthTenant;
  permissions: string[];
};

export type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  roles: AuthRole[];
  tenant: AuthTenant;
  permissions: string[];
  mustChangePassword: boolean;
  branchId: string | null;
  branchName: string;
  warehouseId: string | null;
  departmentId: string | null;
  departmentName: string;
  deviceId: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<string>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<void>;
  logout: () => void;
  hydrateFromStorage: () => void;
  has: (key: string) => boolean;
  defaultLandingRoute: () =>
    | "/pos"
    | "/inventory"
    | "/purchases"
    | "/reports"
    | "/dashboard"
    | "/change-password";
};

function hasPerm(perms: readonly string[], key: string): boolean {
  if (perms.includes(key)) return true;
  const aliases = PERMISSION_EQUIVALENTS[key];
  return Boolean(aliases?.some((a) => perms.includes(a)));
}

export function resolveLandingRoute(
  roles: readonly AuthRole[],
  permissions: readonly string[],
  mustChangePassword = false,
): "/pos" | "/inventory" | "/purchases" | "/reports" | "/dashboard" | "/change-password" {
  if (mustChangePassword) return "/change-password";

  const roleKeys = new Set(roles.map((r) => r.roleKey));

  if (
    roleKeys.has("business_owner") ||
    roleKeys.has("general_manager") ||
    roleKeys.has("branch_manager")
  ) {
    return "/dashboard";
  }
  if (
    roleKeys.has("cashier") ||
    roleKeys.has("sales_attendant") ||
    roleKeys.has("sales_agent")
  ) {
    return "/pos";
  }
  if (roleKeys.has("stock_controller") || roleKeys.has("inventory_officer")) {
    return "/inventory";
  }
  if (roleKeys.has("procurement_officer") || roleKeys.has("purchasing_officer")) {
    return "/purchases";
  }
  if (roleKeys.has("accountant") || roleKeys.has("auditor")) {
    return "/reports";
  }

  if (hasPerm(permissions, "sales.create") && !hasPerm(permissions, "reports.read")) {
    return "/pos";
  }
  if (hasPerm(permissions, "inventory.adjust") && !hasPerm(permissions, "reports.financial")) {
    return "/inventory";
  }
  if (hasPerm(permissions, "purchases.create") && !hasPerm(permissions, "sales.create")) {
    return "/purchases";
  }
  if (hasPerm(permissions, "reports.read")) {
    return "/dashboard";
  }
  return "/pos";
}

async function ensurePosDevice(token: string, branchId: string | null): Promise<string> {
  let deviceId = localStorage.getItem(DEVICE_KEY) ?? sessionStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
  }
  localStorage.setItem(DEVICE_KEY, deviceId);
  sessionStorage.setItem(DEVICE_KEY, deviceId);
  if (!branchId) return deviceId;
  try {
    await apiRequest("/auth/devices/register", {
      method: "POST",
      token,
      body: {
        name: `Wines & Spirits POS (${typeof navigator !== "undefined" ? navigator.platform : "Terminal"})`,
        branchId,
        deviceId,
      },
    });
  } catch {
    try {
      const listed = await apiRequest<
        Array<{ id: string; status: string }> | { data: Array<{ id: string; status: string }> }
      >("/auth/devices", { token });
      const rows = Array.isArray(listed) ? listed : listed.data;
      const active = rows.find((d) => d.id === deviceId) ?? rows.find((d) => d.status === "active");
      if (active) {
        deviceId = active.id;
        localStorage.setItem(DEVICE_KEY, deviceId);
        sessionStorage.setItem(DEVICE_KEY, deviceId);
      }
    } catch {
      /* keep local deviceId */
    }
  }
  return deviceId;
}

function persistSession(
  accessToken: string,
  refreshToken: string,
  sessionPayload: Record<string, unknown>,
) {
  localStorage.setItem(REFRESH_KEY, refreshToken);
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionPayload));
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  roles: [],
  tenant: null,
  permissions: [],
  mustChangePassword: false,
  branchId: null,
  branchName: "MAIN BRANCH",
  warehouseId: null,
  departmentId: null,
  departmentName: "",
  deviceId: null,
  isAuthenticated: false,

  has: (key) => hasPerm(get().permissions, key),

  defaultLandingRoute: () =>
    resolveLandingRoute(get().roles, get().permissions, get().mustChangePassword),

  hydrateFromStorage: () => {
    const accessToken = sessionStorage.getItem(ACCESS_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    const rawSession = sessionStorage.getItem(SESSION_KEY);
    if (!accessToken || !refreshToken || !rawSession) return;
    try {
      const parsed = JSON.parse(rawSession) as {
        user: AuthUser | null;
        roles?: AuthRole[];
        tenant: AuthTenant;
        permissions?: string[];
        mustChangePassword?: boolean;
        branchId?: string | null;
        branchName?: string;
        warehouseId?: string | null;
        departmentId?: string | null;
        departmentName?: string;
        deviceId?: string | null;
      };
      set({
        accessToken,
        user: parsed.user,
        roles: parsed.roles ?? [],
        tenant: parsed.tenant,
        permissions: parsed.permissions ?? [],
        mustChangePassword: Boolean(
          parsed.mustChangePassword ?? parsed.user?.mustChangePassword,
        ),
        branchId: parsed.branchId ?? null,
        branchName: parsed.branchName ?? "MAIN BRANCH",
        warehouseId: parsed.warehouseId ?? null,
        departmentId: parsed.departmentId ?? null,
        departmentName: parsed.departmentName ?? "",
        deviceId: parsed.deviceId ?? localStorage.getItem(DEVICE_KEY),
        isAuthenticated: true,
      });
    } catch {
      /* ignore corrupt storage */
    }
  },

  login: async (email, password, tenantSlug) => {
    const body: Record<string, string> = {
      email: email.trim().toLowerCase(),
      password,
    };
    const slug = tenantSlug?.trim();
    // Send store code when provided (including local `demo` seed). Never invent a default.
    if (slug) {
      body.tenantSlug = slug;
    }

    const data = await apiRequest<LoginPayload>("/auth/login", {
      method: "POST",
      body,
    });

    let roles: AuthRole[] = data.roles ?? [];
    let tenant: AuthTenant = data.tenant;
    let permissions: string[] = data.permissions ?? [];
    let mustChangePassword = Boolean(
      data.mustChangePassword ?? data.user?.mustChangePassword,
    );

    try {
      const me = await apiRequest<{
        roles?: AuthRole[];
        permissions?: string[];
        tenant?: AuthTenant;
        mustChangePassword?: boolean;
      }>("/auth/me", { token: data.accessToken });
      if (me.roles?.length) roles = me.roles;
      if (me.permissions?.length) permissions = me.permissions;
      if (me.tenant) tenant = me.tenant;
      if (typeof me.mustChangePassword === "boolean") {
        mustChangePassword = me.mustChangePassword;
      }
    } catch {
      /* use login response */
    }

    let branchId: string | null = roles.find((r) => r.branchId)?.branchId ?? null;
    let branchName = roles.find((r) => r.branchName)?.branchName ?? "MAIN BRANCH";
    let warehouseId: string | null = null;
    let departmentId: string | null = null;
    let departmentName = "";

    if (!mustChangePassword) {
      try {
        const branches = await apiRequest<
          Array<{ id: string; name: string }> | { data: Array<{ id: string; name: string }> }
        >("/branches", { token: data.accessToken });
        const bList = Array.isArray(branches) ? branches : branches.data;
        const chosenBranch = bList.find((b) => b.id === branchId) ?? bList[0];
        if (chosenBranch) {
          branchId = chosenBranch.id;
          branchName = chosenBranch.name;
        }
      } catch {
        /* restricted role */
      }

      if (branchId) {
        try {
          const warehouses = await apiRequest<
            | Array<{ id: string; isDefault?: boolean }>
            | { data: Array<{ id: string; isDefault?: boolean }> }
          >(`/warehouses?branchId=${branchId}`, { token: data.accessToken });
          const wList = Array.isArray(warehouses) ? warehouses : warehouses.data;
          const chosenWh = wList.find((w) => w.isDefault) ?? wList[0];
          if (chosenWh) warehouseId = chosenWh.id;
        } catch {
          /* optional */
        }
      }

      try {
        const deps = await apiRequest<
          | Array<{ id: string; name: string; branchId?: string | null }>
          | { data: Array<{ id: string; name: string; branchId?: string | null }> }
        >("/departments", { token: data.accessToken });
        const dList = Array.isArray(deps) ? deps : deps.data;
        const chosenDep = dList.find((d) => d.branchId === branchId) ?? dList[0];
        if (chosenDep) {
          departmentId = chosenDep.id;
          departmentName = chosenDep.name;
        }
      } catch {
        /* optional */
      }
    }

    const deviceId = mustChangePassword
      ? localStorage.getItem(DEVICE_KEY)
      : await ensurePosDevice(data.accessToken, branchId);

    const user: AuthUser = {
      ...data.user,
      mustChangePassword,
    };

    const sessionPayload = {
      user,
      roles,
      tenant,
      permissions,
      mustChangePassword,
      branchId,
      branchName,
      warehouseId,
      departmentId,
      departmentName,
      deviceId,
    };

    persistSession(data.accessToken, data.refreshToken, sessionPayload);

    set({
      accessToken: data.accessToken,
      user,
      roles,
      tenant,
      permissions,
      mustChangePassword,
      branchId,
      branchName,
      warehouseId,
      departmentId,
      departmentName,
      deviceId,
      isAuthenticated: true,
    });

    return resolveLandingRoute(roles, permissions, mustChangePassword);
  },

  changePassword: async (currentPassword, newPassword, confirmPassword) => {
    const token = get().accessToken;
    if (!token) throw new Error("Not authenticated");
    const data = await apiRequest<{
      accessToken: string;
      refreshToken: string;
      mustChangePassword?: boolean;
      permissions?: string[];
    }>("/auth/change-password", {
      method: "POST",
      token,
      body: { currentPassword, newPassword, confirmPassword },
    });

    const roles = get().roles;
    const permissions = data.permissions?.length ? data.permissions : get().permissions;
    const user = get().user
      ? { ...get().user!, mustChangePassword: false }
      : null;

    let branchId = get().branchId;
    let branchName = get().branchName;
    let warehouseId = get().warehouseId;
    let departmentId = get().departmentId;
    let departmentName = get().departmentName;

    try {
      const branches = await apiRequest<
        Array<{ id: string; name: string }> | { data: Array<{ id: string; name: string }> }
      >("/branches", { token: data.accessToken });
      const bList = Array.isArray(branches) ? branches : branches.data;
      const chosenBranch = bList.find((b) => b.id === branchId) ?? bList[0];
      if (chosenBranch) {
        branchId = chosenBranch.id;
        branchName = chosenBranch.name;
      }
    } catch {
      /* optional */
    }

    const deviceId = await ensurePosDevice(data.accessToken, branchId);

    const sessionPayload = {
      user,
      roles,
      tenant: get().tenant,
      permissions,
      mustChangePassword: false,
      branchId,
      branchName,
      warehouseId,
      departmentId,
      departmentName,
      deviceId,
    };
    persistSession(data.accessToken, data.refreshToken, sessionPayload);

    set({
      accessToken: data.accessToken,
      user,
      permissions,
      mustChangePassword: false,
      branchId,
      branchName,
      warehouseId,
      departmentId,
      departmentName,
      deviceId,
      isAuthenticated: true,
    });
  },

  logout: () => {
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    set({
      accessToken: null,
      user: null,
      roles: [],
      tenant: null,
      permissions: [],
      mustChangePassword: false,
      branchId: null,
      branchName: "MAIN BRANCH",
      warehouseId: null,
      departmentId: null,
      departmentName: "",
      deviceId: localStorage.getItem(DEVICE_KEY),
      isAuthenticated: false,
    });
  },
}));
