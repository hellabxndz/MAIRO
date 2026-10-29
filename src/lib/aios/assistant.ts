import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { founderBrief } from "./brief";
import { loadFounderSignals } from "./signals";
import { describeProposal, ITEM_KINDS, proposalInput } from "./workspace";

// The AIOS assistant's tools. Reading is free; changing anything is a
// proposal — the tool checks it and hands it back, the page shows a card with
// exactly what would happen, and only the person's Confirm press carries it
// out (confirmProposalAction), logged as done "via assistant". Nothing it can
// propose spends money, emails anyone or touches a customer's account.

const FOUNDER_ASSISTANT_RULES = `You are the AIOS assistant for the people who run MAIRO (an AI advertising platform for small businesses on Meta). You help the founder see what's happening across the platform and keep their own projects moving.

Rules:
- Facts come from your tools only. Call get_briefing for anything about subscriptions, revenue, sign-ups, Meta health, background jobs, errors, alerts, approvals or support. Call find_business for a specific customer, list_work for projects and tasks. If a tool doesn't return it, say you can't see it — never estimate or invent a figure. AI usage and cost are not measured yet; say so if asked.
- Revenue: "collected" figures come from Stripe's paid invoices. The list-price figure is an estimate. Say which one you're quoting.
- You never change anything yourself. To create a project, add a task, milestone, note, doc or idea, or tick something off, call propose_action. It does NOT save — the person sees a confirmation card and decides. After proposing, say in one line what the card will do and that it needs their confirmation. Never claim something was saved.
- You can't change customers' campaigns, billing or settings. Point to the AIOS page that does it (Customers, Billing, Operations, Meta Intelligence).
- Be brief and operational. Plain sentences; a short list only when there are several items.`;

/** The rules, plus today's date — the model has no clock, so "due Friday" needs it. */
export function founderAssistantPrompt(now = new Date()): string {
  const today = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  return `${FOUNDER_ASSISTANT_RULES}\n\nToday is ${today} (UTC, ${now.toISOString().slice(0, 10)}). Work out relative dates such as "Friday" or "next week" from this, and give due dates as YYYY-MM-DD.`;
}

export function founderAssistantTools(): ToolSet {
  return {
    get_briefing: tool({
      description: "Read today's platform signals and the briefing built from them: subscriptions by status and plan, Stripe-verified revenue (last 30 days), sign-ups, Meta connections and operation health, background job failures, unread alerts, pending customer decisions, open feedback, and the founder's own overdue tasks. Each briefing line names its source.",
      inputSchema: z.object({}),
      execute: async () => {
        const s = await loadFounderSignals();
        return { briefing: founderBrief(s), signals: { ...s, aiUsage: "not measured" } };
      },
    }),
    find_business: tool({
      description: "Look up customer businesses by name (or part of it). Returns plan, subscription status, Meta connection and sign-up date — no personal details.",
      inputSchema: z.object({ query: z.string().min(2).max(80) }),
      execute: async ({ query }) => {
        const orgs = await db.organization.findMany({
          where: { name: { contains: query, mode: "insensitive" } },
          take: 8,
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, subscriptionTier: true, subscriptionStatus: true, createdAt: true, executionStoppedAt: true, metaAdAccount: { select: { status: true } }, _count: { select: { mairoCampaigns: true } } },
        });
        return orgs.map((o) => ({
          id: o.id,
          name: o.name,
          plan: o.subscriptionTier,
          subscription: o.subscriptionStatus ?? "none",
          meta: o.metaAdAccount?.status ?? "not connected",
          campaigns: o._count.mairoCampaigns,
          stopped: Boolean(o.executionStoppedAt),
          joined: o.createdAt.toISOString().slice(0, 10),
          page: `/aios/organizations/${o.id}`,
        }));
      },
    }),
    list_work: tool({
      description: "Read the founder's projects and open tasks and milestones (with ids, due dates and project), most urgent first.",
      inputSchema: z.object({}),
      execute: async () => {
        const [projects, open] = await Promise.all([
          db.founderProject.findMany({ where: { status: { not: "DONE" } }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, name: true, status: true } }),
          db.founderItem.findMany({ where: { kind: { in: ["TASK", "MILESTONE"] }, doneAt: null }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 30, select: { id: true, kind: true, title: true, dueAt: true, project: { select: { name: true } } } }),
        ]);
        return { projects, open: open.map((i) => ({ id: i.id, kind: i.kind, title: i.title, due: i.dueAt?.toISOString().slice(0, 10) ?? null, project: i.project?.name ?? "Inbox" })) };
      },
    }),
    propose_action: tool({
      description: `Propose a change to the founder's workspace. This does NOT save anything: it returns a proposal the person must confirm on screen. kind "create_project" (name, summary); "add_item" (itemKind one of ${ITEM_KINDS.join(", ")}, title, optional body, optional projectId from list_work, optional due as YYYY-MM-DD); "complete_item" (itemId from list_work).`,
      inputSchema: z.object({
        kind: z.enum(["create_project", "add_item", "complete_item"]),
        name: z.string().optional(),
        summary: z.string().optional(),
        itemKind: z.enum(ITEM_KINDS).optional(),
        title: z.string().optional(),
        body: z.string().optional(),
        projectId: z.string().optional(),
        due: z.string().optional(),
        itemId: z.string().optional(),
      }),
      execute: async (raw) => {
        const parsed = proposalInput.safeParse(raw);
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That isn't a complete proposal." };
        const p = parsed.data;
        let projectName: string | null = null;
        let itemTitle: string | null = null;
        if (p.kind === "add_item" && p.projectId) {
          projectName = (await db.founderProject.findUnique({ where: { id: p.projectId }, select: { name: true } }))?.name ?? null;
          if (!projectName) return { ok: false, error: "No project with that id. Call list_work for the right one." };
        }
        if (p.kind === "complete_item") {
          itemTitle = (await db.founderItem.findUnique({ where: { id: p.itemId }, select: { title: true } }))?.title ?? null;
          if (!itemTitle) return { ok: false, error: "No item with that id. Call list_work for the right one." };
        }
        return { ok: true, needsConfirmation: true, saved: false, proposal: p, summary: itemTitle ? `Mark "${itemTitle}" done.` : describeProposal(p, projectName) };
      },
    }),
  };
}
