// What MAIRO tells a business when its subscription is cancelled or ends.
//
// Always two separate facts: the MAIRO subscription (what Stripe confirmed),
// and the Meta campaigns (still running, still spending, unchanged by the
// cancellation). Saying the first without the second is how somebody cancels
// and keeps paying Meta for a month without noticing.

export type CancellationNotice = { title: string; body: string; sms: string };

function day(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function campaignsLine(running: number, after: "ends" | "now"): string {
  if (running === 0) return "No MAIRO campaigns are running in Meta, so nothing keeps spending because of MAIRO.";
  const what = running === 1 ? "1 MAIRO campaign is" : `${running} MAIRO campaigns are`;
  return after === "ends"
    ? `${what} still running in your Meta ad account. Cancelling doesn't pause ${running === 1 ? "it" : "them"} — ${running === 1 ? "it keeps" : "they keep"} spending at the budgets you approved, during and after your plan, until paused.`
    : `${what} still running in your Meta ad account and ${running === 1 ? "keeps" : "keep"} spending at the budgets you approved until paused. You can still pause ${running === 1 ? "it" : "them"} from MAIRO or in Meta Ads Manager.`;
}

export function cancellationNotice(input: { kind: "scheduled" | "ended"; endsOn: Date | null; running: number }): CancellationNotice {
  if (input.kind === "scheduled") {
    return {
      title: "Your MAIRO subscription is cancelled",
      body: `Stripe confirmed it. Your plan stays active${input.endsOn ? ` until ${day(input.endsOn)}` : " until the end of the period you paid for"}. ${campaignsLine(input.running, "ends")}`,
      sms: input.running > 0
        ? `MAIRO cancelled. ${input.running} campaign${input.running === 1 ? "" : "s"} still running in Meta and spending until paused — review them in MAIRO.`
        : "Your MAIRO subscription is cancelled. No MAIRO campaigns are running in Meta.",
    };
  }
  return {
    title: "Your MAIRO plan has ended",
    body: `MAIRO no longer builds, changes or watches your campaigns. ${campaignsLine(input.running, "now")}`,
    sms: input.running > 0
      ? `Your MAIRO plan ended. ${input.running} campaign${input.running === 1 ? "" : "s"} still running in Meta and spending until paused.`
      : "Your MAIRO plan has ended. No MAIRO campaigns are running in Meta.",
  };
}

/** When Stripe will end a subscription the owner cancelled, or null while it renews. */
export function scheduledEnd(sub: { cancel_at?: number | null; cancel_at_period_end?: boolean | null }, periodEnd: Date | null): Date | null {
  if (sub.cancel_at) return new Date(sub.cancel_at * 1000);
  if (sub.cancel_at_period_end) return periodEnd;
  return null;
}
