import { createHash } from "node:crypto";
import type { Area, ChangeType, Risk, Urgency } from "@/lib/platform-intelligence/types";

// The Meta change detector's pure half: turn a page into comparable blocks,
// find what's new or gone since the last look, and say what kind of change
// each piece of text looks like. No network, no database, no AI — so every
// rule is pinned down by scripts/check-meta-intelligence.ts.
//
// The text is untrusted. It is only ever matched against, hashed and stored.

const MAX_TEXT = 400_000;
const MIN_BLOCK = 24;
const MAX_BLOCK = 1_200;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

/** HTML → plain text blocks (paragraph-ish), scripts, styles and chrome removed. */
export function normalize(html: string): string[] {
  const text = html
    .slice(0, MAX_TEXT * 4)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(p|div|section|article|li|ul|ol|h[1-6]|tr|table|br|hr|pre|blockquote|dd|dt)[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith("#") && /^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m))
    .slice(0, MAX_TEXT);
  return text
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length >= MIN_BLOCK)
    .map((b) => b.slice(0, MAX_BLOCK));
}

export function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** What appeared and what disappeared, block by block. */
export function diffBlocks(previous: string[], next: string[]): { added: string[]; removed: string[] } {
  const before = new Set(previous);
  const after = new Set(next);
  return { added: next.filter((b) => !before.has(b)), removed: previous.filter((b) => !after.has(b)) };
}

/** Groups adjacent changed blocks so one changelog entry is one update, not five. */
export function groupChanges(blocks: string[], all: string[], max = 12): string[] {
  const set = new Set(blocks);
  const groups: string[][] = [];
  let current: string[] = [];
  for (const b of all) {
    if (set.has(b)) current.push(b);
    else if (current.length) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  // Removed blocks aren't in `all` (the new page); keep them as their own groups.
  const covered = new Set(groups.flat());
  for (const b of blocks) if (!covered.has(b)) groups.push([b]);
  return groups.slice(0, max).map((g) => g.join("\n\n").slice(0, 3_000));
}

// --- What kind of change is it? ------------------------------------------------------

const RULES: { type: ChangeType; re: RegExp; areas: Area[] }[] = [
  { type: "API_VERSION_DEPRECATION", re: /\bv\d{1,2}\.0\b[^.]{0,120}\b(deprecat|will be (removed|retired)|no longer (be )?available|end of life|available until)/i, areas: ["api-version"] },
  { type: "API_VERSION_RELEASE", re: /\b(graph api|marketing api)\b[^.]{0,60}\bv\d{1,2}\.0\b|\bintroducing\b[^.]{0,40}\bv\d{1,2}\.0\b|\bv\d{1,2}\.0\b[^.]{0,40}\b(is )?now available\b/i, areas: ["api-version"] },
  { type: "INSTAGRAM_PUBLISHING", re: /instagram[^.]{0,80}\b(content publishing|content_publish|publish(ing)? api|media publish|reels publishing)\b/i, areas: ["publishing"] },
  { type: "PERMISSION_CHANGE", re: /\b(permission|scopes?|app review|advanced access|standard access|ads_management|ads_read|pages_manage_posts|business_management|instagram_content_publish)\b/i, areas: ["permissions"] },
  { type: "ADVANTAGE_PLUS_CHANGE", re: /advantage\s?\+|advantage plus|advantage_audience|advantage campaign budget/i, areas: ["optimization", "targeting"] },
  { type: "AI_CAPABILITY", re: /\b(generative ai|gen ?ai|ai[- ]generated|generate[sd]? (images?|videos?|text|backgrounds?)|image generation|video generation|text generation|machine learning|ai[- ]powered)\b/i, areas: ["ai", "creative"] },
  { type: "OBJECTIVE_CHANGE", re: /\b(campaign objective|objectives?|odax|outcome_(sales|leads|traffic|awareness|engagement|app_promotion))\b/i, areas: ["campaign-creation"] },
  { type: "OPTIMIZATION_CHANGE", re: /\b(optimization[_ ]goal|optimi[sz]ation|bid[_ ]strategy|billing[_ ]event|lowest_cost|cost cap|value optimization)\b/i, areas: ["optimization"] },
  { type: "PLACEMENT_CHANGE", re: /\b(placements?|publisher_platforms|facebook_positions|instagram_positions|audience network|threads ads?)\b/i, areas: ["placements"] },
  { type: "TARGETING_CHANGE", re: /\b(targeting|detailed targeting|interests?|lookalike|custom audiences?|geo_locations|age range|exclusions?)\b/i, areas: ["targeting"] },
  { type: "ATTRIBUTION_CHANGE", re: /\battribution\b/i, areas: ["measurement"] },
  { type: "MEASUREMENT_CHANGE", re: /\b(insights|metrics?|conversions? api|pixel|reporting|breakdowns?|action_type|measurement)\b/i, areas: ["measurement"] },
  { type: "CREATIVE_FORMAT_CHANGE", re: /\b(creative|ad format|carousel|collection ads?|aspect ratio|video ads?|image ads?|asset feed|dynamic creative|call_to_action|cta)\b/i, areas: ["creative"] },
  { type: "AUTOMATION_OPTION", re: /\b(automated rules?|automation|automatic(ally)? (adjust|optimi[sz]e|create))\b/i, areas: ["optimization"] },
  { type: "POLICY_CHANGE", re: /\b(advertising polic|ad polic|special ad categor|political ads?|policy update)\b/i, areas: ["knowledge"] },
];

const LIFECYCLE: { type: ChangeType; re: RegExp }[] = [
  { type: "DEPRECATED_FEATURE", re: /\b(deprecat\w*|sunset\w*|will be (removed|retired|discontinued)|no longer (be )?(supported|available)|end of support)\b/i },
  { type: "RENAMED_FEATURE", re: /\b(renamed|now called|has been replaced (by|with))\b/i },
  { type: "REMOVED_ENDPOINT", re: /\b(endpoint|edge)\b[^.]{0,60}\b(removed|deleted|no longer)\b/i },
  { type: "REMOVED_FIELD", re: /\b(field|parameter)\b[^.]{0,60}\b(removed|deleted|no longer returned|no longer accepted)\b/i },
  { type: "NEW_ENDPOINT", re: /\b(new|introduc\w*|added)\b[^.]{0,40}\b(endpoint|edge)\b/i },
  { type: "NEW_FIELD", re: /\b(new|introduc\w*|added)\b[^.]{0,40}\b(field|parameter)s?\b/i },
  { type: "NEW_FEATURE", re: /\b(introduc\w*|now available|launch\w*|new feature|rolling out|beta|available to all)\b/i },
  { type: "REMOVED_FEATURE", re: /\b(removed|discontinued)\b/i },
];

export type Classification = { changeType: ChangeType; areas: Area[]; urgency: Urgency; risk: Risk; versions: string[]; dates: string[] };

const SPECIFIC: ChangeType[] = ["API_VERSION_DEPRECATION", "API_VERSION_RELEASE"];

/**
 * The best guess from words alone. The AI interpretation refines it; when AI
 * isn't available this is the answer, and it errs toward "look at this".
 */
export function classify(text: string): Classification {
  const versions = [...new Set([...text.matchAll(/\bv(\d{1,2})\.0\b/gi)].map((m) => `v${m[1]}.0`))];
  const dates = extractDates(text);
  const topical = RULES.filter((r) => r.re.test(text));
  const lifecycle = LIFECYCLE.find((l) => l.re.test(text))?.type ?? null;
  const areas = [...new Set(topical.flatMap((r) => r.areas))];
  const specific = topical.find((r) => SPECIFIC.includes(r.type));
  // A lifecycle word (deprecated, renamed, new field…) is the more useful
  // label, unless the topic is an API version, which has its own pipeline.
  const changeType: ChangeType = specific?.type ?? lifecycle ?? topical[0]?.type ?? "OTHER";
  if (/campaign|ad set|adset/i.test(text) && (lifecycle === "DEPRECATED_FEATURE" || lifecycle === "REMOVED_FIELD" || lifecycle === "REMOVED_ENDPOINT")) areas.push("campaign-creation");
  if (/budget/i.test(text)) areas.push("budget");

  const removing = ["DEPRECATED_FEATURE", "REMOVED_FEATURE", "REMOVED_ENDPOINT", "REMOVED_FIELD", "RENAMED_FEATURE", "API_VERSION_DEPRECATION"].includes(changeType);
  const breakingWords = /\b(breaking change|will fail|will return an error|required|must (now )?(include|use|provide)|no longer accepted)\b/i.test(text);
  const risk: Risk = breakingWords ? "BREAKING" : removing ? "POTENTIALLY_BREAKING" : changeType === "OTHER" ? "UNKNOWN" : "NON_BREAKING";
  const urgency: Urgency = risk === "BREAKING" ? "HIGH" : removing ? "MEDIUM" : "LOW";
  return { changeType, areas: [...new Set(areas.length ? areas : ["knowledge" as Area])], urgency, risk, versions, dates };
}

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";

/** Dates written the way Meta writes them ("May 21, 2026", "2026-05-21"), as YYYY-MM-DD. */
export function extractDates(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b`, "gi"))) {
    const d = new Date(`${m[1]} ${m[2]}, ${m[3]} 12:00 UTC`);
    if (!Number.isNaN(d.getTime())) out.add(d.toISOString().slice(0, 10));
  }
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) out.add(`${m[1]}-${m[2]}-${m[3]}`);
  return [...out].sort();
}

/**
 * Version facts in an official versions/changelog text: for each version, a
 * release date and a retirement date when the text says so plainly
 * ("v19.0 … available until May 21, 2026").
 */
export function versionFacts(text: string): { version: string; releasedAt: string | null; retiresAt: string | null }[] {
  const facts = new Map<string, { version: string; releasedAt: string | null; retiresAt: string | null }>();
  for (const sentence of text.split(/(?<=[.!?\n])\s+/)) {
    const versions = [...new Set([...sentence.matchAll(/\bv(\d{1,2})\.0\b/gi)].map((m) => `v${m[1]}.0`))];
    if (versions.length !== 1) continue;
    const v = versions[0];
    const dates = extractDates(sentence);
    const f = facts.get(v) ?? { version: v, releasedAt: null, retiresAt: null };
    if (dates.length) {
      if (/\b(available until|deprecat\w*|retir\w*|expire\w*|end of life|no longer available)\b/i.test(sentence)) f.retiresAt = dates[dates.length - 1];
      else if (/\b(introduc\w*|releas\w*|launch\w*|available (on|from|since)|now available)\b/i.test(sentence)) f.releasedAt = dates[0];
    }
    facts.set(v, f);
  }
  return [...facts.values()].sort((a, b) => Number(b.version.slice(1, -2)) - Number(a.version.slice(1, -2)));
}

/** A short title for a changed block: its first sentence, trimmed. */
export function titleFor(text: string): string {
  const first = text.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? text;
  if (first.length <= 140) return first || "Change in Meta documentation";
  const cut = first.slice(0, 137);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : 137)}…`;
}
