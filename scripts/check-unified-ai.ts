// Checks the one MAIRO AI (docs/UNIFIED-AI-ARCHITECTURE.md) against the real
// code and the local database. No model is called and nothing reaches Meta:
//
//   - one AI: the customer sees one MAIRO, never named specialists or a
//     persona beside it; the AI is told it is one MAIRO;
//   - memory: what the owner tells MAIRO in chat is stored as a Business
//     Brain fact with its source, survives a fresh load, and reaches every
//     later request's context; the owner can correct and delete it;
//   - isolation: one business's facts, rules and activity never appear in
//     another's tools or context;
//   - rules bind: "no further than 20 miles" stops MAIRO recommending, and
//     stops anyone applying, an audience change beyond it — in code;
//   - tools: a role that can't change things isn't given the tools that do;
//   - grounding: tracking and activity answers come from records and say
//     "not checked" or "nothing happened" rather than guess; failures show.
//
//   npm run check:unified-ai   (local database; no AI model, no Meta)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { brainPrompt, changeBrain, loadBrainState } from "../src/lib/brain/store";
import { customerRulesFrom, parseRadius, ruleProblem } from "../src/lib/brain/customer-rules";
import { guardrailsFor } from "../src/lib/decisions/gather";
import { limitProblem } from "../src/lib/decisions/guardrails";
import { AI_TEAM_BRIEF, assistantTools } from "../src/lib/ai/assistant-tools";
import { AGENTS } from "../src/lib/team/agents";
import { DEFAULT_ASSISTANT_NAME, systemPromptFor } from "../src/lib/ai/agents";
import type { DecisionChange } from "../src/lib/decisions/types";
import { findOrCreateThread, recentTurns } from "../src/lib/ai/threads";
import { freshnessOf } from "../src/lib/brain/rules";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-one";
const A = `${TAG}-landscaping`;
const B = `${TAG}-other`;
const widen = (from: number | null, to: number | null): DecisionChange => ({ type: "widen-audience", platform: "META", mairoCampaignId: "c", campaignName: "Spring cleanups", from: { geoRadius: from, ageMin: 25, ageMax: 65 }, to: { geoRadius: to, ageMin: 25, ageMax: 65 } });
// Tools from the AI SDK: run one the way the model would.
type Exec = { execute: (args: unknown, opts: unknown) => Promise<unknown> };
const run = async (tools: Record<string, unknown>, name: string, args: unknown = {}) => (tools[name] as Exec).execute(args, { toolCallId: "t", messages: [] });

async function cleanup() {
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  await db.organization.create({ data: { id: A, name: "Green Fern Landscaping" } });
  await db.organization.create({ data: { id: B, name: "Other Business" } });

  console.log("— one AI —");
  await check("the customer sees one MAIRO: every kind of work is named MAIRO first, and the default name is MAIRO", () => {
    for (const a of AGENTS) assert.match(a.name, /^MAIRO · /, a.role);
    assert.equal(DEFAULT_ASSISTANT_NAME, "MAIRO");
    assert.match(systemPromptFor("SUPPORT", { businessName: "Green Fern" }), /You are MAIRO, the one assistant/);
    assert.match(AI_TEAM_BRIEF, /You are the one MAIRO for this business/);
    assert.doesNotMatch(AI_TEAM_BRIEF, /Strategy Agent|Growth Advisor|specialists? to hand off/);
  });
  await check("no customer-facing page or plan promises a team of specialists", () => {
    for (const f of ["src/lib/plans.ts", "src/lib/site.ts", "src/app/privacy/page.tsx", "src/app/dashboard/team/page.tsx", "src/app/dashboard/agents/page.tsx", "src/lib/coach/diagnose.ts", "src/lib/onboarding/team.ts"]) {
      const text = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
      assert.doesNotMatch(text, /AI [Tt]eam|8 AI|eight AI|(Strategy|Audience|Creative|Campaign|Optimization|Analytics) Agent|Growth Advisor/, f);
    }
  });

  console.log("\n— memory —");
  await check("what the owner says in chat is stored with its source, and survives a fresh load", async () => {
    const r1 = await changeBrain(A, { op: "set", field: "serviceArea", value: "Miami, Florida" }, "assistant");
    const r2 = await changeBrain(A, { op: "set", field: "maxRadiusMiles", value: "20 miles" }, "assistant");
    const r3 = await changeBrain(A, { op: "add", field: "standingInstructions", value: "Never advertise discounts" }, "assistant");
    assert.ok(r1.ok && r2.ok && r3.ok);
    const fresh = await loadBrainState(A);
    const p = fresh.profile as unknown as Record<string, unknown>;
    assert.equal(p.serviceArea, "Miami, Florida");
    assert.equal(fresh.meta("maxRadiusMiles").source, "assistant");
    assert.equal(fresh.meta("maxRadiusMiles").status, "confirmed");
    assert.deepEqual(customerRulesFrom(p), { maxRadiusMiles: 20, standingInstructions: ["Never advertise discounts"] });
  });
  await check("every later request carries it: the rule and the instruction are in the AI's context", async () => {
    const prompt = brainPrompt(await loadBrainState(A));
    assert.match(prompt, /RULE — never advertise further than 20 miles/);
    assert.match(prompt, /RULE from the owner — always follow: Never advertise discounts/);
    assert.match(prompt, /Miami, Florida/);
  });
  await check("the owner can correct and delete a fact", async () => {
    assert.ok((await changeBrain(A, { op: "remove", field: "standingInstructions", value: "Never advertise discounts" }, "customer")).ok);
    assert.deepEqual(customerRulesFrom((await loadBrainState(A)).profile as unknown as Record<string, unknown>).standingInstructions, []);
  });
  await check("a guess from the website never overwrites what the owner said", async () => {
    await changeBrain(A, { op: "set", field: "serviceArea", value: "All of Florida" }, "website");
    assert.equal(((await loadBrainState(A)).profile as unknown as Record<string, unknown>).serviceArea, "Miami, Florida");
  });

  console.log("\n— isolation —");
  await check("another business's tools and context never show A's facts or rules", async () => {
    const tools = assistantTools(B, "OWNER") as Record<string, unknown>;
    const out = JSON.stringify(await run(tools, "get_business_brain"));
    assert.doesNotMatch(out, /Miami|20 miles/);
    assert.equal(((await run(tools, "get_business_brain")) as { rules: { maxRadiusMiles: number | null } }).rules.maxRadiusMiles, null);
    assert.doesNotMatch(brainPrompt(await loadBrainState(B)), /Miami/);
    assert.equal((await guardrailsFor(B)).maxRadiusMiles, null);
  });

  await check("one conversation per person per business: switching business never brings the other's thread", async () => {
    const u = await db.user.create({ data: { email: `${TAG}-owner@example.test`, organizationId: A } });
    const ta = await findOrCreateThread(u.id, A, "SUPPORT");
    const tb = await findOrCreateThread(u.id, B, "SUPPORT");
    assert.notEqual(ta.id, tb.id);
    assert.equal(tb.organizationId, B);
    assert.equal((await findOrCreateThread(u.id, A, "SUPPORT")).id, ta.id, "and coming back finds A's own thread");
    await db.agentMessage.create({ data: { threadId: ta.id, role: "USER", content: "We only work in Miami." } });
    assert.equal(await db.agentMessage.count({ where: { threadId: tb.id } }), 0);
  });

  console.log("\n— context and freshness —");
  await check("the model gets the recent conversation, starting with the person; the Brain carries the rest", () => {
    const long = Array.from({ length: 101 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", i }));
    const r = recentTurns(long);
    assert.ok(r.length <= 40 && r.length > 0);
    assert.equal(r[0].role, "user");
    assert.equal(r.at(-1)!.i, 100, "the newest message is always kept");
    assert.deepEqual(recentTurns([{ role: "assistant" }]), []);
  });
  await check("every fact says when it was last confirmed; one older than six months is flagged, to the owner and to the AI", async () => {
    const now = new Date("2026-11-04T12:00:00Z");
    const meta = (iso: string) => ({ source: "customer" as const, status: "confirmed" as const, updatedAt: iso, verifiedAt: iso });
    assert.deepEqual(freshnessOf(meta("2026-11-04T08:00:00Z"), now), { words: "today", stale: false });
    assert.deepEqual(freshnessOf(meta("2026-11-01T08:00:00Z"), now), { words: "3 days ago", stale: false });
    assert.deepEqual(freshnessOf(meta("2026-03-01T08:00:00Z"), now), { words: "Mar 2026", stale: true });
    await changeBrain(A, { op: "set", field: "industry", value: "Landscaping" }, "customer", new Date(Date.now() - 400 * 864e5));
    const prompt = brainPrompt(await loadBrainState(A));
    assert.match(prompt, /Not confirmed in over 6 months — may be out of date; check with the owner[^\n]*Industry/);
    assert.doesNotMatch(prompt.split("\n").find((l) => l.startsWith("Not confirmed")) ?? "", /Service area/, "a fresh fact isn't flagged");
    // A new business whose facts are still its sign-up answers (no Brain saved yet) is fresh, not "1970".
    const fresh = await loadBrainState(B);
    assert.equal(freshnessOf(fresh.meta("businessName"), new Date()).stale, false);
    assert.doesNotMatch(brainPrompt(fresh), /Not confirmed in over 6 months/);
  });

  console.log("\n— the owner's rules bind, in code —");
  await check("the radius is read from what the owner said, and an unclear one isn't a rule", () => {
    assert.equal(parseRadius("20 miles"), 20);
    assert.equal(parseRadius("within 15mi"), 15);
    assert.equal(parseRadius("about twenty"), null);
    assert.equal(parseRadius("0"), null);
  });
  await check("an audience change beyond 20 miles, or removing the limit, is refused — approved or automatic", async () => {
    const g = await guardrailsFor(A);
    assert.equal(g.maxRadiusMiles, 20);
    assert.match(limitProblem([widen(10, 25)], g, 0) ?? "", /further than your rule of 20 miles/);
    assert.match(limitProblem([widen(10, null)], g, 0) ?? "", /remove the distance limit/);
    assert.equal(limitProblem([widen(10, 18)], g, 0), null);
    assert.equal(ruleProblem([widen(10, 25)], { maxRadiusMiles: null }), null, "no rule, no refusal");
  });
  await check("the daily review drops recommendations that break a rule before anyone sees them (source)", () => {
    const src = readFileSync("src/lib/decisions/run.ts", "utf8");
    assert.match(src, /const allowed = based\.filter\(\(d\) => !ruleProblem\(d\.changes/);
    assert.match(src, /persistDrafts\(organizationId, allowed,/);
    assert.match(readFileSync("src/lib/decisions/apply.ts", "utf8"), /limitProblem\(changes, guardrails/);
  });

  console.log("\n— tools and grounding —");
  await check("a viewer isn't given the tools that change things; an owner is", () => {
    const viewer = Object.keys(assistantTools(A, "VIEWER"));
    for (const t of ["update_business_brain", "tell_mairo", "propose_fix", "propose_mission"]) assert.ok(!viewer.includes(t), t);
    for (const t of ["get_business_brain", "get_tracking_health", "get_recent_activity"]) assert.ok(viewer.includes(t), t);
    assert.ok(Object.keys(assistantTools(A, "OWNER")).includes("update_business_brain"));
  });
  await check("tracking: 'not checked yet' until the daily check has run, then exactly what it found", async () => {
    const tools = assistantTools(A, "OWNER") as Record<string, unknown>;
    assert.equal(((await run(tools, "get_tracking_health")) as { verdict: string }).verdict, "not_checked_yet");
    await db.trackingProfile.create({ data: { organizationId: A, healthStatus: "attention", healthHeadline: "No purchase events in the last 7 days", healthDetail: "d", healthCheckedAt: new Date() } });
    const r = (await run(tools, "get_tracking_health")) as { verdict: string; headline: string };
    assert.equal(r.verdict, "attention");
    assert.equal(r.headline, "No purchase events in the last 7 days");
    assert.equal(((await run(assistantTools(B, "OWNER") as Record<string, unknown>, "get_tracking_health")) as { verdict: string }).verdict, "not_checked_yet");
  });
  await check("'what did you do today': only recorded work, failures included, and 'nothing' when nothing happened", async () => {
    const tools = assistantTools(A, "OWNER") as Record<string, unknown>;
    const none = (await run(tools, "get_recent_activity", { days: 1 })) as { note: string | null };
    assert.match(none.note ?? "", /Nothing was changed, failed or prepared/);
    await db.mairoActivity.create({ data: { organizationId: A, action: "decision.applied", summary: "Paused “Leaf blower — ad 2”", reason: "It spent $48 with no leads.", automatic: true } });
    await db.mairoDecision.create({
      data: { organizationId: A, kind: "raise-budget", category: "BUDGET", title: "Shift $5 a day to Spring cleanups", noticed: "n", noticedAdvanced: "n", whyItMatters: "w", recommendation: "r", impact: "i", risk: "LOW", confidence: "MEDIUM", evidenceJson: "{}", changesJson: "[]", status: "FAILED", dedupeKey: "x", resultJson: JSON.stringify({ error: "Meta refused: budget below minimum" }) },
    });
    const r = (await run(tools, "get_recent_activity", { days: 1 })) as { changesMade: { what: string; by: string }[]; failed: { what: string }[] };
    assert.equal(r.changesMade[0].what, "Paused “Leaf blower — ad 2”");
    assert.match(r.changesMade[0].by, /within the owner's Autopilot limits/);
    assert.equal(r.failed[0].what, "Shift $5 a day to Spring cleanups");
    const other = (await run(assistantTools(B, "OWNER") as Record<string, unknown>, "get_recent_activity", { days: 1 })) as { changesMade: unknown[]; failed: unknown[] };
    assert.equal(other.changesMade.length + other.failed.length, 0, "never another business's work");
  });
  await check("every chat request is built from the Business Brain, memory and the one-MAIRO brief (source)", () => {
    const chat = readFileSync("src/app/api/agents/chat/route.ts", "utf8");
    for (const part of ["memoryBrief(memory)", "brainPrompt(brain)", "AI_TEAM_BRIEF", "assistantTools(threadOrgId, role)", "roleIn(session.user.id, threadOrgId)"]) assert.ok(chat.includes(part), part);
  });

  await cleanup();
  console.log(`\nUnified MAIRO AI: ${passed} checks passed. No AI model was called; nothing was sent to Meta.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => undefined);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
