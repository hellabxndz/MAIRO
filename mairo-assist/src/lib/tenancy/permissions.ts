/**
 * Role-based permissions. This is the single source of truth the server
 * checks before every privileged action; row-level security in the database
 * enforces the same boundaries a second time (see supabase/migrations).
 *
 * Owners can do everything. Admins run day-to-day operations and can be
 * granted a few extra permissions by an owner. Support agents only get
 * customer-support functions.
 */

export const ROLES = ["owner", "admin", "support_agent"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  support_agent: "Support Agent",
};

export const PERMISSIONS = [
  "business.view",
  "business.update",
  "business.delete",
  "billing.view",
  "billing.manage",
  "integrations.view",
  "integrations.manage",
  "team.view",
  "team.manage",
  "ai.view",
  "ai.configure",
  "ai.publish",
  "ai.toggle",
  "knowledge.view",
  "knowledge.manage",
  "inbox.view",
  "inbox.reply",
  "inbox.takeover",
  "customers.view",
  "customers.notes",
  "orders.view",
  "tickets.manage",
  "approvals.view",
  "approvals.decide",
  "analytics.view",
  "analytics.export",
  "audit.view",
  "usage.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const SUPPORT_AGENT: Permission[] = [
  "business.view",
  "ai.view",
  "knowledge.view",
  "inbox.view",
  "inbox.reply",
  "inbox.takeover",
  "customers.view",
  "customers.notes",
  "orders.view",
  "tickets.manage",
  "approvals.view",
];

const ADMIN: Permission[] = [
  ...SUPPORT_AGENT,
  "business.update",
  "billing.view",
  "integrations.view",
  "team.view",
  "ai.configure",
  "ai.publish",
  "ai.toggle",
  "knowledge.manage",
  "approvals.decide",
  "analytics.view",
  "analytics.export",
  "audit.view",
  "usage.view",
];

const OWNER: Permission[] = [...PERMISSIONS];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(OWNER),
  admin: new Set(ADMIN),
  support_agent: new Set(SUPPORT_AGENT),
};

/**
 * Extra permissions an owner may grant to an individual admin. Billing
 * management, business deletion and team management are never grantable:
 * they stay with owners.
 */
export const ADMIN_GRANTABLE: readonly Permission[] = ["integrations.manage"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Parse the business_members.permissions JSON, keeping only valid grants. */
export function parseGrants(role: Role, raw: unknown): Permission[] {
  if (role !== "admin" || !raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return ADMIN_GRANTABLE.filter((p) => (raw as Record<string, unknown>)[p] === true);
}

export function permissionsFor(role: Role, grants: readonly Permission[] = []): Set<Permission> {
  const set = new Set(ROLE_PERMISSIONS[role]);
  if (role === "admin") for (const g of grants) if (ADMIN_GRANTABLE.includes(g)) set.add(g);
  return set;
}

export function can(role: Role, permission: Permission, grants: readonly Permission[] = []) {
  return permissionsFor(role, grants).has(permission);
}

/** Whether `actor` may assign `target` role to someone. Only owners manage the team. */
export function canAssignRole(actor: Role, target: Role) {
  return actor === "owner" && ROLES.includes(target);
}
