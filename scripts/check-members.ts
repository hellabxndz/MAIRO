// Checks teams: the role matrix, that every change a role might not be
// allowed to make is checked on the server, invitations, role changes and
// removals with their rules, the business a request acts in, the assistant's
// tools by role, the audit log — and that one business's team is never
// readable or changeable from another. No Meta call, no email sent.
//
//   npm run check:members   (needs the local database)

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
import { db } from "../src/lib/db";
import { can, canManage, permissionsOf, refusal, ROLES, type Permission, type Role } from "../src/lib/members/roles";
import { acceptInvite, changeRole, createInvite, inviteFor, listTeam, removeMember, revokeInvite } from "../src/lib/members/store";
import { resolveWorkspace, workspacesOf } from "../src/lib/members/workspace";
import { roleIn } from "../src/lib/members/authorize";
import { assistantTools, roleBrief, WRITE_TOOLS } from "../src/lib/ai/assistant-tools";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-mem";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const CLIENT = `${TAG}-client`;
const FREELANCE = `${TAG}-studio`;

async function cleanup() {
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await db.organization.deleteMany({ where: { parentId: { startsWith: TAG } } });
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function person(key: string, home: string | null, role?: Role, extra: Record<string, unknown> = {}) {
  const u = await db.user.create({ data: { email: `${TAG}-${key}@test.invalid`, name: key, passwordHash: "x", organizationId: home, ...extra } });
  if (home && role) await db.organizationMember.create({ data: { organizationId: home, userId: u.id, role } });
  return u;
}
const memberId = async (organizationId: string, userId: string) =>
  (await db.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId, userId } }, select: { id: true } })).id;

// ------------------------------------------------------------------ static
// Every exported server action either checks the role (deniedFor, directly
// or through a helper in the same file that does), or is listed here with
// why it doesn't need to.
const NO_ROLE_CHECK: Record<string, string> = {
  "account-actions:deleteAccountAction": "your own login; closePlan decides what it may close",
  "auth-actions:*": "signing up, in and out",
  "aios-actions:*": "MAIRO staff only (requireOwner)",
  "meta-intelligence-actions:*": "MAIRO staff only (owner())",
  "success-actions:*": "MAIRO staff only (owner())",
  "client-actions:*": "a freelancer's own workspace (workspaceId checks FREELANCER)",
  "team-actions:leaveTeamAction": "anyone may leave; the store keeps the last owner",
  "team-actions:switchWorkspaceAction": "only to a business you're on the team of",
  "team-actions:acceptInviteAction": "only with the invited address",
  "team-actions:joinWithInviteAction": "only with an open invitation",
  "lead-actions:submitLeadAction": "the public lead form",
  "feedback-actions:sendFeedbackAction": "anyone can tell MAIRO something",
  "feedback-actions:pulseLaterAction": "a reminder for the person asking",
  "tour-actions:*": "each person's own tour",
  "view-mode-actions:*": "each person's own view",
  "intelligence-actions:setDashboardLensAction": "each person's own view (a cookie)",
  "meta-actions:listMetaPagesAction": "reads",
  "meta-actions:listMetaAdAccountsAction": "reads",
  "meta-actions:exploreWithoutMetaAction": "each person's own view (a cookie)",
  "tracking-actions:listPixelChoicesAction": "reads",
  "tracking-actions:checkInstallationAction": "reads",
  "tracking-actions:checkEventsAction": "reads",
  "tracking-actions:listGtmContainersAction": "reads",
  "sales-setup-actions:loadPagePostsAction": "reads",
  "sales-setup-actions:loadInstagramPostsAction": "reads",
  "campaign-actions:suggestAllocationAction": "a calculation",
  "campaign-actions:searchPlacesAction": "a lookup",
  "campaign-wizard-actions:reviewCampaignAction": "a review of a draft that isn't saved",
  "campaign-wizard-actions:loadAccountAdsAction": "reads",
  "campaign-wizard-actions:previewAdAction": "a preview",
  "decision-actions:loadDecisionsAction": "reads",
  "decision-actions:refreshDecisionsAction": "recomputes recommendations; approving them is checked",
  "notification-actions:markNotificationReadAction": "the bell",
  "notification-actions:markAllReadAction": "the bell",
  "notification-actions:dismissNotificationAction": "the bell",
  "strategy-actions:dismissWelcomeAction": "a welcome note",
  "suggested-ads-actions:creditQuoteAction": "a price quote",
};

function unguardedActions(): string[] {
  const dir = "src/lib/actions";
  const out: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const text = readFileSync(`${dir}/${f}`, "utf8");
    if (!/^["']use server["']/m.test(text)) continue;
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
    const fns = sf.statements.filter((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && Boolean(s.name));
    const guarded = new Set<string>();
    // A helper that checks the role guards whatever calls it.
    for (let changed = true; changed; ) {
      changed = false;
      for (const fn of fns) {
        const name = fn.name!.text;
        const body = fn.body?.getText() ?? "";
        if (guarded.has(name)) continue;
        if (body.includes("deniedFor(") || [...guarded].some((g) => new RegExp(`\\b${g}\\(`).test(body))) {
          guarded.add(name);
          changed = true;
        }
      }
    }
    const file = f.replace(/\.ts$/, "");
    for (const fn of fns) {
      if (!fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      const key = `${file}:${fn.name!.text}`;
      if (!guarded.has(fn.name!.text) && !NO_ROLE_CHECK[key] && !NO_ROLE_CHECK[`${file}:*`]) out.push(key);
    }
  }
  return out;
}

async function main() {
  await cleanup();

  console.log("— the role matrix —");
  await check("each role can do exactly what its description says", () => {
    const expect: Record<Role, Permission[]> = {
      OWNER: ["creative.edit", "campaign.edit", "business.edit", "budget.change", "launch.approve", "decision.approve", "reports.run", "accounts.manage", "team.manage", "billing.manage", "business.delete"],
      ADMIN: ["creative.edit", "campaign.edit", "business.edit", "budget.change", "launch.approve", "decision.approve", "reports.run", "accounts.manage", "team.manage"],
      MARKETING_MANAGER: ["creative.edit", "campaign.edit", "business.edit", "budget.change", "launch.approve", "decision.approve", "reports.run"],
      CREATIVE_EDITOR: ["creative.edit", "reports.run"],
      ANALYST: ["reports.run"],
      VIEWER: [],
    };
    for (const r of ROLES) assert.deepEqual(permissionsOf(r), expect[r], r);
  });
  await check("only owners and administrators manage the team; administrators never owners", () => {
    for (const t of ROLES) {
      assert.equal(canManage("OWNER", t), true);
      assert.equal(canManage("ADMIN", t), t !== "OWNER", `admin → ${t}`);
      for (const r of ["MARKETING_MANAGER", "CREATIVE_EDITOR", "ANALYST", "VIEWER"] as const) assert.equal(canManage(r, t), false);
    }
    assert.equal(canManage(null, "VIEWER"), false);
  });
  await check("budgets, launches, the team and advertising accounts: only the roles that may", () => {
    const who = (p: Permission) => ROLES.filter((r) => can(r, p));
    assert.deepEqual(who("budget.change"), ["OWNER", "ADMIN", "MARKETING_MANAGER"]);
    assert.deepEqual(who("launch.approve"), ["OWNER", "ADMIN", "MARKETING_MANAGER"]);
    assert.deepEqual(who("team.manage"), ["OWNER", "ADMIN"]);
    assert.deepEqual(who("accounts.manage"), ["OWNER", "ADMIN"]);
    assert.deepEqual(who("billing.manage"), ["OWNER"]);
    assert.match(refusal("VIEWER", "budget.change"), /Viewer\) can't change budgets/);
    assert.match(refusal(null, "creative.edit"), /not a member/);
  });

  console.log("— checked on the server —");
  await check("every server action that changes something checks the role", () => {
    assert.deepEqual(unguardedActions(), []);
  });
  await check("uploads check the role; the assistant's tools follow the role in the thread's business", () => {
    assert.match(readFileSync("src/app/api/uploads/ad-media/route.ts", "utf8"), /deniedFor\("creative\.edit"\)/);
    const chat = readFileSync("src/app/api/agents/chat/route.ts", "utf8");
    assert.match(chat, /roleIn\(session\.user\.id, threadOrgId\)/);
    assert.match(chat, /assistantTools\(threadOrgId, role\)/);
  });
  await check("a Viewer's assistant can't change anything; a Marketing Manager's can", () => {
    const writes = Object.keys(WRITE_TOOLS);
    for (const r of ["VIEWER", "ANALYST", "CREATIVE_EDITOR"] as const) {
      const names = Object.keys(assistantTools(A, r));
      for (const w of writes) assert.ok(!names.includes(w), `${r} has ${w}`);
      assert.ok(names.includes("diagnose_campaigns") && names.includes("go_to"), `${r} can still read`);
      assert.match(roleBrief(r), /owner or administrator/);
    }
    for (const r of ["OWNER", "ADMIN", "MARKETING_MANAGER"] as const) {
      const names = Object.keys(assistantTools(A, r));
      for (const w of writes) assert.ok(names.includes(w), `${r} lacks ${w}`);
      assert.equal(roleBrief(r), "");
    }
  });

  await db.organization.create({ data: { id: A, name: "Members Plumbing" } });
  await db.organization.create({ data: { id: B, name: "Other Bakery" } });
  const owner = await person("owner", A, "OWNER");
  const admin = await person("admin", A, "ADMIN");
  const viewer = await person("viewer", A, "VIEWER");
  const bOwner = await person("b-owner", B, "OWNER");

  console.log("— invitations —");
  let token = "";
  await check("a Viewer, or an administrator inviting an owner, is refused", async () => {
    const v = await createInvite(A, viewer.id, `${TAG}-new@test.invalid`, "ANALYST");
    assert.ok(!v.ok && /Only owners and administrators/.test(v.error));
    const ad = await createInvite(A, admin.id, `${TAG}-new@test.invalid`, "OWNER");
    assert.ok(!ad.ok && /Only an owner can invite another owner/.test(ad.error));
    const outsider = await createInvite(A, bOwner.id, `${TAG}-new@test.invalid`, "ANALYST");
    assert.ok(!outsider.ok, "another business's owner can't invite into this one");
  });
  await check("an invitation keeps only the token's hash, lasts seven days, and replaces an older one", async () => {
    const first = await createInvite(A, admin.id, `${TAG}-new@test.invalid`, "ANALYST");
    assert.ok(first.ok);
    const r = await createInvite(A, owner.id, ` ${TAG.toUpperCase()}-NEW@test.invalid `, "MARKETING_MANAGER");
    assert.ok(r.ok);
    token = r.token;
    const rows = await db.teamInvite.findMany({ where: { organizationId: A, email: `${TAG}-new@test.invalid` } });
    assert.equal(rows.length, 2);
    assert.ok(rows.every((x) => x.tokenHash !== token && x.tokenHash.length === 64), "the token itself isn't stored");
    assert.equal(rows.filter((x) => !x.revokedAt).length, 1, "the older one is withdrawn");
    const days = (r.expiresAt.getTime() - Date.now()) / 86_400_000;
    assert.ok(days > 6.9 && days <= 7.01);
    assert.equal((await inviteFor(token))?.state, "open");
    assert.equal((await inviteFor(first.ok ? first.token : ""))?.state, "withdrawn");
  });
  await check("only the invited address can accept, once", async () => {
    const stranger = await person("stranger", null);
    const wrong = await acceptInvite(token, stranger.id, stranger.email);
    assert.ok(!wrong.ok && /This invitation is for/.test(wrong.error));
    const invited = await person("new", null);
    const ok = await acceptInvite(token, invited.id, invited.email.toUpperCase());
    assert.ok(ok.ok && ok.organizationId === A);
    assert.equal((await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: A, userId: invited.id } } }))?.role, "MARKETING_MANAGER");
    const again = await acceptInvite(token, invited.id, invited.email);
    assert.ok(!again.ok, "a used link doesn't work again");
    assert.equal((await inviteFor(token))?.state, "used");
  });
  await check("an expired or withdrawn invitation doesn't work", async () => {
    const late = await createInvite(A, owner.id, `${TAG}-late@test.invalid`, "VIEWER");
    assert.ok(late.ok);
    await db.teamInvite.updateMany({ where: { organizationId: A, email: `${TAG}-late@test.invalid` }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const lateUser = await person("late", null);
    const r = await acceptInvite(late.token, lateUser.id, lateUser.email);
    assert.ok(!r.ok && /expired/.test(r.error));
    const gone = await createInvite(A, owner.id, `${TAG}-gone@test.invalid`, "VIEWER");
    assert.ok(gone.ok);
    const id = (await db.teamInvite.findFirstOrThrow({ where: { organizationId: A, email: `${TAG}-gone@test.invalid`, revokedAt: null } })).id;
    assert.ok(!(await revokeInvite(B, bOwner.id, id)).ok, "another business can't withdraw it");
    assert.ok((await revokeInvite(A, admin.id, id)).ok);
    const goneUser = await person("gone", null);
    assert.ok(!(await acceptInvite(gone.token, goneUser.id, goneUser.email)).ok);
    assert.equal(await inviteFor("not-a-real-token"), null);
  });
  await check("someone already on the team can't be invited again", async () => {
    const r = await createInvite(A, owner.id, viewer.email, "ANALYST");
    assert.ok(!r.ok && /already on the team/.test(r.error));
  });

  console.log("— roles and removal —");
  await check("an administrator can't change an owner or make one; an owner can", async () => {
    assert.ok(!(await changeRole(A, admin.id, await memberId(A, owner.id), "VIEWER")).ok);
    assert.ok(!(await changeRole(A, admin.id, await memberId(A, viewer.id), "OWNER")).ok);
    assert.ok((await changeRole(A, admin.id, await memberId(A, viewer.id), "ANALYST")).ok);
    assert.ok(!(await changeRole(A, viewer.id, await memberId(A, admin.id), "VIEWER")).ok, "an Analyst can't change anyone");
    assert.ok((await changeRole(A, owner.id, await memberId(A, viewer.id), "VIEWER")).ok);
  });
  await check("a business always keeps an owner", async () => {
    const demote = await changeRole(A, owner.id, await memberId(A, owner.id), "ADMIN");
    assert.ok(!demote.ok && /at least one owner/.test(demote.error));
    const leave = await removeMember(A, owner.id, await memberId(A, owner.id));
    assert.ok(!leave.ok && /at least one owner/.test(leave.error));
  });
  await check("one business can't see or change another's team", async () => {
    const team = await listTeam(A);
    assert.ok(team.members.every((m) => m.email !== bOwner.email));
    assert.ok(!(await changeRole(A, owner.id, await memberId(B, bOwner.id), "VIEWER")).ok);
    assert.ok(!(await removeMember(A, owner.id, await memberId(B, bOwner.id))).ok);
    assert.ok(!(await changeRole(B, owner.id, await memberId(B, bOwner.id), "VIEWER")).ok, "an owner elsewhere is nobody here");
    assert.equal((await listTeam(B)).log.length, 0);
  });

  console.log("— the business a request acts in —");
  await check("a person on two teams switches between them; a cookie naming any other business is ignored", async () => {
    await db.organizationMember.create({ data: { organizationId: B, userId: viewer.id, role: "ANALYST" } });
    assert.equal(await resolveWorkspace(viewer.id, A, null), A);
    assert.equal(await resolveWorkspace(viewer.id, A, B), B);
    assert.equal(await resolveWorkspace(viewer.id, A, `${TAG}-nowhere`), A);
    assert.equal(await resolveWorkspace(owner.id, A, B), A, "the owner of A isn't on B's team");
    assert.deepEqual((await workspacesOf(viewer.id)).map((w) => [w.name, w.role]), [["Members Plumbing", "VIEWER"], ["Other Bakery", "ANALYST"]]);
  });
  await check("removed: access to that business ends on the next request; their own business moves to the next team", async () => {
    assert.ok((await removeMember(A, admin.id, await memberId(A, viewer.id))).ok);
    assert.equal(await resolveWorkspace(viewer.id, A, A), B, "A is gone even when the cookie asks for it");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: viewer.id } })).organizationId, B);
    assert.equal(await roleIn(viewer.id, A), null, "their assistant thread for A stops working");
    assert.equal(await roleIn(viewer.id, B), "ANALYST");
    assert.ok((await removeMember(B, viewer.id, await memberId(B, viewer.id))).ok, "anyone may leave");
    assert.equal(await resolveWorkspace(viewer.id, null, null), null);
  });
  await check("a login from before teams, with a business nobody's on, gets it as owner; a removed one doesn't", async () => {
    await db.organization.create({ data: { id: `${TAG}-legacy`, name: "Legacy" } });
    const legacy = await person("legacy", `${TAG}-legacy`);
    assert.equal(await resolveWorkspace(legacy.id, `${TAG}-legacy`, null), `${TAG}-legacy`);
    assert.equal(await roleIn(legacy.id, `${TAG}-legacy`), "OWNER");
    const intruder = await person("intruder", A);
    assert.equal(await resolveWorkspace(intruder.id, A, null), null, "a business with a team isn't handed to someone not on it");
    assert.equal(await roleIn(intruder.id, A), null);
  });
  await check("a freelancer runs their own clients' businesses, and nobody else's", async () => {
    await db.organization.create({ data: { id: FREELANCE, name: "Studio", kind: "WORKSPACE" } });
    await db.organization.create({ data: { id: CLIENT, name: "Client", parentId: FREELANCE } });
    const free = await person("free", FREELANCE, "OWNER", { role: "FREELANCER" });
    assert.equal(await roleIn(free.id, CLIENT), "OWNER");
    assert.equal(await roleIn(free.id, B), null);
    const notFree = await person("notfree", FREELANCE, "VIEWER");
    assert.equal(await roleIn(notFree.id, CLIENT), null, "a teammate of the studio isn't its freelancer");
  });

  console.log("— the audit log —");
  await check("every team change is recorded with who made it, and nothing secret", async () => {
    const log = (await listTeam(A)).log;
    const actions = log.map((l) => l.action);
    for (const a of ["Invited someone", "Joined the team", "Changed a role", "Withdrew an invitation", "Removed someone"]) assert.ok(actions.includes(a), a);
    assert.ok(log.find((l) => l.action === "Changed a role")?.detail?.includes("→"));
    assert.ok(log.every((l) => l.actor && l.actor !== ""));
    const raw = JSON.stringify(await db.auditLog.findMany({ where: { organizationId: A } }));
    assert.ok(!raw.includes(token), "the invitation token isn't in the log");
  });

  await cleanup();
  console.log(`\nTeams: ${passed} checks passed. No email was sent and nothing reached Meta.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => null);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
