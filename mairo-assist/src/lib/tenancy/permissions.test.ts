import { describe, expect, it } from "vitest";
import { ADMIN_GRANTABLE, can, canAssignRole, parseGrants, permissionsFor, PERMISSIONS } from "./permissions";

describe("role permissions", () => {
  it("gives owners every permission", () => {
    for (const p of PERMISSIONS) expect(can("owner", p)).toBe(true);
  });

  it("keeps billing management, deletion and team management with owners", () => {
    for (const p of ["billing.manage", "business.delete", "team.manage"] as const) {
      expect(can("admin", p)).toBe(false);
      expect(can("support_agent", p)).toBe(false);
    }
  });

  it("limits support agents to support functions", () => {
    const allowed = [...permissionsFor("support_agent")].sort();
    expect(allowed).toEqual(
      ["ai.view", "approvals.view", "business.view", "customers.notes", "customers.view", "inbox.reply", "inbox.takeover", "inbox.view", "knowledge.view", "orders.view", "tickets.manage"].sort(),
    );
    for (const p of ["billing.view", "analytics.view", "ai.toggle", "approvals.decide", "integrations.view", "audit.view"] as const) {
      expect(can("support_agent", p)).toBe(false);
    }
  });

  it("lets admins run operations but not integrations unless granted", () => {
    expect(can("admin", "approvals.decide")).toBe(true);
    expect(can("admin", "ai.toggle")).toBe(true);
    expect(can("admin", "integrations.manage")).toBe(false);
    expect(can("admin", "integrations.manage", ["integrations.manage"])).toBe(true);
  });

  it("only honors grantable permissions, and only for admins", () => {
    expect(parseGrants("admin", { "integrations.manage": true, "billing.manage": true, "team.manage": true })).toEqual(["integrations.manage"]);
    expect(parseGrants("support_agent", { "integrations.manage": true })).toEqual([]);
    expect(parseGrants("admin", { "integrations.manage": "yes" })).toEqual([]);
    expect(parseGrants("admin", null)).toEqual([]);
    expect(parseGrants("admin", ["integrations.manage"])).toEqual([]);
    // A forged grant list passed directly is filtered too.
    expect(can("admin", "billing.manage", ["billing.manage" as never])).toBe(false);
    expect(ADMIN_GRANTABLE).not.toContain("billing.manage");
  });

  it("only owners assign roles", () => {
    expect(canAssignRole("owner", "admin")).toBe(true);
    expect(canAssignRole("admin", "support_agent")).toBe(false);
    expect(canAssignRole("support_agent", "support_agent")).toBe(false);
  });
});
