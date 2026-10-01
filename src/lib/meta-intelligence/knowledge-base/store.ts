import { db } from "@/lib/db";

// MAIRO's versioned Meta knowledge. Every change writes a new version and
// marks the old one superseded — nothing is overwritten — so when MAIRO
// behaves differently, the history says what it believed before and why it
// changed (changeNote, updateId).

export type KnowledgeTopic =
  | "feature"
  | "api-behavior"
  | "objective"
  | "optimization"
  | "placement"
  | "creative-spec"
  | "measurement"
  | "permission"
  | "rate-limit"
  | "deprecation"
  | "limitation"
  | "strategy";

export async function recordKnowledge(input: {
  topic: KnowledgeTopic;
  key: string;
  summary: string;
  data: unknown;
  source: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  state?: "VALIDATED" | "PROPOSED";
  changeNote?: string | null;
  updateId?: string | null;
  verifiedAt?: Date | null;
}): Promise<{ id: string; version: number; changed: boolean }> {
  const current = await db.platformKnowledge.findFirst({
    where: { platform: "META", topic: input.topic, key: input.key, supersededAt: null, state: input.state ?? "VALIDATED" },
    orderBy: { version: "desc" },
  });
  const dataJson = JSON.stringify(input.data ?? {});
  if (current && current.dataJson === dataJson && current.summary === input.summary) return { id: current.id, version: current.version, changed: false };
  const last = await db.platformKnowledge.findFirst({ where: { platform: "META", topic: input.topic, key: input.key }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (last?.version ?? 0) + 1;
  const row = await db.$transaction(async (tx) => {
    if (current) await tx.platformKnowledge.update({ where: { id: current.id }, data: { supersededAt: new Date() } });
    return tx.platformKnowledge.create({
      data: {
        platform: "META",
        topic: input.topic,
        key: input.key,
        version,
        dataJson,
        summary: input.summary.slice(0, 2000),
        source: input.source.slice(0, 500),
        confidence: input.confidence ?? "MEDIUM",
        state: input.state ?? "VALIDATED",
        verifiedAt: input.verifiedAt ?? null,
        changeNote: input.changeNote ?? null,
        updateId: input.updateId ?? null,
      },
    });
  });
  return { id: row.id, version: row.version, changed: true };
}

export async function knowledgeHistory(topic: KnowledgeTopic, key: string) {
  return db.platformKnowledge.findMany({ where: { platform: "META", topic, key }, orderBy: { version: "desc" }, take: 50 });
}

/**
 * Validated, current knowledge for MAIRO's AI (planner, assistant): what Meta
 * offers that MAIRO has validated, and the strategy lessons that came from it.
 * PROPOSED knowledge never reaches here.
 */
export async function metaKnowledgeBrief(limit = 12): Promise<string> {
  const rows = await db.platformKnowledge.findMany({
    where: { platform: "META", state: "VALIDATED", supersededAt: null, topic: { in: ["strategy", "deprecation", "limitation", "optimization", "creative-spec"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (!rows.length) return "";
  return ["Validated Meta advertising knowledge (MAIRO Meta Intelligence; follow it, don't overstate it):", ...rows.map((r) => `- ${r.summary}`)].join("\n");
}
