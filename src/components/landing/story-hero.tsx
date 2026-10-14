"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { HeroStory } from "@/components/hero-story/hero-story";
import { ONBOARDING_TYPE, PREVIEW_EXAMPLE, type ExampleType } from "@/lib/demo/examples";
import { PLANS, STARTER_TRIAL_DAYS } from "@/lib/plans";
import { WALK_DURATION } from "@/lib/demo/walkthrough";

// The landing page's first screen: what MAIRO does in one line, the website
// box that starts a real preview, and the 24-second story beside it. One
// primary action — "Preview my campaign" — and the form works without
// JavaScript (it's a plain GET to /preview). The story holds still while the
// visitor types, and its closing button hands over to this form: it sends
// what was typed, or puts the cursor in the box if nothing was.
//
// The headline promises a preview, and /preview delivers one: the visitor's
// own website read, facts confirmed, a first draft of the campaign. Nothing
// here suggests a campaign runs before the visitor approves and subscribes.

const starter = PLANS[0];
const demoLength = `${Math.floor(WALK_DURATION / 60000)}:${String(Math.round((WALK_DURATION % 60000) / 1000)).padStart(2, "0")}`;

export function StoryHero() {
  const [type, setType] = useState<ExampleType>("service");
  // Only an example the visitor picked is carried into the preview as a hint — never the default.
  const [picked, setPicked] = useState(false);
  const [typing, setTyping] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // The team example implies no business type; the others carry theirs as a hint.
  const typeHint = picked && ONBOARDING_TYPE[type] ? type : null;
  const fromStory = () => {
    const el = input.current;
    if (!el) return;
    if (el.value.trim()) form.current?.requestSubmit();
    else {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
    }
  };
  return (
    <section id="product" aria-labelledby="hero-title" data-palette="classic" className="relative isolate scroll-mt-20 overflow-hidden bg-[#05060d] pb-16 pt-[96px] text-white sm:pb-20 sm:pt-[116px]">
      {/* Near-black with a cosmic violet glow and a faint, static star field — nothing that moves behind the story. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_55%_at_70%_40%,rgba(124,92,255,0.28),transparent_70%),radial-gradient(ellipse_45%_40%_at_10%_10%,rgba(59,107,255,0.16),transparent_70%),radial-gradient(ellipse_50%_35%_at_50%_100%,rgba(167,139,250,0.12),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(1px_1px_at_12%_22%,rgba(255,255,255,0.5),transparent),radial-gradient(1px_1px_at_32%_68%,rgba(255,255,255,0.35),transparent),radial-gradient(1px_1px_at_58%_14%,rgba(255,255,255,0.4),transparent),radial-gradient(1.5px_1.5px_at_82%_58%,rgba(196,181,253,0.55),transparent),radial-gradient(1px_1px_at_92%_18%,rgba(255,255,255,0.3),transparent),radial-gradient(1px_1px_at_6%_84%,rgba(255,255,255,0.3),transparent),radial-gradient(1px_1px_at_46%_90%,rgba(255,255,255,0.25),transparent)]" />

      <div className="mx-auto grid max-w-[1360px] grid-cols-1 items-center gap-10 px-4 sm:px-8 lg:px-12 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] xl:gap-12">
        <div className="mx-auto w-full min-w-0 max-w-[640px] xl:mx-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#a78bfa]/30 bg-[#7c5cff]/[0.10] px-3.5 py-1.5 text-[12.5px] font-medium text-white/85">For Facebook &amp; Instagram ads</p>
          <h1 id="hero-title" className="mt-5 text-[clamp(36px,5.2vw,64px)] font-extrabold leading-[1.03] tracking-[-0.045em] [text-wrap:balance]">
            Your business. Your next campaign. <span className="bg-gradient-to-r from-[#c4b5fd] via-[#a78bfa] to-[#7c9bff] bg-clip-text text-transparent">See it come together.</span>
          </h1>
          <p className="mt-5 max-w-[560px] text-[clamp(16px,1.35vw,19px)] leading-relaxed text-white/75">
            Give MAIRO your website. Preview a campaign built around your business, then decide what happens next.
          </p>

          <form ref={form} action="/preview" method="get" className="mt-7">
            <label htmlFor="hero-website" className="block text-[13.5px] font-medium text-white/90">Enter your business website</label>
            <div className="mt-2 flex flex-col gap-2.5 rounded-[22px] border border-white/12 bg-white/[0.04] p-2 sm:flex-row sm:items-center sm:rounded-full">
              <input
                ref={input}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                id="hero-website"
                name="website"
                required
                maxLength={300}
                inputMode="url"
                autoComplete="url"
                placeholder="yourbusiness.com"
                className="min-h-[50px] w-full min-w-0 flex-1 rounded-full bg-transparent px-4 text-[16px] text-white placeholder:text-white/40 outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/60"
              />
              {typeHint && <input type="hidden" name="type" value={typeHint} />}
              <button type="submit" className="inline-flex min-h-[50px] shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#5b6cff] to-[#8b4dfb] px-6 text-[15.5px] font-semibold text-white shadow-[0_14px_44px_-12px_rgba(124,92,255,0.95)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4b5fd]">
                Preview my campaign <span aria-hidden>→</span>
              </button>
            </div>
          </form>
          <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
            <a href="#walkthrough" className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] pl-1.5 pr-4 font-semibold text-white transition hover:border-[#a78bfa]/60">
              <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-[#7952FF] to-[#356CFF]">
                <svg viewBox="0 0 12 12" className="ml-0.5 h-2.5 w-2.5 fill-white"><path d="M2 1.2v9.6L10.5 6z" /></svg>
              </span>
              Watch MAIRO in action <span className="font-normal text-white/55">{demoLength}</span>
            </a>
            <Link href={`/preview?example=${PREVIEW_EXAMPLE[type]}`} className="font-medium text-[#c4b5fd] underline-offset-4 hover:text-white hover:underline">Try an example</Link>
            <Link href="/preview?manual=1" className="text-white/70 underline-offset-4 hover:text-white hover:underline">No website? Describe your business</Link>
          </p>

          <dl className="mt-7 grid max-w-[600px] grid-cols-1 gap-3 border-t border-white/10 pt-5 text-[12.5px] leading-relaxed sm:grid-cols-3">
            <div>
              <dt className="font-semibold text-white">Free</dt>
              <dd className="text-white/60">The preview and your full advertising plan.</dd>
            </div>
            <div>
              <dt className="font-semibold text-white">Free account</dt>
              <dd className="text-white/60">To save your plan. No card.</dd>
            </div>
            <div>
              <dt className="font-semibold text-white">Paid, only to launch</dt>
              <dd className="text-white/60">
                From ${starter.priceMonthly}/month, {STARTER_TRIAL_DAYS}-day trial on {starter.name}. Ad spend is paid to Meta.
              </dd>
            </div>
          </dl>
        </div>

        <div className="mx-auto w-full min-w-0 max-w-[880px] xl:max-w-none">
          <HeroStory
            initialType="service"
            hold={typing}
            onInvite={fromStory}
            onTypeChange={(t) => {
              setType(t);
              setPicked(true);
            }}
          />
        </div>
      </div>
    </section>
  );
}
