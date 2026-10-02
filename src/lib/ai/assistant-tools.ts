import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { gatherDecisionInput } from "@/lib/decisions/gather";
import { decide, costPerResult, clickRate, frequency } from "@/lib/decisions/rules";
import { persistDrafts, parseChanges } from "@/lib/decisions/store";
import { describeChange } from "@/lib/decisions/guardrails";
import { resultsFor, resultWord } from "@/lib/protection/rules";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { activeMission, missionActivity, proposedMission, startMission, tellMairo } from "@/lib/mission/store";
import { MISSION_GOAL_KEYS, missionGoal } from "@/lib/mission/goals";
import { changeBrain, loadBrainState } from "@/lib/brain/store";
import { confirmationQuestion, requiresConfirmation, type FactChange } from "@/lib/brain/edit";
import { BRAIN_FIELDS } from "@/lib/brain/catalog";
import { displayValue, hasValue } from "@/lib/brain/rules";

// What the assistant can look at and propose — One-Click Fix.
//
// Two tools, and the split is the safety:
//
//   diagnose_campaigns reads the account's real figures (the same windows
//   Mairo Decisions uses) and the decisions the rules produce. The assistant
//   explains from these numbers only.
//
//   propose_fix puts a "Fix This For Me" button under the answer, for
//   decisions the rules produced. The assistant can't invent a change: it can
//   only point at one of these, and the customer still approves every change
//   in the confirmation panel. Nothing here changes an account.

function figures(objective: Parameters<typeof resultsFor>[0], m: PlatformMetrics | null) {
  if (!m) return null;
  const ctr = clickRate(m);
  const freq = frequency(m);
  const cpr = costPerResult(objective, m);
  return {
    spend: m.spendCents === null ? null : `$${(m.spendCents / 100).toFixed(2)}`,
    results: resultsFor(objective, m),
    costPerResult: cpr === null ? null : `$${(cpr / 100).toFixed(2)}`,
    clickRatePercent: ctr === null ? null : Number((ctr * 100).toFixed(2)),
    frequency: freq === null ? null : Number(freq.toFixed(2)),
    revenue: m.revenueCents === null ? null : `$${(m.revenueCents / 100).toFixed(2)}`,
    roas: m.roas,
  };
}

export function assistantTools(organizationId: string) {
  return {
    diagnose_campaigns: tool({
      description:
        "Read this business's real campaign figures and MAIRO's current recommended fixes. Use it for any question about performance: why sales or results changed, why costs went up, whether to change a budget, why people click but don't buy. Figures come in three windows: the last 3 days, the 4 days before that, and the last 7 days. Never state a figure that isn't in this result.",
      inputSchema: z.object({
        campaignId: z.string().optional().describe("A MAIRO campaign id, to focus on one campaign"),
      }),
      execute: async ({ campaignId }) => {
        const input = await gatherDecisionInput(organizationId);
        const run = decide(input);
        // Stored like the daily run's, so a proposal can point at them and
        // the Decisions page shows the same thing.
        const ids = await persistDrafts(organizationId, run.decisions, "daily");
        const rows = await db.mairoDecision.findMany({ where: { id: { in: ids } } });
        const campaigns = input.campaigns
          .filter((c) => !campaignId || c.mairoCampaignId === campaignId)
          .map((c) => ({
            id: c.mairoCampaignId,
            name: c.name,
            status: c.status,
            goal: c.objective,
            resultWord: resultWord(c.objective),
            dailyBudget: `$${(c.dailyBudgetCents / 100).toFixed(0)}`,
            last3Days: figures(c.objective, c.recent),
            previous4Days: figures(c.objective, c.prior),
            last7Days: figures(c.objective, c.week),
            ads: c.ads.map((a) => ({
              label: a.label,
              last3Days: figures(c.objective, a.recent),
              previous4Days: figures(c.objective, a.prior),
              last7Days: figures(c.objective, a.week),
            })),
          }));
        return {
          dataStatus: run.dataStatus,
          note:
            run.dataStatus === "learning"
              ? "Campaigns are still in their first days. Say MAIRO needs more campaign data before recommending changes."
              : run.dataStatus === "no-campaigns"
                ? "Nothing is running yet."
                : null,
          campaigns,
          recommendedFixes: rows
            .filter((d) => !campaignId || d.mairoCampaignId === campaignId || d.mairoCampaignId === null)
            .map((d) => ({
              decisionId: d.id,
              title: d.title,
              whatMairoNoticed: d.noticed,
              recommendation: d.recommendation,
              confidence: d.confidence,
              risk: d.risk,
              changes: parseChanges(d.changesJson).map((c) => describeChange(c)),
              canBeAppliedByMairo: parseChanges(d.changesJson).some((c) => c.type !== "guide"),
            })),
        };
      },
    }),

    get_mission: tool({
      description:
        "Read the business's current MAIRO mission (its goal, strategy and what MAIRO is doing) and any plan waiting for approval. Use it whenever the person talks about what they want to achieve, their goal, or what MAIRO is doing.",
      inputSchema: z.object({}),
      execute: async () => {
        const [m, p, doing] = await Promise.all([activeMission(organizationId), proposedMission(organizationId), missionActivity(organizationId)]);
        return {
          current: m ? { goal: missionGoal(m.primaryGoal).label, secondaryGoal: m.secondaryGoal ? missionGoal(m.secondaryGoal).label : null, title: m.title, strategy: m.plan.strategy, why: m.plan.why, focus: m.plan.focus } : null,
          waitingForApproval: p ? { title: p.title, goal: missionGoal(p.primaryGoal).label } : null,
          doing,
        };
      },
    }),

    propose_mission: tool({
      description:
        "Build a new MAIRO plan when the person wants a different outcome (\"I need more customers this month\", \"we want more bookings\") or is launching something. It is saved for them to review and approve on the Mission page; nothing changes until they do. Pass their words; add the goal key only if it is clear. Explain the recommendation briefly, then tell them to review and approve it.",
      inputSchema: z.object({
        request: z.string().min(3).max(800).describe("What they said they want, in their words"),
        goal: z.enum(MISSION_GOAL_KEYS).optional(),
      }),
      execute: async ({ request, goal }) => {
        const r = await startMission(organizationId, { goal: goal ?? null, request });
        if (r.kind === "questions") return { needsAnswers: r.questions.map((q) => q.question), missionId: null };
        const p = await proposedMission(organizationId);
        return { missionId: r.missionId, title: p?.title ?? null, goal: p ? missionGoal(p.primaryGoal).label : null, strategy: p?.plan.strategy ?? null, why: p?.plan.why ?? null, focus: p?.plan.focus ?? [] };
      },
    }),

    tell_mairo: tool({
      description:
        "Record news about the business that should change the marketing: a promotion (\"20% off this weekend\"), something sold out or discontinued (\"we sold out of the blue hoodie\"), or a fact to remember. MAIRO updates its plans (and, on Scale, social posts) and says what it changed. For a new goal or a launch, use propose_mission instead.",
      inputSchema: z.object({ text: z.string().min(3).max(800).describe("What they told you, in their words") }),
      execute: async ({ text }) => {
        const r = await tellMairo(organizationId, text);
        return { result: r.kind, message: r.message, whatMairoChanged: r.actions, missionId: r.missionId ?? null };
      },
    }),

    get_business_brain: tool({
      description:
        "Read what MAIRO knows about this business — products and services, customers, what makes it different, brand, the current goal, what's temporary, and what MAIRO has learned from results. Use it before building a campaign or creative so you never ask the owner something MAIRO already knows.",
      inputSchema: z.object({}),
      execute: async () => {
        const s = await loadBrainState(organizationId);
        const p = s.profile as unknown as Record<string, unknown>;
        return {
          facts: BRAIN_FIELDS.filter((d) => hasValue(p[d.key])).map((d) => ({ field: d.key, label: d.label, value: displayValue(p[d.key]), confirmed: s.meta(d.key).status === "confirmed" })),
          products: s.profile.products.map((x) => ({ name: x.name, price: x.price, priority: x.priority, status: x.status })),
          goal: s.goals.current?.label ?? null,
          temporary: s.temporary.map((t) => ({ text: t.text, state: t.state, ends: t.endsAt?.toISOString().slice(0, 10) ?? null })),
          learned: s.learned.filter((l) => l.active).map((l) => l.said),
          unknownButUseful: s.questions.map((q) => q.text),
        };
      },
    }),

    update_business_brain: tool({
      description:
        "Update what MAIRO knows about the business when the owner corrects or changes a lasting fact: \"we don't do free estimates anymore\" (remove from offers), \"our best seller is Premium Detail\" (add to bestProducts), \"we want to focus on commercial roofing\" (set focusItem — then also suggest propose_mission for a goal change), \"the blue hoodie is back\" (product status available). For a promotion or sale, or something just sold out, use tell_mairo instead — temporary things never go here. Removing or replacing a fact is permanent: call with confirmed=false first, ask the owner the returned question, and only call again with confirmed=true after they say yes.",
      inputSchema: z.object({
        op: z.enum(["set", "add", "remove", "product"]),
        field: z.enum(BRAIN_FIELDS.map((d) => d.key) as [string, ...string[]]).optional().describe("The fact to change (not for op=product)"),
        value: z.string().max(300).optional().describe("The new value, or the item to remove from a list"),
        product: z.string().max(200).optional().describe("For op=product: the product or service name"),
        status: z.enum(["available", "unavailable", "seasonal", "new"]).optional(),
        priority: z.enum(["high", "normal", "low"]).optional(),
        confirmed: z.boolean().describe("True only after the owner has said yes to the confirmation question"),
      }),
      execute: async ({ op, field, value, product, status, priority, confirmed }) => {
        const change: FactChange | null =
          op === "product"
            ? product ? { op: "product", name: product, patch: { ...(status ? { status } : {}), ...(priority ? { priority } : {}) } } : null
            : !field ? null
              : op === "remove" ? { op: "remove", field, value }
                : value ? { op, field, value } : null;
        if (!change) return { ok: false, message: "Say which fact and what it should be." };
        if (requiresConfirmation(change) && !confirmed) return { ok: false, needsConfirmation: true, ask: confirmationQuestion(change) };
        const r = await changeBrain(organizationId, change, "assistant");
        return r.ok ? { ok: true, learned: r.changed, message: r.text } : { ok: false, message: r.error };
      },
    }),

    go_to: tool({
      description:
        "Show a button that takes the person to the right MAIRO page, when they want to see or do something there (\"show me my best creative\", \"I want to create a campaign\"). Use it with a one-sentence answer; don't describe menus. Social pages are Scale only.",
      inputSchema: z.object({ destination: z.enum(Object.keys(DESTINATIONS) as [keyof typeof DESTINATIONS, ...(keyof typeof DESTINATIONS)[]]) }),
      execute: async ({ destination }) => DESTINATIONS[destination],
    }),

    propose_fix: tool({
      description:
        "Show a 'Fix This For Me' button under your answer for recommended fixes from diagnose_campaigns (only those with canBeAppliedByMairo). The person reviews each change and approves it in a confirmation panel; nothing changes until they do. Call it at most once per answer, after explaining the problem.",
      inputSchema: z.object({
        decisionIds: z.array(z.string()).min(1).max(5),
      }),
      execute: async ({ decisionIds }) => {
        const rows = await db.mairoDecision.findMany({
          where: { id: { in: decisionIds }, organizationId, status: "PENDING" },
        });
        const usable = rows.filter((d) => parseChanges(d.changesJson).some((c) => c.type !== "guide"));
        return {
          decisionIds: usable.map((d) => d.id),
          changes: usable.flatMap((d) => parseChanges(d.changesJson).filter((c) => c.type !== "guide").map((c) => describeChange(c))),
          note: usable.length === 0 ? "None of those can be applied by MAIRO; tell the person what to do instead." : null,
        };
      },
    }),
  };
}

/**
 * Where go_to may take someone. A fixed list: the assistant can't send a
 * person to an arbitrary URL, only to a MAIRO page that exists.
 */
export const DESTINATIONS = {
  overview: { href: "/dashboard", label: "Open your Overview" },
  campaigns: { href: "/dashboard/campaigns", label: "Open Campaigns" },
  create_campaign: { href: "/dashboard/create", label: "Create a campaign" },
  creatives: { href: "/dashboard/creatives", label: "Open Creatives" },
  best_creative: { href: "/dashboard/creatives?tab=top", label: "See your best creatives" },
  new_creatives: { href: "/dashboard/creatives?tab=new", label: "See new creatives" },
  create_creative: { href: "/dashboard/creative-studio", label: "Create a creative" },
  analytics: { href: "/dashboard/analytics", label: "Open Analytics" },
  analytics_advanced: { href: "/dashboard/analytics?view=advanced", label: "Open detailed analytics" },
  decisions: { href: "/dashboard/decisions", label: "Open Mairo Decisions" },
  mission: { href: "/dashboard/mission", label: "Open your goal and plan" },
  social: { href: "/dashboard/social", label: "Open Social Manager" },
  social_calendar: { href: "/dashboard/social/calendar", label: "Open the Content Calendar" },
  social_approvals: { href: "/dashboard/social/posts?view=approval", label: "Review posts waiting for you" },
  promotions: { href: "/dashboard/social/promotions", label: "Open Promotions" },
  reports: { href: "/dashboard/reports", label: "Open your reports" },
  settings: { href: "/dashboard/settings", label: "Open Settings" },
  billing: { href: "/dashboard/billing", label: "Open Billing" },
} as const;

/** Added to the customer assistant's prompt alongside the tools. */
export const MISSION_BRIEF = [
  "MAIRO Mission:",
  "- MAIRO is the business's AI marketing manager. The owner says what they want to achieve; MAIRO decides the marketing.",
  "- When they describe an outcome they want or a launch, call get_mission, then propose_mission with their words. Say what you recommend in one or two sentences (e.g. \"Your current goal is brand awareness. I recommend changing the primary goal to customer acquisition.\"), then tell them the plan is ready to review and approve on the Mission page. Never say it's already changed.",
  "- When they tell you news (a promotion, something sold out), call tell_mairo and relay what MAIRO changed.",
  "- When they correct or change a lasting fact about the business, call update_business_brain. Removing or replacing a fact needs their yes first: ask the question it returns, then call again with confirmed=true. After a change, say briefly “✓ MAIRO learned this.” — not after every message.",
  "- The Business Brain above is what MAIRO already knows. Never ask the owner for something in it; build on it (\"Your current goal is more ceramic coating bookings, and before/after videos have been your strongest format — I'll build the next concept around that.\"). Learned patterns are observations, never causes: say \"has generated\" or \"MAIRO has seen\", never \"caused\".",
  "- Social posting is part of the plan only on Scale; don't promise it otherwise. Never promise results.",
  "- When the person wants to see or do something in MAIRO, call go_to so they get a button straight there, instead of describing where to click.",
  "- Before recommending anything, answer: what business objective does this help accomplish? If there's no clear answer, don't recommend it.",
  "- Say how sure MAIRO is in words (\"MAIRO needs more data\", \"MAIRO is becoming more confident\"), never as a percentage or a predicted result.",
].join("\n");

export const ONE_CLICK_FIX_BRIEF = [
  "One-Click Fix:",
  "- For any question about how campaigns are performing, call diagnose_campaigns first and answer from its figures only. Never invent or estimate a number.",
  "- Explain the likely cause in plain words first (e.g. \"people are seeing this ad too often and fewer are clicking it\"), then the supporting figures, then numbered recommended steps.",
  "- If diagnose_campaigns returns recommended fixes MAIRO can apply, call propose_fix with their decisionIds so the person gets a \"Fix This For Me\" button, and tell them they'll see every change before it's made.",
  "- Only MAIRO's own recommended fixes can be proposed. For anything else (their website, a new campaign), say what to do and where.",
  "- If the data status is \"learning\", say MAIRO needs more campaign data before making this recommendation. Never promise results or revenue.",
].join("\n");
