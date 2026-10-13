// Reads a headline, the line under it and the button, and reports what a
// stranger arriving from an ad would still have to guess.
//
// A rubric of observable things — the words on the page — not a prediction.
// Every finding quotes the text it's about, and anything that can't be judged
// from the text alone is "Not checked" rather than guessed. Suggestions are
// built only from what the owner tells MAIRO about the business.

export type ClarityInput = {
  headline: string;
  subheadline?: string;
  cta?: string;
  /** Context the owner gives, used to check and to suggest — never invented. */
  offering?: string;
  customer?: string;
  location?: string;
  outcome?: string;
  priceOrFirstStep?: string;
  kind?: "service" | "shop";
};

export type ClarityStatus = "met" | "not met" | "not checked";
export type ClarityCheck = {
  id: string;
  question: string;
  status: ClarityStatus;
  evidence: string | null;
  why: string;
  fix: string | null;
};

const BUZZ = /\b(solutions?|innovative|world[- ]class|cutting[- ]edge|best[- ]in[- ]class|synerg\w*|leverag\w*|seamless(ly)?|next[- ]level|game[- ]chang\w*|one[- ]stop[- ]shop|premier|bespoke solutions?|empower\w*|elevate)\b/gi;
const SUPERLATIVE = /\b(the best|#1|number one|top[- ]rated|leading|unbeatable|award[- ]winning)\b/gi;
const RISKY = /\b(guarantee[sd]?|100%|risk[- ]free|instant(ly)?|miracle|cure[sd]?)\b/gi;
const URGENCY = /\b(limited time|ends soon|today only|last chance|hurry|while stocks last|act now)\b/gi;
const GENERIC_CTA = /^(submit|send|click here|go|learn more|more|continue|ok|enter|here)$/i;
const PRICE = /([$£€]\s?\d|\d+\s?(dollars|usd|gbp|eur)|\bfree\b|\bfrom\s+[$£€]?\d|\bper (hour|month|visit|session)\b|\bquote\b)/i;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const quote = (s: string, re: RegExp) => [...new Set((s.match(re) ?? []).map((m) => m.toLowerCase()))];
const overlap = (text: string, phrase: string) => {
  const key = words(phrase.toLowerCase()).filter((w) => w.length > 3);
  const t = text.toLowerCase();
  return key.length > 0 && key.some((w) => t.includes(w.replace(/s$/, "")));
};

export type ClarityReport = {
  checks: ClarityCheck[];
  met: number;
  judged: number;
  /** Questions a stranger would still have, from the checks not met. */
  questions: string[];
  suggestions: { headline: string[]; cta: string[] };
};

export function checkOfferClarity(i: ClarityInput): ClarityReport {
  const headline = i.headline.trim();
  const sub = (i.subheadline ?? "").trim();
  const cta = (i.cta ?? "").trim();
  const all = [headline, sub, cta].filter(Boolean).join(" · ");
  const checks: ClarityCheck[] = [];
  const push = (c: ClarityCheck) => checks.push(c);
  const hw = words(headline).length;

  push({
    id: "length",
    question: "Can the headline be read at a glance?",
    status: !headline ? "not met" : hw <= 12 && hw >= 3 ? "met" : "not met",
    evidence: headline ? `${hw} words: "${headline}"` : null,
    why: "People arriving from an ad decide in a few seconds whether they're in the right place.",
    fix: !headline ? "Add a headline that says what you offer." : hw > 12 ? "Cut it to 12 words or fewer; move detail to the line underneath." : hw < 3 ? "Say a little more: what it is and who it's for." : null,
  });

  if (i.offering?.trim()) {
    const ok = overlap(`${headline} ${sub}`, i.offering);
    push({
      id: "what",
      question: "Does it say what you sell?",
      status: ok ? "met" : "not met",
      evidence: ok ? `Mentions "${i.offering}"` : `"${i.offering}" doesn't appear in the headline or the line under it.`,
      why: "A visitor who can't tell what you sell leaves, however good the design.",
      fix: ok ? null : `Name it plainly — "${i.offering}" — in the headline or the line under it.`,
    });
  } else {
    push({ id: "what", question: "Does it say what you sell?", status: "not checked", evidence: null, why: "Tell MAIRO what you sell to check this.", fix: null });
  }

  if (i.customer?.trim()) {
    const ok = overlap(all, i.customer);
    push({
      id: "who",
      question: "Is it clear who it's for?",
      status: ok ? "met" : "not met",
      evidence: ok ? `Mentions "${i.customer}"` : "The text doesn't name who it's for.",
      why: "The right people stop when they see themselves; everyone else scrolls on, which saves your budget.",
      fix: ok ? null : `Say who it's for: "for ${i.customer}".`,
    });
  } else {
    push({ id: "who", question: "Is it clear who it's for?", status: "not checked", evidence: null, why: "Tell MAIRO who your customers are to check this.", fix: null });
  }

  if (i.location?.trim()) {
    const ok = overlap(all, i.location);
    push({
      id: "where",
      question: "Does it say where you work?",
      status: ok ? "met" : "not met",
      evidence: ok ? `Mentions "${i.location}"` : `"${i.location}" isn't mentioned.`,
      why: "For a local service, \"near me\" is often the deciding question.",
      fix: ok ? null : `Add your area: "in ${i.location}".`,
    });
  }

  const priced = PRICE.test(all);
  push({
    id: "cost",
    question: "Can a visitor tell what it costs, or what the first step costs?",
    status: priced ? "met" : "not met",
    evidence: priced ? `Found: "${all.match(PRICE)?.[0]}"` : "No price, \"from\" price, free quote or free first step mentioned.",
    why: "Not knowing the cost stops people enquiring. A starting price or a free first step answers it.",
    fix: priced ? null : i.priceOrFirstStep?.trim() ? `Say it: "${i.priceOrFirstStep.trim()}".` : "Add a starting price (\"From $…\") or a free first step (\"Free quote\") — only if it's true.",
  });

  const ctaGeneric = cta ? GENERIC_CTA.test(cta) : false;
  push({
    id: "cta",
    question: "Does the button say what happens next?",
    status: !cta ? "not met" : ctaGeneric ? "not met" : "met",
    evidence: cta ? `Button: "${cta}"` : "No button text given.",
    why: "A specific button (\"Book a visit\") tells people what they're agreeing to; \"Submit\" doesn't.",
    fix: !cta || ctaGeneric ? (i.kind === "shop" ? "Use \"Shop now\" or \"Buy\" with what they're buying." : "Use what happens next: \"Get a quote\", \"Book a visit\", \"Call now\".") : null,
  });

  const buzz = quote(all, BUZZ);
  push({
    id: "plain",
    question: "Is it in plain words?",
    status: buzz.length ? "not met" : "met",
    evidence: buzz.length ? `Vague words: ${buzz.map((b) => `"${b}"`).join(", ")}` : null,
    why: "Words like \"solutions\" could describe anything; concrete words say what you actually do.",
    fix: buzz.length ? "Replace each with the specific thing you do." : null,
  });

  const sup = quote(all, SUPERLATIVE);
  const risky = quote(all, RISKY);
  push({
    id: "claims",
    question: "Are the claims ones you can prove?",
    status: sup.length || risky.length ? "not met" : "met",
    evidence: sup.length || risky.length ? `Claims to check: ${[...sup, ...risky].map((b) => `"${b}"`).join(", ")}` : null,
    why: "Unprovable claims cost trust, and Meta can ask for proof of them.",
    fix: sup.length || risky.length ? "Keep them only if you can show proof; otherwise say what's specifically true (years in business, a policy you really offer)." : null,
  });

  const urgent = quote(all, URGENCY);
  const dated = /\b(\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}|\d{1,2}\/\d{1,2})/i.test(all);
  if (urgent.length) {
    push({
      id: "urgency",
      question: "Is any urgency real and dated?",
      status: dated ? "met" : "not met",
      evidence: `Urgency: ${urgent.map((b) => `"${b}"`).join(", ")}${dated ? " with a date" : " with no date"}`,
      why: "Deadlines work only when they're real; an undated \"limited time\" reads as a trick.",
      fix: dated ? null : "Give the real end date, or remove it.",
    });
  }

  push({
    id: "trust",
    question: "Is there a reason to trust you?",
    status: "not checked",
    evidence: null,
    why: "Reviews, years in business, licences or money-back terms you really offer usually sit elsewhere on the page — check your page with the landing page audit.",
    fix: null,
  });

  const judged = checks.filter((c) => c.status !== "not checked");
  const failed = checks.filter((c) => c.status === "not met");
  const QUESTION: Record<string, string> = {
    length: "What is this, in one line?",
    what: "What do they actually sell?",
    who: "Is this for someone like me?",
    where: "Do they work in my area?",
    cost: "What will this cost me?",
    cta: "What happens if I click?",
    plain: "What does that actually mean?",
    claims: "Can they back that up?",
    urgency: "Is that deadline real?",
  };

  const lead = i.outcome?.trim() || i.offering?.trim() || "";
  const forWho = i.customer?.trim() ? ` for ${i.customer.trim()}` : "";
  const where = i.location?.trim() ? ` in ${i.location.trim()}` : "";
  const headlines = lead
    ? [
        `${capFirst(lead)}${forWho}${where}`,
        ...(i.offering?.trim() && i.outcome?.trim() ? [`${capFirst(i.offering.trim())}${where} — ${i.outcome.trim()}`] : []),
        ...(i.priceOrFirstStep?.trim() ? [`${capFirst(i.offering?.trim() || lead)}${where}. ${capFirst(i.priceOrFirstStep.trim())}.`] : []),
      ]
    : [];
  // "Free" only when the owner said the first step is free.
  const free = /\bfree\b/i.test(i.priceOrFirstStep ?? "");
  const ctas = i.kind === "shop" ? ["Shop now", `Buy ${i.offering?.trim() || "now"}`] : [free ? "Get a free quote" : "Get a quote", "Book a visit", "Call now"];

  return {
    checks,
    met: judged.filter((c) => c.status === "met").length,
    judged: judged.length,
    questions: failed.map((c) => QUESTION[c.id]).filter(Boolean),
    suggestions: { headline: [...new Set(headlines)].slice(0, 3), cta: ctas },
  };
}

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
