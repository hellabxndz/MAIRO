import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AmbientSky } from "@/components/ambient-sky";
import { limitsFor, planFor } from "@/lib/plans";
import { AGENT_LABELS, AGENT_DESCRIPTIONS } from "@/lib/ai/agents";

// How to run MAIRO for other people's businesses.
//
// Written for a freelancer rather than a business owner, because the job is a
// different shape: they are setting up an account they do not own, describing
// a business that is not theirs, and answering to somebody who is paying them
// for the result.
//
// It is deliberately specific. "Connect Meta" is not advice; knowing that the
// login needs an existing role on the client's ad account, and that a campaign
// arrives paused, is. Where numbers appear they come from the reader's own
// plan, not from a hardcoded example.

export const metadata = { title: "Guide — MAIRO" };

export default async function GuidePage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  if (session.user.role !== "FREELANCER") redirect("/dashboard");

  const workspace = await db.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { subscriptionTier: true },
  });
  const plan = planFor(workspace?.subscriptionTier ?? "NONE");
  const limits = limitsFor(workspace?.subscriptionTier ?? "NONE");

  const sections: Array<{ n: string; title: string; body: React.ReactNode }> = [
    {
      n: "01",
      title: "How the account is shaped",
      body: (
        <>
          <p>
            You have a <strong className="font-medium text-white">studio</strong> — the
            account you pay from. Inside it sits one{" "}
            <strong className="font-medium text-white">client business</strong> per business
            you run ads for.
          </p>
          <p>
            The studio never runs ads itself. Everything real — campaigns, creatives, the
            monthly plan, the ad account — belongs to a client, and you get there by
            opening one from your client list. Whichever client you have open is named at
            the top of every screen, so you always know whose account you are editing.
          </p>
          <p>
            Your clients are never billed and never log in. As far as they are concerned,
            this is you doing the work.
          </p>
        </>
      ),
    },
    {
      n: "02",
      title: "Adding a client",
      body: (
        <>
          <p>
            From your client list: a name, optionally an industry, and it exists. You are
            dropped straight into its setup, because that is the only useful next step.
          </p>
          <p>
            Your plan covers{" "}
            <strong className="font-medium text-white">
              {limits.clients ?? 0} client businesses
            </strong>{" "}
            at once. Removing a client frees the slot immediately — and deletes their
            campaigns, creatives and stored ad account access with it. That last part is
            deliberate: once you stop working with someone you should not still be holding
            the keys to their ad account.
          </p>
        </>
      ),
    },
    {
      n: "03",
      title: "The brief is the whole job",
      body: (
        <>
          <p>
            Setup asks what the business sells, who buys it, the goal, and the monthly
            budget. Every plan and every ad MAIRO writes comes out of these answers.
          </p>
          <p>
            This is where a freelancer earns the fee. Anyone can type &ldquo;a
            gym&rdquo;. You know that they are a gym competing on 6am classes for shift
            workers, that the owner hates discount offers, and that last winter&apos;s
            best month came from a free-week trial. Write that. The difference between a
            generic campaign and a good one is almost entirely here.
          </p>
          <p>
            It is editable forever, in that client&apos;s Settings. Change it whenever the
            business changes.
          </p>
        </>
      ),
    },
    {
      n: "04",
      title: "Connecting their Meta ad account",
      body: (
        <>
          <p>
            Open the client, go to <strong className="font-medium text-white">Meta
            connection</strong>, and sign in with a Facebook account that already has
            access to that business&apos;s ad account. MAIRO cannot grant access it does
            not have — if you are not on their Business portfolio yet, get added first.
          </p>
          <p>
            Each client connects separately, with its own token. There is no path by which
            one client&apos;s budget touches another&apos;s.
          </p>
          <p>
            Until a client is connected you can still write plans and creatives for them.
            Nothing can go live, which is the point.
          </p>
        </>
      ),
    },
    {
      n: "05",
      title: "The monthly plan",
      body: (
        <>
          <p>
            MAIRO writes the strategy, the budget split and what to expect from the month.
            Read it before you forward it — it is written to be sent to a client as-is,
            and it is often the thing that justifies your invoice.
          </p>
          <p>
            Disagree with it? Say so in the chat with the{" "}
            <strong className="font-medium text-white">Strategist</strong> and ask for a
            different split. Arguing with it is faster than starting over.
          </p>
        </>
      ),
    },
    {
      n: "06",
      title: "Creatives",
      body: (
        <>
          <p>
            Send a photo of what the business sells. MAIRO reads the picture and writes the
            concept, the headline, the copy and the call to action.
          </p>
          <p>
            Rewrites are free and unlimited — &ldquo;make it about the sale&rdquo;,
            &ldquo;their shop is called X&rdquo;, &ldquo;less corporate&rdquo;. Only
            starting a new creative counts against your allowance, which on{" "}
            <strong className="font-medium text-white">{plan.name}</strong> is{" "}
            <strong className="font-medium text-white">
              {limits.creativesPerMonth} a month per client
            </strong>
            . So push the first one until it is right rather than starting again.
          </p>
        </>
      ),
    },
    {
      n: "07",
      title: "Campaigns go live paused",
      body: (
        <>
          <p>
            When you approve, MAIRO builds the campaign in the client&apos;s own Meta ad
            account — <strong className="font-medium text-white">always paused</strong>.
            Nothing spends a penny until somebody switches it on in Ads Manager.
          </p>
          <p>
            For a freelancer that gap is useful: it is where you check the targeting, show
            the client, and turn it on yourself once they have said yes.{" "}
            <strong className="font-medium text-white">{plan.name}</strong> allows{" "}
            {limits.campaigns} active campaigns per client.
          </p>
        </>
      ),
    },
    {
      n: "08",
      title: "The AI specialists",
      body: (
        <>
          <p>
            Three of them, unlimited on every plan, and they answer in the context of
            whichever client you have open — ask about the gym and you get the gym&apos;s
            numbers.
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
            The most useful habit: before a client call, open their account and ask the
            Strategist what moved this month. It answers in sentences you can repeat.
          </p>
        </>
      ),
    },
    {
      n: "09",
      title: "A rhythm that works",
      body: (
        <>
          <p>
            <strong className="font-medium text-white">Start of the month</strong> —
            generate each client&apos;s plan, skim it, send it on.
          </p>
          <p>
            <strong className="font-medium text-white">Once a week</strong> — open each
            client, look at spend and cost per result, ask the Strategist about anything
            that moved.
          </p>
          <p>
            <strong className="font-medium text-white">When creative goes stale</strong> —
            new photo, new concept, swap it in. This is usually the highest-value thing you
            can do, and the thing a client notices.
          </p>
        </>
      ),
    },
  ];

  return (
    <div className="relative min-h-screen text-white">
      <AmbientSky />

      <header className="border-b border-white/[0.07] bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <p className="text-sm font-light tracking-[0.28em]">MAIRO</p>
          <Link href="/clients" className="text-xs text-neutral-400 transition hover:text-white">
            Back to clients
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1
          className="font-light leading-[1.05] tracking-[-0.025em]"
          style={{ fontSize: "clamp(32px, 5vw, 56px)" }}
        >
          Running MAIRO
          <br />
          <span className="text-neutral-600">for other people.</span>
        </h1>
        <p className="mt-6 max-w-xl leading-relaxed text-neutral-400">
          Ten minutes of reading that will save you a month of working it out. Written for
          the job you are actually doing — running ads for businesses that are not yours.
        </p>

        <div className="mt-16 space-y-14">
          {sections.map((s) => (
            <section key={s.n}>
              <div className="flex items-baseline gap-4">
                <span className="text-[11px] tabular-nums tracking-[0.2em] text-neutral-600">
                  {s.n}
                </span>
                <h2 className="text-xl font-light tracking-[-0.01em]">{s.title}</h2>
              </div>
              <div className="mt-4 space-y-4 pl-0 text-sm leading-relaxed text-neutral-400 sm:pl-10">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-20 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-7">
          <p className="text-sm">Still stuck on something?</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">
            Open any client and ask the Support specialist. It knows how MAIRO works and it
            answers about the account you have open.
          </p>
          <Link
            href="/clients"
            className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-black transition hover:bg-neutral-200"
          >
            Back to your clients
          </Link>
        </div>
      </main>
    </div>
  );
}
