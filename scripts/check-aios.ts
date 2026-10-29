// Checks the AIOS Founder Command Center: the briefing says only what the
// signals say (and that a source it can't read is unread, not zero), the AI
// core shows the worst line, the assistant can only propose — confirming is a
// separate staff-checked action that logs "via assistant" — and none of it is
// reachable from a customer page.
//
//   npm run check:aios   (needs the local database; nothing reaches Stripe or Meta)

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { coreState, founderBrief, type FounderSignals } from "../src/lib/aios/brief";
import { founderAssistantPrompt } from "../src/lib/aios/assistant";
import { addItem, applyProposal, describeProposal, proposalInput, setItemDone } from "../src/lib/aios/workspace";
import { db } from "../src/lib/db";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const quiet: FounderSignals = {
  subscriptions: { entitled: 0, trialing: 0, pastDue: 0, incomplete: 0, canceled30: 0, byTier: [], listMrrCents: 0 },
  revenue: { state: "verified", cents: 0, invoices: 0, truncated: false, currency: "usd" },
  stripe: { configured: true, mode: "test", pricesSet: 2, pricesExpected: 2 },
  signups: { users7: 0, users30: 0, businesses7: 0, daily: [] },
  meta: { connected: 0, needsReconnect: 0, operations: [], apiErrors24h: 0 },
  jobs: { done24h: 0, failed24h: 0, stuck: 0, lastFinishedAt: null },
  approvals: { pending: 0, urgent: 0, businesses: 0 },
  alerts: { unread: 0, critical: 0 },
  support: { open: 0, inProgress: 0 },
  billing: { stopped: 0, awaitingPayment: 0 },
  work: { openTasks: 0, overdue: 0, dueToday: 0, activeProjects: 0 },
};
const w = (patch: Partial<{ [K in keyof FounderSignals]: Partial<FounderSignals[K]> }>): FounderSignals =>
  Object.fromEntries(Object.entries(quiet).map(([k, v]) => [k, typeof v === "object" && v && !Array.isArray(v) ? { ...v, ...((patch as Record<string, object>)[k] ?? {}) } : v])) as FounderSignals;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

async function main() {
  console.log("\n— the briefing —");
  await check("a quiet platform says nothing needs you, and the core is steady", () => {
    const b = founderBrief(quiet);
    assert.ok(b.some((l) => l.text === "Nothing needs you right now."));
    assert.equal(coreState(b), "steady");
  });
  await check("Stripe missing or a price unset is an alert", () => {
    assert.equal(coreState(founderBrief(w({ stripe: { configured: false } }))), "alert");
    const b = founderBrief(w({ stripe: { pricesSet: 1 } }));
    assert.match(b[0].text, /1 plan price not set/);
    assert.equal(b[0].href, "/aios/setup");
  });
  await check("failing and waiting things come first, each with its source", () => {
    const b = founderBrief(w({ subscriptions: { pastDue: 2, entitled: 5 }, jobs: { stuck: 1 }, signups: { users7: 3, businesses7: 2 } }));
    assert.equal(b[0].tone, "alert");
    assert.match(b[0].text, /1 background run started over an hour ago/);
    assert.ok(b.findIndex((l) => /past due/.test(l.text)) < b.findIndex((l) => /new account/.test(l.text)));
    for (const l of b) assert.ok(l.source && l.href.startsWith("/aios"), l.text);
    assert.ok(!b.some((l) => l.text === "Nothing needs you right now."));
  });
  await check("revenue is quoted only when Stripe answered — never as $0 when it didn't", () => {
    assert.ok(founderBrief(w({ revenue: { state: "verified", cents: 27998, invoices: 2 } as never })).some((l) => /\$280 collected in the last 30 days across 2 paid invoices/.test(l.text)));
    for (const revenue of [{ state: "error", message: "timeout" }, { state: "not_configured" }] as const) {
      assert.ok(!founderBrief({ ...quiet, revenue }).some((l) => /collected/.test(l.text)), revenue.state);
    }
  });
  await check("Meta pausing an operation names it", () => {
    const b = founderBrief(w({ meta: { operations: [{ label: "Launch campaign", state: "paused", reason: "Meta 5xx" }] } }));
    assert.match(b[0].text, /failing launch campaign for everyone/);
  });

  console.log("\n— the assistant proposes, a person confirms —");
  await check("proposals are validated: no empty titles, unknown kinds or bad dates", () => {
    assert.equal(proposalInput.safeParse({ kind: "add_item", itemKind: "TASK", title: "  " }).success, false);
    assert.equal(proposalInput.safeParse({ kind: "delete_everything" }).success, false);
    assert.equal(proposalInput.safeParse({ kind: "add_item", itemKind: "TASK", title: "Ship", due: "next week" }).success, false);
    assert.equal(proposalInput.safeParse({ kind: "add_item", itemKind: "BUDGET", title: "x" }).success, false);
    const ok = proposalInput.parse({ kind: "add_item", itemKind: "TASK", title: "Call Stripe", due: "2026-11-04" });
    assert.equal(describeProposal(ok), 'Add the task "Call Stripe" to your inbox, due 2026-11-04.');
  });
  await check("a proposal still validates when it comes back to be confirmed", () => {
    // The tool parses it, the browser holds it, and Confirm parses it again:
    // whatever the first parse produces (null body, no due date) must pass the second.
    for (const raw of [
      { kind: "add_item", itemKind: "TASK", title: "Test a real Stripe checkout", due: "2026-10-30" },
      { kind: "add_item", itemKind: "NOTE", title: "Idea", body: "  " },
      { kind: "add_item", itemKind: "TASK", title: "Inbox task", projectId: "", due: "" },
      { kind: "create_project", name: "Launch" },
      { kind: "complete_item", itemId: "abc" },
    ]) {
      const once = proposalInput.parse(raw);
      const back = JSON.parse(JSON.stringify(once));
      assert.equal(JSON.stringify(proposalInput.parse(back)), JSON.stringify(once), JSON.stringify(raw));
    }
  });
  await check("the propose tool cannot write; only the staff-checked confirm action can", () => {
    const tools = readFileSync("src/lib/aios/assistant.ts", "utf8");
    assert.doesNotMatch(tools, /\.(create|update|delete|upsert)(Many)?\(/, "assistant tools only read");
    assert.doesNotMatch(tools, /applyProposal|createProject|addItem|setItemDone/);
    const actions = readFileSync("src/lib/actions/founder-actions.ts", "utf8");
    const exported = [...actions.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n\s*const me = await staffUser\(\);\n\s*if \(!me\) return DENIED;/g)].map((m) => m[1]);
    const all = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    assert.deepEqual(exported.sort(), all.sort(), "every action checks staff first");
    const workspace = readFileSync("src/lib/aios/workspace.ts", "utf8");
    assert.match(workspace, /user\?\.role === "OWNER"/, "the role is re-read from the database");
  });
  await check("the assistant is told today's date, so \"due Friday\" resolves", () => {
    const prompt = founderAssistantPrompt(new Date("2026-10-29T17:00:00Z"));
    assert.match(prompt, /Today is Thursday, October 29, 2026 \(UTC, 2026-10-29\)/);
    assert.match(prompt, /YYYY-MM-DD/);
  });
  await check("the chat route checks the role before handing over the founder tools", () => {
    const route = readFileSync("src/app/api/agents/chat/route.ts", "utf8");
    const gate = route.indexOf('if (session.user.role !== "OWNER")');
    const tools = route.indexOf("founderAssistantTools()");
    assert.ok(gate > 0 && tools > gate, "role check comes first");
    assert.ok(route.indexOf("thread.userId !== session.user.id") < gate, "the thread must be the caller's own");
  });

  console.log("\n— the workspace —");
  const actor = await db.user.create({ data: { email: `zz-aios-${Date.now()}@example.test`, role: "OWNER", name: "AIOS Check" } });
  try {
    await check("a confirmed proposal saves and is logged as done via the assistant", async () => {
      const msg = await applyProposal(actor.id, proposalInput.parse({ kind: "create_project", name: "zz-aios project", summary: "check" }));
      assert.match(msg, /Project "zz-aios project" created/);
      const project = await db.founderProject.findFirstOrThrow({ where: { name: "zz-aios project" } });
      const log = await db.founderActivity.findFirstOrThrow({ where: { target: project.id } });
      assert.equal(log.via, "assistant");
      assert.equal(log.actorUserId, actor.id);
      const t = await applyProposal(actor.id, proposalInput.parse({ kind: "add_item", itemKind: "MILESTONE", title: "Beta", projectId: project.id, due: "2026-12-01" }));
      assert.match(t, /Milestone "Beta" added/);
      const ms = await db.founderItem.findFirstOrThrow({ where: { projectId: project.id } });
      assert.equal(ms.dueAt?.toISOString().slice(0, 10), "2026-12-01");
      await applyProposal(actor.id, { kind: "complete_item", itemId: ms.id });
      assert.ok((await db.founderItem.findUniqueOrThrow({ where: { id: ms.id } })).doneAt);
    });
    await check("items can't be filed under a project that doesn't exist; notes can't be ticked off", async () => {
      await assert.rejects(addItem(actor.id, { kind: "TASK", title: "x", body: null, projectId: "nope" }), /doesn't exist/);
      const note = await addItem(actor.id, { kind: "NOTE", title: "zz-aios note", body: "hello", projectId: null });
      await assert.rejects(setItemDone(actor.id, note.id, true), /Only tasks and milestones/);
    });
  } finally {
    await db.founderProject.deleteMany({ where: { createdByUserId: actor.id } });
    await db.founderItem.deleteMany({ where: { createdByUserId: actor.id } });
    await db.founderActivity.deleteMany({ where: { actorUserId: actor.id } });
    await db.user.delete({ where: { id: actor.id } });
  }

  console.log("\n— kept away from customers —");
  await check("no customer page or customer action imports the founder workspace", () => {
    const offenders = [...files("src/app/dashboard"), ...files("src/components/dashboard"), ...files("src/components/mairo")]
      .filter((f) => /@\/lib\/aios\/|founder-actions|components\/aios\//.test(readFileSync(f, "utf8")));
    assert.deepEqual(offenders, []);
  });
  await check("every AIOS page sits under the staff-only layout", () => {
    const layout = readFileSync("src/app/aios/layout.tsx", "utf8");
    assert.match(layout, /session\.user\.role !== "OWNER"\) redirect\("\/sign-in"\)/);
    for (const route of ["projects", "billing", "operations", "activity", "copilot"]) assert.ok(statSync(`src/app/aios/${route}/page.tsx`).isFile(), route);
  });

  console.log(`\n${passed} AIOS checks passed. Nothing reached Stripe or Meta.\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
