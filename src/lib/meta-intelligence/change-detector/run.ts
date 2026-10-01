import { db } from "@/lib/db";
import { graphApiVersion } from "@/lib/meta/client";
import { raiseAlert } from "../alerts";
import { recordVersionFacts } from "../api-versioning";
import { compatibilityFor } from "../compatibility";
import { BASELINE_FEATURES, featuresMentioned } from "../feature-registry/baseline";
import { fetchSource } from "../sources/fetch";
import { authorityFor } from "../sources/catalog";
import { classify, diffBlocks, groupChanges, hashOf, normalize, titleFor, versionFacts } from "./diff";

// The Meta change detector: look at each approved source, compare it with the
// last stored version, and file what changed as updates for the pipeline.
//
// The first look at a source is its baseline — nothing is "new" yet. Version
// facts (release and retirement dates) are read from official version and
// changelog pages every time. Removed text is filed too: documentation that
// disappears is often the first sign of a removal.

const MAX_UPDATES_PER_SOURCE = 12;

type Source = { id: string; key: string; name: string; url: string; kind: string; authority: string };

export type CheckResult = { source: string; ok: boolean; changed: boolean; updates: number; baseline: boolean; error?: string };

async function terms() {
  const rows = await db.platformFeature.findMany({ where: { platform: "META" }, select: { featureKey: true, name: true, mairoSupport: true, deprecated: true, mairoMapping: true } });
  const baseline = new Map(BASELINE_FEATURES.map((f) => [f.featureKey, f.terms]));
  return rows.map((r) => ({ featureKey: r.featureKey, name: r.name, terms: baseline.get(r.featureKey) ?? [], mairoSupport: r.mairoSupport, deprecated: r.deprecated }));
}

/** Files the changed text of one source as updates. Used by both the fetcher and an admin pasting official text. */
export async function ingestText(source: Source, html: string, now = new Date()): Promise<Omit<CheckResult, "source" | "ok">> {
  const blocks = normalize(html);
  const text = blocks.join("\n\n");
  const hash = hashOf(text);
  const last = await db.platformSourceSnapshot.findFirst({ where: { sourceId: source.id }, orderBy: { fetchedAt: "desc" } });

  // Versions are read from official pages every time, not only on a diff.
  if (source.authority === "OFFICIAL" && (source.kind === "VERSIONS" || source.kind === "CHANGELOG")) {
    await recordVersionFacts(versionFacts(text), source.url);
  }

  if (last && last.hash === hash) {
    await db.platformSource.update({ where: { id: source.id }, data: { lastCheckedAt: now, lastError: null } });
    return { changed: false, updates: 0, baseline: false };
  }
  await db.platformSourceSnapshot.create({ data: { sourceId: source.id, hash, text: text.slice(0, 400_000), fetchedAt: now } });
  await db.platformSource.update({ where: { id: source.id }, data: { lastCheckedAt: now, lastChangedAt: now, lastError: null } });
  if (!last) return { changed: true, updates: 0, baseline: true };

  const { added, removed } = diffBlocks(last.text.split("\n\n"), blocks);
  const features = await terms();
  const production = graphApiVersion();
  const groups = [
    ...groupChanges(added, blocks, MAX_UPDATES_PER_SOURCE).map((g) => ({ text: g, removedText: false })),
    ...groupChanges(removed, [], Math.max(0, MAX_UPDATES_PER_SOURCE - added.length)).map((g) => ({ text: g, removedText: true })),
  ].slice(0, MAX_UPDATES_PER_SOURCE);

  let filed = 0;
  for (const g of groups) {
    const c = classify(g.text);
    const mentioned = featuresMentioned(g.text, features);
    const feature = features.find((f) => f.featureKey === mentioned[0]) ?? null;
    const used = Boolean(feature && ["SUPPORTED", "PARTIALLY_SUPPORTED"].includes(feature.mairoSupport));
    const touchesProduction = c.versions.includes(production) && c.changeType === "API_VERSION_DEPRECATION";
    const removing = ["DEPRECATED_FEATURE", "REMOVED_FEATURE", "REMOVED_ENDPOINT", "REMOVED_FIELD", "RENAMED_FEATURE", "API_VERSION_DEPRECATION"].includes(c.changeType);
    const urgency = touchesProduction ? "HIGH" : used && removing ? (c.risk === "BREAKING" ? "CRITICAL" : "HIGH") : c.urgency;
    const dedupeKey = `src:${source.key}:${g.removedText ? "removed" : "added"}:${hashOf(g.text).slice(0, 40)}`;
    const exists = await db.platformUpdate.findUnique({ where: { dedupeKey }, select: { id: true } });
    if (exists) continue;
    const row = await db.platformUpdate.create({
      data: {
        platform: "META",
        sourceId: source.id,
        dedupeKey,
        title: `${g.removedText ? "Removed from docs: " : ""}${titleFor(g.text)}`.slice(0, 200),
        excerpt: g.text.slice(0, 6000),
        sourceUrl: source.url,
        changeType: c.changeType,
        areas: c.areas,
        urgency,
        risk: c.risk,
        compatibility: compatibilityFor({ changeType: c.changeType, status: "DETECTED", featureSupport: (feature?.mairoSupport as never) ?? null, used }),
        featureKey: feature?.featureKey ?? null,
        historyJson: JSON.stringify([{ at: now.toISOString(), by: "change-detector", to: "DETECTED", note: `${source.name} (${source.authority})` }]),
      },
    });
    filed++;
    if (urgency === "HIGH" || urgency === "CRITICAL") {
      await raiseAlert({ key: `update:${row.id}`, severity: urgency, title: `Meta update: ${row.title}`, body: `${source.name}: ${c.changeType.replace(/_/g, " ").toLowerCase()}${feature ? ` affecting ${feature.name}, which MAIRO ${used ? "uses" : "tracks"}` : ""}.`, href: `/aios/meta-intelligence/updates/${row.id}` });
    }
  }
  return { changed: true, updates: filed, baseline: false };
}

export async function checkSource(source: Source, opts: { fetcher?: typeof fetch; now?: Date } = {}): Promise<CheckResult> {
  // The authority always comes from the host, never from the stored row alone.
  if (authorityFor(source.url) === "UNVERIFIED") return { source: source.key, ok: false, changed: false, updates: 0, baseline: false, error: "Not an allowlisted source." };
  const got = await fetchSource(source.url, opts.fetcher);
  if (!got.ok) {
    await db.platformSource.update({ where: { id: source.id }, data: { lastCheckedAt: opts.now ?? new Date(), lastError: got.error } });
    return { source: source.key, ok: false, changed: false, updates: 0, baseline: false, error: got.error };
  }
  const r = await ingestText(source, got.html, opts.now);
  return { source: source.key, ok: true, ...r };
}

/** Checks active sources, oldest-checked first, within a time budget. */
export async function checkSources(opts: { budgetMs?: number; fetcher?: typeof fetch; now?: Date } = {}): Promise<CheckResult[]> {
  const started = Date.now();
  const sources = await db.platformSource.findMany({ where: { platform: "META", active: true }, orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } } });
  const out: CheckResult[] = [];
  for (const s of sources) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) break;
    out.push(await checkSource(s, opts));
  }
  return out;
}
