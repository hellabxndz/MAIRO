// The top of the Overview, answering three questions the moment it opens:
//
//   1. What is MAIRO doing for my business right now?
//   2. Is there anything I need to do or approve?
//   3. What results am I getting?
//
// …and giving one primary button, picked from the account's actual state.
// Pure, so every state is testable without a database (check:right-now).
// Every input is something the dashboard already read from this business's
// own records or from what Meta reported; nothing here is estimated.

export type JourneyNext = "connect" | "build" | "review" | "waiting" | "live";

export type RightNowInput = {
  /** The first campaign's step, while it isn't launched. Null once it is, or for businesses that didn't come through the plan. */
  journey: JourneyNext | null;
  meta: "connected" | "attention" | "none";
  /** What's in the way first (readiness or billing), from the Action Center. */
  blocker: { title: string; why: string; href: string; cta: string } | null;
  /** Launches, budget changes and other decisions waiting for a yes. */
  approvals: number;
  campaigns: { live: number; review: number; paused: number; total: number };
  /** Only for a business whose result is website purchases. */
  purchaseTracking: { verified: boolean; declined: boolean; title: string | null; href: string } | null;
  /** The figures Meta reported for the period, as display strings; null when not reported. */
  figures: { spend: string | null; results: string | null; resultsLabel: string; cost: string | null; costLabel: string; roas: string | null };
  /** Meta couldn't be read just now. */
  unreadable: boolean;
  /** What MAIRO may do on its own (Autopilot, approvals only, paused). */
  mode: string | null;
};

export type RightNow = {
  doing: string;
  needs: { text: string; href: string; cta: string } | null;
  results: { text: string; state: "reported" | "pending" | "unavailable" };
  tracking: { verified: boolean; text: string } | null;
  primary: { href: string; cta: string };
};

/** A gate title used inside running text, ending with a full stop. */
const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function rightNow(i: RightNowInput): RightNow {
  // ---- 2. What needs the owner, most blocking first. Exactly one.
  let needs: RightNow["needs"] = null;
  const purchaseOpen = i.purchaseTracking && !i.purchaseTracking.verified && !i.purchaseTracking.declined;
  if (i.meta === "none" || i.journey === "connect") {
    needs = {
      text: "Connect your Meta ad account. MAIRO builds and runs your ads inside it — connecting doesn't create or spend anything.",
      // The checklist holds the connect button and says what went wrong if Facebook refuses.
      href: i.journey ? "/dashboard/launch" : "/dashboard/meta",
      cta: "Connect Meta",
    };
  } else if (i.blocker) {
    needs = {
      text: `${i.blocker.title}. ${i.blocker.why}`.replace(/\.\. /, ". "),
      href: i.blocker.href,
      // Say what the button does when it's the Meta connection that broke.
      cta: i.meta === "attention" && /meta/i.test(i.blocker.title) ? "Reconnect Meta" : i.blocker.cta,
    };
  } else if (i.journey === "build") {
    needs = {
      text: "Build your first campaign. It's filled in from the plan you approved and created switched off — nothing spends yet.",
      href: "/dashboard/launch",
      cta: "Build my campaign",
    };
  } else if (i.journey === "review" && purchaseOpen) {
    needs = {
      text: `Verify purchase tracking before your campaign can launch. ${sentence(i.purchaseTracking!.title ?? "Meta hasn't confirmed a purchase from your website yet")}`,
      href: i.purchaseTracking!.href,
      cta: "Verify purchase tracking",
    };
  } else if (i.journey === "review") {
    needs = {
      text: "Approve your first campaign. Check the budget, audience and ads — nothing is spent until you approve the launch.",
      href: "/dashboard/launch",
      cta: "Review and approve",
    };
  } else if (i.approvals > 0) {
    needs = {
      text: `${plural(i.approvals, "change")} ${i.approvals === 1 ? "is" : "are"} waiting for your approval. Nothing changes in your ad account until you say yes.`,
      href: "/dashboard/decisions",
      cta: i.approvals === 1 ? "Review it" : "Review them",
    };
  } else if (purchaseOpen && i.campaigns.total > 0) {
    needs = {
      text: `Verify purchase tracking so MAIRO can count your sales. ${sentence(i.purchaseTracking!.title ?? "Meta hasn't confirmed a purchase from your website yet")}`,
      href: i.purchaseTracking!.href,
      cta: "Verify purchase tracking",
    };
  } else if (i.journey === null && i.campaigns.total === 0 && i.meta === "connected") {
    needs = {
      text: "Create your first campaign. Tell MAIRO what to advertise; you see everything before anything spends.",
      href: "/dashboard/create",
      cta: "Create your first campaign",
    };
  }

  // ---- 1. What MAIRO is doing, in one plain sentence.
  const { live, review, paused, total } = i.campaigns;
  const doing =
    i.meta === "attention" && total > 0
      ? "MAIRO has lost its connection to your Meta ad account, so it can't check or change your campaigns. They keep running on Meta exactly as they were."
      : i.journey === "connect" || (i.meta === "none" && total === 0)
      ? "Your plan is approved. MAIRO is waiting for your Meta ad account so it can build your first campaign."
      : i.journey === "build"
        ? "Meta is connected. Your first campaign is ready to be built from your approved plan."
        : i.journey === "review"
          ? "Your first campaign is built in your ad account, switched off, and waiting for your approval."
          : i.journey === "waiting"
            ? "You approved the launch. MAIRO switches it on as soon as Meta approves the ad and confirms it can charge your ad account — you don't need to come back."
            : live > 0
              ? `Running ${plural(live, "campaign")} on Meta and checking ${live === 1 ? "it" : "them"} every day${i.mode ? ` · ${i.mode}` : ""}.`
              : review > 0
                ? `${plural(review, "campaign")} ${review === 1 ? "is" : "are"} switched on and waiting for Meta's review. Meta usually answers within a day.`
                : paused > 0
                  ? "Your campaigns are paused, so nothing is being spent. MAIRO keeps watching the account."
                  : total > 0
                    ? "Your campaigns aren't running right now. Nothing is being spent."
                    : "Nothing is running yet. Nothing is spent until you approve a campaign.";

  // ---- 3. Results: the figures Meta reported, or why there are none.
  const f = i.figures;
  const parts = [
    f.spend && `${f.spend} spent`,
    f.results && `${f.results} ${f.resultsLabel.toLowerCase()}`,
    f.cost && `${f.cost} ${f.costLabel.toLowerCase()}`,
    f.roas && `${f.roas} ROAS`,
  ].filter(Boolean) as string[];
  const results: RightNow["results"] = parts.length > 0
    ? { text: parts.join(" · "), state: "reported" }
    : i.unreadable
      ? { text: "Unavailable — Meta couldn't be read just now. That's unknown, not zero.", state: "unavailable" }
      : i.meta !== "connected" || total === 0
        ? { text: "None yet — results start once your first campaign is approved and running.", state: "pending" }
        : live > 0 || review > 0 || i.journey === "waiting"
          ? { text: "Pending — Meta sends the first figures a few hours after an ad starts delivering.", state: "pending" }
          : { text: "Nothing reported for this period.", state: "pending" };

  // ---- Purchase tracking, for a shop: said either way, before launch and after.
  const tracking = i.purchaseTracking
    ? i.purchaseTracking.verified
      ? { verified: true, text: "Purchase tracking verified — Meta has received a purchase from your website." }
      : i.purchaseTracking.declined
        ? { verified: false, text: "Purchase tracking is off (your choice), so purchase campaigns can't launch. Website-visit campaigns still can." }
        : i.meta !== "connected"
          ? { verified: false, text: "Not verified yet. After Meta is connected, MAIRO helps you set up your Pixel — a purchase campaign launches only once Meta has received a purchase from your website." }
          : { verified: false, text: `Not verified yet. ${sentence(i.purchaseTracking.title ?? "Meta hasn't confirmed a purchase from your website")}` }
    : null;

  const primary = needs
    ? { href: needs.href, cta: needs.cta }
    : total > 0
      ? { href: "/dashboard/results", cta: "View results" }
      : { href: "/dashboard/launch", cta: "See your first campaign" };

  return { doing, needs, results, tracking, primary };
}
