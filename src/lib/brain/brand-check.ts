// The brand check every ad's words go through before they're saved or
// launched, against the business's own rules:
//
//   - a word or claim the owner said never to use stops it (a problem);
//   - a discount, "free" or price that isn't one of the confirmed standing
//     offers or a current promotion is flagged — ads only promise what the
//     business really runs (a warning);
//   - a guarantee, "the best", "#1", "award-winning", "licensed"… that the
//     owner hasn't confirmed as true about them is flagged (a warning).
//
// Warnings don't block: the owner may know something MAIRO doesn't, and says
// so by adding it to their Business Brain. Pure, so the campaign builder can
// show it while they type and the server can enforce it at launch; pinned by
// scripts/check-brand.ts.

export type BrandRules = {
  /** Words and claims never to use — the owner's list. */
  avoid: string[];
  /** Confirmed standing offers. */
  offers: string[];
  /** Promotions running now. */
  promotions: string[];
  /** Confirmed things that make them different — what claims can rest on. */
  proof: string[];
};

export type BrandFinding = { level: "problem" | "warning"; text: string };

export const NO_RULES: BrandRules = { avoid: [], offers: [], promotions: [], proof: [] };

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A whole word or phrase, not part of another word ("free" isn't in "freedom"). */
function contains(text: string, phrase: string): boolean {
  const p = norm(phrase).trim();
  if (p.length < 2) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escape(p)}($|[^a-z0-9])`, "i");
  return re.test(norm(text));
}

const OFFER_PATTERNS: { re: RegExp; label: (m: string) => string }[] = [
  { re: /\b\d{1,3}\s?%\s?(off|discount)\b/gi, label: (m) => m },
  { re: /\b(half[- ]price|bogo|buy one,? get one|two for one|2 for 1)\b/gi, label: (m) => m },
  { re: /\bfree\s+[a-z]+(\s[a-z]+)?/gi, label: (m) => m.split(/\s+/).slice(0, 2).join(" ") },
  { re: /[$£€]\s?\d[\d,]*(\.\d{2})?/g, label: (m) => m },
];

const CLAIM_PATTERNS: RegExp[] = [
  /\bguarantee[ds]?\b/gi,
  /\b(the best|best in [a-z]+|number one|no\.\s?1)\b/gi,
  /(?<![\w#])#\s?1\b/g,
  /\b(cheapest|lowest prices?|unbeatable)\b/gi,
  /\b(award[- ]winning|certified|licensed|insured|accredited|5[- ]star|five[- ]star)\b/gi,
];

export function brandCheck(text: string, rules: BrandRules): BrandFinding[] {
  const out: BrandFinding[] = [];
  const seen = new Set<string>();
  const add = (f: BrandFinding) => {
    const k = f.text.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(f);
  };

  for (const a of rules.avoid) {
    const w = a.trim();
    if (w.length >= 3 && contains(text, w)) add({ level: "problem", text: `“${w}” is on your list of words to avoid.` });
  }

  const backing = [...rules.offers, ...rules.promotions].map(norm).join(" | ");
  for (const { re, label } of OFFER_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const said = label(m[0].trim());
      const core = norm(said).replace(/\s?(off|discount)$/, "").trim();
      if (!backing.includes(core)) add({ level: "warning", text: `“${said}” isn't one of your confirmed offers or current promotions. Ads should only promise one you really run — add it to your Business Brain if it's real.` });
    }
  }

  const proof = rules.proof.map(norm).join(" | ");
  for (const re of CLAIM_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const said = m[0].trim();
      if (!proof.includes(norm(said))) add({ level: "warning", text: `“${said}” is a claim you haven't confirmed about your business. Add it to what makes you different if it's true, or take it out.` });
    }
  }
  return out;
}

/** Whether these words may be saved or launched: nothing on the avoid list. */
export const brandAllows = (text: string, rules: BrandRules) => !brandCheck(text, rules).some((f) => f.level === "problem");
