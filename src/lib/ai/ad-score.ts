import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import { contextOf, hasOwnWords, runningCopy } from "@/lib/campaigns/plan";
import { ctaLabel, unsupportedNumbers, fitCta, ctaChoicesFor, HEADLINE_SHOWN, PRIMARY_TEXT_SHOWN } from "@/lib/campaigns/ad-copy";
import { isOwnUpload } from "@/lib/campaigns/media-rules";
import { hookOf, type AiCopyScores, type FixKind } from "@/lib/score/rules";
import type { FixResult, ImproveOption, OptionsResult, PlanEdit } from "@/lib/score/edits";

/** What MAIRO knows about the business, for writing. Only these facts may appear in a rewrite. */
export type BrandFacts = {
  brandVoice: string;
  offers: string[];
  usps: string[];
  painPoints?: string[];
  customerResults?: string[];
  objections?: string[];
  customerPraise?: string[];
  bestProducts?: string[];
  serviceArea?: string;
};

// The AI parts of the Pre-Launch Ad Score: reading the ad's words (and its
// picture, where there is one) for quality, and rewriting one element when
// the customer presses "Fix with AI".
//
// Every rewrite is held to the same rule as the rest of MAIRO's writing: only
// facts the business gave. A rewrite that brings in a number the facts don't
// contain is refused, not shown.

const judged = z.object({ score: z.number().min(0).max(100), reason: z.string() });

const scoreSchema = z.object({
  creative: judged.nullable().describe("The picture and words together; null if no picture was given"),
  hook: judged.describe("Would the first line make someone stop scrolling?"),
  headline: judged,
  primaryText: judged,
  offer: judged.describe("How strong and clear the offer is, from what's in the ad"),
  brand: judged.nullable().describe("Does it sound like the brand voice given? null if no voice was given"),
  offerVisible: z.boolean().describe("Is the business's offer clearly stated in the ad?"),
});

const SCORE_SYSTEM = [
  "You review a small business's Facebook/Instagram ad before it launches.",
  "Score each part 0–100 against what makes paid social ads work: a first line that stops the scroll, a specific benefit, a clear offer, a clear next step, and words that sound like the brand.",
  "Be honest and specific: 85+ only for genuinely strong work. Each reason is one short sentence the business owner can act on, in plain words — no jargon.",
  "Never judge whether the business's claims are true; judge only how the ad is written.",
].join("\n");

export function creativeImageUrl(plan: CampaignPlan, organizationId: string): string | null {
  const url =
    plan.adChoice === "images" ? plan.images?.[0]?.url
      : plan.adChoice === "video" ? plan.video?.posterUrl
        : plan.adChoice === "attached" ? plan.attachedPreview
          : null;
  if (!url || !/^https:\/\//.test(url)) return null;
  if (plan.adChoice === "attached") return url;
  return isOwnUpload(url, organizationId) ? url : null;
}

export async function scoreCopyWithAi(input: {
  plan: CampaignPlan;
  brandVoice: string;
  offers: string[];
  imageUrl: string | null;
}): Promise<AiCopyScores | null> {
  if (!process.env.ANTHROPIC_API_KEY?.trim() || !hasOwnWords(input.plan)) return null;
  const copy = runningCopy(input.plan)[0];
  if (!copy?.primaryText.trim()) return null;
  const p = input.plan;
  const text = [
    `Business: ${p.businessName}`,
    `What it offers: ${p.offering || "(not given)"}`,
    `Advertising: ${p.promotesDetail || "(not given)"}`,
    `Goal: ${p.goal ?? "(not chosen)"}`,
    input.offers.length ? `The business's current offers: ${input.offers.join("; ")}` : "The business hasn't given a specific offer.",
    input.brandVoice ? `Brand voice: ${input.brandVoice}` : "No brand voice given.",
    "",
    `Main text: ${copy.primaryText}`,
    `Headline: ${copy.headline}`,
    `Button: ${ctaLabel(copy.cta)}`,
  ].join("\n");
  const image = input.imageUrl ? new URL(input.imageUrl) : null;
  const { object } = await generateObject({
    model: agentModel,
    schema: scoreSchema,
    system: SCORE_SYSTEM,
    messages: [
      {
        role: "user",
        content: image
          ? [{ type: "text" as const, text: `${text}\n\nThe attached picture is the ad's creative.` }, { type: "image" as const, image }]
          : [{ type: "text" as const, text }],
      },
    ],
  });
  return {
    ...object,
    creative: image ? object.creative : null,
    brand: input.brandVoice ? object.brand : null,
  };
}

// --- Fix with AI --------------------------------------------------------------

const rewriteSchema = z.object({ text: z.string(), why: z.string() });

async function rewrite(input: {
  element: string;
  current: string;
  maxChars: number;
  instruction: string;
  facts: string;
}): Promise<{ text: string; why: string } | null> {
  const { object } = await generateObject({
    model: agentModel,
    schema: rewriteSchema,
    system: [
      "You improve one part of a small business's Facebook/Instagram ad.",
      "Use ONLY the facts given. Never invent prices, discounts, offers, deadlines, reviews, numbers or guarantees.",
      "No fake urgency, no ALL CAPS, at most one exclamation mark. Plain, warm, specific.",
      "Never imply you know personal things about the reader (health, money, religion, age…).",
    ].join("\n"),
    prompt: `Facts about the business:\n${input.facts}\n\nThe ad's ${input.element} is currently:\n"${input.current}"\n\n${input.instruction}\nKeep it under ${input.maxChars} characters. Give the new ${input.element} and, in one sentence, why it's better.`,
  });
  const text = object.text.trim().replace(/^"|"$/g, "").slice(0, input.maxChars);
  if (!text || unsupportedNumbers(text, `${input.facts} ${input.current}`).length) return null;
  return { text, why: object.why.trim() };
}

function factsOf(plan: CampaignPlan, brand: BrandFacts): string {
  const c = contextOf(plan);
  const list = (label: string, xs?: string[]) => (xs && xs.length ? `${label}: ${xs.slice(0, 4).join("; ")}` : "");
  return [
    `Business: ${plan.businessName}`,
    `What it offers: ${plan.offering || "(not given)"}`,
    `Advertising: ${plan.promotesDetail || "(the business as a whole)"}`,
    `Customers: ${plan.targetAudience || "(not given)"}`,
    `What makes it different: ${[plan.differentiator, ...brand.usps].filter(Boolean).join("; ") || "(not given)"}`,
    list("Problems it solves", brand.painPoints),
    list("Results customers get", brand.customerResults),
    list("What customers compliment", brand.customerPraise),
    list("What customers hesitate about", brand.objections),
    list("Best sellers", brand.bestProducts),
    brand.serviceArea ? `Where customers are: ${brand.serviceArea}` : "",
    // This campaign only — never a permanent claim about the business.
    c.promotion ? `This campaign's promotion: ${c.promotion}${c.promotionEnds ? ` (ends ${c.promotionEnds})` : ""}` : "",
    c.urgency ? `Reason to act now (this campaign): ${c.urgency}` : "",
    ...Object.entries(c.answers).filter(([, v]) => v && v !== "no").map(([k, v]) => `Owner said (${k.replace(/^[a-z]+-/, "")}): ${v}`),
    brand.offers.length ? `Standing offers: ${brand.offers.join("; ")}` : "No standing offer given.",
    brand.brandVoice ? `Brand voice: ${brand.brandVoice}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The offers this campaign may mention: its own promotion first, then standing ones. */
function campaignOffers(plan: CampaignPlan, brand: BrandFacts): string[] {
  const promo = contextOf(plan).promotion.trim();
  return promo ? [promo, ...brand.offers] : brand.offers;
}

/**
 * "Fix with AI" for one recommendation. Returns the edit to make and a
 * before/after to show; nothing is changed until the customer approves it.
 */
export async function fixElement(input: {
  plan: CampaignPlan;
  kind: FixKind;
  brand: BrandFacts;
}): Promise<FixResult> {
  const { plan, kind } = input;
  const index = plan.chosenCopy;
  const copy = plan.copyOptions[index];
  const facts = factsOf(plan, input.brand);
  const needsAi = kind === "headline" || kind === "primaryText" || kind === "hook" || kind === "offer" || kind === "variation";
  if (needsAi && !process.env.ANTHROPIC_API_KEY?.trim()) {
    return { ok: false, kind, error: "The AI isn't switched on for this site, so MAIRO can't rewrite the ad here. You can still edit it yourself in the Advertisement step." };
  }
  if ((kind === "headline" || kind === "primaryText" || kind === "hook" || kind === "offer" || kind === "cta") && !copy) {
    return { ok: false, kind, error: "This ad doesn't have words MAIRO can change — it runs an existing post or ad as it is." };
  }

  try {
    switch (kind) {
      case "headline": {
        const r = await rewrite({ element: "headline", current: copy.headline, maxChars: HEADLINE_SHOWN, instruction: "Make it specific and benefit-led, so it's clear what someone gets.", facts });
        if (!r) return { ok: false, kind, error: "MAIRO couldn't write a better headline from what it knows without inventing something. Try adding detail in Business Brain." };
        return { ok: true, kind, label: "Headline", before: copy.headline, after: r.text, explanation: r.why, edits: [{ op: "copy-field", index, field: "headline", value: r.text }] };
      }
      case "primaryText": {
        const r = await rewrite({ element: "main text", current: copy.primaryText, maxChars: 220, instruction: `Put the point first, in the first ${PRIMARY_TEXT_SHOWN} characters, then one sentence of support and a clear next step.`, facts });
        if (!r) return { ok: false, kind, error: "MAIRO couldn't improve the text without inventing something. Try adding detail in Business Brain." };
        return { ok: true, kind, label: "Main text", before: copy.primaryText, after: r.text, explanation: r.why, edits: [{ op: "copy-field", index, field: "primaryText", value: r.text }] };
      }
      case "hook": {
        const first = hookOf(copy.primaryText);
        const r = await rewrite({ element: "opening line", current: first, maxChars: 90, instruction: "Rewrite only this first line so it stops someone scrolling: lead with the reader's problem, a specific benefit, or a surprising true fact from the facts. Don't start with the business's name.", facts });
        if (!r) return { ok: false, kind, error: "MAIRO couldn't write a stronger opening without inventing something." };
        const rest = copy.primaryText.trim().slice(first.length).trim();
        const next = `${r.text}${rest ? ` ${rest}` : ""}`.slice(0, 500);
        return { ok: true, kind, label: "Opening line", before: first, after: r.text, explanation: r.why, edits: [{ op: "copy-field", index, field: "primaryText", value: next }] };
      }
      case "offer": {
        const offers = campaignOffers(plan, input.brand);
        if (offers.length === 0) {
          // MAIRO won't put an offer in an ad the business hasn't confirmed.
          const { object } = await generateObject({
            model: agentModel,
            schema: z.object({ ideas: z.array(z.string()).min(2).max(4) }),
            system: "Suggest simple, common offers a small business could choose to run. They are ideas for the owner to consider, not claims.",
            prompt: `Business facts:\n${facts}\n\nSuggest 3 offers that suit this business (e.g. free delivery on a first order, a free consultation, a bundle). One short line each.`,
          });
          return {
            ok: false,
            kind,
            error: "MAIRO won't put an offer in your ad that you haven't confirmed is real. If one of these suits you, tell MAIRO in the offer questions on this page and it will work it into the ad.",
            suggestions: object.ideas,
          };
        }
        const r = await rewrite({ element: "main text", current: copy.primaryText, maxChars: 220, instruction: `Work this offer into the text clearly, near the start: ${offers[0]}. Keep the rest of the meaning.`, facts });
        if (!r) return { ok: false, kind, error: "MAIRO couldn't work the offer in without changing its details." };
        return { ok: true, kind, label: "Main text (offer made clear)", before: copy.primaryText, after: r.text, explanation: r.why, edits: [{ op: "copy-field", index, field: "primaryText", value: r.text }] };
      }
      case "cta": {
        const best = fitCta(copy.cta, plan.destinationType) === copy.cta ? ctaChoicesFor(plan.destinationType)[0].value : fitCta(copy.cta, plan.destinationType);
        return { ok: true, kind, label: "Button", before: ctaLabel(copy.cta), after: ctaLabel(best), explanation: "This button matches where people actually go after tapping.", edits: [{ op: "copy-field", index, field: "cta", value: best }] };
      }
      case "variation": {
        const { writeAdCopyOptions } = await import("@/lib/ai/ad-copy");
        const versions = await writeAdCopyOptions({
          businessName: plan.businessName,
          offering: plan.offering,
          targetAudience: plan.targetAudience,
          differentiator: [plan.differentiator, input.brand.brandVoice ? `Brand voice: ${input.brand.brandVoice}` : ""].filter(Boolean).join(". "),
          advertising: `${plan.promotesDetail}. Write angles different from: ${plan.copyOptions.map((o) => o.angle).join(", ")}`,
          goal: plan.goal ?? "Get results",
          destination: plan.destinationType,
          website: plan.website,
        });
        const fresh = versions.find((v) => !plan.copyOptions.some((o) => o.primaryText === v.primaryText));
        if (!fresh) return { ok: false, kind, error: "MAIRO couldn't write a version different enough from the ones you have." };
        return { ok: true, kind, label: "New ad version", before: null, after: `${fresh.headline} — ${fresh.primaryText}`, explanation: `A new angle (${fresh.angle}) to test against your current version.`, edits: [{ op: "add-copy", option: fresh }] };
      }
      case "audience": {
        if (plan.audienceMode === "manual" && plan.geoKey) {
          const radius = Math.min(50, plan.geoRadius + 10);
          const ages = plan.ageMax - plan.ageMin < 20 && !plan.specialAdCategory ? { ageMin: Math.max(18, plan.ageMin - 5), ageMax: Math.min(65, plan.ageMax + 5) } : {};
          return {
            ok: true,
            kind,
            label: "Audience",
            before: `${plan.geoRadius} miles around ${plan.geoLabel ?? "your area"}, ages ${plan.ageMin}–${plan.ageMax}`,
            after: `${radius} miles, ages ${ages.ageMin ?? plan.ageMin}–${ages.ageMax ?? plan.ageMax}`,
            explanation: "A slightly wider audience gives Meta enough people to find the ones who respond, which usually lowers the cost of each result.",
            edits: [{ op: "set", patch: { geoRadius: radius, ...ages } }],
          };
        }
        return { ok: false, kind, error: "Add your town in the Audience step — MAIRO can't guess where your customers are." };
      }
      case "placements":
        return { ok: true, kind, label: "Placements", before: `${plan.placements.length} chosen by you`, after: "Meta chooses (Advantage+ placements)", explanation: "Meta shows the ad wherever it's getting the best results for the money.", edits: [{ op: "set", patch: { choosingPlacements: false, placements: [] } }] };
      case "budget": {
        const target = plan.goal === "SALES" ? 20 : 10;
        if (plan.budgetType !== "DAILY") return { ok: false, kind, error: "This campaign has a total budget — change it in the Budget step." };
        return { ok: true, kind, label: "Daily budget", before: `$${plan.dailyAmount}/day`, after: `$${Math.max(target, plan.dailyAmount)}/day`, explanation: `About $${target} a day gives Meta enough results each week to learn who responds. This is a recommendation, not a promise of results.`, edits: [{ op: "set", patch: { dailyAmount: Math.max(target, plan.dailyAmount) } }] };
      }
      case "landing":
        return { ok: false, kind, error: "Your website isn't something MAIRO can change. The Business Analyzer can check it and tell you exactly what to fix." };
    }
  } catch (error) {
    console.error("Fix with AI failed:", error);
    return { ok: false, kind, error: "MAIRO couldn't make that fix just now. Try again in a moment." };
  }
}

// --- Improve With MAIRO: three alternatives ----------------------------------------

const optionsSchema = z.object({
  options: z.array(z.object({ text: z.string(), why: z.string() })).min(2).max(4),
  recommended: z.number().int().min(0).max(3).describe("Index of the option you'd pick for this business and goal"),
});

const OPTION_SPEC: Partial<Record<FixKind, { element: string; label: string; max: number; instruction: string }>> = {
  hook: { element: "opening line", label: "Opening line", max: 90, instruction: "Write opening lines that stop someone scrolling: lead with the customer's problem, the result they get, or a specific true fact. Don't start with the business's name. Make each one a genuinely different angle." },
  headline: { element: "headline", label: "Headline", max: HEADLINE_SHOWN, instruction: "Write specific, benefit-led headlines so it's clear what someone gets. Each a different angle." },
  primaryText: { element: "main text", label: "Main text", max: 220, instruction: `Put the point first, in the first ${PRIMARY_TEXT_SHOWN} characters, then one sentence of support and a clear next step. Each a different angle.` },
  offer: { element: "main text", label: "Main text (offer made clear)", max: 220, instruction: "Work the offer into the text clearly, near the start, keeping the rest of the meaning. Each a different way of saying it." },
};

/**
 * Three alternatives for one part of the ad, written only from facts the
 * business gave, one marked recommended. Nothing changes until the customer
 * picks one; an option that brings in a number the facts don't contain is
 * dropped rather than shown.
 */
export async function improveOptions(input: { plan: CampaignPlan; kind: FixKind; brand: BrandFacts }): Promise<OptionsResult> {
  const { plan, kind } = input;
  const spec = OPTION_SPEC[kind];
  if (!spec) return { ok: false, kind, error: "MAIRO doesn't write alternatives for this — use the fix shown instead." };
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return { ok: false, kind, error: "The AI isn't switched on for this site, so MAIRO can't write alternatives here. You can still edit the ad yourself in the Advertisement step." };
  }
  const index = plan.chosenCopy;
  const copy = plan.copyOptions[index];
  if (!copy || !hasOwnWords(plan)) return { ok: false, kind, error: "This ad doesn't have words MAIRO can change — it runs an existing post or ad as it is." };
  const offers = campaignOffers(plan, input.brand);
  if (kind === "offer" && offers.length === 0) {
    return { ok: false, kind, error: "MAIRO won't put an offer in your ad that you haven't confirmed is real. Answer the offer questions on this page first — it never has to be a discount." };
  }
  const facts = factsOf(plan, input.brand);
  const first = hookOf(copy.primaryText);
  const current = kind === "hook" ? first : kind === "headline" ? copy.headline : copy.primaryText;
  try {
    const { object } = await generateObject({
      model: agentModel,
      schema: optionsSchema,
      system: [
        "You improve one part of a small business's Facebook/Instagram ad and offer three alternatives.",
        "Use ONLY the facts given. Never invent prices, discounts, offers, deadlines, reviews, numbers or guarantees.",
        "Write for this specific business — never generic lines that would fit any company.",
        "No fake urgency, no ALL CAPS, at most one exclamation mark. Plain, warm, specific.",
        "Never imply you know personal things about the reader (health, money, religion, age…).",
      ].join("\n"),
      prompt: `Facts about the business:\n${facts}\n\nGoal of the campaign: ${plan.goal ?? "(not chosen)"}\n\nThe ad's ${spec.element} is currently:\n"${current}"\n\n${spec.instruction}${kind === "offer" ? ` The offer: ${offers[0]}.` : ""}\nEach under ${spec.max} characters. Give three, each with one sentence on why it's stronger, and say which you'd recommend.`,
    });
    const rest = copy.primaryText.trim().slice(first.length).trim();
    const options: ImproveOption[] = [];
    object.options.forEach((o, i) => {
      const text = o.text.trim().replace(/^"|"$/g, "").slice(0, spec.max);
      if (!text || unsupportedNumbers(text, `${facts} ${current}`).length) return;
      const edits: PlanEdit[] =
        kind === "hook"
          ? [{ op: "copy-field", index, field: "primaryText", value: `${text}${rest ? ` ${rest}` : ""}`.slice(0, 500) }]
          : [{ op: "copy-field", index, field: kind === "headline" ? "headline" : "primaryText", value: text }];
      options.push({ text, why: o.why.trim(), edits, recommended: i === object.recommended });
    });
    if (options.length === 0) return { ok: false, kind, error: "MAIRO couldn't write alternatives from what it knows without inventing something. Answering the questions on this page gives it more to work with." };
    if (!options.some((o) => o.recommended)) options[0].recommended = true;
    return { ok: true, kind, label: spec.label, before: current, options: options.slice(0, 3) };
  } catch (error) {
    console.error("Improve With MAIRO failed:", error);
    return { ok: false, kind, error: "MAIRO couldn't write alternatives just now. Try again in a moment." };
  }
}
