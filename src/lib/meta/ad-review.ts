import { metaGraphRequest } from "@/lib/meta/client";
import type { ReviewStep } from "@/lib/campaigns/review-rules";

// What Meta's ad review decided, in words a business owner can act on.
//
// Meta reviews every ad before it runs. When it says no, the reason arrives as
// a policy name ("Personal Attributes") and a paragraph written for lawyers.
// This turns the common ones into what went wrong and what to do about it,
// and passes anything it doesn't recognise through in Meta's own words rather
// than guessing.

export type AdReviewState = "APPROVED" | "PENDING" | "REJECTED" | "WITH_ISSUES" | "OFF";

export type AdReview = {
  state: AdReviewState;
  /** Plain-English explanation, when there's something to explain. */
  explanation: string | null;
  /** What to do next, in one sentence. */
  action: string | null;
  /** The wizard screen that fixes it, when a new ad is the fix. */
  fix: ReviewStep | null;
};

type Feedback = { global?: Record<string, string>; placement_specific?: Record<string, Record<string, string>> };
type Issue = { error_summary?: string; error_message?: string };

const POLICY_HELP: { match: RegExp; explanation: string; action: string; fix: ReviewStep }[] = [
  {
    match: /personal attribute/i,
    explanation: "Meta thinks the ad implies it knows something personal about the reader — their health, money, religion, age or similar.",
    action: "Rewrite it to describe what you offer (\"Help with debt\") rather than the reader (\"Are you in debt?\").",
    fix: "ad",
  },
  {
    match: /unrealistic|misleading|false|deceptive|sensational/i,
    explanation: "Meta thinks the ad promises something it can't back up, or overstates results.",
    action: "Remove claims like \"guaranteed\" or before-and-after promises and describe what you actually offer.",
    fix: "ad",
  },
  {
    match: /special ad categor|housing|employment|credit|financial/i,
    explanation: "Meta thinks this ad is about housing, jobs or credit, which have stricter targeting rules, and it wasn't declared as one.",
    action: "Make the campaign again and choose that category on the audience screen.",
    fix: "audience",
  },
  {
    match: /grammar|profanity|capitali|punctuation/i,
    explanation: "Meta flagged the writing — unusual capitals, symbols or language.",
    action: "Use ordinary sentences without ALL CAPS, repeated punctuation or slang that could read as rude.",
    fix: "ad",
  },
  {
    match: /adult|sexual|nudity|body image/i,
    explanation: "Meta thinks the picture or words are too suggestive, or focus on bodies in a way its rules don't allow.",
    action: "Use a picture of the product or service itself, with people fully clothed and no zoomed-in body parts.",
    fix: "ad",
  },
  {
    match: /low.?quality|disruptive|engagement bait|clickbait/i,
    explanation: "Meta thinks the ad is built to get clicks rather than to inform — for example withholding information or asking for likes and shares.",
    action: "Say plainly what you offer and remove any \"like/share this\" or \"you won't believe\" wording.",
    fix: "ad",
  },
  {
    match: /logo|intellectual property|trademark|copyright/i,
    explanation: "Meta thinks the picture uses something the business doesn't own — another brand's logo, a trademark or copyrighted material.",
    action: "Use your own photo or one made in Creative Studio, without other companies' logos.",
    fix: "ad",
  },
  {
    match: /landing page|non.?functional|destination|broken/i,
    explanation: "The page the ad sends people to didn't work for Meta's reviewer — it didn't load, redirected oddly, or didn't match the ad.",
    action: "Check the page opens on a phone and matches what the ad promises, then make the ad again.",
    fix: "goal",
  },
];

export function explainAdReview(effectiveStatus: string, feedback: Feedback | null, issues: Issue[] | null): AdReview {
  if (effectiveStatus === "DISAPPROVED") {
    const policies = Object.entries(feedback?.global ?? {});
    const text = policies.map(([k, v]) => `${k} ${v}`).join(" ");
    const known = POLICY_HELP.find((p) => p.match.test(text));
    if (known) return { state: "REJECTED", explanation: known.explanation, action: known.action, fix: known.fix };
    const [name, detail] = policies[0] ?? ["", ""];
    return {
      state: "REJECTED",
      explanation: name ? `Meta's reason: ${name}${detail ? ` — ${detail.slice(0, 300)}` : ""}` : "Meta didn't approve this ad and didn't say why.",
      action: "Make a new ad that avoids this, or ask Meta to review it again from Account Quality in Meta Business Suite.",
      fix: "ad",
    };
  }
  if (effectiveStatus === "WITH_ISSUES") {
    const issue = issues?.[0];
    return {
      state: "WITH_ISSUES",
      explanation: issue?.error_summary || issue?.error_message || "Meta flagged a problem with this ad that stops it delivering.",
      action: "Open the campaign in Ads Manager to see the issue, or make the ad again in MAIRO.",
      fix: "ad",
    };
  }
  if (effectiveStatus === "PENDING_REVIEW" || effectiveStatus === "IN_PROCESS" || effectiveStatus === "PREAPPROVED") {
    return { state: "PENDING", explanation: null, action: null, fix: null };
  }
  if (effectiveStatus === "ACTIVE") return { state: "APPROVED", explanation: null, action: null, fix: null };
  return { state: "OFF", explanation: null, action: null, fix: null };
}

/** Meta's current review state for several ads, in one call. */
export async function fetchAdReviews(adIds: string[], accessToken: string): Promise<Map<string, AdReview>> {
  const out = new Map<string, AdReview>();
  if (adIds.length === 0) return out;
  const res = await metaGraphRequest<
    Record<string, { effective_status?: string; ad_review_feedback?: Feedback; issues_info?: Issue[] }>
  >("/", {
    accessToken,
    params: { ids: adIds.slice(0, 50).join(","), fields: "effective_status,ad_review_feedback,issues_info" },
  });
  for (const [id, ad] of Object.entries(res)) {
    out.set(id, explainAdReview(ad.effective_status ?? "", ad.ad_review_feedback ?? null, ad.issues_info ?? null));
  }
  return out;
}
