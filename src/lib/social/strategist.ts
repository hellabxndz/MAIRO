import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";
import { brainBrief, type BrainProfile } from "@/lib/business/brain";
import type { MediaItem } from "@/lib/instagram/library";
import { CAPTION_MAX } from "@/lib/instagram/constants";
import { FACEBOOK_TEXT_MAX, type MediaType, type Network } from "@/lib/instagram/social-logic";
import {
  GOAL_KEYS,
  businessCategory,
  contentMix,
  goalInfo,
  promotionLabel,
  recommendGoal,
  type ContentIdea,
  type GoalKey,
  type PromotionDetails,
  type PromotionKind,
} from "./goals";

// The AI marketing strategist behind Social Manager. It works from what
// MAIRO knows about the business (the Business Brain), the goal the business
// chose, anything happening at the business (a sale, a launch), and what has
// worked on their own feed — and it writes every post for a reason.
//
// Without an AI key, a rule-based strategy from goals.ts is used and posts
// are written from the business's own facts, so Social Manager still plans
// goal-based content; the captions are plainer.

const FORMATS = ["IMAGE", "CAROUSEL", "REEL"] as const;

export const strategySchema = z.object({
  summary: z.string().min(20).max(900),
  audience: z.string().max(400),
  pillars: z.array(z.object({ name: z.string().max(60), purpose: z.string().max(240), share: z.number().min(0).max(100) })).min(2).max(5),
  contentTypes: z
    .array(z.object({ type: z.string().max(60), purpose: z.string().max(240), promotional: z.boolean(), format: z.enum(FORMATS).nullable() }))
    .min(3)
    .max(8),
  ctas: z.array(z.string().max(120)).min(1).max(4),
  bestTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(3),
  avoid: z.array(z.string().max(200)).max(5),
});
export type Strategy = z.infer<typeof strategySchema> & { goal: GoalKey; category: string };

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function categoryText(p: BrainProfile): string {
  return [p.industry, p.categories.join(" "), p.overview, p.businessName, p.products.map((x) => x.name).join(" ")].join(" ");
}

/** The goal to plan for: "Let MAIRO recommend" becomes a concrete one. */
export function resolveGoal(goal: GoalKey, profile: BrainProfile): Exclude<GoalKey, "RECOMMEND"> {
  if (goal !== "RECOMMEND") return goal;
  return recommendGoal(businessCategory(categoryText(profile)), profile.products.some((p) => Boolean(p.price)));
}

const DEFAULT_CTAS: Partial<Record<GoalKey, string[]>> = {
  INCREASE_SALES: ["Shop now — link in bio", "Order today"],
  GENERATE_LEADS: ["Message us for a free estimate", "DM us to get started"],
  GET_BOOKINGS: ["Book your spot — link in bio", "Message us to book"],
  WEBSITE_TRAFFIC: ["Read more on our website — link in bio"],
  GROW_FOLLOWERS: ["Follow for more", "Save this for later"],
  BRAND_AWARENESS: ["Follow along", "Share with a friend who'd love this"],
  REPEAT_CUSTOMERS: ["See you again soon", "Tag a friend who should come with you"],
  PROMOTE_EVENT: ["Save the date", "RSVP — link in bio"],
};

function ruleStrategy(goal: Exclude<GoalKey, "RECOMMEND">, profile: BrainProfile): Strategy {
  const category = businessCategory(categoryText(profile));
  const mix = contentMix(goal, category);
  const g = goalInfo(goal);
  const promoShare = Math.round((mix.filter((m) => m.promotional).length / mix.length) * 100);
  return {
    goal,
    category,
    summary: `Your goal is to ${g.label.toLowerCase()}. MAIRO will post a mix built for ${category === "general" ? "your kind of business" : `a ${category.replace("_", " & ")} business`}: ${mix
      .slice(0, 4)
      .map((m) => m.type.toLowerCase())
      .join(", ")}. Most posts build trust and interest; a smaller share ask for the ${g.objective.toLowerCase()} directly, so your feed never reads like a stream of ads.`,
    audience: profile.targetCustomer || "People most likely to buy from you, based on your Business Brain.",
    pillars: [
      { name: "Trust", purpose: "Show proof, results and the people behind the business", share: 40 },
      { name: "Interest", purpose: "Show the product or service and why it matters", share: 100 - 40 - Math.min(40, promoShare) },
      { name: "Action", purpose: `Ask for the ${g.objective.toLowerCase()} with a clear call to action`, share: Math.min(40, promoShare) },
    ],
    contentTypes: mix.map((m) => ({ type: m.type, purpose: m.purpose, promotional: Boolean(m.promotional), format: m.format ?? null })),
    ctas: profile.primaryCta ? [profile.primaryCta, ...(DEFAULT_CTAS[goal] ?? [])].slice(0, 3) : DEFAULT_CTAS[goal] ?? ["Learn more — link in bio"],
    bestTimes: ["11:00", "18:00"],
    avoid: ["Posting the same offer two days running", "Claims the business hasn't made"],
  };
}

const STRATEGY_SYSTEM = `You are MAIRO, an AI social media marketing strategist for small businesses. You build an organic Instagram and Facebook content strategy around ONE business goal.

Rules:
- Tailor it to this specific business and category. A clothing shop's sales strategy is different from a restaurant's, a dentist's, a real estate agent's or a contractor's.
- Use only facts given about the business. Never invent products, prices, awards, reviews or customers.
- Every content type must serve the goal. Mix trust-building and useful content with promotional posts; promotional content should be a minority (at most about 40% of posts).
- Sales goals favour product demonstrations, benefits, testimonials and social proof, education, lifestyle, offers, urgency, new arrivals, before/after and strong purchase CTAs — pick what fits this business.
- Lead goals favour education, customer problems, case studies, before/after, testimonials, free estimates or consultations, FAQs and DM/contact CTAs.
- Content type names are short (2–4 words). Formats: IMAGE (single photo), CAROUSEL (several photos), REEL (short video).
- bestTimes are local times like "11:00" when this kind of audience is likely online.
- Write in plain, warm English the business owner understands.`;

export async function buildStrategy(input: {
  profile: BrainProfile;
  goal: GoalKey;
  goalDetail: string;
  learnings: string[];
  promotion?: { kind: PromotionKind; details: PromotionDetails } | null;
  /** The Strategy Engine's direction for the whole business, when a mission set it. */
  direction?: string | null;
}): Promise<{ strategy: Strategy; ai: boolean }> {
  const goal = resolveGoal(input.goal, input.profile);
  const fallback = ruleStrategy(goal, input.profile);
  if (!aiAvailable()) return { strategy: fallback, ai: false };
  try {
    const { object } = await generateObject({
      model: agentModel,
      schema: strategySchema,
      system: STRATEGY_SYSTEM,
      abortSignal: AbortSignal.timeout(40_000),
      prompt: [
        brainBrief(input.profile),
        `Industry: ${input.profile.industry || "not known"}. Brand style: ${input.profile.brandStyle || "not known"}. Website: ${input.profile.website || "not known"}.`,
        `\nThe business's goal: ${goalInfo(goal).label}${input.goal === "RECOMMEND" ? " (MAIRO recommended this from what the business sells)" : ""}.`,
        input.goalDetail ? `In their words: "${input.goalDetail.slice(0, 600)}"` : "",
        input.promotion ? `\nWhat's happening: ${promotionLabel(input.promotion.kind)} — ${JSON.stringify(input.promotion.details).slice(0, 800)}` : "",
        input.direction ? `\nMAIRO's strategy for the whole business (keep social consistent with it — same goal, message and call to action, in social form):\n${input.direction}` : "",
        input.learnings.length ? `\nWhat MAIRO has learned from their own posts:\n- ${input.learnings.join("\n- ")}` : "",
        `\nA starting playbook for this goal and category (adapt it, don't copy blindly): ${fallback.contentTypes.map((c) => c.type).join(", ")}.`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    return { strategy: { ...object, goal, category: fallback.category }, ai: true };
  } catch (error) {
    console.error("Social strategy AI failed:", error);
    return { strategy: fallback, ai: false };
  }
}

export function strategyMix(strategy: Strategy): ContentIdea[] {
  return strategy.contentTypes.map((c) => ({ type: c.type, purpose: c.purpose, promotional: c.promotional, format: c.format ?? undefined }));
}

// --- Writing the posts -------------------------------------------------------

export type PostSlot = {
  date: string;
  time: string;
  platform: Network;
  contentType: string;
  purpose: string;
  promotional: boolean;
  format?: MediaType;
  step?: string;
  promotion?: { id: string; kind: PromotionKind; title: string; details: PromotionDetails } | null;
};

export type WrittenPost = {
  caption: string;
  cta: string;
  format: MediaType;
  mediaRefs: string[];
  creativeIdea: string | null;
  why: string;
};

const writtenSchema = z.object({
  posts: z.array(
    z.object({
      caption: z.string().min(10).max(CAPTION_MAX),
      cta: z.string().max(160),
      format: z.enum(FORMATS),
      mediaRefs: z.array(z.string().max(80)).max(10),
      creativeIdea: z.string().max(400).nullable(),
      why: z.string().min(20).max(400),
    }),
  ),
});

const WRITER_SYSTEM = `You are MAIRO, writing a small business's own organic Instagram and Facebook posts (not ads). Each post has a planned content type and a business goal; write it to serve that goal.

Rules:
- Use only facts given. Never invent prices, discounts, codes, dates, awards, reviews or customer names. For a promotion, use exactly the details given.
- Instagram captions: 1–4 short paragraphs, 3–6 relevant hashtags on the last line. Facebook posts: a little more context, 0–2 hashtags.
- End with the call to action (also returned separately as cta).
- Pick media only from the library given, by ref. IMAGE = exactly 1 image ref. CAROUSEL = 2–10 image refs. REEL = exactly 1 video ref. Choose the pictures that best match the post. If nothing in the library fits, return no refs and describe in creativeIdea the photo or short video the business should make (concrete and doable on a phone).
- "why" explains to the business owner, in one or two sentences, why MAIRO created this post and how it serves their goal — e.g. "Your current goal is increasing online sales. MAIRO created this product demonstration Reel to build purchase intent before your promotional post later this week."
- Don't repeat the same opening line across posts.`;

function pickMedia(format: MediaType, library: MediaItem[], words: string, used: Set<string>): string[] {
  const score = (m: MediaItem) => words.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && m.label.toLowerCase().includes(w)).length;
  const fresh = (kind: "image" | "video") =>
    library
      .filter((m) => m.kind === kind)
      .sort((a, b) => Number(used.has(a.ref)) - Number(used.has(b.ref)) || score(b) - score(a));
  if (format === "REEL") return fresh("video").slice(0, 1).map((m) => m.ref);
  const images = fresh("image");
  if (format === "CAROUSEL") return images.length >= 2 ? images.slice(0, Math.min(4, images.length)).map((m) => m.ref) : [];
  return images.slice(0, 1).map((m) => m.ref);
}

/** Makes media and format agree; returns null refs when nothing fits. */
export function fitMedia(format: MediaType, refs: string[], library: MediaItem[]): { format: MediaType; refs: string[] } {
  const kinds = new Map(library.map((m) => [m.ref, m.kind]));
  const valid = [...new Set(refs)].filter((r) => kinds.has(r));
  const images = valid.filter((r) => kinds.get(r) === "image");
  const videos = valid.filter((r) => kinds.get(r) === "video");
  if (format === "REEL") return videos.length ? { format, refs: [videos[0]] } : images.length ? { format: "IMAGE", refs: [images[0]] } : { format, refs: [] };
  if (format === "CAROUSEL") return images.length >= 2 ? { format, refs: images.slice(0, 10) } : images.length === 1 ? { format: "IMAGE", refs: images } : { format, refs: [] };
  return images.length ? { format: "IMAGE", refs: [images[0]] } : { format: "IMAGE", refs: [] };
}

function detailLine(d: PromotionDetails): string {
  const parts = [d.offer, d.discount, d.items && `on ${d.items}`, d.code && `Use code ${d.code}.`, d.price && `Price: ${d.price}.`, d.promotion, d.location && `At ${d.location}.`, d.restrictions && `(${d.restrictions})`];
  return parts.filter(Boolean).join(" ");
}

function ruleCaption(slot: PostSlot, profile: BrainProfile, cta: string): string {
  const name = profile.businessName || "us";
  const product = profile.products[0]?.name;
  const p = slot.promotion;
  if (p) {
    const d = p.details;
    const lines: Record<string, string> = {
      Teaser: `Something new is coming to ${name}. ${d.name || d.offer || d.holiday || ""} — watch this space.`,
      Launch: `It's here: ${p.title}. ${detailLine(d)}`,
      "Product reveal": `Meet ${d.name}. ${d.description ?? ""}`,
      Introduction: `New at ${name}: ${d.name}. ${d.description ?? ""}`,
      "Ending soon": `${p.title} ends tomorrow. ${detailLine(d)}`,
      "Last chance": `Last chance: ${p.title} ends today. ${detailLine(d)}`,
      Announcement: `${d.headline || d.name || p.title}. ${d.description ?? ""}`,
      Today: `${d.name} is today! ${d.location ? `See you at ${d.location}.` : ""}`,
      Tomorrow: `${d.name} is tomorrow. ${d.location ? `${d.location}.` : ""}`,
    };
    const body = lines[slot.step ?? ""] ?? `${slot.contentType}: ${p.title}. ${detailLine(d) || d.description || ""}`;
    return `${body.replace(/\s+/g, " ").trim()}\n\n${cta}`;
  }
  const about = product ? ` ${product}` : "";
  return `${slot.contentType} from ${name}.${about ? ` Featuring${about}.` : ""} ${profile.usps[0] ?? profile.overview.slice(0, 160)}`.replace(/\s+/g, " ").trim() + `\n\n${cta}`;
}

function ruleWhy(slot: PostSlot, goalLabel: string): string {
  const goal = `Your current goal is to ${goalLabel.toLowerCase()}.`;
  if (slot.promotion && slot.step) {
    return `${goal} MAIRO created this ${slot.contentType.toLowerCase()} post as the "${slot.step}" step of your ${slot.promotion.title} plan, ${
      slot.promotional ? "to turn interest into action at the right moment" : "to build interest and trust before the promotional posts"
    }.`;
  }
  return `${goal} MAIRO created this ${slot.contentType.toLowerCase()} post because it ${slot.purpose.replace(/\.$/, "")}.`;
}

export async function writePosts(input: {
  profile: BrainProfile;
  strategy: Strategy;
  goalDetail: string;
  slots: PostSlot[];
  library: MediaItem[];
  learnings: string[];
  timeoutMs?: number;
}): Promise<{ posts: WrittenPost[]; ai: boolean }> {
  const g = goalInfo(input.strategy.goal);
  const used = new Set<string>();
  const fallback = (slot: PostSlot, i: number): WrittenPost => {
    const format: MediaType = slot.format ?? "IMAGE";
    const refs = pickMedia(format, input.library, `${slot.contentType} ${slot.promotion?.title ?? ""}`, used);
    refs.forEach((r) => used.add(r));
    const fitted = fitMedia(format, refs, input.library);
    const cta = input.strategy.ctas[i % input.strategy.ctas.length];
    return {
      caption: ruleCaption(slot, input.profile, cta),
      cta,
      format: fitted.format,
      mediaRefs: fitted.refs,
      creativeIdea: fitted.refs.length ? null : `Make a ${fitted.format === "REEL" ? "short video" : "photo"} for this ${slot.contentType.toLowerCase()} post${slot.promotion ? ` about ${slot.promotion.title}` : ""}.`,
      why: ruleWhy(slot, g.label),
    };
  };

  if (!aiAvailable() || input.slots.length === 0) return { posts: input.slots.map(fallback), ai: false };

  try {
    const library = input.library.slice(0, 40).map((m) => `${m.ref} | ${m.kind} | ${m.label.slice(0, 120)}`).join("\n");
    const { object } = await generateObject({
      model: agentModel,
      schema: writtenSchema,
      system: WRITER_SYSTEM,
      abortSignal: AbortSignal.timeout(input.timeoutMs ?? 50_000),
      prompt: [
        brainBrief(input.profile),
        `\nGoal: ${g.label}.${input.goalDetail ? ` In their words: "${input.goalDetail.slice(0, 400)}"` : ""}`,
        `Strategy: ${input.strategy.summary}`,
        `Calls to action to use: ${input.strategy.ctas.join(" | ")}`,
        input.strategy.avoid.length ? `Avoid: ${input.strategy.avoid.join("; ")}` : "",
        input.learnings.length ? `Learned from their posts: ${input.learnings.join(" ")}` : "",
        `\nMedia library (ref | kind | what it shows):\n${library || "(empty — describe a creativeIdea for every post)"}`,
        `\nWrite ${input.slots.length} posts, one per slot, in order:`,
        ...input.slots.map(
          (s, i) =>
            `${i + 1}. ${s.date} ${s.time} on ${s.platform === "FACEBOOK" ? "Facebook" : "Instagram"} — ${s.contentType} (${s.purpose}); suggested format ${s.format ?? "IMAGE"}${s.promotional ? "; promotional" : ""}${
              s.promotion ? `; part of "${s.promotion.title}" (${promotionLabel(s.promotion.kind)}), step "${s.step}", details: ${JSON.stringify(s.promotion.details).slice(0, 600)}` : ""
            }`,
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    });
    const posts = input.slots.map((slot, i) => {
      const o = object.posts[i];
      if (!o) return fallback(slot, i);
      const fitted = fitMedia(o.format, o.mediaRefs, input.library);
      fitted.refs.forEach((r) => used.add(r));
      const max = slot.platform === "FACEBOOK" ? FACEBOOK_TEXT_MAX : CAPTION_MAX;
      return {
        caption: o.caption.slice(0, max),
        cta: o.cta || input.strategy.ctas[0],
        format: fitted.format,
        mediaRefs: fitted.refs,
        creativeIdea: fitted.refs.length ? null : o.creativeIdea ?? `Make a photo for this ${slot.contentType.toLowerCase()} post.`,
        why: o.why,
      };
    });
    return { posts, ai: true };
  } catch (error) {
    console.error("Social post writing AI failed:", error);
    return { posts: input.slots.map(fallback), ai: false };
  }
}

export { GOAL_KEYS };
