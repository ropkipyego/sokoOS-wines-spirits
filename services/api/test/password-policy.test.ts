import { describe, it, expect } from "vitest";
import { assertPasswordPolicy } from "../src/auth/password-policy";
import { hasAnyPermission } from "../src/common/guards/permissions.guard";
import { ROLE_PERMISSION_TEMPLATES } from "../src/roles/roles.service";
import { SystemRole } from "@sokoos/shared";

describe("password policy", () => {
  it("rejects short passwords", () => {
    expect(() => assertPasswordPolicy("Ab1")).toThrow();
  });

  it("rejects passwords without a digit", () => {
    expect(() => assertPasswordPolicy("PasswordOnly")).toThrow();
  });

  it("accepts a strong password", () => {
    expect(() => assertPasswordPolicy("SecurePass12")).not.toThrow();
  });
});

describe("sales agent permission template", () => {
  const agent = ROLE_PERMISSION_TEMPLATES[SystemRole.SalesAgent] ?? [];

  it("includes POS minimums", () => {
    expect(agent).toContain("sales.create");
    expect(agent).toContain("sales.view_own");
    expect(agent).toContain("sales.reprint");
    expect(agent).toContain("pos.customers");
  });

  it("excludes admin and pricing surfaces", () => {
    for (const forbidden of [
      "users.read",
      "users.write",
      "roles.write",
      "products.read",
      "products.view",
      "products.write",
      "products.edit",
      "products.change_price",
      "inventory.read",
      "inventory.view",
      "inventory.adjust",
      "purchases.read",
      "expenses.read",
      "reports.read",
      "settings.manage",
      "etims.configure",
      "audit.read",
      "sales.read",
      "sales.view",
      "customers.edit",
      "customers.credit",
    ]) {
      expect(agent).not.toContain(forbidden);
    }
  });
});

describe("products.change_price gating helper", () => {
  it("does not treat products.edit as price permission", () => {
    expect(hasAnyPermission(["products.edit", "products.write"], ["products.change_price"])).toBe(
      false,
    );
  });

  it("allows explicit products.change_price", () => {
    expect(hasAnyPermission(["products.change_price"], ["products.change_price"])).toBe(true);
  });
});
