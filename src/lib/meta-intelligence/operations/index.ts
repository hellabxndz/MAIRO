import { db } from "@/lib/db";
import { raiseAlert } from "../alerts";
import type { FailureCause } from "../errors/classify";
import { bucketFor, hourOf, OPERATION_LABEL, OPERATIONS, operationHealth, pausedMessage, successDrop, type Operation, type OperationHealth, type Stat } from "./rules";

// The store behind operations/rules.ts: hourly counts of how MAIRO's writes
// to Meta went. Counts only — never a business, account, campaign or token.

/** Counts one write's outcome. Fire and forget from the Graph client: never slows or breaks the request. */
export async function recordOperation(operation: Operation, cause: FailureCause | null, now = new Date()): Promise<void> {
  const hour = hourOf(now);
  const field = bucketFor(cause);
  await db.metaOperationStat.upsert({
    where: { operation_hour: { operation, hour } },
    create: { operation, hour, [field]: 1 },
    update: { [field]: { increment: 1 } },
  });
}

async function recentStats(now: Date, hours: number): Promise<Stat[]> {
  return db.metaOperationStat.findMany({ where: { hour: { gte: new Date(now.getTime() - hours * 3_600_000) } } });
}

export async function currentOperationHealth(now = new Date()): Promise<OperationHealth[]> {
  return operationHealth(await recentStats(now, 2), now);
}

/**
 * Whether MAIRO should hold off this kind of action because Meta's side is
 * failing it for everyone. The answer comes with the words to tell the customer.
 */
export async function metaOperationPaused(operation: Operation, now = new Date()): Promise<{ paused: false } | { paused: true; message: string }> {
  const h = (await currentOperationHealth(now)).find((x) => x.operation === operation);
  return h?.state === "paused" ? { paused: true, message: pausedMessage(operation, h.reason ?? "") } : { paused: false };
}

/** The daily look: an operation succeeding much less often than it did. */
export async function operationSweep(now = new Date()): Promise<number> {
  const stats = await recentStats(now, 8 * 24 + 1);
  let raised = 0;
  for (const op of OPERATIONS) {
    const drop = successDrop(stats, op, now);
    if (!drop) continue;
    const day = now.toISOString().slice(0, 10);
    if (
      await raiseAlert({
        key: `op-drop:${op}:${day}`,
        severity: "HIGH",
        title: `${OPERATION_LABEL[op]}: success rate fell from ${drop.before}% to ${drop.after}%`,
        body: "Over the last 24 hours, compared with the 7 days before (requests Meta answered; customers' own expired tokens and permissions excluded). Check the Errors tab for what Meta is returning, and the changelog for a related change.",
        href: "/aios/meta-intelligence?tab=errors",
      })
    )
      raised++;
  }
  return raised;
}
