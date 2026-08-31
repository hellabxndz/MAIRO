import Link from "next/link";

const steps = [
  {
    title: "Tell us your goal",
    body: "Leads, sales, awareness, or traffic — and your monthly ad budget. Takes about two minutes.",
  },
  {
    title: "We build your plan",
    body: "A real strategist and our AI plan your monthly campaigns, budget split, and creative calendar.",
  },
  {
    title: "We create and launch",
    body: "We write the ad copy, build the creative, and push live campaigns straight to your Meta ad account.",
  },
  {
    title: "You watch it work",
    body: "Track performance in one dashboard, and chat with an AI specialist anytime you have a question.",
  },
];

const agents = [
  { name: "Strategist", desc: "Plans budget, targeting, and monthly goals with you." },
  { name: "Creative", desc: "Drafts ad copy and creative briefs for your campaigns." },
  { name: "Support", desc: "Answers questions about your account, billing, and performance." },
];

export default function Home() {
  return (
    <div className="flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold tracking-tight">MyRo</span>
        <nav className="flex items-center gap-6 text-sm text-neutral-300">
          <a href="#how-it-works" className="hover:text-white">
            How it works
          </a>
          <a href="#agents" className="hover:text-white">
            AI specialists
          </a>
          <Link href="/sign-in" className="hover:text-white">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-full bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-20 pb-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Run winning Meta ads.
          <br />
          <span className="text-neutral-400">Without learning Meta ads.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
          MyRo is the ad platform for business owners who don&apos;t have time to become
          an ads expert. Tell us your goal and budget — we plan, build, and manage your
          campaigns for you.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:bg-neutral-200"
          >
            Start your first plan
          </Link>
          <a
            href="#how-it-works"
            className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium hover:border-white/40"
          >
            See how it works
          </a>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-white/10 bg-white/[0.02] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            From zero to a live campaign
          </h2>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-white/10 p-6">
                <div className="mb-4 text-sm font-medium text-neutral-500">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="mb-2 font-semibold">{step.title}</h3>
                <p className="text-sm text-neutral-400">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="agents" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            AI specialists, on call
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-neutral-400">
            Every plan includes chat access to a team of AI agents trained on your
            account and campaigns.
          </p>
          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {agents.map((agent) => (
              <div key={agent.name} className="rounded-2xl border border-white/10 p-6">
                <h3 className="mb-2 font-semibold">{agent.name}</h3>
                <p className="text-sm text-neutral-400">{agent.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Ready to hand off your ads?
          </h2>
          <p className="mt-4 text-neutral-400">
            Set your goal and budget today — your first monthly plan is ready in minutes.
          </p>
          <Link
            href="/sign-up"
            className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:bg-neutral-200"
          >
            Create your account
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto max-w-6xl px-6 text-sm text-neutral-500">
          © {new Date().getFullYear()} MyRo. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
