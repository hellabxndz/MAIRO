import Link from "next/link";
import type { ReactNode } from "react";
import { Galaxy } from "@/components/galaxy";
import { LEGAL } from "@/lib/legal";

// Shared shell for the public legal pages. These have to stay reachable
// without signing in — Meta's automated checks fetch them during App Review
// and a redirect to /sign-in reads as a broken URL.

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen text-white">
      <Galaxy />

      <div className="relative mx-auto max-w-3xl px-6 py-16 sm:px-10 sm:py-24">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.2em] text-neutral-500 transition hover:text-white"
        >
          ← {LEGAL.productName}
        </Link>

        <h1 className="mt-10 text-4xl font-medium leading-[1.05] sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-400">{intro}</p>
        <p className="mt-6 text-xs uppercase tracking-[0.15em] text-neutral-600">
          Last updated {LEGAL.lastUpdated}
        </p>

        <div className="mt-14 space-y-10 border-t border-white/10 pt-14">{children}</div>

        <footer className="mt-16 border-t border-white/10 pt-8 text-sm text-neutral-500">
          <p>
            Questions about this page? Email{" "}
            <a
              href={`mailto:${LEGAL.contactEmail}`}
              className="text-neutral-300 underline underline-offset-4 hover:text-white"
            >
              {LEGAL.contactEmail}
            </a>
            .
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.15em] text-neutral-600">
            <Link href="/privacy" className="transition hover:text-white">Privacy</Link>
            <Link href="/terms" className="transition hover:text-white">Terms</Link>
            <Link href="/data-deletion" className="transition hover:text-white">Data deletion</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-medium text-white">{heading}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-neutral-400">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neutral-600" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
