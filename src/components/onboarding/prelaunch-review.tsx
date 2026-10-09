import Link from "next/link";
import type { PreLaunch } from "@/lib/onboarding/prelaunch";

// Everything the business is about to approve, in the order they'd ask:
// what it's for, who sees it, what the ads look like, where it runs, what it
// costs (Meta's bill and MAIRO's, kept apart), what can be measured, and
// whose approval it still needs.

const card = "rounded-2xl border border-white/[0.07] bg-field/80 p-5";
const eyebrow = "text-[11.5px] font-semibold uppercase tracking-[0.16em] text-faint";

function Row({ k, v, note }: { k: string; v: React.ReactNode; note?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-faint">{k}</dt>
      <dd className="text-[14px] leading-relaxed text-white">{v}</dd>
      {note && <dd className="text-[12.5px] text-muted">{note}</dd>}
    </div>
  );
}

const STATE = {
  done: { icon: "✓", cls: "text-emerald-300", sr: "done" },
  pending: { icon: "○", cls: "text-violet-bright", sr: "waiting" },
  problem: { icon: "!", cls: "text-alert", sr: "needs attention" },
  unknown: { icon: "?", cls: "text-amber-300", sr: "not confirmed yet" },
} as const;

export function PreLaunchReview({ review, campaignHref }: { review: PreLaunch; campaignHref: string }) {
  return (
    <div className="space-y-4" id="review">
      <section aria-labelledby="pl-what" className={card}>
        <h2 id="pl-what" className={eyebrow}>What it&rsquo;s for</h2>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Row k="Business goal" v={review.goal.label} note={review.goal.why || null} />
          <Row k="Campaign objective" v={review.objective.label} note={review.objective.meaning} />
          <Row k="When someone taps the ad" v={review.destination} />
        </dl>
      </section>

      <section aria-labelledby="pl-who" className={card}>
        <h2 id="pl-who" className={eyebrow}>Who sees it</h2>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Row k="Location" v={review.audience.location} />
          <Row k="Ages and gender" v={`${review.audience.ages} · ${review.audience.genders}`} />
          <Row
            k="Interests from your plan"
            v={review.audience.interests.length ? review.audience.interests.join(", ") : "None set — Meta finds the right people from your goal"}
            note={review.audience.widen ? "Meta may also show it to similar people when it expects better results." : null}
          />
          <Row k="Where the ads appear" v={review.audience.placements} />
        </dl>
        {review.audience.special && (
          <p className="mt-3 text-[12.5px] text-muted">Special ad category: {review.audience.special.toLowerCase().replace(/_/g, " ")} — Meta limits how this kind of ad can be targeted.</p>
        )}
      </section>

      <section aria-labelledby="pl-ads" className={card}>
        <h2 id="pl-ads" className={eyebrow}>Your ads</h2>
        {review.ads.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-muted">No ad is attached yet. Finish the ad in the campaign before launching.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {review.ads.slice(0, 3).map((a) => (
              <li key={a.id} className="overflow-hidden rounded-xl border border-white/[0.08] bg-paper">
                {a.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.image} alt={a.headline ? `Ad picture for “${a.headline}”` : "Ad picture"} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-white/[0.03] px-4 text-center text-[12.5px] text-faint">{a.text ?? "Picture shown by Meta"}</div>
                )}
                <div className="p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-faint">{a.label}</p>
                  {a.primaryText && <p className="mt-1 line-clamp-3 text-[13px] text-white/85">{a.primaryText}</p>}
                  {a.headline && <p className="mt-1.5 text-[13.5px] font-semibold text-white">{a.headline}</p>}
                  {a.callToAction && <p className="mt-1 inline-block rounded-md border border-white/12 px-2 py-0.5 text-[11.5px] text-white/80">{a.callToAction.replace(/_/g, " ").toLowerCase()}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pl-where" className={card}>
        <h2 id="pl-where" className={eyebrow}>Where it runs</h2>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Row k="Meta ad account" v={review.account.adAccount ?? "Not connected"} note={review.account.connected ? "Connected — the campaign is already built here, switched off." : "Reconnect before launching."} />
          <Row k="Your ads appear as" v={review.account.pageName ?? "No Facebook Page chosen"} note={review.account.pageName ? "Your Facebook Page's name and picture." : "Choose a Page on your Meta settings."} />
        </dl>
      </section>

      <section aria-labelledby="pl-pay" className={card}>
        <h2 id="pl-pay" className={eyebrow}>What you pay — two separate bills</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-violet/30 bg-violet/[0.05] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-bright">Ad budget · paid to Meta</p>
            <p className="mt-1 text-[22px] font-semibold text-white">{review.budget.headline}</p>
            {review.budget.per30 && <p className="text-[13px] text-muted">About {review.budget.per30} every 30 days, at most</p>}
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-faint">Starts</dt><dd className="text-white">{review.budget.start}</dd></div>
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-faint">Ends</dt><dd className="text-white">{review.budget.end}</dd></div>
            </dl>
            <p className="mt-3 text-[12.5px] text-muted">Meta charges your ad account directly. MAIRO never handles this money and never raises it without asking you.</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">MAIRO subscription · paid to MAIRO</p>
            <p className="mt-1 text-[22px] font-semibold text-white">{review.subscription.price}</p>
            <p className="text-[13px] text-muted">{review.subscription.name} plan · {review.subscription.status}</p>
            <p className="mt-3 text-[12.5px] text-muted">Billed by Stripe. It isn&rsquo;t ad spend and doesn&rsquo;t change your ad budget. Launching doesn&rsquo;t add anything to it.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="pl-track" className={card}>
        <h2 id="pl-track" className={eyebrow}>What can be measured</h2>
        <ul className="mt-3 space-y-1.5 text-[13.5px] text-white/85">
          {review.tracking.map((t) => (
            <li key={t} className="flex gap-2"><span aria-hidden className="text-faint">•</span>{t}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pl-approvals" className={card}>
        <h2 id="pl-approvals" className={eyebrow}>Approvals needed before it runs</h2>
        <ul className="mt-3 space-y-2.5">
          {review.approvals.map((a) => (
            <li key={a.key} className="flex gap-3" data-approval={a.key} data-state={a.state}>
              <span aria-hidden className={`w-4 shrink-0 text-center ${STATE[a.state].cls}`}>{STATE[a.state].icon}</span>
              <span className="min-w-0">
                <span className="block text-[13.5px] text-white">
                  {a.label} <span className="text-[11.5px] text-faint">· {a.who}</span>
                  <span className="sr-only"> ({STATE[a.state].sr})</span>
                </span>
                <span className="block text-[12.5px] text-muted">{a.detail}</span>
                {a.fix && (
                  <a href={a.fix.href} {...(a.fix.external ? { target: "_blank", rel: "noreferrer" } : {})} className="mt-1 inline-block text-[12.5px] text-violet-bright hover:text-white">
                    {a.fix.label}{a.fix.external ? " ↗" : " →"}
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {review.differences.length > 0 && (
        <section aria-labelledby="pl-diff" className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-5">
          <h2 id="pl-diff" className="text-[14px] font-semibold text-white">Changed from the plan you approved</h2>
          <ul className="mt-2 space-y-2 text-[13px]">
            {review.differences.map((d) => (
              <li key={d.key}>
                <span className="font-medium text-white">{d.label}:</span> <span className="text-muted">plan said {d.approved}; the campaign has {d.real}.</span>
                {d.note && <span className="block text-[12.5px] text-amber-200">{d.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[13px] text-muted">
        Something to change?{" "}
        <Link href={campaignHref} className="text-violet-bright hover:text-white">Change the campaign</Link>
        {" · "}
        <Link href="/dashboard/agents" className="text-violet-bright hover:text-white">Ask MAIRO</Link>
      </p>
    </div>
  );
}
