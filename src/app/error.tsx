"use client";

import Link from "next/link";

// What shows when a page fails to render, instead of Next's default.
//
// Deliberately says nothing about the cause: an error forwarded from the
// server carries only a reference (error.digest) that matches the server's
// log, and the message of one thrown in the browser may contain the
// business's own data, so neither the message nor the stack is shown or
// logged from here. What it does say is the thing an owner worries about
// first, without promising more than is known: showing a page never changes
// their ads, but an action they had just pressed may or may not have gone
// through, so it sends them to check before pressing it again.

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="relative isolate flex min-h-screen items-center bg-paper px-4 py-20 text-white sm:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_45%_at_50%_0%,rgba(47,107,255,0.18),transparent_70%)]" />
      <div className="mx-auto w-full max-w-[560px] text-center">
        <Link href="/" className="inline-flex min-h-[44px] items-center text-[15px] font-semibold tracking-[0.3em] text-white/80 hover:text-white">MAIRO</Link>
        <h1 className="mt-8 text-[clamp(28px,4vw,42px)] font-semibold leading-[1.08] tracking-[-0.035em] [text-wrap:balance]">
          This page didn&rsquo;t load.
        </h1>
        <p className="mx-auto mt-4 max-w-[460px] text-[16px] leading-relaxed text-white/65">
          Something went wrong on our side while showing it. Showing a page never changes your ads. If you had just pressed a button, check whether it went through before pressing it again.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex min-h-[46px] items-center rounded-full bg-[image:var(--mairo-ramp)] px-6 text-[15px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[46px] items-center rounded-full border border-white/15 px-6 text-[15px] font-medium text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Go to the homepage
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-8 text-[12.5px] text-white/45">
            If it keeps happening, contact support and quote this reference: <span className="font-mono text-white/70">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
