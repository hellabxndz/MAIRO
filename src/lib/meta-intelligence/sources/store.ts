import { db } from "@/lib/db";
import { authorityFor, OFFICIAL_SOURCES, type SourceKind } from "./catalog";

// The monitored sources, stored. Official Meta sources are seeded; an admin
// can add more, but only on an allowlisted host, and the authority comes from
// the host, not from what the admin types.

export async function seedSources(): Promise<number> {
  let added = 0;
  for (const s of OFFICIAL_SOURCES) {
    const existing = await db.platformSource.findUnique({ where: { key: s.key }, select: { id: true } });
    if (existing) continue;
    await db.platformSource.create({ data: { platform: "META", key: s.key, name: s.name, url: s.url, kind: s.kind, authority: s.authority } });
    added++;
  }
  return added;
}

export async function addSource(input: { name: string; url: string; kind: SourceKind }): Promise<{ ok: true } | { ok: false; error: string }> {
  const authority = authorityFor(input.url);
  if (authority === "UNVERIFIED") return { ok: false, error: "Only https pages on Meta's own sites (or a host added to TRUSTED_HOSTS in code) can be monitored." };
  const key = `custom.${new URL(input.url).hostname}.${new URL(input.url).pathname}`.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/-+$/, "").slice(0, 120);
  await db.platformSource.upsert({ where: { key }, create: { platform: "META", key, name: input.name.slice(0, 120), url: input.url, kind: input.kind, authority }, update: { name: input.name.slice(0, 120), active: true } });
  return { ok: true };
}
