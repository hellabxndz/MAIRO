import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { limitsFor, planFor } from "@/lib/plans";
import { AGENT_LABELS, AGENT_DESCRIPTIONS } from "@/lib/ai/agents";
import { PageHeader } from "@/components/ui";

// How MAIRO works, for the person whose business it is.
//
// Written for someone who has never bought an ad and does not want to become
// an advertiser — which is the entire premise of the product. So it explains
// what each thing is FOR and what it will cost them in attention, and it is
// honest about the parts that are genuinely their decision.
//
// Deliberately not the freelancer guide with the words swapped. A freelancer
// wants to know how to run five businesses efficiently; an owner wants to know
// whether they are about to spend money by accident.

export const metadata = { title: "How MAIRO works" };

export default async function OwnerGuidePage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true },
  });
  const plan = planFor(org?.subscriptionTier ?? "NONE");
  const limits = limitsFor(org?.subscriptionTier ?? "NONE");

  const sections: Array<{ n: string; title: string; body: React.ReactNode }> = [
    {
      n: "01",
      title: "What MAIRO actually does",
      body: (
        <>
          <p>
            You tell it about your business once. From then on it writes the strategy,
            designs the ads, and builds the campaigns in your own Meta ad account.
          </p>
          <p>
            What it does not do is spend your money. Every campaign it builds arrives{" "}
            <strong className="font-medium text-white">paused</strong>. You decide what
            goes live and when — there is no arrangement under which MAIRO starts
            spending on its own.
          </p>
        </>
      ),
    },
    {
      n: "02",
      title: "Your answers are the whole product",
      body: (
        <>
          <p>
            In Settings, MAIRO keeps what you told it: what you sell, who buys it, your
            goal and your budget. Every plan and every advert is written from that.
          </p>
          <p>
            So if an ad ever sounds like it is about somebody else&apos;s business, that
            is where to look. Being specific pays off more than anything else you can do
            here — &ldquo;we do same-day repairs and most customers find us on a
            Saturday&rdquo; is worth more than a paragraph of adjectives.
          </p>
        </>
      ),
    },
    {
      n: "03",
      title: "Connecting Meta",
      body: (
        <>
          <p>
            Sign in with the Facebook account that manages your business&apos;s ads. MAIRO
            can only see and use the ad account you connect — nothing else on your
            Facebook, and no other business.
          </p>
          <p>
            Before it is connected you can still read plans and design ads. Only going
            live needs the connection.
          </p>
          <p>
            You can disconnect any time from the Meta connection screen, and anything
            already live in your ad account stays yours; it is your account, not ours.
          </p>
        </>
      ),
    },
    {
      n: "04",
      title: "The monthly plan",
      body: (
        <>
          <p>
            At the start of each month MAIRO writes what to spend, where to spend it, and
            what a reasonable month looks like. This is the part worth ten minutes of your
            attention — everything else follows from it.
          </p>
          <p>
            If a number looks wrong for your business, say so to the Strategist and ask
            for a different split. It is a proposal, not an instruction.
          </p>
        </>
      ),
    },
    {
      n: "05",
      title: "Making an ad",
      body: (
        <>
          <p>
            Photograph what you sell — on your phone is fine. MAIRO reads the picture and
            writes the concept, the headline and the words.
          </p>
          <p>
            Then argue with it. &ldquo;Make it about the sale.&rdquo; &ldquo;My shop is
            called X.&rdquo; &ldquo;Less corporate.&rdquo; Rewrites are free and unlimited;
            only starting a brand new creative counts against your plan, which on{" "}
            <strong className="font-medium text-white">{plan.name}</strong> is{" "}
            <strong className="font-medium text-white">
              {limits.creativesPerMonth} a month
            </strong>
            . Push the first one until you would be happy to see it on your own feed.
          </p>
        </>
      ),
    },
    {
      n: "06",
      title: "Going live, and what it costs",
      body: (
        <>
          <p>
            Approving a creative builds the campaign in your ad account, paused. You switch
            it on in Meta Ads Manager when you are ready.{" "}
            <strong className="font-medium text-white">{plan.name}</strong> covers{" "}
            {limits.campaigns} active {limits.campaigns === 1 ? "campaign" : "campaigns"}.
          </p>
          <p>
            Two separate bills, and it is worth being clear about them: your MAIRO
            subscription, and the money Meta charges for showing the ads. MAIRO never
            takes a cut of your ad spend, and your budget goes straight from you to Meta.
          </p>
        </>
      ),
    },
    {
      n: "07",
      title: "Asking questions",
      body: (
        <>
          <p>
            Three specialists, unlimited on every plan, and they know your business and
            your numbers.
          </p>
          <ul className="mt-4 space-y-2">
            {(["STRATEGIST", "CREATIVE", "SUPPORT"] as const).map((a) => (
              <li key={a} className="flex gap-3">
                <span className="mt-[9px] h-px w-3 shrink-0 bg-neutral-700" />
                <span>
                  <strong className="font-medium text-white">{AGENT_LABELS[a]}</strong> —{" "}
                  {AGENT_DESCRIPTIONS[a].toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4">
            Ask in ordinary words. &ldquo;Is £20 a day enough?&rdquo; &ldquo;Why did this
            get more clicks than that one?&rdquo; You will get a straight answer, not a
            chart to interpret.
          </p>
        </>
      ),
    },
    {
      n: "08",
      title: "What a month looks like",
      body: (
        <>
          <p>
            <strong className="font-medium text-white">Start of the month</strong> — read
            the plan. Ten minutes.
          </p>
          <p>
            <strong className="font-medium text-white">Once a week</strong> — open the
            Overview, glance at spend and results, ask the Strategist about anything that
            surprises you. Five minutes.
          </p>
          <p>
            <strong className="font-medium text-white">When an ad gets tired</strong> —
            new photo, new creative, swap it in. This is the single highest-value thing
            you can do, and it is the thing most small businesses never get round to.
          </p>
        </>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="How MAIRO works"
        description="Everything worth knowing, in about ten minutes."
      />

      <div className="max-w-2xl space-y-12">
        {sections.map((s) => (
          <section key={s.n}>
            <div className="flex items-baseline gap-4">
              <span className="text-[11px] tabular-nums tracking-[0.2em] text-neutral-600">
                {s.n}
              </span>
              <h2 className="text-lg font-light tracking-[-0.01em]">{s.title}</h2>
            </div>
            <div className="mt-3 space-y-4 text-sm leading-relaxed text-neutral-400 sm:pl-10">
              {s.body}
            </div>
          </section>
        ))}

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6">
          <p className="text-sm">Still not sure about something?</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">
            Ask the Support specialist — it knows how MAIRO works and it can see your
            account.
          </p>
          <Link
            href="/dashboard/agents/support"
            className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-xs font-medium text-black transition hover:bg-neutral-200"
          >
            Ask Support
          </Link>
        </div>
      </div>
    </div>
  );
}
