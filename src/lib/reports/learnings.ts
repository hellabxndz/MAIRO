import { db } from "@/lib/db";

// MAIRO Learning Memory, read back. Its own module so anything that writes
// ads or answers questions can use it without importing the report builder.

/** What MAIRO has learned, for the assistant's prompt and for writing new ads. */
export async function learningsBrief(organizationId: string): Promise<string> {
  const rows = await db.mairoLearning.findMany({
    where: { organizationId, active: true, confidence: { in: ["HIGH", "MEDIUM"] } },
    orderBy: [{ confidence: "asc" }, { lastSeenAt: "desc" }],
    take: 8,
  });
  if (rows.length === 0) return "";
  return ["What MAIRO has learned from this business's own results (use it; don't overstate it):", ...rows.map((r) => `- ${r.statement} (${r.confidence.toLowerCase()} confidence, seen ${r.timesSeen}×)`)].join("\n");
}

