import Link from "next/link";
import type { ReactNode } from "react";
import type { ClipId } from "@/lib/demo/clip";
import { DemoVideo } from "@/components/clips/demo-video";

// One of the homepage's product demonstrations: a headline, one paragraph,
// the clip large, and where to go next. Text and video swap sides from one
// section to the next on wide screens; on a phone they stack, headline first.

export function DemoSection({
  id,
  eyebrow,
  title,
  body,
  clip,
  clipTitle,
  cta,
  flip = false,
  points,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  body: ReactNode;
  clip: ClipId;
  clipTitle: string;
  cta: { href: string; label: string };
  flip?: boolean;
  points?: string[];
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="relative mx-auto max-w-[1360px] scroll-mt-20 px-4 py-16 sm:px-8 sm:py-24 lg:px-12">
      <div className={`grid items-center gap-8 lg:gap-14 ${flip ? "lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.75fr)]"}`}>
        <div data-reveal className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">{eyebrow}</p>
          <h2 id={`${id}-title`} className="mt-3 text-[clamp(28px,3.6vw,46px)] font-semibold leading-[1.04] tracking-[-0.035em] text-white [text-wrap:balance]">
            {title}
          </h2>
          <p className="mt-4 max-w-[520px] text-[16px] leading-relaxed text-white/68">{body}</p>
          {points && (
            <ul className="mt-5 space-y-2 text-[14px] text-white/75">
              {points.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/80" />
                  {p}
                </li>
              ))}
            </ul>
          )}
          <Link href={cta.href} className="mt-7 hidden min-h-[48px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 text-[14.5px] font-semibold text-white transition hover:border-cyan-300/50 hover:bg-white/[0.07] lg:inline-flex">
            {cta.label}
          </Link>
        </div>
        <div data-reveal className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>
          <DemoVideo id={clip} title={clipTitle} />
          <Link href={cta.href} className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 text-[14.5px] font-semibold text-white transition hover:border-cyan-300/50 lg:hidden">
            {cta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
