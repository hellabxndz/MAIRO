import { db } from "@/lib/db";

// The MAIRO Meta Update log: for each release, what Meta changed and what
// MAIRO changed because of it — so anyone can see exactly why behaviour moved.

export function nextVersion(latest: string | null): string {
  if (!latest) return "1.0";
  const [major, minor] = latest.split(".").map(Number);
  return `${major || 1}.${(minor || 0) + 1}`;
}

export async function appendRelease(input: { metaChanges: string[]; mairoChanges: string[]; updateIds: string[]; by: string | null }): Promise<string> {
  const latest = await db.platformReleaseLog.findFirst({ where: { platform: "META" }, orderBy: { createdAt: "desc" }, select: { version: true } });
  const version = nextVersion(latest?.version ?? null);
  await db.platformReleaseLog.create({ data: { platform: "META", version, metaChanges: input.metaChanges, mairoChanges: input.mairoChanges, updateIds: input.updateIds, createdBy: input.by } });
  return version;
}
