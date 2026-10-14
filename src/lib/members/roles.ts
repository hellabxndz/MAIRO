// Who may do what in a business. Six roles, each a set of permissions; the
// server checks the permission on every change (lib/members/authorize.ts), so a
// hidden button is never the only thing in the way.
//
//   Owner              everything, including billing, the team and deleting the business
//   Administrator      everything except billing and the business itself; manages the team, not owners
//   Marketing Manager  runs the advertising: campaigns, budgets, launches, recommendations, the business profile
//   Creative Editor    makes and changes ads' pictures, videos and words; launches nothing
//   Analyst            reads everything and makes reports; changes nothing
//   Viewer             reads everything; changes nothing
//
// Pure, so scripts/check-members.ts pins the whole matrix.

export const ROLES = ["OWNER", "ADMIN", "MARKETING_MANAGER", "CREATIVE_EDITOR", "ANALYST", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Administrator",
  MARKETING_MANAGER: "Marketing Manager",
  CREATIVE_EDITOR: "Creative Editor",
  ANALYST: "Analyst",
  VIEWER: "Viewer",
};

export const ROLE_SUMMARY: Record<Role, string> = {
  OWNER: "Everything, including billing, the team and deleting the business.",
  ADMIN: "Everything except billing and deleting the business. Manages the team, except owners.",
  MARKETING_MANAGER: "Runs the advertising: campaigns, budgets, launches, recommendations and the business profile.",
  CREATIVE_EDITOR: "Makes and changes ads' pictures, videos and words. Can't launch, spend or change budgets.",
  ANALYST: "Sees everything and makes reports. Changes nothing.",
  VIEWER: "Sees everything. Changes nothing.",
};

export const PERMISSIONS = [
  "creative.edit",
  "campaign.edit",
  "business.edit",
  "budget.change",
  "launch.approve",
  "decision.approve",
  "reports.run",
  "accounts.manage",
  "team.manage",
  "billing.manage",
  "business.delete",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** What a refusal says the person can't do: "Your role (Viewer) can't change budgets." */
export const PERMISSION_VERB: Record<Permission, string> = {
  "creative.edit": "change ads' pictures, videos or words",
  "campaign.edit": "change campaigns",
  "business.edit": "change the business profile or plan",
  "budget.change": "change budgets or spending limits",
  "launch.approve": "approve launches or switch campaigns on",
  "decision.approve": "approve or turn down recommendations",
  "reports.run": "make reports",
  "accounts.manage": "connect or disconnect advertising accounts",
  "team.manage": "manage the team",
  "billing.manage": "change billing",
  "business.delete": "delete the business",
};

const ALL = new Set<Permission>(PERMISSIONS);
const without = (...p: Permission[]) => new Set<Permission>(PERMISSIONS.filter((x) => !p.includes(x)));

const MATRIX: Record<Role, Set<Permission>> = {
  OWNER: ALL,
  ADMIN: without("billing.manage", "business.delete"),
  MARKETING_MANAGER: new Set<Permission>(["creative.edit", "campaign.edit", "business.edit", "budget.change", "launch.approve", "decision.approve", "reports.run"]),
  CREATIVE_EDITOR: new Set<Permission>(["creative.edit", "reports.run"]),
  ANALYST: new Set<Permission>(["reports.run"]),
  VIEWER: new Set<Permission>(),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return Boolean(role && MATRIX[role]?.has(permission));
}

export function permissionsOf(role: Role): Permission[] {
  return PERMISSIONS.filter((p) => MATRIX[role].has(p));
}

/** The sentence a refused change shows. */
export function refusal(role: Role | null, permission: Permission): string {
  if (!role) return "You're not a member of this business any more.";
  return `Your role here (${ROLE_LABEL[role]}) can't ${PERMISSION_VERB[permission]}. Ask an owner or administrator.`;
}

/**
 * Whether someone may give a role, or change or remove someone who has one:
 * owners may do anything; administrators may manage everyone except owners
 * and can't make anyone an owner; nobody else manages the team.
 */
export function canManage(actor: Role | null | undefined, target: Role): boolean {
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return target !== "OWNER";
  return false;
}

export const isRole = (x: unknown): x is Role => typeof x === "string" && (ROLES as readonly string[]).includes(x);
