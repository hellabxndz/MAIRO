// Tagged links for ads: utm_* values that let analytics tell which ad sent a
// visitor. Pure, so the public builder and the campaign setup produce the same
// link.
//
// Meta fills its own dynamic values ({{campaign.name}} and friends) when the
// ad runs. Those must reach Meta unencoded, so they're kept as written and
// everything else is encoded.

export const META_DYNAMIC = [
  { value: "{{campaign.name}}", label: "Campaign name" },
  { value: "{{adset.name}}", label: "Ad set name" },
  { value: "{{ad.name}}", label: "Ad name" },
  { value: "{{campaign.id}}", label: "Campaign ID" },
  { value: "{{adset.id}}", label: "Ad set ID" },
  { value: "{{ad.id}}", label: "Ad ID" },
  { value: "{{placement}}", label: "Placement" },
  { value: "{{site_source_name}}", label: "Site source (fb, ig, an, msg)" },
] as const;

export type UtmInput = {
  url: string;
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
};

export type UtmResult =
  | { ok: true; url: string; parameters: string; replaced: string[] }
  | { ok: false; problems: { field: string; message: string }[] };

const DYNAMIC = /^\{\{[a-z_.]+\}\}$/;

function encodeValue(v: string): string {
  // Dynamic values stay literal so Meta can fill them; anything else is encoded,
  // spaces as + would be read inconsistently, so they become %20.
  return v
    .split(/(\{\{[a-z_.]+\}\})/)
    .map((part) => (DYNAMIC.test(part) ? part : encodeURIComponent(part)))
    .join("");
}

export function buildUtm(input: UtmInput): UtmResult {
  const problems: { field: string; message: string }[] = [];
  let url: URL | null = null;
  const raw = input.url.trim();
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    if (!url.hostname.includes(".")) throw new Error();
  } catch {
    problems.push({ field: "url", message: "Enter the full web address the ad sends people to, like yourbusiness.com/offer." });
  }
  const fields: [keyof UtmInput, string, boolean][] = [
    ["source", "utm_source", true],
    ["medium", "utm_medium", true],
    ["campaign", "utm_campaign", true],
    ["content", "utm_content", false],
    ["term", "utm_term", false],
  ];
  const pairs: [string, string][] = [];
  for (const [key, name, required] of fields) {
    const v = (input[key] ?? "").trim();
    if (!v) {
      if (required) problems.push({ field: key, message: `Enter a ${name.replace("utm_", "")} value.` });
      continue;
    }
    if (v.length > 120) problems.push({ field: key, message: `Keep ${name} under 120 characters.` });
    pairs.push([name, v]);
  }
  if (problems.length || !url) return { ok: false, problems };

  // A utm_* already on the address is replaced, not duplicated.
  const replaced: string[] = [];
  for (const [name] of pairs) {
    if (url.searchParams.has(name)) {
      replaced.push(name);
      url.searchParams.delete(name);
    }
  }
  const parameters = pairs.map(([k, v]) => `${k}=${encodeValue(v)}`).join("&");
  const base = url.toString();
  const hash = url.hash;
  const withoutHash = hash ? base.slice(0, -hash.length) : base;
  const joiner = withoutHash.includes("?") ? (withoutHash.endsWith("?") || withoutHash.endsWith("&") ? "" : "&") : "?";
  return { ok: true, url: `${withoutHash}${joiner}${parameters}${hash}`, parameters, replaced };
}

/** Lowercase, hyphens for spaces — consistent values group together in analytics. */
export function tidyValue(v: string): string {
  if (DYNAMIC.test(v.trim())) return v.trim();
  return v.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_.{}]/g, "");
}
