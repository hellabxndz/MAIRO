import Link from "next/link";
import { NeuralBrain } from "@/components/neural-brain";

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
    <div className="relative flex-1 overflow-hidden bg-[#050507]">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-violet-600/25 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]" />
      </div>

      <div className="relative">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <span className="text-lg font-semibold tracking-tight text-white">MAIRO</span>
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
              className="rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 font-medium text-black shadow-[0_0_20px_-4px_rgba(139,92,246,0.7)] transition hover:shadow-[0_0_28px_-2px_rgba(139,92,246,0.9)]"
            >
              Get started
            </Link>
          </nav>
        </header>

        <section className="mx-auto grid max-w-6xl items-center gap-8 px-6 pt-16 pb-24 lg:grid-cols-2 lg:pt-20">
          <div className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-300" />
              AI-run ad management
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Run winning Meta ads.
              <br />
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                Without learning Meta ads.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-neutral-400 lg:mx-0">
              MAIRO is the ad platform for business owners who don&apos;t have time to
              become an ads expert. Tell us your goal and budget — our AI plans, builds,
              and manages your campaigns for you.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
              <Link
                href="/sign-up"
                className="rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-6 py-3 text-sm font-medium text-black shadow-[0_0_30px_-6px_rgba(139,92,246,0.8)] transition hover:shadow-[0_0_40px_-4px_rgba(139,92,246,1)]"
              >
                Start your first plan
              </Link>
              <a
                href="#how-it-works"
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white hover:border-violet-400/50 hover:bg-violet-500/5"
              >
                See how it works
              </a>
            </div>
          </div>

          <div className="relative mx-auto aspect-[5/4] w-full max-w-lg">
            <NeuralBrain className="h-full w-full" />
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-t border-white/10 bg-white/[0.015] py-24 backdrop-blur-sm"
        >
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
              From zero to a live campaign
            </h2>
            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <div
                  key={step.title}
                  className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-violet-400/40 hover:bg-violet-500/[0.04]"
                >
                  <div className="mb-4 text-sm font-medium text-violet-300/70 transition group-hover:text-violet-300">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <h3 className="mb-2 font-semibold text-white">{step.title}</h3>
                  <p className="text-sm text-neutral-400">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="agents" className="py-24">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
              AI specialists, on call
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-neutral-400">
              Every plan includes chat access to a team of AI agents trained on your
              account and campaigns.
            </p>
            <div className="mt-14 grid gap-6 sm:grid-cols-3">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-cyan-400/40"
                >
                  <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-cyan-400/0 blur-2xl transition group-hover:bg-cyan-400/20" />
                  <h3 className="mb-2 font-semibold text-white">{agent.name}</h3>
                  <p className="text-sm text-neutral-400">{agent.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 py-24">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              Ready to hand off your ads?
            </h2>
            <p className="mt-4 text-neutral-400">
              Set your goal and budget today — your first monthly plan is ready in minutes.
            </p>
            <Link
              href="/sign-up"
              className="mt-8 inline-block rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-6 py-3 text-sm font-medium text-black shadow-[0_0_30px_-6px_rgba(139,92,246,0.8)] transition hover:shadow-[0_0_40px_-4px_rgba(139,92,246,1)]"
            >
              Create your account
            </Link>
          </div>
        </section>

        <footer className="border-t border-white/10 py-8">
          <div className="mx-auto max-w-6xl px-6 text-sm text-neutral-500">
            © {new Date().getFullYear()} MAIRO. All rights reserved.
          </div>
        </footer>
      </div>
    </div>
  );
}
